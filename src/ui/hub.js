// Lobby hub: Play (difficulty, loadout, tutorial), Towers (locked / unlocked, permanent levels and
// evolutions), Summon (slot machine), Shop, Index (silhouettes until discovered), Quests and
// Daily rewards. All state changes go through src/meta/meta.js and are saved immediately.
import {
  levelForXp, summon, dailyDeal, buyTower, buyBundle, levelUpTower, levelUpCost, towerPrice, questStatus, claimQuest,
  dailyStatus, claimDaily, localDate, owns, unlockedSpeeds, dailyChallenge,
} from '../meta/meta.js';
import { towerStats } from '../sim/stats.js';
import { SlotMachine, RARITY_SYMBOL, RARITY_LABEL, revealCutscene } from './slotMachine.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const TABS = [['play', 'Play'], ['towers', 'Towers'], ['summon', 'Summon'], ['shop', 'Shop'], ['index', 'Index'], ['quests', 'Quests'], ['daily', 'Daily']];
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const rewardText = (r) => Object.entries(r || {}).map(([k, v]) => `${k === 'crowns' ? '👑' : k === 'sigils' ? '✦' : k} ${fmt(v)}`).join(' + ');

export class Hub {
  constructor(root, ctx) {
    // ctx: {content, save, settings, sfx, persist(), towerThumb(id, silhouette), enemyThumb(id, silhouette), modes}
    this.ctx = ctx;
    this.c = ctx.content;
    this.meta = ctx.content.meta;
    this.tab = 'play';
    this.el = document.createElement('dialog');
    this.el.className = 'modal panel hub';
    this.el.dataset.testid = 'lobby';
    root.appendChild(this.el);
    this.el.addEventListener('cancel', (e) => e.preventDefault());
    this.thumbs = new Map();
  }

  get save() {
    return this.ctx.save;
  }

  date() {
    return this.ctx.date ? this.ctx.date() : localDate();
  }

  /** Opens the hub; resolves with the chosen match config when the player presses Start. */
  open({ difficulty = 'normal', loadout, mode = 'campaign', tutorial = !this.save.progress.tutorialDone } = {}) {
    this.cfg = { difficulty, mode, modifiers: [], loadout: (loadout || []).filter((id) => owns(this.save, id)).slice(0, 6), tutorial };
    if (!this.cfg.loadout.length) this.cfg.loadout = Object.keys(this.save.towers.owned).slice(0, 6);
    this.render();
    if (!this.el.open) this.el.showModal();
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  close() {
    if (this.el.open) this.el.close();
  }

  toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = `hub-toast ${kind}`;
    t.textContent = text;
    this.el.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  badgeCounts() {
    const qs = questStatus(this.save, this.c.quests, this.c, this.date());
    return { quests: qs.filter((q) => q.done && !q.claimed).length, daily: dailyStatus(this.save, this.meta, this.date()).claimedToday ? 0 : 1 };
  }

  render() {
    const s = this.save;
    const lv = levelForXp(this.meta, s.profile.xp);
    const badges = this.badgeCounts();
    this.el.innerHTML = `
      <header class="hub-head">
        <div class="lvl" title="Player level"><b data-testid="player-level">Lv ${s.profile.level}</b><div class="xpbar" aria-label="XP ${lv.into} of ${lv.need}"><span style="width:${(lv.into / lv.need) * 100}%"></span></div><small>${fmt(lv.into)}/${fmt(lv.need)} XP</small></div>
        <div class="wallet"><span title="Crowns (earned in matches)" data-testid="crowns">👑 ${fmt(s.wallet.crowns)}</span><span title="Sigils (summoning)" data-testid="sigils">✦ ${fmt(s.wallet.sigils)}</span></div>
      </header>
      <nav class="hub-tabs" role="tablist" aria-label="Lobby">${TABS.map(([id, label]) => `<button role="tab" data-tab="${id}" aria-selected="${this.tab === id}" data-testid="tab-${id}">${label}${badges[id] ? `<i class="badge" aria-label="${badges[id]} ready">${badges[id]}</i>` : ''}</button>`).join('')}</nav>
      <section class="hub-body" role="tabpanel" data-testid="panel-${this.tab}">${this['_' + this.tab]()}</section>`;
    this.el.querySelector('.hub-tabs').onclick = (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      this.tab = b.dataset.tab;
      this.ctx.sfx?.play('ui');
      this.render();
      this.el.querySelector(`[data-tab="${this.tab}"]`)?.focus();
    };
    this.el.querySelector('.hub-body').onclick = (e) => this.onClick(e);
    this.el.querySelector('.hub-body').onchange = (e) => this.onChange(e);
    this.fillThumbs();
    if (this.tab === 'summon') this.mountSlot();
  }

  async fillThumbs() {
    for (const img of this.el.querySelectorAll('img[data-thumb]')) {
      const key = img.dataset.thumb;
      if (!this.thumbs.has(key)) {
        const [kind, id, sil] = key.split(':');
        try { this.thumbs.set(key, kind === 'e' ? await this.ctx.enemyThumb(id, sil === '1') : await this.ctx.towerThumb(id, sil === '1')); } catch { this.thumbs.set(key, ''); }
      }
      img.src = this.thumbs.get(key);
    }
  }

  // ------------------------------------------------------------------------- tabs ----------
  _play() {
    const diffs = [...this.c.difficulties.values()].sort((a, b) => a.order - b.order);
    const modes = [...(this.c.modes?.values() || [])].map((m) => ({ ...m, locked: m.unlockLevel && this.save.profile.level < m.unlockLevel ? `Reach player level ${m.unlockLevel}` : null }));
    const mapId = this.ctx.mapId || 'riftline';
    const maps = [...this.c.maps.values()].map((m) => ({ ...m, locked: m.unlockLevel && this.save.profile.level < m.unlockLevel ? `Reach player level ${m.unlockLevel}` : null }));
    for (const m of modes) if (!m.locked && m.map && m.map !== mapId) m.locked = `Played on ${this.c.maps.get(m.map)?.name || m.map}`;
    if (modes.find((m) => m.id === this.cfg.mode)?.locked) this.cfg.mode = 'campaign';
    const mode = this.c.modes?.get(this.cfg.mode) || { id: 'campaign' };
    const daily = mode.daily ? dailyChallenge(this.c, this.date()) : null;
    const anyTower = !!mode.allTowers;
    const mods = [...(this.c.modifiers?.values() || [])];
    const modMul = this.cfg.modifiers.reduce((a, id) => a * (this.c.modifiers.get(id)?.rewardMul || 1), 1);
    const towers = [...this.c.towers.values()].sort((a, b) => ORDER.indexOf(a.rarity) - ORDER.indexOf(b.rarity) || a.cost - b.cost);
    const speeds = unlockedSpeeds(this.save, this.meta);
    if (daily) this.cfg.loadout = daily.loadout.slice();
    const usable = (id) => anyTower || owns(this.save, id);
    return `
      ${maps.length > 1 ? `<fieldset><legend>Map</legend><div class="diffs maps" role="radiogroup" aria-label="Map">${maps.map((m) => `<label><input type="radio" name="map" value="${m.id}" data-testid="map-${m.id}" ${m.id === mapId ? 'checked' : ''} ${m.locked ? 'disabled' : ''}><span><b>${m.locked ? '🔒 ' : ''}${esc(m.name)}</b><small>${esc(m.locked || `${m.paths.length} road${m.paths.length > 1 ? 's' : ''}${this.save.progress.bestDifficultyWon >= 0 && this.save.progress.best?.[m.id] ? ` · best ${Math.max(...Object.values(this.save.progress.best[m.id]))} waves` : ''}`)}</small></span></label>`).join('')}</div></fieldset>` : ''}
      ${this.c.heroes.size > 1 ? `<fieldset><legend>Hero</legend><div class="diffs heroes" role="radiogroup" aria-label="Hero">${[...this.c.heroes.values()].map((h) => `<label><input type="radio" name="hero" value="${h.id}" data-testid="hero-${h.id}" ${h.id === this.ctx.heroId ? 'checked' : ''}><span><b>${esc(h.name)}</b><small>${esc(h.abilities.map((a) => this.c.abilities.get(a)?.name || a).join(' · '))}</small></span></label>`).join('')}</div></fieldset>` : ''}
      ${modes.length > 1 ? `<fieldset><legend>Mode</legend><div class="diffs modes" role="radiogroup" aria-label="Mode">${modes.map((m) => `<label><input type="radio" name="mode" value="${m.id}" data-testid="mode-${m.id}" ${m.id === this.cfg.mode ? 'checked' : ''} ${m.locked ? 'disabled' : ''}><span><b>${m.locked ? '🔒 ' : ''}${esc(m.name)}</b><small>${esc(m.locked ? m.locked : m.desc)}</small></span></label>`).join('')}</div></fieldset>` : ''}
      ${mode.modifiers ? `<fieldset><legend>Modifiers <span class="count">reward x${modMul.toFixed(2)}</span></legend><div class="mods">${mods.map((x) => `<label class="row"><input type="checkbox" name="mod" value="${x.id}" ${this.cfg.modifiers.includes(x.id) ? 'checked' : ''}> <b>${esc(x.name)}</b> <small>${esc(x.desc)} · x${x.rewardMul}</small></label>`).join('')}</div></fieldset>` : ''}
      ${daily ? `<fieldset data-testid="daily-challenge"><legend>Today (${daily.date})</legend><p class="note">Difficulty: ${esc(this.c.difficulties.get(daily.difficulty).name)} (fixed). Modifiers: ${daily.modifiers.map((id) => `<b>${esc(this.c.modifiers.get(id).name)}</b> (${esc(this.c.modifiers.get(id).desc)})`).join(', ')}. Loaner loadout below, every tower at level ${Object.values(daily.levels)[0]}. Win for ${Object.entries(daily.reward).map(([k, v]) => `${v} ${k}`).join(' + ')}${this.save.claimed.includes(daily.rewardId) ? ' (already claimed today)' : ''}.</p></fieldset>` : ''}
      ${mode.sandbox ? '<p class="note">Sandbox: infinite cash, every tower, press Next wave any time. No rewards, no records.</p>' : ''}
      <fieldset><legend>Difficulty</legend><div class="diffs" role="radiogroup" aria-label="Difficulty">
        ${diffs.map((d) => `<label><input type="radio" name="diff" value="${d.id}" ${(daily ? d.id === daily.difficulty : d.id === this.cfg.difficulty) ? 'checked' : ''} ${daily ? 'disabled' : ''}><span><b>${esc(d.name)}</b><small>${d.id === 'relaxed' ? 'slower enemies, 2x keep' : `${d.hpMul}x enemy health`}${this.save.progress.best?.[mapId]?.[d.id] ? ` · best ${this.save.progress.best[mapId][d.id]}` : ''}</small></span></label>`).join('')}
      </div></fieldset>
      <fieldset><legend>Loadout <span class="count" data-testid="loadout-count">${this.cfg.loadout.length}/6</span></legend><div class="cards" data-testid="loadout">
        ${towers.map((t) => {
          const own = usable(t.id);
          const on = this.cfg.loadout.includes(t.id);
          const lvl = daily?.levels[t.id] ?? (this.save.towers.owned[t.id]?.level || 1);
          return `<button class="card ${on ? 'on' : ''} ${own ? '' : 'locked'} f-${t.faction} r-${t.rarity}" data-tower="${t.id}" aria-pressed="${on}" ${own ? '' : 'aria-disabled="true"'}>
            <img alt="" data-thumb="t:${t.id}:${own ? 0 : 1}"><span class="nm">${own ? esc(t.name) : `🔒 ${esc(t.name)}`}</span>
            <span class="meta">${t.faction === 'magic' ? 'Magic' : 'War'} · ${esc(t.class)}${own ? ` · Lv ${lvl}` : ''}</span>
            <span class="rar">${RARITY_SYMBOL[t.rarity]} ${RARITY_LABEL[t.rarity]}</span>
            ${own ? `<span class="cost">$${t.cost}</span>` : '<span class="lockd">Shop or Summon</span>'}
            ${on ? `<span class="slot">${this.cfg.loadout.indexOf(t.id) + 1}</span>` : ''}</button>`;
        }).join('')}
      </div></fieldset>
      <div class="row-end">
        <div><label class="row"><input type="checkbox" name="tutorial" ${this.cfg.tutorial ? 'checked' : ''}> Tutorial</label>
        <small class="note">Game speeds unlocked: ${speeds.map((x) => `${x}x`).join(', ')}${speeds.includes(3) ? '' : ` · next: ${this.meta.speeds.find((x) => !speeds.includes(x.speed))?.label || ''}`}</small></div>
        <button class="btn primary big" data-act="start" ${this.cfg.loadout.length ? '' : 'disabled'} data-testid="start">Start match</button>
      </div>`;
  }

  _towers() {
    const prog = this.c.progression.towerLevels;
    const towers = [...this.c.towers.values()].sort((a, b) => Number(owns(this.save, b.id)) - Number(owns(this.save, a.id)) || ORDER.indexOf(a.rarity) - ORDER.indexOf(b.rarity));
    return `<p class="note">Permanent levels make a tower stronger in every match (+${Math.round(prog.perLevel.damage * 100)}% damage per level) and evolve it at levels ${prog.evolutions.map((e) => `${e.level} (${e.prefix})`).join(', ')}.</p>
      <div class="tower-list" data-testid="tower-list">${towers.map((t) => {
        const own = owns(this.save, t.id);
        const lv = own ? this.save.towers.owned[t.id].level : 1;
        const st = towerStats(t, undefined, lv, prog);
        const cost = own && lv < prog.maxLevel ? levelUpCost(prog, lv) : null;
        const next = prog.evolutions.find((e) => e.level > lv);
        const dps = (st.stats.damage || 0) * (st.stats.rate || 0);
        return `<div class="trow ${own ? '' : 'locked'} r-${t.rarity}" data-testid="trow-${t.id}">
          <img alt="" data-thumb="t:${t.id}:${own ? 0 : 1}">
          <div class="tinfo"><b>${own ? esc(st.name) : `🔒 ${esc(t.name)}`}</b><small>${RARITY_SYMBOL[t.rarity]} ${RARITY_LABEL[t.rarity]} · ${t.faction === 'magic' ? 'Magic' : 'War'} · ${esc(t.class)}</small>
          <small>${esc(t.description || '')}</small>
          ${own ? `<div class="lvbar" aria-label="Level ${lv} of ${prog.maxLevel}"><span style="width:${(lv / prog.maxLevel) * 100}%"></span></div><small>Level ${lv}/${prog.maxLevel}${dps ? ` · ${dps.toFixed(0)} DPS` : ''}${next ? ` · evolves at ${next.level}` : ' · fully evolved'}</small>` : `<small>Unlock: Shop 👑 ${fmt(towerPrice(this.meta, t))} or Summon</small>`}</div>
          ${own ? (cost !== null ? `<button class="btn ${this.save.wallet.crowns >= cost ? 'primary' : ''}" data-levelup="${t.id}" data-testid="levelup-${t.id}">Level up 👑 ${fmt(cost)}</button>` : '<span class="maxed">★ Max</span>') : `<button class="btn" data-goto="shop">Unlock…</button>`}
        </div>`;
      }).join('')}</div>`;
  }

  _summon() {
    const b = this.meta.summon.banners[0];
    const w = this.meta.summon.rarityWeights;
    const total = Object.values(w).reduce((a, x) => a + x, 0);
    const counts = {};
    for (const t of this.c.towers.values()) counts[t.rarity] = (counts[t.rarity] || 0) + 1;
    return `<div class="summon">
      <div class="sm-host"></div>
      <div class="sm-side">
        <h3>${esc(b.name)}</h3><p class="note">${esc(b.description)} Free in-game sigils only.</p>
        <div class="row2"><button class="btn primary big" data-pull="1" data-testid="pull-1">Pull ✦ ${b.cost}</button><button class="btn primary big" data-pull="10" data-testid="pull-10">10x ✦ ${b.cost10}</button></div>
        <button class="btn" data-act="skip-anim" data-testid="skip-anim">Skip animation</button>
        <label class="row"><input type="checkbox" name="alwaysSkip" ${this.ctx.settings.skipSummonAnim ? 'checked' : ''}> Always skip animations</label>
        <p class="note">Pity: ${this.save.summon.pity}/${this.meta.summon.pity.pulls} pulls towards a guaranteed ${RARITY_LABEL[this.meta.summon.pity.minRarity]}. Duplicates turn into crowns.</p>
        <table class="odds"><caption>Odds</caption>${Object.entries(w).map(([r, x]) => `<tr><th>${RARITY_SYMBOL[r]} ${RARITY_LABEL[r]}</th><td>${((x / total) * 100).toFixed(1)}%</td><td>${counts[r] ? `${counts[r]} towers` : 'none yet (falls back)'}</td></tr>`).join('')}</table>
        <div class="pull-results" data-testid="pull-results"></div>
      </div></div>`;
  }

  _shop() {
    const deal = dailyDeal(this.save, this.c, this.meta, this.date());
    const locked = [...this.c.towers.values()].filter((t) => !owns(this.save, t.id)).sort((a, b) => towerPrice(this.meta, a) - towerPrice(this.meta, b));
    return `${deal ? `<div class="deal" data-testid="daily-deal"><img alt="" data-thumb="t:${deal.tower}:0"><div><b>Daily deal: ${esc(this.c.towers.get(deal.tower).name)}</b><small><s>👑 ${fmt(deal.full)}</s> 👑 ${fmt(deal.price)} today only</small></div><button class="btn primary" data-buy="${deal.tower}">Buy 👑 ${fmt(deal.price)}</button></div>` : '<p class="note">You own every tower. More arrive with new content.</p>'}
      <h3>Towers</h3><div class="shop-grid">${locked.map((t) => `<div class="shop-item r-${t.rarity}"><img alt="" data-thumb="t:${t.id}:0"><b>${esc(t.name)}</b><small>${RARITY_SYMBOL[t.rarity]} ${RARITY_LABEL[t.rarity]}</small><button class="btn ${this.save.wallet.crowns >= towerPrice(this.meta, t) ? 'primary' : ''}" data-buy="${t.id}" data-testid="buy-${t.id}">👑 ${fmt(deal && deal.tower === t.id ? deal.price : towerPrice(this.meta, t))}</button></div>`).join('') || '<p class="note">Nothing left to buy.</p>'}</div>
      <h3>Sigils</h3><div class="shop-grid">${this.meta.shop.bundles.map((b) => `<div class="shop-item"><b>${esc(b.name)}</b><small>${rewardText(b.gives)}</small><button class="btn" data-bundle="${b.id}">${rewardText(b.price)}</button></div>`).join('')}</div>`;
  }

  _index() {
    const towers = [...this.c.towers.values()];
    const enemies = [...this.c.enemies.values()];
    const seenT = new Set([...Object.keys(this.save.towers.owned), ...this.save.index.towers]);
    const seenE = new Set(this.save.index.enemies);
    const card = (kind, x, known) => `<div class="ix ${known ? '' : 'unknown'}" data-testid="ix-${x.id}"><img alt="" data-thumb="${kind}:${x.id}:${known ? 0 : 1}"><b>${known ? esc(x.name) : '???'}</b><small>${known ? esc(kind === 't' ? `${RARITY_LABEL[x.rarity]} · ${x.class}` : `${x.archetype}${x.boss ? ' · boss' : ''}`) : 'Not discovered'}</small>${known ? `<p>${esc(x.description || '')}</p>` : ''}</div>`;
    return `<h3>Towers <span class="count">${towers.filter((t) => seenT.has(t.id)).length}/${towers.length}</span></h3><div class="ix-grid">${towers.map((t) => card('t', t, seenT.has(t.id))).join('')}</div>
      <h3>Enemies <span class="count" data-testid="ix-enemy-count">${enemies.filter((e) => seenE.has(e.id)).length}/${enemies.length}</span></h3><div class="ix-grid">${enemies.map((e) => card('e', e, seenE.has(e.id))).join('')}</div>`;
  }

  _quests() {
    const qs = questStatus(this.save, this.c.quests, this.c, this.date());
    const sec = (kind, title) => `<h3>${title}</h3><div class="quests">${qs.filter((q) => q.kind === kind).map((q) => `<div class="quest ${q.done ? 'done' : ''} ${q.claimed ? 'claimed' : ''}" data-testid="quest-${q.id}">
      <div><b>${q.claimed ? '✓ ' : q.done ? '★ ' : ''}${esc(q.name)}</b><small>${esc(q.desc)}</small>
      <div class="qbar" aria-label="${q.progress} of ${q.target}"><span style="width:${(q.progress / q.target) * 100}%"></span></div><small>${fmt(q.progress)}/${fmt(q.target)} · ${rewardText(q.reward)}</small></div>
      ${q.claimed ? '<span class="maxed">Claimed</span>' : `<button class="btn ${q.done ? 'primary' : ''}" data-claim="${q.claimId}" ${q.done ? '' : 'disabled'}>Claim</button>`}</div>`).join('')}</div>`;
    return `${sec('daily', 'Daily quests (new set every day)')}${sec('story', 'Story')}${sec('achievement', 'Achievements')}<p class="note">Assisted runs do not count towards quests or achievements.</p>`;
  }

  _daily() {
    const st = dailyStatus(this.save, this.meta, this.date());
    return `<p class="note">Log in every day: the streak resets if you miss a day. Current streak: ${st.streak} day${st.streak === 1 ? '' : 's'}.</p>
      <div class="days">${st.rewards.map((r, i) => {
        const day = i + 1;
        const state = st.claimedToday ? (day <= ((st.streak - 1) % st.rewards.length) + 1 ? 'got' : '') : day < st.nextDay ? 'got' : day === st.nextDay ? 'today' : '';
        return `<div class="day ${state}"><b>Day ${day}</b><span>${rewardText(r)}</span>${state === 'got' ? '<i>✓</i>' : ''}</div>`;
      }).join('')}</div>
      <button class="btn primary big" data-act="daily" data-testid="claim-daily" ${st.claimedToday ? 'disabled' : ''}>${st.claimedToday ? 'Come back tomorrow' : `Claim day ${st.nextDay}: ${rewardText(st.reward)}`}</button>`;
  }

  // ------------------------------------------------------------------------- actions -------
  saved() {
    this.ctx.persist();
  }

  onChange(e) {
    if (e.target.name === 'diff') this.cfg.difficulty = e.target.value;
    if (e.target.name === 'hero' && e.target.value !== this.ctx.heroId) {
      this.toast(`${this.c.heroes.get(e.target.value)?.name || e.target.value} takes command…`, 'info');
      this.saved();
      this.ctx.switchHero?.(e.target.value);
      return;
    }
    if (e.target.name === 'map' && e.target.value !== this.ctx.mapId) {
      this.toast(`Travelling to ${this.c.maps.get(e.target.value)?.name || e.target.value}…`, 'info');
      this.saved();
      this.ctx.switchMap?.(e.target.value);
      return;
    }
    if (e.target.name === 'mode') {
      this.cfg.mode = e.target.value;
      const m = this.c.modes.get(this.cfg.mode);
      if (!m?.modifiers) this.cfg.modifiers = [];
      if (!m?.allTowers) this.cfg.loadout = (this.save.towers.loadout?.length ? this.save.towers.loadout : this.meta.starterTowers).filter((id) => owns(this.save, id)).slice(0, 6);
      this.render();
    }
    if (e.target.name === 'mod') {
      this.cfg.modifiers = [...this.el.querySelectorAll('[name="mod"]:checked')].map((x) => x.value);
      this.render();
    }
    if (e.target.name === 'tutorial') this.cfg.tutorial = e.target.checked;
    if (e.target.name === 'alwaysSkip') { this.ctx.settings.skipSummonAnim = e.target.checked; this.ctx.persistSettings?.(); }
  }

  async onClick(e) {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    const d = t.dataset;
    const sfx = this.ctx.sfx;
    if (d.tower) {
      const m = this.c.modes?.get(this.cfg.mode);
      if (m?.daily) { this.toast('The daily challenge uses a fixed loaner loadout', 'warn'); return; }
      if (!m?.allTowers && !owns(this.save, d.tower)) { this.toast('Locked: unlock it in the Shop or by summoning', 'warn'); sfx?.play('error'); return; }
      const lo = this.cfg.loadout;
      if (lo.includes(d.tower)) this.cfg.loadout = lo.filter((x) => x !== d.tower);
      else if (lo.length < 6) lo.push(d.tower);
      else { this.toast('Loadout is full (6)', 'warn'); return; }
      sfx?.play('ui');
      this.render();
      this.el.querySelector(`[data-tower="${d.tower}"]`)?.focus();
      return;
    }
    if (d.act === 'start') {
      const m = this.c.modes?.get(this.cfg.mode);
      if (!m?.allTowers) this.save.towers.loadout = this.cfg.loadout.slice();
      if (m?.daily) { const dc = dailyChallenge(this.c, this.date()); this.cfg.modifiers = dc.modifiers; this.cfg.dailyDate = dc.date; this.cfg.difficulty = dc.difficulty; }
      if (!m?.modifiers && !m?.daily) this.cfg.modifiers = [];
      this.saved();
      this.close();
      this.resolve?.({ ...this.cfg, loadout: this.cfg.loadout.slice() });
      return;
    }
    if (d.goto) { this.tab = d.goto; this.render(); return; }
    if (d.levelup) {
      const r = levelUpTower(this.save, this.c.progression.towerLevels, d.levelup);
      if (!r.ok) { this.toast(r.reason, 'warn'); sfx?.play('error'); return; }
      this.saved();
      sfx?.play(r.evolved ? 'evolve' : 'upgrade');
      this.toast(r.evolved ? `Evolved: ${r.evolved.prefix} ${this.c.towers.get(d.levelup).name}!` : `Level ${r.level}!`, 'good');
      this.render();
      return;
    }
    if (d.buy) {
      const r = buyTower(this.save, this.c, this.meta, d.buy, this.date());
      if (!r.ok) { this.toast(r.reason, 'warn'); sfx?.play('error'); return; }
      this.saved();
      sfx?.play('purchase');
      this.toast(`Unlocked ${this.c.towers.get(d.buy).name}!`, 'good');
      this.render();
      return;
    }
    if (d.bundle) {
      const r = buyBundle(this.save, this.meta, d.bundle);
      if (!r.ok) { this.toast(r.reason, 'warn'); sfx?.play('error'); return; }
      this.saved();
      sfx?.play('purchase');
      this.render();
      return;
    }
    if (d.claim) {
      const r = claimQuest(this.save, this.c.quests, this.c, this.date(), d.claim);
      if (!r.ok) { this.toast(r.reason, 'warn'); return; }
      this.saved();
      sfx?.play('claim');
      this.toast(`Claimed ${rewardText(r.reward)}`, 'good');
      this.render();
      return;
    }
    if (d.act === 'daily') {
      const r = claimDaily(this.save, this.meta, this.date());
      if (!r.ok) { this.toast(r.reason, 'warn'); return; }
      this.saved();
      sfx?.play('claim');
      this.toast(`Day ${r.day}: ${rewardText(r.reward)}`, 'good');
      this.render();
      return;
    }
    if (d.act === 'skip-anim') { this.slot?.skip(); this.skipReveal = true; return; }
    if (d.pull) await this.pull(Number(d.pull));
  }

  mountSlot() {
    // one machine for the whole session, re-attached on every render (keeps reels where they stopped)
    if (!this.slot) this.slot = new SlotMachine(document.createElement('div'), { sfx: this.ctx.sfx, settings: this.ctx.settings });
    this.el.querySelector('.sm-host').appendChild(this.slot.el);
  }

  async pull(count) {
    if (this.pulling) return;
    const r = summon(this.save, this.c, this.meta, 'standard', count);
    if (!r.ok) { this.toast(r.reason, 'warn'); this.ctx.sfx?.play('error'); return; }
    this.saved(); // result is final before any animation: skipping or closing cannot change it
    this.pulling = true;
    this.skipReveal = !!this.ctx.settings.skipSummonAnim;
    for (const b of this.el.querySelectorAll('[data-pull]')) b.disabled = true;
    const best = r.results.reduce((a, x) => (ORDER.indexOf(x.rarity) > ORDER.indexOf(a.rarity) ? x : a), r.results[0]);
    const plan = this.slot.plan(best.rarity);
    if (this.skipReveal) this.slot.skip();
    await this.slot.spin(plan);
    for (const x of r.results) {
      if (ORDER.indexOf(x.rarity) >= 3 && !this.skipReveal) {
        await revealCutscene(this.el, { name: this.c.towers.get(x.tower).name, rarity: x.rarity, thumb: await this.ctx.towerThumb(x.tower, false), duplicate: x.duplicate, crowns: x.crowns, reduced: this.ctx.settings.reducedMotion });
      }
    }
    this.pulling = false;
    this.render(); // refresh wallet + pity; the same reels are re-attached
    const box = this.el.querySelector('.pull-results');
    box.innerHTML = `<h4>Results</h4>${r.results.map((x) => `<div class="pr r-${x.rarity}"><img alt="" data-thumb="t:${x.tower}:0"><span>${RARITY_SYMBOL[x.rarity]} ${esc(this.c.towers.get(x.tower).name)}</span><small>${x.duplicate ? `dup +👑${x.crowns}` : 'NEW'}</small></div>`).join('')}`;
    this.fillThumbs();
  }
}
