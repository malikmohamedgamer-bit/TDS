// Match HUD: status bar, boss bar, tower hotbar, tower panel (upgrades / targeting / move / sell),
// abilities, placement hint, loadout + difficulty screen, pause and end screens, captions.
import { nextStep, towerStats } from '../sim/stats.js';
import { TARGET_MODES } from '../sim/combat.js';
import { DAMAGE_COLORS } from '../engine/effects.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TARGET_LABEL = { first: 'First', last: 'Last', strongest: 'Strongest', weakest: 'Weakest', fastest: 'Fastest', closest: 'Closest', flying: 'Flying only' };
const ABILITY_KEYS = ['Z', 'X', 'G'];
const ABILITY_ICON = { airstrike: '✈', frost_nova: '❄', commanders_rally: '⚑', artillery_barrage: '💥', field_repairs: '🔧', war_chest: '💰', gravity_well: '🌀', starfall: '☄' };
export const HOTBAR_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];
export const DEFAULT_LOADOUT = ['rifleman', 'ember_adept', 'frost_weaver', 'marksman', 'rocket_battery', 'storm_caller'];

const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${Math.round(n)}`);

export class MatchHud {
  constructor(root, content, cb) {
    this.root = root;
    this.content = content;
    this.cb = cb;
    this.thumbs = new Map();
    this.el = document.createElement('div');
    this.el.className = 'match-ui';
    this.el.innerHTML = `
      <div class="status panel" role="group" aria-label="Match status" data-testid="status">
        <div class="st wave"><span class="k">Wave</span><b data-testid="wave">0/20</b></div>
        <div class="st timer"><span class="k">Next</span><b data-testid="timer">-</b></div>
        <button class="btn skip" data-testid="skip" aria-label="Start next wave (N)">Next wave <kbd>N</kbd></button>
        <div class="st hp"><span class="k">Keep</span><div class="bar" aria-hidden="true"><span></span></div><b data-testid="keep">150</b></div>
        <div class="st cash"><span class="k">Cash</span><b data-testid="cash">$0</b></div>
        <button class="btn assist-skip" data-testid="assist-skip" hidden aria-label="Assist: skip this whole wave">✚ Skip this wave</button>
        <button class="btn speed" data-testid="speed" aria-label="Game speed">1x</button>
        <button class="icon-btn pause" aria-label="Pause (P)">❚❚</button>
      </div>
      <div class="bossbar panel" hidden data-testid="bossbar" role="group" aria-label="Boss health"><div class="bname"></div><div class="bphase"></div><div class="bbar"><span class="bhp"></span><span class="bsh"></span></div><div class="bnum"></div></div>
      <div class="hotbar" role="toolbar" aria-label="Towers" data-testid="hotbar"></div>
      <div class="abilities" role="toolbar" aria-label="Abilities" data-testid="abilities"></div>
      <section class="tower-panel panel" hidden aria-label="Selected tower" data-testid="tower-panel"></section>
      <div class="place-hint" hidden data-testid="place-hint"></div>
      <div class="captions" aria-live="polite" data-testid="captions"></div>
      <div class="banner" aria-live="assertive" data-testid="banner"></div>
      <dialog class="modal panel pause-modal" data-testid="pause">
        <h2>Paused</h2>
        <div class="col">
          <button class="btn primary" data-act="resume">Resume</button>
          <button class="btn" data-act="settings">Settings</button>
          <button class="btn" data-act="restart">Restart match</button>
          <button class="btn danger" data-act="quit">Quit to loadout</button>
        </div>
      </dialog>
      <dialog class="modal panel end-modal" data-testid="end"></dialog>`;
    root.appendChild(this.el);
    this.$ = (s) => this.el.querySelector(s);
    this.$('.skip').addEventListener('click', () => cb.onSkip());
    this.$('.speed').addEventListener('click', () => cb.onSpeed());
    this.$('.assist-skip').addEventListener('click', () => cb.onAssistSkip());
    this.$('.pause').addEventListener('click', () => cb.onPause());
    const pm = this.$('.pause-modal');
    pm.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (!a) return;
      if (a === 'resume') cb.onResume();
      if (a === 'settings') cb.onSettings();
      if (a === 'restart') cb.onRestart();
      if (a === 'quit') cb.onQuit();
    });
    pm.addEventListener('cancel', (e) => { e.preventDefault(); cb.onResume(); });
    this.lastPanel = '';
    this.selectedUid = null;
  }

  // ------------------------------------------------------------------- hotbar ----------------
  setLoadout(loadout, thumb, costOf = (d) => d.cost) {
    this.loadout = loadout;
    const bar = this.$('.hotbar');
    bar.innerHTML = loadout.map((id, i) => {
      const t = this.content.towers.get(id);
      return `<button class="slot f-${t.faction}" data-tower="${id}" aria-label="${esc(t.name)}, $${costOf(t)}, key ${i + 1}" data-testid="slot-${id}">
        <img alt="" data-thumb="${id}"><kbd>${i + 1}</kbd><span class="nm">${esc(t.name)}</span><span class="cost">$${costOf(t)}</span><span class="why"></span></button>`;
    }).join('');
    bar.onclick = (e) => {
      const s = e.target.closest('[data-tower]');
      if (s) this.cb.onPickTower(s.dataset.tower);
    };
    (async () => {
      for (const id of loadout) {
        if (!this.thumbs.has(id)) this.thumbs.set(id, await thumb(id));
        const img = bar.querySelector(`[data-thumb="${id}"]`);
        if (img) img.src = this.thumbs.get(id);
      }
    })();
  }

  setAbilities(abilities) {
    const box = this.$('.abilities');
    box.innerHTML = abilities.map((a, i) => `<div class="ab" data-ab="${a.id}">
      <button class="abtn" data-cast="${a.id}" aria-label="${esc(a.def.name)} (${ABILITY_KEYS[i]})"><span class="ic" aria-hidden="true">${ABILITY_ICON[a.id] || '✦'}</span><kbd>${ABILITY_KEYS[i]}</kbd><span class="cd" aria-hidden="true"></span><span class="nm">${esc(a.def.name)}</span></button>
      <button class="auto" data-auto="${a.id}" aria-pressed="false" aria-label="${esc(a.def.name)} automatic">AUTO</button></div>`).join('');
    box.onclick = (e) => {
      const c = e.target.closest('[data-cast]');
      if (c) this.cb.onAbility(c.dataset.cast);
      const au = e.target.closest('[data-auto]');
      if (au) this.cb.onAbilityMode(au.dataset.auto, au.getAttribute('aria-pressed') === 'true' ? 'manual' : 'auto');
    };
  }

  // ------------------------------------------------------------------- per frame -------------
  update(m, { placing, speed }) {
    const ws = m.waveCount();
    this.$('[data-testid="wave"]').textContent = Number.isFinite(ws) ? `${m.wave}/${ws}` : `${m.wave}/∞`;
    const left = m.nextWaveAt - m.time;
    const timer = this.$('[data-testid="timer"]');
    timer.textContent = m.mode.score === 'time' && m.phase === 'wave' ? `⏱ ${Math.floor(m.time / 60)}:${String(Math.floor(m.time) % 60).padStart(2, '0')}` : m.phase === 'won' || m.phase === 'lost' ? '-' : m.wave >= ws ? 'Final' : Number.isFinite(left) ? `${Math.max(0, Math.ceil(left))}s` : 'Ready';
    const canSkip = m.phase === 'prep' || m.canSkip();
    const skip = this.$('.skip');
    skip.disabled = !canSkip;
    skip.firstChild.textContent = m.phase === 'prep' ? 'Start wave ' : 'Next wave ';
    this.$('[data-testid="keep"]').textContent = `${Math.max(0, Math.round(m.baseHp))}/${m.baseMax}`;
    const hpf = Math.max(0, m.baseHp / m.baseMax);
    const bar = this.$('.hp .bar span');
    bar.style.width = `${hpf * 100}%`;
    this.$('.hp').classList.toggle('low', hpf < 0.35);
    this.$('[data-testid="cash"]').textContent = m.options.infiniteCash ? '∞' : `$${fmt(m.cash)}`;
    this.$('.speed').textContent = `${speed}x`;
    this.$('.assist-skip').hidden = !(m.tune.skipWave && m.phase === 'wave');
    // boss bar
    const boss = m.enemies.find((e) => e.boss && e.alive);
    const bb = this.$('.bossbar');
    bb.hidden = !boss;
    if (boss) {
      bb.querySelector('.bname').textContent = boss.def.name;
      const phases = boss.def.phases || [];
      bb.querySelector('.bphase').textContent = boss.phase > 0 ? `Phase ${boss.phase + 1}: ${phases[boss.phase - 1]?.name || ''}` : 'Phase 1';
      bb.querySelector('.bhp').style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
      bb.querySelector('.bsh').style.width = `${boss.maxShield ? Math.max(0, boss.shield / boss.maxShield) * 100 : 0}%`;
      bb.querySelector('.bnum').textContent = `${fmt(boss.hp)} HP${boss.shield > 0 ? ` + ${fmt(boss.shield)} shield` : ''}`;
    }
    // hotbar availability (never colour-only: text reason too)
    for (const s of this.el.querySelectorAll('.hotbar .slot')) {
      const id = s.dataset.tower;
      const def = this.content.towers.get(id);
      const count = m.towers.filter((t) => t.defId === id).length;
      const atLimit = def.limit && count >= def.limit;
      const cost = m.costOf(def);
      const poor = m.cash < cost && !m.options.infiniteCash;
      s.classList.toggle('poor', poor && !atLimit);
      s.classList.toggle('max', !!atLimit);
      s.classList.toggle('active', placing === id);
      s.setAttribute('aria-pressed', String(placing === id));
      s.querySelector('.why').textContent = atLimit ? `max ${def.limit}` : poor ? `need $${cost - m.cash}` : `${count ? `${count} built` : ''}`;
    }
    // abilities
    for (const a of m.abilities) {
      const el = this.el.querySelector(`[data-ab="${a.id}"]`);
      if (!el) continue;
      const left2 = Math.max(0, a.ready - m.time);
      el.querySelector('.cd').textContent = left2 > 0 ? `${Math.ceil(left2)}` : '';
      el.querySelector('.abtn').style.setProperty('--cd', String(left2 > 0 ? left2 / a.def.cooldown : 0));
      el.querySelector('.abtn').classList.toggle('ready', left2 <= 0);
      const au = el.querySelector('[data-auto]');
      au.setAttribute('aria-pressed', String(a.mode === 'auto'));
    }
    if (this.selectedUid) this.renderPanel(m);
  }

  // ------------------------------------------------------------------- tower panel -----------
  select(uid, m) {
    this.selectedUid = uid;
    this.lastPanel = '';
    const p = this.$('.tower-panel');
    p.hidden = !uid;
    if (uid) this.renderPanel(m);
  }

  renderPanel(m) {
    const t = m.towerById(this.selectedUid);
    const p = this.$('.tower-panel');
    if (!t) { p.hidden = true; this.selectedUid = null; return; }
    const eff = m.effective(t);
    const b = t.base;
    const n = nextStep(t.def, t.up, null);
    const key = JSON.stringify([t.uid, t.up, t.targeting, Math.floor(m.cash / 25), t.kills, Math.round(t.damage / 50), t.stunUntil > m.time]);
    if (key === this.lastPanel) return;
    this.lastPanel = key;
    const pips = [];
    const totalSteps = (t.def.upgrades?.linear?.length || 0) + Math.max(0, ...Object.values(t.def.upgrades?.branches || {}).map((x) => x.steps.length));
    for (let i = 0; i < totalSteps; i++) pips.push(`<i class="${i < t.tier ? 'on' : ''}"></i>`);
    const dps = (eff.damage || 0) * (eff.rate || 0);
    const stats = [];
    if (b.damage) stats.push(['Damage', `${eff.damage.toFixed(eff.damage < 10 ? 1 : 0)} <span class="dt" style="color:${DAMAGE_COLORS[b.damageType] || '#fff'}">${esc(b.damageType || '')}</span>`]);
    if (b.rate) stats.push(['Attacks/s', eff.rate.toFixed(2)]);
    if (dps) stats.push(['DPS', dps.toFixed(0)]);
    if (eff.range) stats.push(['Range', `${eff.range.toFixed(1)} m`]);
    if (b.splash) stats.push(['Splash', `${b.splash.toFixed(1)} m`]);
    if (b.chain) stats.push(['Chain', `${b.chain.count} targets`]);
    if (b.slow) stats.push(['Slow', `${Math.round(b.slow.amount * 100)}% for ${b.slow.duration}s`]);
    if (b.burn) stats.push(['Burn', `${b.burn.dps}/s`]);
    if (b.income) stats.push(['Income', `$${b.income}/wave`]);
    if (b.aura) stats.push(['Aura', Object.entries(b.aura).map(([k, v]) => (v === true ? k : `+${Math.round(v * 100)}% ${k}`)).join(', ')]);
    if (b.summon) stats.push(['Summons', `${b.summon.max} x ${b.summon.unit.id.replace('_', ' ')}`]);
    stats.push(['Hits air', b.targets?.air ? 'Yes' : 'No']);
    stats.push(['Detection', eff.detection ? 'Yes' : 'No']);
    stats.push(['Kills', t.kills]);
    let upgrade = '';
    if (!n) upgrade = '<p class="maxed">★ Fully upgraded</p>';
    else if (n.needsBranch) {
      upgrade = `<div class="branches">${n.options.map((br) => {
        const bd = t.def.upgrades.branches[br];
        const st = bd.steps[0];
        const sc = m.stepCost(st);
        const poor = m.cash < sc && !m.options.infiniteCash;
        return `<button class="branch ${poor ? 'poor' : ''}" data-branch="${br}" data-testid="branch-${br}"><b>Path ${br}: ${esc(bd.name)}</b><span>${esc(bd.desc || '')}</span><span class="nx">${esc(st.name)}: ${esc(st.desc || '')}</span><span class="cost">$${sc}${poor ? ` · need $${sc - m.cash}` : ''}</span></button>`;
      }).join('')}</div>`;
    } else {
      const sc = m.stepCost(n.step);
      const poor = m.cash < sc && !m.options.infiniteCash;
      const after = towerStats(t.def, { ...t.up, ...(n.kind === 'linear' ? { linear: t.up.linear + 1 } : { branch: n.branch, branchLevel: t.up.branchLevel + 1 }) }, t.lobbyLevel, m.progression);
      upgrade = `<button class="btn primary upgrade ${poor ? 'poor' : ''}" data-act="upgrade" data-testid="upgrade"><b>${esc(n.step.name)}</b><span>${esc(n.step.desc || '')}</span>${n.step.evolve ? `<span class="evo">Evolves into ${esc(after.name)}</span>` : ''}<span class="cost">$${sc}${poor ? ` · need $${sc - m.cash}` : ''} <kbd>U</kbd></span></button>`;
    }
    const refund = m.refundOf(t);
    p.innerHTML = `
      <header><div><h2 data-testid="tower-name">${esc(t.name)}</h2><div class="pips" aria-label="Tier ${t.tier} of ${totalSteps}">${pips.join('')}</div></div>
      <button class="icon-btn" data-act="close" aria-label="Close">✕</button></header>
      ${t.stunUntil > m.time ? '<p class="stunned">⚠ Stunned</p>' : ''}
      <dl>${stats.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      ${b.damage || b.trap ? `<div class="targeting" role="radiogroup" aria-label="Targeting">${TARGET_MODES.map((mode) => `<button role="radio" aria-checked="${t.targeting === mode}" data-target="${mode}">${TARGET_LABEL[mode]}</button>`).join('')}</div>` : ''}
      ${upgrade}
      <div class="row2"><button class="btn" data-act="move" data-testid="move">Move <kbd>M</kbd></button><button class="btn danger" data-act="sell" data-testid="sell">Sell $${refund}</button></div>`;
    p.onclick = (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'close') this.cb.onDeselect();
      if (a === 'upgrade') this.cb.onUpgrade(null);
      if (a === 'move') this.cb.onMove();
      if (a === 'sell') {
        const btn = e.target.closest('[data-act]');
        if (btn.dataset.confirm) this.cb.onSell();
        else { btn.dataset.confirm = '1'; btn.textContent = `Confirm sell $${refund}`; }
      }
      const br = e.target.closest('[data-branch]');
      if (br) this.cb.onUpgrade(br.dataset.branch);
      const tg = e.target.closest('[data-target]');
      if (tg) this.cb.onTargeting(tg.dataset.target);
    };
  }

  // ------------------------------------------------------------------- misc ------------------
  hint(text, ok) {
    const h = this.$('.place-hint');
    h.hidden = !text;
    if (text) {
      h.textContent = `${ok ? '✓' : '✕'} ${text}`;
      h.classList.toggle('bad', !ok);
    }
  }

  caption(text) {
    const box = this.$('.captions');
    const el = document.createElement('div');
    el.textContent = `[${text}]`;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 3500);
  }

  banner(text, kind = '') {
    const b = this.$('.banner');
    b.textContent = text;
    b.className = `banner show ${kind}`;
    clearTimeout(this._bt);
    this._bt = setTimeout(() => { b.className = 'banner'; }, 2600);
  }

  setPaused(on) {
    const d = this.$('.pause-modal');
    if (on && !d.open) d.showModal();
    if (!on && d.open) d.close();
  }

  showEnd(res, rewards) {
    const d = this.$('.end-modal');
    const won = res.won;
    d.innerHTML = `<h2 class="${won ? 'won' : 'lost'}">${won ? '★ Victory' : '✕ Defeat'}</h2>
      <p class="sub">${esc(res.presetLabel || res.preset || '')} tuning${res.assisted ? ` · <b class="assisted" data-testid="assisted">✚ Assist: ${esc(res.assists.join(', '))}</b>` : ''}</p>
      <p class="sub">${res.mode === 'endless' ? `Endless: you survived ${res.score} waves.` : res.mode === 'time_attack' && won ? `Time: ${Math.floor(res.score / 60)}:${String(res.score % 60).padStart(2, '0')}` : won ? 'The keep stands. The rift is sealed, for now.' : `The keep fell on wave ${res.wave}.`}</p>
      <dl class="endstats"><dt>Waves</dt><dd>${res.wave}/${res.waves}</dd><dt>Kills</dt><dd>${res.stats.kills}</dd><dt>Leaks</dt><dd>${res.stats.leaks}</dd>
      <dt>Damage</dt><dd>${fmt(res.stats.damage)}</dd><dt>Keep</dt><dd>${Math.max(0, Math.round(res.baseHp))}</dd><dt>Time</dt><dd>${Math.floor(res.ticks / 3600)}:${String(Math.floor(res.ticks / 60) % 60).padStart(2, '0')}</dd></dl>
      <div class="rewards" data-testid="rewards">${rewards.sandbox ? 'Sandbox: no rewards' : rewards.granted ? `+${rewards.crowns} Crowns · +${rewards.xp} XP${rewards.sigils ? ` · +${rewards.sigils} Sigils` : ''}${rewards.daily ? ' · Daily challenge complete!' : ''}${rewards.levels?.length ? ` · Level ${rewards.levels[rewards.levels.length - 1].level}!` : ''}` : 'Rewards already claimed for this match'}</div>
      <div class="row2"><button class="btn primary" data-act="again" data-testid="again">Play again</button><button class="btn" data-act="lobby">Change loadout</button></div>`;
    if (!d.open) d.showModal();
    d.onclick = (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a) { d.close(); this.cb.onEnd(a); }
    };
    d.oncancel = (e) => e.preventDefault();
  }

  get modalOpen() {
    return [...this.el.querySelectorAll('dialog')].some((d) => d.open);
  }

  setVisible(v) {
    this.el.classList.toggle('hidden', !v);
  }
}
