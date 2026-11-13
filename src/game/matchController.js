// Runs a match: creates the simulation, renderer view and HUD, routes input (placing, selecting,
// upgrading, abilities), maps sim events to VFX / audio / banners, and grants rewards once.
import * as THREE from 'three';
import { Match } from '../sim/match.js';
import { battleReport } from '../sim/report.js';
import { nextStep } from '../sim/stats.js';
import { MatchView } from '../engine/matchView.js';
import { MatchHud, HOTBAR_KEYS, DEFAULT_LOADOUT } from '../ui/matchHud.js';
import { Tutorial } from '../ui/tutorial.js';
import { towerThumbnail } from '../engine/thumbnails.js';
import { FIRE_SOUND } from '../audio/sfx.js';
import { writeSave } from '../save/save.js';
import { applyMatchResult, localDate, unlockedSpeeds, dailyChallenge } from '../meta/meta.js';
import { Hub } from '../ui/hub.js';
import { mapTheme } from '../ui/mapThumb.js';
import { equippedCosmetic } from '../meta/cosmetics.js';
import { towerThumbnail as tThumb, enemyThumbnail } from '../engine/thumbnails.js';
import { buildMapWorld } from '../core/mapLayout.js';
import { LockstepSession, matchSim } from '../net/lockstep.js';
import { playerView } from '../sim/bot.js';
import { PING_TEXTS, seatColor } from '../ui/coopUi.js';

const ABILITY_CODES = ['KeyZ', 'KeyX', 'KeyG', 'KeyV'];

export class MatchController {
  constructor(ctx) {
    // ctx: {content, map, mapWorld (shared with the hero), renderer, mapView, rig, hero, input, hud, sfx, save, storage, settings, ui}
    Object.assign(this, ctx);
    this.match = null;
    this.view = null;
    this.speed = 1;
    this.paused = false;
    this.mode = 'idle'; // idle | placing | moving | aiming
    this.placing = null;
    this.aiming = null;
    this.selected = null;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.heroSync = 0;
    this.matchCount = 0;
    this.mhud = new MatchHud(this.ui, this.content, {
      onPickTower: (id) => this.pickTower(id),
      onSkip: () => this.command({ type: 'skip' }),
      onAssistSkip: () => this.command({ type: 'assistSkip' }),
      onSpeed: () => this.cycleSpeed(),
      onPause: () => this.setPaused(true),
      onResume: () => this.setPaused(false),
      onSettings: () => { this.hud.openSettings(); },
      onRestart: () => { this.setPaused(false); if (this.online) { this.mhud.banner('Co-op matches cannot be restarted', 'warn'); return; } this.restart(); },
      onQuit: () => { this.setPaused(false); if (this.online) this.backToOnlineLobby('You left the match'); else this.toLobby(); },
      onDeselect: () => this.select(null),
      onUpgrade: (branch) => this.upgrade(branch),
      onSell: () => this.sell(),
      onMove: () => this.startMove(),
      onTargeting: (mode) => this.selected && this.command({ type: 'target', uid: this.selected, mode }),
      onAbility: (id) => this.useAbility(id),
      onAbilityMode: (id, mode) => this.command({ type: 'abilityMode', id, mode }),
      onEnd: (a) => (this.online ? this.backToOnlineLobby() : a === 'again' ? this.restart() : this.toLobby()),
      onPing: (k) => this.sendPing(k),
    });
    this.tutorial = new Tutorial(this.ui, (skipped) => {
      this.save.progress.tutorialDone = true;
      this.persist();
      if (skipped) this.mhud.banner('Tutorial skipped');
      else { this.mhud.banner('Tutorial complete!', 'info'); this.sfx.play('upgrade'); }
    });
    this.thumb = (id) => towerThumbnail(this.renderer, this.content, id);
    this.hub = new Hub(this.ui, {
      content: this.content,
      get save() { return ctx.save; },
      settings: this.settings,
      sfx: this.sfx,
      persist: () => this.persist(),
      persistSettings: () => ctx.persistSettings?.(),
      towerThumb: (id, sil) => tThumb(this.renderer, this.content, id, 128, sil),
      enemyThumb: (id, sil) => enemyThumbnail(this.renderer, this.content, id, 128, sil),
      date: () => ctx.date?.() || localDate(),
      modes: ctx.modes,
      mapId: this.map.id,
      startOnline: (o) => this.startOnline(o),
      heroId: this.content.heroes.has(this.settings.hero) ? this.settings.hero : [...this.content.heroes.keys()][0],
      switchHero: (id) => {
        // the hero's look is built with the world: reload into it, like a map change
        this.settings.hero = id;
        ctx.persistSettings?.();
        location.reload();
      },
      switchMap: (id) => {
        // a different map is a different world: rebuild it cleanly by reloading on that map
        this.settings.map = id;
        ctx.persistSettings?.();
        const u = new URL(location.href);
        u.searchParams.set('map', id);
        location.assign(u.toString());
      },
    });
  }

  /** Speeds the player has unlocked (slow speeds are always free). */
  speeds() {
    return unlockedSpeeds(this.save, this.content.meta);
  }

  cycleSpeed() {
    if (this.online) {
      if (!this.online.isHost) { this.mhud.banner('Only the host changes the game speed', 'info'); return; }
      const steps = [1, 1.5, 2, 3];
      const next = steps[(steps.indexOf(this.online.session.speed) + 1) % steps.length] || 1;
      this.online.session.setSpeed(next);
      this.sfx.play('ui');
      return;
    }
    const list = this.speeds();
    const i = list.indexOf(this.speed);
    this.speed = list[(i + 1) % list.length];
    this.sfx.play('ui');
    const locked = this.content.meta.speeds.find((s) => !list.includes(s.speed));
    if (this.speed === list[list.length - 1] && locked) this.mhud.banner(`${locked.speed}x: ${locked.label}`, 'info');
  }

  /** Tuning preset chosen in Settings, or the one data/tuning.json names. */
  presetId() {
    const p = this.settings.tuningPreset;
    return p && p !== 'default' && this.content.tuning?.presets?.[p] ? p : this.content.tuning?.preset;
  }

  assist() {
    const s = this.settings;
    return { extraCash: !!s.assistExtraCash, slowEnemies: !!s.assistSlowEnemies, heroBoost: !!s.assistHeroBoost, fullRefund: !!s.assistFullRefund, skipWave: !!s.assistSkipWave };
  }

  persist() {
    writeSave(this.storage, this.save, Date.now());
  }

  // ------------------------------------------------------------------------ lifecycle ------
  async toLobby() {
    this.end();
    this.music?.setMood('hub', this.map.id, mapTheme(this.map));
    this.mhud.setVisible(true);
    const cfg = await this.hub.open({
      // a new commander starts on Easy: starter towers at level 1 cannot hold Normal yet
      difficulty: this.lastConfig?.difficulty || (this.save.stats.wins > 0 ? 'normal' : 'easy'),
      mode: this.lastConfig?.mode || 'campaign',
      loadout: this.lastConfig?.loadout || (this.save.towers.loadout?.length ? this.save.towers.loadout : DEFAULT_LOADOUT),
    });
    this.sfx.unlock();
    this.music?.resume();
    this.music?.setMood('build', this.map.id);
    await this.start(cfg);
  }

  async start(cfg) {
    this.end();
    this.lastConfig = cfg;
    this.save.towers.loadout = cfg.loadout.slice();
    // a fresh collision world per match (tower colliders are added to it) shared with the hero
    const mw = buildMapWorld(this.map, this.content.props);
    this.swapWorld(mw);
    const levels = {};
    for (const [id, t] of Object.entries(this.save.towers.owned || {})) levels[id] = t.level;
    if (cfg.mode === 'daily' && cfg.dailyDate) Object.assign(levels, dailyChallenge(this.content, cfg.dailyDate).levels);
    this.matchCount++;
    const seed = `${Date.now().toString(36)}-${this.matchCount}`;
    this.ready = false;
    const match = new Match({
      content: this.content, mapWorld: mw, difficulty: cfg.difficulty, seed, loadout: cfg.loadout, levels,
      hero: this.content.heroes.has(this.settings.hero) ? this.settings.hero : undefined,
      options: { manualStart: true, enemiesHurtHero: !!this.settings.enemiesHurtHero, preset: this.presetId(), assist: this.assist(), mode: cfg.mode || 'campaign', modifiers: cfg.modifiers || [], dailyDate: cfg.dailyDate },
    });
    const looks = { projectile: equippedCosmetic(this.save, this.content, 'projectileFx'), plinth: equippedCosmetic(this.save, this.content, 'towerPlinth') };
    const view = new MatchView(this.renderer, match, this.content, this.settings, this.ui.querySelector('.dmg-layer'), looks);
    await view.preload();
    // only expose the match once everything it needs exists (the frame loop reads it)
    this.match = match;
    this.view = view;
    this.tutorialStats = { heroMoved: 0, cameraTurned: 0, tutorialTimer: 0, lastHero: { x: this.hero.x, z: this.hero.z }, lastYaw: this.rig.yaw };
    this.mhud.setLoadout(cfg.loadout, this.thumb, (d) => match.costOf(d));
    this.mhud.setTeam(null); // single-player: no team list or pings (after a co-op match)
    this.mhud.setAbilities(this.me.abilities);
    this.mhud.select(null, this.me);
    this.speed = 1;
    this.rewarded = false;
    this.endSeq = false;
    this.introduced = new Set();
    this.cine = null;
    document.body.classList.remove('cine');
    this.mode = 'idle';
    this.ready = true;
    document.body.classList.add('in-match');
    if (cfg.tutorial) this.tutorial.start();
    this.mhud.banner(cfg.tutorial ? 'Tutorial' : 'Build towers, then press N to start', 'info');
    this.persist();
  }

  restart() {
    if (this.lastConfig) this.start({ ...this.lastConfig, tutorial: false });
  }

  end() {
    this.closeOnline();
    if (this.view) this.view.dispose();
    if (this.match) this.match.dispose();
    this.view = null;
    this.match = null;
    this.ready = false;
    document.body.classList.remove('in-match');
    this.select(null);
    this.cancelMode();
    this.tutorial.stop();
  }

  setPaused(on) {
    if (this.online) {
      // the host pauses everyone; a client only opens the menu (the match keeps running)
      this.paused = on;
      if (this.online.isHost) this.online.session.setPaused(on);
      else if (on) this.mhud.banner('The match keeps running: only the host can pause', 'info');
      if (on && this.match) this.mhud.setReport(battleReport(this.match));
      this.mhud.setPaused(on);
      return;
    }
    this.paused = on;
    if (on && this.match) this.mhud.setReport(battleReport(this.match));
    this.mhud.setPaused(on);
  }

  // ------------------------------------------------------------------------ commands -------
  command(cmd) {
    if (!this.match) return { ok: false };
    if (this.online) return this.commandOnline(cmd);
    const r = this.match.command(cmd);
    if (!r.ok && cmd.type !== 'hero') {
      this.mhud.banner(r.reason, 'warn');
      this.sfx.play('error');
    }
    return r;
  }

  pickTower(id) {
    if (!this.match) return;
    if (this.mode === 'placing' && this.placing === id) { this.cancelMode(); return; }
    this.cancelMode();
    this.select(null);
    this.mode = 'placing';
    this.placing = id;
    this.sfx.play('ui');
  }

  cancelMode() {
    this.mode = 'idle';
    this.placing = null;
    this.aiming = null;
    this.moving = null;
    this.view?.setPreview(null);
    this.mhud.hint(null);
  }

  select(uid) {
    this.selected = uid;
    this.view?.select(uid);
    if (this.match) this.mhud.select(uid, this.me);
  }

  upgrade(branch) {
    const t = this.selected && this.match.towerById(this.selected);
    if (!t) return;
    const n = nextStep(t.def, t.up, branch);
    if (n?.needsBranch) { this.mhud.banner('Choose path A or B in the tower panel', 'info'); return; }
    this.command({ type: 'upgrade', uid: t.uid, branch });
  }

  sell() {
    if (!this.selected) return;
    this.command({ type: 'sell', uid: this.selected });
    this.select(null);
  }

  startMove() {
    if (!this.selected) return;
    const t = this.match.towerById(this.selected);
    this.cancelMode();
    this.mode = 'moving';
    this.moving = t.uid;
    this.placing = t.defId;
    this.mhud.banner('Click where to move it (Esc cancels). Moving stuns it for 2 s', 'info');
  }

  useAbility(id) {
    if (!this.match) return;
    const a = this.me.abilities.find((x) => x.id === id);
    if (!a) return;
    if (a.ready > this.match.time) { this.mhud.banner(`${a.def.name} ready in ${Math.ceil(a.ready - this.match.time)} s`, 'warn'); this.sfx.play('error'); return; }
    if (a.def.target === 'self') { this.command({ type: 'ability', id, x: this.hero.x, z: this.hero.z }); return; }
    this.cancelMode();
    this.select(null);
    this.mode = 'aiming';
    this.aiming = id;
    this.mhud.banner(`Aim ${a.def.name}: click the ground`, 'info');
  }

  // ------------------------------------------------------------------------ input ----------
  /** Screen point to ground hit (terrain mesh) or null. */
  groundAt(sx, sy) {
    const rect = this.renderer.canvas.getBoundingClientRect();
    this.ndc.set(((sx - rect.left) / rect.width) * 2 - 1, -((sy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.renderer.camera);
    const hits = this.raycaster.intersectObject(this.mapView.terrainMesh, false);
    return hits.length ? hits[0].point : null;
  }

  /** Nearest tower whose body the screen ray passes through. */
  towerAt(sx, sy) {
    if (!this.match) return null;
    const rect = this.renderer.canvas.getBoundingClientRect();
    this.ndc.set(((sx - rect.left) / rect.width) * 2 - 1, -((sy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.renderer.camera);
    const ray = this.raycaster.ray;
    let best = null;
    let bd = Infinity;
    const c = new THREE.Vector3();
    for (const t of this.match.towers) {
      for (const h of [0.6, 1.4, 2.2]) {
        c.set(t.x, t.y + h, t.z);
        const d2 = ray.distanceSqToPoint(c);
        const along = c.clone().sub(ray.origin).dot(ray.direction);
        if (d2 < 1.3 * 1.3 && along > 0 && along < bd) { bd = along; best = t; }
      }
    }
    return best;
  }

  pointer() {
    const inp = this.input;
    const rect = this.renderer.canvas.getBoundingClientRect();
    if (inp.locked || this.rig.mode === 'first') return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    return { x: inp.pointer.x, y: inp.pointer.y };
  }

  handleInput(f) {
    if (!this.match || !this.ready) return;
    const keys = f.keyEdges;
    if (keys.has('Escape') || keys.has('KeyP')) {
      if (this.mode !== 'idle') this.cancelMode();
      else if (this.selected && keys.has('Escape')) this.select(null);
      else this.setPaused(!this.paused);
    }
    if (this.paused || this.mhud.modalOpen) return;
    HOTBAR_KEYS.forEach((code, i) => { if (keys.has(code) && this.mhud.loadout?.[i]) this.pickTower(this.mhud.loadout[i]); });
    ABILITY_CODES.forEach((code, i) => { const a = this.me.abilities[i]; if (keys.has(code) && a) this.useAbility(a.id); });
    if (keys.has('KeyN')) this.command({ type: 'skip' });
    if (keys.has('KeyU')) this.upgrade(null);
    if (keys.has('KeyM')) this.startMove();

    const p = this.pointer();
    // live preview for placing / moving / aiming
    if (this.mode === 'placing' || this.mode === 'moving' || this.mode === 'aiming') {
      const hit = this.groundAt(p.x, p.y);
      if (hit) {
        if (this.mode === 'aiming') {
          const def = this.content.abilities.get(this.aiming);
          this.view.setPreview('__ability', hit.x, hit.z, true, def.radius);
          this.view.ghost && (this.view.ghost.visible = false);
          this.mhud.hint(`${def.name}: click to cast`, true);
        } else {
          const v = this.mode === 'moving' ? this.match.canPlace(this.placing, hit.x, hit.z, this.moving, true) : this.match.canPlace(this.placing, hit.x, hit.z);
          const def = this.content.towers.get(this.placing);
          this.view.setPreview(this.placing, hit.x, hit.z, v.ok, def.stats.range || def.footprint * 2);
          this.mhud.hint(v.ok ? `${def.name} $${this.match.costOf(def)}${this.mode === 'moving' ? ' (move)' : ''}` : v.reason, v.ok);
        }
        this.lastHit = hit;
      } else {
        this.view.setPreview(null);
        this.mhud.hint('Aim at the ground', false);
      }
    }
    for (const c of f.clicks) {
      const at = c.locked || this.rig.mode === 'first' ? p : { x: c.x, y: c.y };
      const hit = this.groundAt(at.x, at.y);
      if (this.mode === 'placing' && hit) {
        const r = this.command({ type: 'place', tower: this.placing, x: hit.x, z: hit.z, rot: this.rig.yaw + Math.PI });
        if (r.ok) { this.sfx.play('place', hit); if (!this.input.keys.has('ShiftLeft')) this.cancelMode(); }
      } else if (this.mode === 'moving' && hit) {
        const r = this.command({ type: 'move', uid: this.moving, x: hit.x, z: hit.z });
        if (r.ok) this.cancelMode();
      } else if (this.mode === 'aiming' && hit) {
        const r = this.command({ type: 'ability', id: this.aiming, x: hit.x, z: hit.z });
        if (r.ok) this.cancelMode();
      } else if (this.mode === 'idle') {
        const t = this.towerAt(at.x, at.y);
        this.select(t ? t.uid : null);
        if (t) this.sfx.play('ui');
      }
    }
  }

  // ------------------------------------------------------------------------ frame ----------
  /** One fixed simulation tick (called by the main loop). */
  step() {
    if (!this.match || !this.ready) return;
    if (this.online) { this.stepOnline(); return; }
    if (this.paused) return;
    // fractional speeds (0.5x, 1.5x) accumulate whole simulation steps
    this.speedAcc = (this.speedAcc || 0) + this.speed * (this.view?.timeScale ?? 1);
    while (this.speedAcc >= 1) { this.speedAcc -= 1; this.match.step(); }
    this.heroSync += 1;
    if (this.heroSync >= 15) {
      this.heroSync = 0;
      this.match.command({ type: 'hero', x: this.hero.x, y: this.hero.y, z: this.hero.z });
    }
  }

  update(dt) {
    const m = this.match;
    if (!m || !this.ready) return;
    const events = m.drainEvents();
    this.view.onEvents(events);
    this.onEvents(events);
    this.view.update(this.paused ? 0 : dt);
    this._cinematics(dt);
    if (this.online) this.speed = this.online.session.speed;
    this.mhud.update(this.me, { placing: this.mode === 'placing' ? this.placing : null, speed: this.speed, team: this.online ? this.teamState() : null });
    // tutorial progress
    const ts = this.tutorialStats;
    ts.heroMoved += Math.hypot(this.hero.x - ts.lastHero.x, this.hero.z - ts.lastHero.z);
    ts.lastHero = { x: this.hero.x, z: this.hero.z };
    ts.cameraTurned += Math.abs(this.rig.yaw - ts.lastYaw);
    ts.lastYaw = this.rig.yaw;
    ts.match = m;
    ts.placing = this.placing;
    ts.dt = dt;
    this.tutorial.update(ts);
    if ((m.phase === 'won' || m.phase === 'lost') && !this.rewarded) this.finish();
  }

  /**
   * Boss intro (letterbox + camera turns to the boss once), victory / defeat sequences (slow orbit and a
   * burst at the keep). Reduced motion keeps the letterbox and the burst but never moves the camera.
   */
  _cinematics(dt) {
    const m = this.match;
    const calm = this.settings.reducedMotion;
    const boss = m.enemies.find((e) => e.alive && e.def.boss && !this.introduced?.has(e.id));
    if (boss) {
      this.introduced = this.introduced || new Set();
      this.introduced.add(boss.id);
      this.cine = { until: performance.now() + 2600, x: boss.x, z: boss.z, turn: !calm && this.rig.mode === 'orbit' };
      document.body.classList.add('cine');
      this.mhud.caption(`${boss.def.name} enters the valley`);
    }
    if (this.cine) {
      if (this.cine.turn) {
        const want = Math.atan2(-(this.cine.x - this.hero.x), -(this.cine.z - this.hero.z));
        const d = Math.atan2(Math.sin(want - this.rig.yaw), Math.cos(want - this.rig.yaw));
        this.rig.yaw += d * Math.min(1, dt * 2.4);
      }
      if (performance.now() > this.cine.until) { this.cine = null; document.body.classList.remove('cine'); }
    }
    if ((m.phase === 'won' || m.phase === 'lost') && !this.endSeq) {
      this.endSeq = true;
      const base = m.map.base || { x: 0, z: 0 };
      this.view._vfx(m.phase === 'won' ? 'victory' : 'defeat', base.x, 1, base.z);
    }
    if (this.endSeq && !calm && this.rig.mode === 'orbit' && !this.mhud.modalOpen) this.rig.yaw += dt * 0.25;
  }

  onEvents(events) {
    const sfx = this.sfx;
    for (const e of events) {
      switch (e.type) {
        case 'fire': sfx.play(FIRE_SOUND[e.kind] || 'bullet', e, { gap: 0.05 }); break;
        case 'explosion': sfx.play(e.kind === 'mine' ? 'mine' : 'explosion', e, { gap: 0.08 }); break;
        case 'death': sfx.play(e.boss ? 'bossDeath' : 'death', e, { gap: 0.05 }); if (e.boss) this.mhud.banner('The boss falls!', 'good'); break;
        case 'upgrade': sfx.play(e.evolved ? 'evolve' : 'upgrade'); if (e.evolved) this.mhud.banner(`Evolved: ${e.evolved.to}!`, 'good'); break;
        case 'sell': sfx.play('sell'); break;
        case 'waveStart': this.music?.setMood(e.boss ? (e.wave >= e.total ? 'boss_final' : 'boss') : 'wave', this.map.id); sfx.play('waveStart'); this.mhud.banner(e.boss ? `⚠ Wave ${e.wave}: BOSS WAVE` : `Wave ${e.wave}`, e.boss ? 'boss' : 'info'); break;
        case 'bossSpawn': sfx.play('boss'); break;
        case 'rejected': if (this.online && e.cmd?.pid === this.online.localPid && e.cmd.type !== 'hero') { this.mhud.banner(e.reason || 'Not allowed', 'warn'); sfx.play('error'); } break;
        case 'mutation': this.mhud.banner(`Mutation: ${e.name}. ${e.desc}`, 'warn'); break;
        case 'bossPhase': sfx.play('boss'); this.mhud.banner(`${e.name}!`, 'boss'); break;
        case 'telegraph': sfx.play('telegraph'); break;
        case 'telegraphHit': sfx.play('stomp'); break;
        case 'leak': sfx.play('leak', null, { gap: 0.4 }); break;
        case 'abilityCast': sfx.play(e.id === 'airstrike' ? 'jet' : 'ability'); break;
        case 'heroAttack': sfx.play('slash', e, { gap: 0.1 }); break;
        case 'heal': sfx.play('heal', e, { gap: 0.3 }); break;
        case 'waveCleared': if (!this.match?.enemies.some((x) => x.alive && x.def.boss)) this.music?.setMood('build', this.map.id); this.mhud.banner(`Wave ${e.wave} cleared`, 'good'); break;
        case 'waveReward': sfx.play('cash'); break;
        case 'cashDrain': if (e.amount > 0) this.mhud.banner(`The boss stole $${e.amount}!`, 'warn'); sfx.play('error'); break;
        case 'bossRevive': this.mhud.banner('It rises again!', 'boss'); break;
        case 'bossImmune': this.mhud.banner(`Immune to ${e.types.join(' and ')} for ${e.duration} s`, 'warn'); break;
        case 'bossCloak': this.mhud.banner('The boss vanished: only detection can hit it', 'warn'); break;
        case 'bossPortal': this.mhud.caption('Portal opens on another road'); break;
        case 'bossRegen': this.mhud.caption('The boss regenerates: fire stops it'); break;
        case 'heroDown': this.mhud.banner('Commander down! Back in 6 s', 'warn'); break;
        case 'won': this.music?.setMood('victory', this.map.id); sfx.play('win'); break;
        case 'lost': this.music?.setMood('defeat', this.map.id); sfx.play('lose'); break;
        default: break;
      }
    }
  }

  // ------------------------------------------------------------------------ online co-op ---
  // docs/multiplayer.md contract 5. The lobby UI (src/ui/onlineLobby.js) owns the transport and the
  // Lobby and calls startOnline when the host starts. Every client builds an identical Match from
  // the start payload; the LockstepSession steps it and carries every command.

  /** The local player's view of the match: own wallet, towers, hero and abilities online. */
  get me() {
    return this.online && this.match ? playerView(this.match, this.online.localPid) : this.match;
  }

  async startOnline(o) {
    try {
      await this._startOnline(o);
    } catch (err) {
      // never leave the player on a half-built match: back to the room with the reason
      console.error(err);
      if (this.online) this.backToOnlineLobby(`Could not start the match: ${err.message}`);
      else this.hub.showOnline({ lobby: o.lobby, transport: o.transport, message: `Could not start the match: ${err.message}` }).then((cfg) => cfg && this.start(cfg));
    }
  }

  async _startOnline({ lobby, transport, start, localPid, config = {} }) {
    if (start.map !== this.map.id) throw new Error(`co-op start for map ${start.map} but ${this.map.id} is loaded`);
    // the host repeats a start until everyone acknowledged it: the same start never runs twice
    if (this.online?.start?.id === start.id) return;
    this.end();
    this.lastConfig = null;
    const content = this.content;
    const mw = buildMapWorld(this.map, content.props);
    this.swapWorld(mw);
    // identical on every client: nothing here may come from local settings or the local save
    const players = start.players.map((p) => ({ pid: p.pid, name: p.name, hero: content.heroes.has(p.hero) ? p.hero : [...content.heroes.keys()][0] }));
    const match = new Match({
      content, mapWorld: mw, difficulty: start.difficulty, seed: String(start.seed), players,
      loadout: [...content.towers.keys()], levels: {},
      options: { manualStart: true, mode: 'coop' },
    });
    const looks = { projectile: equippedCosmetic(this.save, content, 'projectileFx'), plinth: equippedCosmetic(this.save, content, 'towerPlinth') };
    this.ready = false;
    const online = {
      lobby, transport, start, localPid, config, isHost: start.hostId === transport.id, finished: false, heroAt: null,
      names: Object.fromEntries(start.players.map((p) => [p.pid, p.name])), status: {}, offs: [],
    };
    const sim = matchSim(match, {
      rebuild: (snap) => Match.restore(snap, { content, mapWorld: buildMapWorld(this.map, content.props) }),
      onReplace: (next) => this.rebindOnline(next),
    });
    online.sim = sim;
    this.online = online;
    // load the models first, THEN join the session: the host starts the clock only when every
    // player said hello (it waits up to 15 s), so nobody starts behind and needs a snapshot
    online.loading = true;
    const view = new MatchView(this.renderer, match, content, this.settings, this.ui.querySelector('.dmg-layer'), looks);
    view.coop = { localPid, players: start.players, color: seatColor };
    await view.preload();
    if (this.online !== online) { view.dispose(); return; } // superseded while loading
    online.session = new LockstepSession({
      transport, hostId: start.hostId, sim,
      turnTicks: config.turnTicks || 6, delayTicks: config.delayTicks || 12, hashEvery: 120,
      peers: Object.keys(start.peers), peerPids: start.peers, awaitSnapshot: !!start.rejoin,
    });
    this.listenOnline();
    online.loading = false;
    this.match = match;
    this.view = view;
    // a snapshot already replaced the match (rejoin): draw the restored one
    if (online.sim.match !== match) this.rebindOnline(online.sim.match);
    this.tutorialStats = { heroMoved: 0, cameraTurned: 0, tutorialTimer: 0, lastHero: { x: this.hero.x, z: this.hero.z }, lastYaw: this.rig.yaw };
    const own = (this.save.towers.loadout?.length ? this.save.towers.loadout : DEFAULT_LOADOUT).filter((id) => content.towers.has(id)).slice(0, 6);
    this.mhud.setLoadout(own, this.thumb, (d) => match.costOf(d));
    this.mhud.setAbilities(this.me.abilities);
    this.mhud.select(null, this.me);
    this.mhud.setTeam(start.players.map((p, i) => ({ pid: p.pid, name: p.name, hero: content.heroes.get(p.hero)?.name || '', color: seatColor(i), me: p.pid === localPid })));
    Object.assign(this, { speed: 1, rewarded: false, endSeq: false, introduced: new Set(), cine: null, mode: 'idle', paused: false });
    document.body.classList.remove('cine');
    document.body.classList.add('in-match', 'coop');
    this.ready = true;
    this.mhud.banner(online.isHost ? 'Co-op: build towers, then press N to start the first wave' : 'Co-op: build towers together; anyone can start the first wave', 'info');
    this.sfx.unlock();
    this.music?.resume();
    this.music?.setMood('build', this.map.id, mapTheme(this.map));
  }

  /** A resync replaced the Match: draw the new one (the view builds missing visuals itself). */
  rebindOnline(next) {
    const o = this.online;
    if (!o || o.loading) return; // startOnline picks up sim.match when its view is ready
    const old = this.view;
    this.swapWorld(next.mw);
    const view = new MatchView(this.renderer, next, this.content, this.settings, this.ui.querySelector('.dmg-layer'), old?.looks || {});
    view.coop = old?.coop;
    this.match = next;
    this.view = view;
    old?.dispose();
    view.preload().catch((err) => console.warn('co-op: preload after resync failed', err));
    this.select(null);
    this.mhud.setAbilities(this.me.abilities);
  }

  listenOnline() {
    const o = this.online;
    const s = o.session;
    const on = (ev, fn) => o.offs.push(s.on(ev, fn));
    const name = (peerId) => o.names[o.start.peers[peerId]] || 'A player';
    // short stalls (a turn message a few ms late) are normal: only a real wait gets a banner
    on('stall', (e) => {
      o.stalled = !!e.stalled;
      clearTimeout(o.stallTimer);
      if (e.stalled && e.reason !== 'snapshot') {
        o.stallTimer = setTimeout(() => { if (this.online === o && o.stalled) this.mhud.banner(`Waiting for ${name(o.start.hostId)}...`, 'info'); }, 1500);
      }
    });
    on('resync', () => this.mhud.banner('Resynced with the host', 'info'));
    on('peerLeft', (e) => { o.status[o.start.peers[e.id]] = 'left'; this.mhud.banner(`${name(e.id)} left`, 'warn'); });
    on('peerJoined', (e) => { o.status[o.start.peers[e.id]] = 'ok'; if (e.returning) this.mhud.banner(`${name(e.id)} is back`, 'good'); });
    on('reject', (e) => { if (e.cmd?.type !== 'hero') { this.mhud.banner(e.reason || 'Not allowed', 'warn'); this.sfx.play('error'); } });
    on('hostLeft', () => { if (!o.finished) this.backToOnlineLobby('The host left: the match ended'); });
    on('paused', (p) => { if (!o.isHost) this.mhud.banner(p ? 'Paused by the host' : 'The host resumed', 'info'); });
    on('error', (err) => console.warn('co-op session:', err));
    // the host ended the match (it went back to the room) before our session heard about it
    o.offs.push(o.lobby.on('state', () => {
      if (this.online === o && !o.isHost && !o.lobby.state?.start && o.lobby.phase === 'lobby') this.backToOnlineLobby('The host ended the match');
    }));
    o.offs.push(o.lobby.on('players', () => {
      if (this.online === o && !o.isHost && !o.lobby.state?.start && o.lobby.phase === 'lobby') this.backToOnlineLobby('The host ended the match');
    }));
    // quick pings ride on the same transport ({t:'chat'}; the session ignores unknown messages)
    const offMsg = o.transport.onMessage((d, from) => {
      if (d?.t !== 'chat' || !Number.isInteger(d.k) || !PING_TEXTS[d.k]) return;
      const pid = o.start.peers[from];
      if (!pid) return;
      // at most one ping per player every 1.2 s, whatever a peer sends
      const now = performance.now();
      o.pingAt ||= {};
      if (now - (o.pingAt[pid] || 0) < 1200) return;
      o.pingAt[pid] = now;
      this.showPing(pid, d.k);
    });
    if (typeof offMsg === 'function') o.offs.push(offMsg);
    // the same player opened this room in another tab: that tab takes over, this one stops
    const offSt = o.transport.onStatus?.((st) => {
      if (st !== 'replaced' || this.online !== o) return;
      this.end();
      this.mhud.setVisible(true);
      this.hub.showOnline({ message: 'This room was opened in another tab or window' }).then((cfg) => cfg && this.start(cfg));
    });
    if (typeof offSt === 'function') o.offs.push(offSt);
  }

  commandOnline(cmd) {
    const o = this.online;
    const full = { ...cmd, pid: o.localPid };
    // answer bad clicks at once from the local copy; the host still validates everything
    const v = this.match.validate(full);
    if (!v.ok) {
      if (cmd.type !== 'hero') { this.mhud.banner(v.reason, 'warn'); this.sfx.play('error'); }
      return v;
    }
    const r = o.session.issue(full);
    if (!r.ok && cmd.type !== 'hero') { this.mhud.banner(r.reason || 'Not allowed', 'warn'); this.sfx.play('error'); }
    return r.ok ? { ok: true, pending: !!r.pending } : r;
  }

  stepOnline() {
    const o = this.online;
    const s = o.session;
    // the fixed loop calls this 60 times a second; the host's speed decides the sim steps
    o.acc = (o.acc || 0) + (s.paused ? 0 : s.speed);
    const n = Math.floor(o.acc);
    o.acc -= n;
    s.advance(n);
    if (this.match !== o.sim.match) this.rebindOnline(o.sim.match);
    // our hero's position: every 6 ticks, only when it moved
    this.heroSync += 1;
    if (this.heroSync >= 6) {
      this.heroSync = 0;
      const h = this.hero;
      const last = o.heroAt;
      if (!last || Math.hypot(h.x - last.x, h.z - last.z) > 0.2 || Math.abs(h.y - last.y) > 0.2) {
        o.heroAt = { x: h.x, y: h.y, z: h.z };
        o.session.issue({ type: 'hero', x: h.x, y: h.y, z: h.z, pid: o.localPid });
      }
    }
  }

  /** Team list rows for the HUD: connection state and cash per player. */
  teamState() {
    const o = this.online;
    const m = this.match;
    return m.players.map((p, i) => ({ pid: p.pid, cash: m.wallet(p.pid), status: o.status[p.pid] || 'ok', stalled: !!o.stalled && p.pid !== o.localPid && i === 0, me: p.pid === o.localPid }));
  }

  sendPing(k) {
    const o = this.online;
    if (!o || !PING_TEXTS[k]) return;
    const now = performance.now();
    if (now - (o.lastPing || 0) < 1200) return; // no spam
    o.lastPing = now;
    o.transport.send({ t: 'chat', k });
    this.showPing(o.localPid, k);
  }

  showPing(pid, k) {
    const o = this.online;
    const i = this.match ? this.match.playerIndex(pid) : 0;
    this.mhud.ping(o.names[pid] || 'Player', PING_TEXTS[k], seatColor(Math.max(0, i)));
    this.sfx.play('ui');
  }

  /** Stop the session (match over or left); the transport and room stay for the lobby. */
  closeOnline() {
    const o = this.online;
    if (!o) return;
    clearTimeout(o.stallTimer);
    for (const off of o.offs) { try { off?.(); } catch { /* already gone */ } }
    try { o.session?.close(); } catch { /* already closed */ }
    this.online = null;
    document.body.classList.remove('coop');
  }

  backToOnlineLobby(message = '') {
    const o = this.online;
    if (!o) { this.toLobby(); return; }
    const { lobby, transport } = o;
    // the host returns the room to the lobby for everyone: same players can start again
    if (o.isHost) { try { lobby.endMatch(); } catch (err) { console.warn('co-op: endMatch', err); } }
    this.end();
    this.music?.setMood('hub', this.map.id, mapTheme(this.map));
    this.mhud.setVisible(true);
    // the hub resolves with a single-player config if the player starts a normal match from it
    this.hub.showOnline({ lobby, transport, message }).then((cfg) => cfg && this.start(cfg));
  }

  finish() {
    const m = this.match;
    if (this.online) this.online.finished = true;
    this.rewarded = true;
    this.cancelMode();
    const res = m.result();
    const rewards = applyMatchResult(this.save, res, this.content, this.content.meta, localDate());
    this.persist();
    this.onProgress?.();
    res.presetLabel = m.tune.label;
    this.lastResult = res;
    setTimeout(() => this.mhud.showEnd(res, rewards), 1200);
  }
}
