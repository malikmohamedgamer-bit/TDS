// TDS bootstrap: loads content and the save, builds the world (map, hero, cameras), then runs the
// match flow (loadout -> match -> results) on a fixed-timestep loop.
import { mapTheme } from './ui/mapThumb.js';
import { initPwa } from './pwa.js';
import { QualityGovernor, QUALITY_ORDER } from './ui/autoQuality.js';
import { equippedCosmetic } from './meta/cosmetics.js';
import { applyUiTheme } from './ui/applyCosmetics.js';
import { loadContent, browserReadJson } from './core/content.js';
import { buildMapWorld } from './core/mapLayout.js';
import { Character } from './core/character.js';
import { FixedLoop } from './core/fixedLoop.js';
import { lerp } from './core/math.js';
import { Renderer } from './engine/renderer.js';
import { MapView } from './engine/mapView.js';
import { HeroView } from './engine/heroView.js';
import { CameraRig, CAMERA_LABELS } from './engine/cameraRig.js';
import { Input } from './input/input.js';
import { TouchControls } from './input/touch.js';
import { Hud } from './ui/hud.js';
import { createStorage } from './save/storage.js';
import { loadSettings, saveSettings } from './save/settings.js';
import { loadSave } from './save/save.js';
import { ensureStarters, dailyChallenge } from './meta/meta.js';
import { Sfx } from './audio/sfx.js';
import { Music } from './audio/music.js';
import { setPalettes } from './engine/models.js';
import { MatchController } from './game/matchController.js';
import { SIM_DT } from './sim/match.js';

const $ = (sel) => document.querySelector(sel);

function setLoading(text, pct) {
  const el = $('#loading');
  if (!el) return;
  el.querySelector('.load-text').textContent = text;
  if (pct !== undefined) el.querySelector('.load-bar span').style.width = `${pct}%`;
}

function fail(err) {
  console.error(err);
  const el = $('#loading');
  if (el) {
    el.classList.add('error');
    el.querySelector('.load-text').textContent = `Could not start: ${err.message || err}`;
  }
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const storage = createStorage();
  const settings = loadSettings(storage, {
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    prefersReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    deviceMemory: navigator.deviceMemory,
    cores: navigator.hardwareConcurrency,
  });
  // ?quality= (tests, tools): only a known tier is accepted
  if (QUALITY_ORDER.includes(params.get('quality'))) settings.quality = params.get('quality');
  // automatic step-down for slow devices; off in automated tests and when a quality is forced
  let lastMatch = null;
  const governor = settings.qualityAuto !== false && !params.get('quality') && !navigator.webdriver ? new QualityGovernor() : null;

  setLoading('Loading content…', 15);
  const content = await loadContent(browserReadJson('data/'));
  setPalettes(content.palettes);
  const { save } = loadSave(storage, content, Date.now());
  ensureStarters(save, content.meta);
  applyUiTheme(save, content);
  // ?map= (links, tests) wins; otherwise the map last picked in the hub, if it is still unlocked
  const unlocked = (m) => m && !(m.unlockLevel && save.profile.level < m.unlockLevel);
  const mapId = params.get('map') || (unlocked(content.maps.get(settings.map)) ? settings.map : 'riftline');
  const map = content.maps.get(mapId);
  if (!map) throw new Error(`Unknown map "${mapId}"`);

  setLoading('Raising the valley…', 40);
  await new Promise((r) => setTimeout(r, 0));
  let mw = buildMapWorld(map, content.props);

  const canvas = $('#scene');
  const renderer = new Renderer(canvas, settings);
  setLoading('Planting trees…', 65);
  await new Promise((r) => setTimeout(r, 0));
  const mapView = new MapView(renderer, mw, content.props, settings, content.themes?.[mapTheme(map)]);

  const hero = new Character(mw.world, map.playerSpawn);
  const heroDef = content.heroes.get(settings.hero) || [...content.heroes.values()][0];
  const heroView = new HeroView(renderer.scene, { ...(heroDef?.model?.colors || {}), ...(equippedCosmetic(save, content, 'heroOutfit')?.colors || {}) }, heroDef?.model?.gear);
  const rig = new CameraRig(renderer.camera, mw, settings);
  rig.yaw = (map.playerSpawn.yaw ?? 0) + Math.PI;

  const ui = $('#ui');
  ui.insertAdjacentHTML('afterbegin', '<div class="dmg-layer" aria-hidden="true"></div>');
  const input = new Input(canvas, settings);
  const persist = () => saveSettings(storage, settings);

  let hud;
  let ctrl;
  const sfx = new Sfx(settings, (text) => ctrl?.mhud.caption(text));
  const music = new Music(sfx, settings, content.music);
  sfx.onDuck = (s) => music.duck(s);
  // every hub / menu button gives a soft click (in-match actions play their own sounds)
  ui.addEventListener('click', (e) => { if (e.target.closest?.('button:not([disabled])')) sfx.play('ui'); });
  const setCamera = (mode) => {
    if (mode === rig.mode) return;
    rig.setMode(mode, hero);
    hud.setCameraMode(rig.mode, input.locked);
    touch.setMode(rig.mode);
    const tips = {
      free: 'Free camera: WASD to fly, Q/E down/up, wheel = speed, C to return',
      top: 'Overview: WASD to pan, wheel to zoom, C to return',
      first: 'First person: V to switch back',
      orbit: 'Third person',
    };
    hud.toast(tips[mode] || CAMERA_LABELS[mode]);
  };
  const doAction = (act) => {
    switch (act) {
      case 'firstPerson': setCamera(rig.mode === 'first' ? 'orbit' : 'first'); break;
      case 'freeCam': setCamera(rig.mode === 'free' ? 'orbit' : 'free'); break;
      case 'overview': setCamera(rig.mode === 'top' ? 'orbit' : 'top'); break;
      case 'toCharacter': setCamera('orbit'); break;
      case 'help': hud.toggleHelp(); break;
      case 'menu': if (!ctrl?.match) hud.openSettings(); break; // in a match Esc pauses / cancels
      case 'slower': rig.zoom(300); break;
      case 'faster': rig.zoom(-300); break;
      default: break;
    }
  };
  const touch = new TouchControls(ui, canvas, input, doAction);
  hud = new Hud(ui, {
    settings,
    mapName: map.name,
    onCamera: setCamera,
    onSettings: () => {
      renderer.applySettings();
      mapView.applyQuality();
      ctrl?.view?.setQuality(renderer.q);
      sfx.applyVolume();
      music.applyVolume();
      persist();
    },
  });
  hud.setCameraMode(rig.mode, false);
  hud.toggleHelp(false);
  document.addEventListener('pointerlockchange', () => hud.setCameraMode(rig.mode, input.locked));
  // first user gesture unlocks audio
  const unlock = () => { sfx.unlock(); music.resume(); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  ctrl = new MatchController({
    content, map, mapWorld: mw, renderer, mapView, rig, hero, input, hud, sfx, music, save, storage, settings, ui,
    persistSettings: persist,
    swapWorld(next) {
      // the match adds tower colliders to its own collision world; the hero must collide with it too
      mw = next;
      hero.world = next.world;
      rig.mw = next;
      hero.reset({ x: hero.x, z: hero.z, yaw: hero.yaw });
      prev = cur = hero.snapshot();
    },
  });

  // ---- main loop -------------------------------------------------------------------------
  const loop = new FixedLoop({ step: SIM_DT, maxSteps: 6 });
  let prev = hero.snapshot();
  let cur = prev;
  let last = performance.now();
  const stats = { frames: 0, acc: 0, fps: 0, frameMs: 0, samples: [] };

  let errorShown = false;
  let menuFrame = 0;
  function frame(now) {
    // schedule first: one failing frame must never stop the game loop
    requestAnimationFrame(frame);
    try {
      tick(now);
    } catch (err) {
      console.error(err);
      if (!errorShown) { errorShown = true; hud.toast(`Something went wrong: ${err.message}`, 6000); }
    }
  }

  // Co-op: browsers stop animation frames in hidden tabs, which would freeze this player's
  // simulation (and stall everyone if it is the host). A worker timer keeps the lockstep match
  // stepping while the tab is hidden; nothing is drawn until the tab is visible again.
  let hiddenLast = 0;
  try {
    const src = 'setInterval(() => postMessage(0), 50);';
    const keepalive = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    keepalive.onmessage = () => {
      if (!document.hidden || !ctrl?.online) { hiddenLast = 0; return; }
      const now = performance.now();
      if (hiddenLast) {
        try { loop.advance(Math.min(0.25, (now - hiddenLast) / 1000), () => ctrl.step()); } catch (err) { console.error(err); }
      }
      hiddenLast = now;
    };
  } catch { /* no workers: a hidden tab simply pauses, the session catches up afterwards */ }

  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const f = input.frame();
    for (const a of f.actions) doAction(a);
    const blocked = hud.settingsOpen || ctrl.paused || ctrl.mhud.modalOpen;
    if (!hud.settingsOpen) ctrl.handleInput(f);
    if (!blocked) {
      rig.rotate(f.look.dx, f.look.dy);
      if (f.zoom) rig.zoom(f.zoom);
    }
    const controlsHero = !blocked && (rig.mode === 'orbit' || rig.mode === 'first');
    const bas = rig.basis();
    const heroIn = controlsHero
      ? {
        mx: bas.fx * f.move.y + bas.rx * f.move.x,
        mz: bas.fz * f.move.y + bas.rz * f.move.x,
        jump: f.jump,
        sprint: f.sprint,
        faceYaw: rig.mode === 'first' ? rig.faceYaw() : null,
      }
      : { mx: 0, mz: 0, jump: false, sprint: false };
    let jumpOnce = heroIn.jump;
    // co-op never stops for a local menu: the match runs on for everyone (only hero input stops)
    const alpha = loop.advance(blocked && !ctrl.online ? 0 : dt, (step) => {
      prev = cur;
      hero.step(step, { ...heroIn, jump: jumpOnce });
      jumpOnce = false;
      cur = hero.snapshot();
      ctrl.step();
    });
    const st = {
      x: lerp(prev.x, cur.x, alpha),
      y: lerp(prev.y, cur.y, alpha),
      z: lerp(prev.z, cur.z, alpha),
      yaw: cur.yaw,
      grounded: cur.grounded,
      sprinting: cur.sprinting,
      hSpeed: Math.hypot(hero.vx, hero.vz),
    };
    heroView.setVisible(rig.mode !== 'first');
    heroView.update(dt, st, mw.world.groundHeight(st.x, st.z, 0.2, st.y + 0.1), settings.reducedMotion);
    rig.update(blocked ? 0 : dt, st, blocked ? { x: 0, y: 0, up: 0 } : { x: f.move.x, y: f.move.y, up: f.up }, f.sprint);
    if (ctrl.view?.shake) {
      renderer.camera.position.x += (Math.random() - 0.5) * ctrl.view.shake;
      renderer.camera.position.y += (Math.random() - 0.5) * ctrl.view.shake;
      ctrl.view.shake = Math.max(0, ctrl.view.shake - dt * 2);
    }
    sfx.setListener(renderer.camera.position.x, renderer.camera.position.z);
    ctrl.update(dt);
    mapView.update(dt, renderer.camera.position);
    // a full-screen menu (hub) hides the world: draw it at a quarter rate behind the panel
    menuFrame = (menuFrame + 1) % 4;
    if (!(ctrl.hub?.el.open && menuFrame !== 0)) renderer.render();

    stats.frames++;
    stats.acc += dt;
    stats.samples.push(dt * 1000);
    if (stats.samples.length > 600) stats.samples.shift();
    if (stats.acc >= 0.5) {
      stats.fps = stats.frames / stats.acc;
      stats.frameMs = (stats.acc / stats.frames) * 1000;
      stats.frames = 0;
      stats.acc = 0;
      hud.setFps(stats.fps, stats.frameMs, renderer.frameMs);
      if (governor && ctrl?.match !== lastMatch) { lastMatch = ctrl?.match; governor.reset(); }
      const playing = !!ctrl?.match && ctrl.ready && !ctrl.paused && !ctrl.hub?.el.open && !document.hidden;
      const next = governor && settings.qualityAuto !== false ? governor.sample(stats.fps, playing, settings.quality) : null;
      if (next) {
        settings.quality = next;
        persist();
        renderer.applySettings();
        ctrl?.view?.setQuality(renderer.q);
        hud.toast(`Graphics lowered to ${next[0].toUpperCase()}${next.slice(1)} to keep the game smooth. Change it in Settings.`, 6000);
      }
    }
  }

  // ---- debug / test hooks (used by Playwright e2e, screenshots and the soak test) ---------
  window.TDS = {
    ready: true,
    get hero() { return { ...hero.snapshot(), hSpeed: Math.hypot(hero.vx, hero.vz), rescues: hero.rescues, jumps: hero.jumps }; },
    get camera() { return { mode: rig.mode, x: rig.pos.x, y: rig.pos.y, z: rig.pos.z, yaw: rig.yaw, pitch: rig.pitch, distance: rig.distance, locked: input.locked }; },
    get stats() {
      const s = [...stats.samples].sort((a, b) => a - b);
      const pct = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0;
      return { fps: stats.fps, frameMs: stats.frameMs, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), cpuRenderMs: renderer.frameMs, ...renderer.info() };
    },
    get simTime() { return loop.ticks * loop.step; },
    get match() { return ctrl.match; },
    get ctrl() { return ctrl; },
    get save() { return save; },
    get music() { return { mood: music.mood, key: music.key, bar: music.bar, playing: !!music.timer }; },
    content,
    dailyChallenge: (date) => dailyChallenge(content, date),
    settings,
    map: { id: map.id, size: map.size, get bounds() { return mw.world.bounds; }, props: mw.layout.length, colliders: mw.world.colliders.size },
    setCamera,
    teleport(x, z) { hero.reset({ x, z, yaw: hero.yaw }); prev = cur = hero.snapshot(); },
    setDistance(d) { rig.distance = d; },
    /** Aim the camera so it looks from the hero towards (x, z). */
    lookAt(x, z, pitch) { rig.yaw = Math.atan2(-(x - hero.x), -(z - hero.z)); if (pitch !== undefined) rig.pitch = pitch; rig.snap(); },
    setView(yaw, pitch) { rig.yaw = yaw; if (pitch !== undefined) rig.pitch = pitch; },
    insideSolid() { return mw.world.overlapsWall(hero.x, hero.z, hero.p.radius * 0.9, hero.y, hero.p.height, hero.p.stepUp); },
    groundAt(x, z) { return mw.terrain.height(x, z); },
    /** Project a world point to screen pixels (for clicking on things in e2e tests). */
    toScreen(x, y, z) {
      const v = renderer.camera.position.clone();
      v.set(x, y, z).project(renderer.camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, visible: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 };
    },
    debug: {
      /** Run the simulation forward without rendering (deterministic). */
      fastForward(seconds) { const m = ctrl.match; for (let i = 0; i < seconds / SIM_DT && m.phase !== 'won' && m.phase !== 'lost'; i++) m.step(); },
      setCash(n) { ctrl.match.cash = n; },
      setBaseHp(n) { ctrl.match.baseHp = n; },
      killAll() {
        const m = ctrl.match;
        m.spawnQueue = [];
        // bosses summon minions as they die, so repeat until nothing is left
        for (let i = 0; i < 10 && m.enemies.some((e) => e.alive); i++) for (const e of [...m.enemies]) if (e.alive) m._damage(e, { amount: 1e12, type: 'holy' }, null);
      },
      jumpToWave(n) { const m = ctrl.match; m.spawnQueue = []; for (const e of m.enemies) e.alive = false; m.wave = n - 1; m.paidWaves = n - 1; m.command({ type: 'skip' }); },
    },
  };

  setLoading('Ready', 100);
  $('#loading').classList.add('done');
  setTimeout(() => $('#loading')?.remove(), 600);
  requestAnimationFrame((t) => { last = t; frame(t); });
  initPwa((text) => hud.toast(text, 5000));
  if (params.has('nolobby')) return;
  ctrl.toLobby();
}

boot().catch(fail);
