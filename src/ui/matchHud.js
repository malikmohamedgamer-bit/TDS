// Match HUD: status bar, boss bar, tower hotbar, tower panel (upgrades / targeting / move / sell),
// abilities, placement hint, loadout + difficulty screen, pause and end screens, captions.
import { nextStep, towerStats } from '../sim/stats.js';
import { TARGET_MODES } from '../sim/combat.js';
import { DAMAGE_COLORS } from '../engine/effects.js';
import { icon, abilityIcon } from './icons.js';
import { countUp } from './counter.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TARGET_LABEL = { first: 'First', last: 'Last', strongest: 'Strongest', weakest: 'Weakest', fastest: 'Fastest', closest: 'Closest', flying: 'Flying only' };
const ABILITY_KEYS = ['Z', 'X', 'G', 'V'];
export const HOTBAR_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];
export const DEFAULT_LOADOUT = ['rifleman', 'ember_adept', 'frost_weaver', 'marksman', 'rocket_battery', 'storm_caller'];

const fmt = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${Math.round(n)}`);

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
        <div class="st wave" data-tip="Current wave / total">${icon('wave')}<div class="stk"><span class="k">Wave</span><b data-testid="wave">0/20</b><div class="wavebar" aria-hidden="true"><span></span></div></div></div>
        <div class="st timer" data-tip="Time until the next wave starts on its own">${icon('timer')}<div class="stk"><span class="k">Next</span><b data-testid="timer">-</b></div></div>
        <button class="btn skip" data-testid="skip" aria-label="Start next wave (N)">Next wave <kbd>N</kbd></button>
        <div class="st hp" data-tip="Keep health: enemies that reach the keep damage it">${icon('keep')}<div class="stk"><span class="k">Keep</span><div class="bar" aria-hidden="true"><span></span></div><b data-testid="keep">150</b></div></div>
        <div class="st cash" data-tip="Cash for towers and upgrades this match">${icon('cash')}<div class="stk"><span class="k">Cash</span><b data-testid="cash">$0</b></div></div>
        <button class="btn assist-skip" data-testid="assist-skip" hidden aria-label="Assist: skip this whole wave">✚ Skip this wave</button>
        <button class="btn speed" data-testid="speed" aria-label="Game speed">1x</button>
        <button class="icon-btn pause" aria-label="Pause (P)">${icon('pause')}</button>
      </div>
      <div class="bossbar panel" hidden data-testid="bossbar" role="group" aria-label="Boss health"><div class="bname">${icon('boss')}<span></span>${icon('boss')}</div><div class="bphase"></div><div class="bbar"><span class="bhp"></span><span class="bsh"></span></div><div class="bnum"></div></div>
      <div class="hotbar" role="toolbar" aria-label="Towers" data-testid="hotbar"></div>
      <div class="abilities" role="toolbar" aria-label="Abilities" data-testid="abilities"></div>
      <section class="tower-panel panel" hidden aria-label="Selected tower" data-testid="tower-panel"></section>
      <div class="place-hint" hidden data-testid="place-hint"></div>
      <div class="captions" aria-live="polite" data-testid="captions"></div>
      <div class="banner" aria-live="assertive" data-testid="banner"></div>
      <dialog class="modal panel pause-modal" data-testid="pause">
        <h2>Paused</h2>
        <div class="report" data-testid="battle-report"></div>
        <div class="col">
          <button class="btn primary" data-act="resume">${icon('play')} Resume</button>
          <button class="btn" data-act="settings">${icon('settings')} Settings</button>
          <button class="btn" data-act="restart">${icon('restart')} Restart match</button>
          <button class="btn danger" data-act="quit">${icon('exit')} Quit to loadout</button>
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
      <button class="abtn" data-cast="${a.id}" aria-label="${esc(a.def.name)} (${ABILITY_KEYS[i]})">${icon(abilityIcon(a.id))}<kbd>${ABILITY_KEYS[i]}</kbd><span class="cd" aria-hidden="true"></span><span class="nm">${esc(a.def.name)}</span></button>
      <button class="auto" data-auto="${a.id}" data-tip="${esc(a.def.description || '')}" aria-pressed="false" aria-label="${esc(a.def.name)} automatic">AUTO</button></div>`).join('');
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
    this.$('.wavebar span').style.width = `${Number.isFinite(ws) ? Math.min(1, m.wave / ws) * 100 : 100}%`;
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
      bb.querySelector('.bname span').textContent = boss.def.name;
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
    if (b.damage) stats.push(['Damage', `${eff.damage.toFixed(eff.damage < 10 ? 1 : 0)} <span class="dt" style="color:${DAMAGE_COLORS[b.damageType] || '#fff'}">${icon(b.damageType || 'physical')}${esc(b.damageType || '')}</span>`]);
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
      <button class="icon-btn" data-act="close" aria-label="Close">${icon('cross')}</button></header>
      ${t.stunUntil > m.time ? `<p class="stunned">${icon('warn')} Stunned</p>` : ''}
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

  /** Battle report table (pause screen): damage share, kills and damage per cash for each tower type. */
  setReport(rep) {
    const el = this.$('.report');
    if (!rep || !rep.rows.length) { el.innerHTML = '<p class="note">No towers placed yet.</p>'; return; }
    const f = (n) => Math.round(n).toLocaleString('en-US');
    el.innerHTML = `<table class="rep"><caption>Battle report: ${f(rep.total)} damage, ${f(rep.stats.kills)} kills, $${f(rep.stats.cashEarned)} earned, ${f(rep.stats.leaks)} leaked</caption>
      <thead><tr><th scope="col">Tower</th><th scope="col">Damage</th><th scope="col">Kills</th><th scope="col" title="Damage per cash spent">Dmg / $</th></tr></thead>
      <tbody>${rep.rows.slice(0, 8).map((r) => `<tr><th scope="row">${esc(r.name)}${r.count > 1 ? ` x${r.count}` : ''}<span class="rep-bar" aria-hidden="true"><i style="width:${(r.share * 100).toFixed(1)}%"></i></span></th><td>${f(r.damage)} <small>${Math.round(r.share * 100)}%</small></td><td>${f(r.kills)}</td><td>${r.perCash.toFixed(1)}</td></tr>`).join('')}
      ${rep.hero > 0 ? `<tr><th scope="row">Hero, abilities and allies</th><td>${f(rep.hero)} <small>${Math.round((rep.hero / rep.total) * 100)}%</small></td><td></td><td></td></tr>` : ''}</tbody></table>`;
  }

  setPaused(on) {
    const d = this.$('.pause-modal');
    if (on && !d.open) d.showModal();
    if (!on && d.open) d.close();
  }

  showEnd(res, rewards) {
    const d = this.$('.end-modal');
    const won = res.won;
    const time = `${Math.floor(res.ticks / 3600)}:${String(Math.floor(res.ticks / 60) % 60).padStart(2, '0')}`;
    const stat = (k, v, n) => `<div><dt>${k}</dt><dd${n !== undefined ? ` data-count="${n}"` : ''}>${v}</dd></div>`;
    const rw = [];
    if (rewards.granted && !rewards.sandbox) {
      rw.push(`<span class="rw">${icon('crown')} +<span data-count="${rewards.crowns}">${rewards.crowns}</span> Crowns</span>`);
      rw.push(`<span class="rw">${icon('star')} +<span data-count="${rewards.xp}">${rewards.xp}</span> XP</span>`);
      if (rewards.sigils) rw.push(`<span class="rw">${icon('sigil')} +<span data-count="${rewards.sigils}">${rewards.sigils}</span> Sigils</span>`);
    }
    const extra = rewards.sandbox ? 'Sandbox: no rewards' : !rewards.granted ? 'Rewards already claimed for this match'
      : [rewards.daily ? 'Daily challenge complete!' : '', rewards.levels?.length ? `Level ${rewards.levels[rewards.levels.length - 1].level}!` : ''].filter(Boolean).join(' · ');
    d.classList.toggle('lost', !won);
    d.innerHTML = `<div class="end-hero">${icon(won ? 'trophy' : 'skull', { cls: 'end-ic' })}
      <h2 class="${won ? 'won' : 'lost'}">${won ? 'Victory' : 'Defeat'}</h2>
      <p class="sub">${res.mode === 'endless' ? `Endless: you survived ${res.score} waves.` : res.mode === 'time_attack' && won ? `Time: ${Math.floor(res.score / 60)}:${String(res.score % 60).padStart(2, '0')}` : won ? 'The keep stands. The rift is sealed, for now.' : `The keep fell on wave ${res.wave}.`}</p>
      <p class="sub">${esc(res.presetLabel || res.preset || '')} tuning${res.assisted ? ` · <b class="assisted" data-testid="assisted">✚ Assist: ${esc(res.assists.join(', '))}</b>` : ''}</p></div>
      <div class="end-body"><dl class="endstats">${stat('Waves', `${res.wave}/${res.waves}`)}${stat('Kills', res.stats.kills, res.stats.kills)}${stat('Leaks', res.stats.leaks, res.stats.leaks)}${stat('Damage', fmt(res.stats.damage))}${stat('Keep', Math.max(0, Math.round(res.baseHp)), Math.max(0, Math.round(res.baseHp)))}${stat('Time', time)}</dl>
      <div class="rewards" data-testid="rewards">${rw.join('')}${extra ? `<span class="rw-note">${extra}</span>` : ''}</div>
      <div class="row2"><button class="btn primary big" data-act="again" data-testid="again">${icon('restart')} Play again</button><button class="btn" data-act="lobby">${icon('back')} Change loadout</button></div></div>`;
    if (!d.open) d.showModal();
    countUp(d, { reduced: document.body.classList.contains('reduced-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches });
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
