// Lobby hub: Play (map picker, hero, mode, difficulty, loadout, mission summary), Towers (permanent
// levels and evolutions), Summon (banner + slot machine), Shop, Index (silhouettes until discovered),
// Quests and Daily rewards. All state changes go through src/meta/meta.js and are saved immediately.
// Look: docs/ui-style.md (war-table panels, faction dress, code-drawn SVG icons).
import { filterHelp } from './helpSearch.js';
import { VERSION } from '../version.js';
import { cosmeticStatus, equipCosmetic } from '../meta/cosmetics.js';
import { applyUiTheme } from './applyCosmetics.js';
import { exportSave, importSave } from '../save/save.js';
import {
  levelForXp, summon, dailyDeal, buyTower, buyBundle, levelUpTower, levelUpCost, towerPrice, questStatus, claimQuest,
  dailyStatus, claimDaily, localDate, owns, unlockedSpeeds, dailyChallenge, bannerPity,
} from '../meta/meta.js';
import { towerStats } from '../sim/stats.js';
import { SlotMachine, RARITY_LABEL, revealCutscene } from './slotMachine.js';
import { icon, rarityBadge, towerIcon, enemyIcon, abilityIcon } from './icons.js';
import { mapPreviewSvg, mapTheme, themeLabel, groupMapsByTheme } from './mapThumb.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const TABS = [['play', 'Play', 'play'], ['towers', 'Towers', 'tower'], ['summon', 'Summon', 'summon'], ['shop', 'Shop', 'shop'], ['index', 'Index', 'book'], ['quests', 'Quests', 'scroll'], ['daily', 'Daily', 'gift'], ['help', 'Help', 'help']];
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const CUR = { crowns: ['crown', 'Crowns'], sigils: ['sigil', 'Sigils'] };
/** Reward / price as markup with currency icons. */
const rewardHtml = (r) => Object.entries(r || {}).map(([k, v]) => `<span class="coin">${CUR[k] ? icon(CUR[k][0], { title: CUR[k][1] }) : esc(k)} ${fmt(v)}</span>`).join(' + ');
/** Same as plain text (toasts, aria labels). */
const rewardText = (r) => Object.entries(r || {}).map(([k, v]) => `${fmt(v)} ${CUR[k]?.[1] || k}`).join(' + ');
const SIDE = { war: ['ground', 'War'], magic: ['arcane', 'Magic'], hybrid: ['hybrid', 'Hybrid'] };

export class Hub {
  constructor(root, ctx) {
    // ctx: {content, save, settings, sfx, persist(), towerThumb(id, silhouette), enemyThumb(id, silhouette), modes}
    this.ctx = ctx;
    this.c = ctx.content;
    this.meta = ctx.content.meta;
    this.tab = 'play';
    this.mapFilter = { query: '', theme: 'all' };
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
    t.setAttribute('role', 'status');
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
    const scroll = this.el.querySelector('.hub-body')?.scrollTop || 0;
    const mapScroll = this.el.querySelector('.map-groups')?.scrollTop || 0;
    this.el.innerHTML = `
      <header class="hub-head">
        <div class="lvl" title="Player level"><span class="lvl-badge" aria-hidden="true">${s.profile.level}</span><div class="xpwrap"><b data-testid="player-level">Lv ${s.profile.level}</b><div class="xpbar" role="progressbar" aria-label="XP ${lv.into} of ${lv.need}" aria-valuemin="0" aria-valuemax="${lv.need}" aria-valuenow="${lv.into}"><span style="width:${(lv.into / lv.need) * 100}%"></span></div><small>${fmt(lv.into)}/${fmt(lv.need)} XP</small></div></div>
        <div class="hub-brand" aria-hidden="true">TDS<small>Rift defence command</small></div>
        <div class="wallet"><span data-tip="Crowns: earned in matches, spent in the Shop and on tower levels" data-testid="crowns">${icon('crown', { title: 'Crowns' })} ${fmt(s.wallet.crowns)}</span><span data-tip="Sigils: spent on Summons" data-testid="sigils">${icon('sigil', { title: 'Sigils' })} ${fmt(s.wallet.sigils)}</span></div>
      </header>
      <nav class="hub-tabs" role="tablist" aria-label="Lobby">${TABS.map(([id, label, ic]) => `<button role="tab" data-tab="${id}" aria-selected="${this.tab === id}" data-testid="tab-${id}">${icon(ic)}<span class="tl">${label}</span>${badges[id] ? `<i class="badge" aria-label="${badges[id]} ready">${badges[id]}</i>` : ''}</button>`).join('')}</nav>
      <section class="hub-body" role="tabpanel" data-testid="panel-${this.tab}">${this['_' + this.tab]()}</section>`;
    this.el.querySelector('.hub-tabs').onclick = (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      this.tab = b.dataset.tab;
      this.ctx.sfx?.play('ui');
      this.render();
      this.el.querySelector('.hub-body').scrollTop = 0;
      this.el.querySelector(`[data-tab="${this.tab}"]`)?.focus();
    };
    this.el.querySelector('.hub-tabs').onkeydown = (e) => {
      // arrow keys move between tabs (ARIA tab pattern)
      const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      const i = TABS.findIndex(([id]) => id === this.tab);
      this.tab = TABS[(i + keys[e.key] + TABS.length) % TABS.length][0];
      this.render();
      this.el.querySelector(`[data-tab="${this.tab}"]`)?.focus();
    };
    const body = this.el.querySelector('.hub-body');
    body.onclick = (e) => this.onClick(e);
    body.onchange = (e) => this.onChange(e);
    body.oninput = (e) => {
      if (e.target.name === 'mapq') { this.mapFilter.query = e.target.value; this.applyMapFilter(); }
      if (e.target.name === 'helpq') { this.helpQuery = e.target.value; this.el.querySelector('.help-list').innerHTML = this.helpList(); }
    };
    body.scrollTop = scroll;
    const mg = this.el.querySelector('.map-groups');
    if (mg) { mg.scrollTop = mapScroll; this.applyMapFilter(); }
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

  // ------------------------------------------------------------------------- map picker ----
  mapList() {
    return [...this.c.maps.values()].map((m) => ({ ...m, locked: m.unlockLevel && this.save.profile.level < m.unlockLevel ? `Level ${m.unlockLevel}` : null }));
  }

  /** Search + theme filter without a re-render (keeps focus in the search box). */
  applyMapFilter() {
    const q = this.mapFilter.query.trim().toLowerCase();
    const th = this.mapFilter.theme;
    let shown = 0;
    for (const g of this.el.querySelectorAll('.map-group')) {
      let any = false;
      for (const card of g.querySelectorAll('.map-card')) {
        const ok = (th === 'all' || card.dataset.theme === th) && (!q || card.dataset.search.includes(q));
        card.hidden = !ok;
        if (ok) { any = true; shown++; }
      }
      g.hidden = !any;
    }
    const empty = this.el.querySelector('.map-empty');
    if (empty) empty.hidden = shown > 0;
    for (const b of this.el.querySelectorAll('[data-theme-filter]')) b.setAttribute('aria-pressed', String(b.dataset.themeFilter === th));
  }

  _mapPicker(mapId) {
    const maps = this.mapList();
    const groups = groupMapsByTheme(maps);
    const best = (m) => (this.save.progress.best?.[m.id] ? Math.max(...Object.values(this.save.progress.best[m.id])) : 0);
    const unlocked = maps.filter((m) => !m.locked).length;
    return `<section class="sec" data-testid="map-picker" aria-label="Map picker">
      <header class="sec-h">${icon('map')}<h3>Map</h3><span class="count">${unlocked}/${maps.length} unlocked</span></header>
      <div class="map-tools"><label class="search">${icon('search')}<input type="search" name="mapq" value="${esc(this.mapFilter.query)}" placeholder="Search maps" aria-label="Search maps" autocomplete="off" data-testid="map-search"></label>
        <div class="chips" role="group" aria-label="Filter by theme"><button type="button" data-theme-filter="all" aria-pressed="${this.mapFilter.theme === 'all'}">All <small>${maps.length}</small></button>${groups.map((g) => `<button type="button" data-theme-filter="${g.theme}" aria-pressed="${this.mapFilter.theme === g.theme}" data-testid="theme-${g.theme}">${esc(g.label)} <small>${g.maps.length}</small></button>`).join('')}</div></div>
      <div class="map-groups" role="radiogroup" aria-label="Map">${groups.map((g) => `<div class="map-group" data-group="${g.theme}"><h4>${esc(g.label)} <small>${g.maps.length}</small></h4><div class="map-row">${g.maps.map((m) => `
        <label class="map-card" data-theme="${g.theme}" data-search="${esc(`${m.name} ${m.description || ''} ${g.label}`.toLowerCase())}" ${m.description ? `data-tip="${esc(m.description)}"` : ''}>
          <input type="radio" name="map" value="${m.id}" data-testid="map-${m.id}" ${m.id === mapId ? 'checked' : ''} ${m.locked ? 'disabled' : ''}>
          <span class="mc">${mapPreviewSvg(m, { locked: !!m.locked })}<span class="mc-info"><b>${esc(m.name)}</b><small>${m.locked ? `${icon('lock')} Reach player level ${m.unlockLevel}` : `${m.paths.length} road${m.paths.length > 1 ? 's' : ''}${best(m) ? ` · best ${best(m)} waves` : ''}`}</small></span></span>
          ${m.locked ? `<span class="lock">${icon('lock')} Lv ${m.unlockLevel}</span>` : ''}</label>`).join('')}</div></div>`).join('')}
        <p class="map-empty" hidden>No map matches. Clear the search or pick another theme.</p></div>
    </section>`;
  }

  // ------------------------------------------------------------------------- tabs ----------
  heroSide(h) {
    const f = h.abilities.map((id) => this.c.abilities.get(id)?.faction);
    const w = f.filter((x) => x === 'war').length;
    const m = f.filter((x) => x === 'magic').length;
    return w > m ? 'war' : m > w ? 'magic' : 'hybrid';
  }

  /** Hero picker: one card per hero (side, role) and the chosen hero's attack and four skills. */
  _heroPicker() {
    const heroes = [...this.c.heroes.values()];
    const cur = this.c.heroes.get(this.ctx.heroId) || heroes[0];
    const at = cur.attack || {};
    const extras = [at.splash ? `splash ${at.splash} m` : '', at.burn ? 'burns' : '', at.slow ? 'slows' : '', at.mark ? 'marks' : '', at.chain ? 'chains' : ''].filter(Boolean).join(', ');
    const side = this.heroSide(cur);
    return `<fieldset class="hero-pick"><legend>Hero <span class="count">${heroes.length}</span></legend>
      <div class="diffs heroes" role="radiogroup" aria-label="Hero">${heroes.map((h) => { const sd = this.heroSide(h); return `<label class="f-${sd}"><input type="radio" name="hero" value="${h.id}" data-testid="hero-${h.id}" ${h.id === cur.id ? 'checked' : ''}><span><i class="hero-ic">${icon(SIDE[sd][0])}</i><b>${esc(h.name)}</b><small>${SIDE[sd][1]} · ${esc(h.role || '')}</small></span></label>`; }).join('')}</div>
      <div class="hero-detail f-${side}" data-testid="hero-detail">
        <p class="note"><b>${esc(cur.name)}</b>: <span class="lore">${esc(cur.description)}</span> Attack: <span class="coin">${icon(at.damageType || 'physical')} ${at.damage} ${esc(at.damageType)}</span> every ${(1 / (at.rate || 1)).toFixed(1)} s, range ${at.range} m${extras ? ` (${extras})` : ''}. Health ${cur.hp}.</p>
        <ol class="skills">${cur.abilities.map((id) => { const a = this.c.abilities.get(id); return `<li><i class="sk-ic">${icon(abilityIcon(id))}</i><b>${esc(a?.name || id)}</b><small>${a?.cooldown ?? '?'} s cooldown · ${a?.target === 'self' ? 'around the hero' : 'aimed'}</small><small>${esc(a?.description || '')}</small></li>`; }).join('')}</ol>
      </div></fieldset>`;
  }

  _mission(mapId, mode, daily) {
    const map = this.c.maps.get(mapId) || [...this.c.maps.values()][0];
    const hero = this.c.heroes.get(this.ctx.heroId) || [...this.c.heroes.values()][0];
    const diff = this.c.difficulties.get(daily ? daily.difficulty : this.cfg.difficulty);
    const speeds = unlockedSpeeds(this.save, this.meta);
    const slots = [];
    for (let i = 0; i < 6; i++) {
      const t = this.c.towers.get(this.cfg.loadout[i]);
      slots.push(t ? `<i class="on f-${t.faction}" data-tip="${esc(t.name)}">${icon(towerIcon(t))}</i>` : `<i>${i + 1}</i>`);
    }
    return `<aside class="mission panel" aria-label="Mission summary">
      <h3>Mission</h3>
      <div class="mp-big">${mapPreviewSvg(map, { w: 240, h: 150 })}</div>
      <div class="m-name">${esc(map.name)}</div>
      <div class="m-line">${icon('map')} ${esc(themeLabel(mapTheme(map)))} · ${map.paths.length} road${map.paths.length > 1 ? 's' : ''}</div>
      <div class="m-line">${icon('hero')} ${esc(hero?.name || '')}</div>
      <div class="m-line">${icon('skull')} ${esc(mode.name || 'Campaign')} · ${esc(diff?.name || '')}</div>
      <div class="m-slots" aria-label="Loadout ${this.cfg.loadout.length} of 6">${slots.join('')}</div>
      <div class="m-actions">
        <label class="row"><input type="checkbox" name="tutorial" ${this.cfg.tutorial ? 'checked' : ''}> Tutorial</label>
        <button class="btn primary big" data-act="start" ${this.cfg.loadout.length ? '' : 'disabled'} data-testid="start">${icon('play')} Start match</button>
        <small class="note">Game speeds: ${speeds.map((x) => `${x}x`).join(', ')}${speeds.includes(3) ? '' : ` · next: ${this.meta.speeds.find((x) => !speeds.includes(x.speed))?.label || ''}`}</small>
      </div></aside>`;
  }

  _play() {
    const diffs = [...this.c.difficulties.values()].sort((a, b) => a.order - b.order);
    const modes = [...(this.c.modes?.values() || [])].map((m) => ({ ...m, locked: m.unlockLevel && this.save.profile.level < m.unlockLevel ? `Reach player level ${m.unlockLevel}` : null }));
    const mapId = this.ctx.mapId || 'riftline';
    for (const m of modes) if (!m.locked && m.map && m.map !== mapId) m.locked = `Played on ${this.c.maps.get(m.map)?.name || m.map}`;
    if (modes.find((m) => m.id === this.cfg.mode)?.locked) this.cfg.mode = 'campaign';
    const mode = this.c.modes?.get(this.cfg.mode) || { id: 'campaign' };
    const daily = mode.daily ? dailyChallenge(this.c, this.date()) : null;
    const anyTower = !!mode.allTowers;
    const mods = [...(this.c.modifiers?.values() || [])];
    const modMul = this.cfg.modifiers.reduce((a, id) => a * (this.c.modifiers.get(id)?.rewardMul || 1), 1);
    const towers = [...this.c.towers.values()].sort((a, b) => ORDER.indexOf(a.rarity) - ORDER.indexOf(b.rarity) || a.cost - b.cost);
    if (daily) this.cfg.loadout = daily.loadout.slice();
    const usable = (id) => anyTower || owns(this.save, id);
    return `<div class="play-grid"><div class="play-main">
      ${this.c.maps.size > 1 ? this._mapPicker(mapId) : ''}
      ${this.c.heroes.size > 1 ? this._heroPicker() : ''}
      ${modes.length > 1 ? `<fieldset><legend>Mode</legend><div class="diffs modes" role="radiogroup" aria-label="Mode">${modes.map((m) => `<label><input type="radio" name="mode" value="${m.id}" data-testid="mode-${m.id}" ${m.id === this.cfg.mode ? 'checked' : ''} ${m.locked ? 'disabled' : ''}><span><b>${m.locked ? `${icon('lock')} ` : ''}${esc(m.name)}</b><small>${esc(m.locked ? m.locked : m.desc)}</small></span></label>`).join('')}</div></fieldset>` : ''}
      ${mode.modifiers ? `<fieldset><legend>Modifiers <span class="count">reward x${modMul.toFixed(2)}</span></legend><div class="mods">${mods.map((x) => `<label class="row"><input type="checkbox" name="mod" value="${x.id}" ${this.cfg.modifiers.includes(x.id) ? 'checked' : ''}> <b>${esc(x.name)}</b> <small>${esc(x.desc)} · x${x.rewardMul}</small></label>`).join('')}</div></fieldset>` : ''}
      ${daily ? `<fieldset data-testid="daily-challenge"><legend>Today (${daily.date})</legend><p class="note">Difficulty: ${esc(this.c.difficulties.get(daily.difficulty).name)} (fixed). Modifiers: ${daily.modifiers.map((id) => `<b>${esc(this.c.modifiers.get(id).name)}</b> (${esc(this.c.modifiers.get(id).desc)})`).join(', ')}. Loaner loadout below, every tower at level ${Object.values(daily.levels)[0]}. Win for ${Object.entries(daily.reward).map(([k, v]) => `${v} ${k}`).join(' + ')}${this.save.claimed.includes(daily.rewardId) ? ' (already claimed today)' : ''}.</p></fieldset>` : ''}
      ${mode.sandbox ? '<p class="note">Sandbox: infinite cash, every tower, press Next wave any time. No rewards, no records.</p>' : ''}
      ${this.save.stats.wins > 0 ? '' : `<p class="note first-run" data-testid="first-run">${icon('info')} New here? Start on <b>Easy</b> with the tutorial on. Normal is tuned for towers you have levelled up; Skirmish is a shorter 10-wave match.</p>`}
      <fieldset><legend>Difficulty</legend><div class="diffs" role="radiogroup" aria-label="Difficulty">
        ${diffs.map((d) => `<label><input type="radio" name="diff" value="${d.id}" ${(daily ? d.id === daily.difficulty : d.id === this.cfg.difficulty) ? 'checked' : ''} ${daily ? 'disabled' : ''}><span><b>${esc(d.name)}</b><small>${d.id === 'relaxed' ? 'slower enemies, 2x keep' : `${d.hpMul}x enemy health`}${this.save.progress.best?.[mapId]?.[d.id] ? ` · best ${this.save.progress.best[mapId][d.id]}` : ''}</small></span></label>`).join('')}
      </div></fieldset>
      <fieldset><legend>Loadout <span class="count" data-testid="loadout-count">${this.cfg.loadout.length}/6</span></legend><div class="cards" data-testid="loadout">
        ${towers.map((t) => {
          const own = usable(t.id);
          const on = this.cfg.loadout.includes(t.id);
          const lvl = daily?.levels[t.id] ?? (this.save.towers.owned[t.id]?.level || 1);
          return `<button class="card ${on ? 'on' : ''} ${own ? '' : 'locked'} f-${t.faction} r-${t.rarity}" data-tower="${t.id}" aria-pressed="${on}" ${own ? '' : 'aria-disabled="true"'} data-tip="${esc(t.description || t.name)}">
            <img alt="" data-thumb="t:${t.id}:${own ? 0 : 1}"><span class="nm">${own ? esc(t.name) : `${icon('lock')} ${esc(t.name)}`}</span>
            <span class="meta">${icon(towerIcon(t))} ${t.faction === 'magic' ? 'Magic' : 'War'} · ${esc(t.class)}${own ? ` · Lv ${lvl}` : ''}</span>
            <span class="rar">${rarityBadge(t.rarity)}</span>
            ${own ? `<span class="cost">$${t.cost}</span>` : `<span class="lockd">${icon('lock')} Shop or Summon</span>`}
            ${on ? `<span class="slot">${this.cfg.loadout.indexOf(t.id) + 1}</span>` : ''}</button>`;
        }).join('')}
      </div></fieldset>
      </div>${this._mission(mapId, mode, daily)}</div>`;
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
        return `<div class="trow ${own ? '' : 'locked'} r-${t.rarity} f-${t.faction}" data-testid="trow-${t.id}">
          <img alt="" data-thumb="t:${t.id}:${own ? 0 : 1}">
          <div class="tinfo"><b>${own ? esc(st.name) : `${icon('lock')} ${esc(t.name)}`}</b><small>${rarityBadge(t.rarity)} · ${icon(towerIcon(t))} ${t.faction === 'magic' ? 'Magic' : 'War'} · ${esc(t.class)}${st.stats.damageType ? ` · ${icon(st.stats.damageType)} ${esc(st.stats.damageType)}` : ''}</small>
          <small>${esc(t.description || '')}</small>
          ${own ? `<div class="lvbar" role="progressbar" aria-label="Level ${lv} of ${prog.maxLevel}" aria-valuemin="1" aria-valuemax="${prog.maxLevel}" aria-valuenow="${lv}"><span style="width:${(lv / prog.maxLevel) * 100}%"></span></div><small>Level ${lv}/${prog.maxLevel}${dps ? ` · <span data-tip="Damage per second at this level, before upgrades">${dps.toFixed(0)} DPS</span>` : ''}${next ? ` · evolves at ${next.level}` : ' · fully evolved'}</small>` : `<small>Unlock: Shop <span class="coin">${icon('crown')} ${fmt(towerPrice(this.meta, t))}</span> or Summon</small>`}</div>
          ${own ? (cost !== null ? `<button class="btn ${this.save.wallet.crowns >= cost ? 'primary' : ''}" data-levelup="${t.id}" data-testid="levelup-${t.id}">Level up ${icon('crown')} ${fmt(cost)}</button>` : `<span class="maxed">${icon('star')} Max</span>`) : `<button class="btn" data-goto="shop">${icon('shop')} Unlock…</button>`}
        </div>`;
      }).join('')}</div>`;
  }

  _summon() {
    const banners = this.meta.summon.banners;
    const b = banners.find((x) => x.id === this.banner) || banners[0];
    const pity = bannerPity(this.save, this.meta, b.id);
    const inPool = (t) => !b.pool?.faction || t.faction === b.pool.faction;
    const w = this.meta.summon.rarityWeights;
    const total = Object.values(w).reduce((a, x) => a + x, 0);
    const counts = {};
    for (const t of this.c.towers.values()) if (inPool(t)) counts[t.rarity] = (counts[t.rarity] || 0) + 1;
    const featured = [...this.c.towers.values()].filter((t) => inPool(t) && ORDER.indexOf(t.rarity) >= 3).slice(0, 4);
    return `<div class="summon">
      <div class="sm-host"></div>
      <div class="sm-side">
        ${banners.length > 1 ? `<div class="banner-tabs" role="radiogroup" aria-label="Banner">${banners.map((x) => `<button class="chip ${x.id === b.id ? 'on' : ''}" role="radio" aria-checked="${x.id === b.id}" data-banner="${x.id}" data-testid="banner-${x.id}">${esc(x.name)}</button>`).join('')}</div>` : ''}
        <div class="banner-card"><h3>${esc(b.name)}</h3><p class="note">${esc(b.description)} Free in-game sigils only.</p>
          ${featured.length ? `<div class="feat" aria-label="Featured towers">${featured.map((t) => `<img alt="${esc(t.name)}" title="${esc(t.name)}" data-thumb="t:${t.id}:0">`).join('')}</div>` : ''}</div>
        <div class="row2"><button class="btn primary big" data-pull="1" data-testid="pull-1">Pull ${icon('sigil')} ${b.cost}</button><button class="btn brass big" data-pull="10" data-testid="pull-10">10x ${icon('sigil')} ${b.cost10}</button></div>
        <button class="btn ghost" data-act="skip-anim" data-testid="skip-anim">Skip animation</button>
        <label class="row"><input type="checkbox" name="alwaysSkip" ${this.ctx.settings.skipSummonAnim ? 'checked' : ''}> Always skip animations</label>
        <p class="note">Pity: ${pity}/${this.meta.summon.pity.pulls} pulls towards a guaranteed ${RARITY_LABEL[this.meta.summon.pity.minRarity]}. Duplicates turn into crowns.</p>
        <div class="seg-bar" role="progressbar" aria-label="Pity ${pity} of ${this.meta.summon.pity.pulls}" aria-valuemin="0" aria-valuemax="${this.meta.summon.pity.pulls}" aria-valuenow="${pity}"><span style="display:block;height:100%;width:${Math.min(100, (pity / this.meta.summon.pity.pulls) * 100)}%"></span></div>
        <table class="odds"><caption>Odds</caption>${Object.entries(w).map(([r, x]) => `<tr><th>${rarityBadge(r)}</th><td>${((x / total) * 100).toFixed(1)}%</td><td>${counts[r] ? `${counts[r]} towers` : 'none yet (falls back)'}</td></tr>`).join('')}</table>
        <div class="pull-results" data-testid="pull-results"></div>
      </div></div>`;
  }

  _shop() {
    const deal = dailyDeal(this.save, this.c, this.meta, this.date());
    const locked = [...this.c.towers.values()].filter((t) => !owns(this.save, t.id)).sort((a, b) => towerPrice(this.meta, a) - towerPrice(this.meta, b));
    return `${deal ? `<div class="deal" data-testid="daily-deal"><img alt="" data-thumb="t:${deal.tower}:0"><div><b>Daily deal: ${esc(this.c.towers.get(deal.tower).name)}</b><small><s>${fmt(deal.full)}</s> <span class="coin">${icon('crown')} ${fmt(deal.price)}</span> today only</small></div><button class="btn primary" data-buy="${deal.tower}">Buy ${icon('crown')} ${fmt(deal.price)}</button></div>` : `<div class="empty">${icon('trophy')}<b>You own every tower.</b><span>More arrive with new content.</span></div>`}
      <h3>Towers</h3><div class="shop-grid">${locked.map((t) => `<div class="shop-item r-${t.rarity} f-${t.faction}" data-tip="${esc(t.description || '')}"><img alt="" data-thumb="t:${t.id}:0"><b>${esc(t.name)}</b><small>${rarityBadge(t.rarity)} · ${icon(towerIcon(t))} ${esc(t.class)}</small><button class="btn ${this.save.wallet.crowns >= towerPrice(this.meta, t) ? 'primary' : ''}" data-buy="${t.id}" data-testid="buy-${t.id}">${icon('crown')} ${fmt(deal && deal.tower === t.id ? deal.price : towerPrice(this.meta, t))}</button></div>`).join('') || `<div class="empty">${icon('check')}<span>Nothing left to buy.</span></div>`}</div>
      <h3>Sigils</h3><div class="shop-grid">${this.meta.shop.bundles.map((b) => `<div class="shop-item"><span class="coin" style="font-size:2rem">${icon('sigil')}</span><b>${esc(b.name)}</b><small>${rewardHtml(b.gives)}</small><button class="btn" data-bundle="${b.id}">${rewardHtml(b.price)}</button></div>`).join('')}</div>`;
  }

  _index() {
    const towers = [...this.c.towers.values()];
    const enemies = [...this.c.enemies.values()];
    const seenT = new Set([...Object.keys(this.save.towers.owned), ...this.save.index.towers]);
    const seenE = new Set(this.save.index.enemies);
    const card = (kind, x, known) => `<div class="ix ${known ? '' : 'unknown'} ${kind === 't' ? `r-${x.rarity}` : ''}" data-testid="ix-${x.id}"><img alt="" data-thumb="${kind}:${x.id}:${known ? 0 : 1}"><b>${known ? esc(x.name) : '???'}</b><small class="ix-k">${known ? (kind === 't' ? `${rarityBadge(x.rarity)} ${icon(towerIcon(x))} ${esc(x.class)}` : `${icon(enemyIcon(x))} ${esc(x.archetype)}${x.boss ? ' · boss' : ''}`) : `${icon('lock')} Not discovered`}</small>${known ? `<p>${esc(x.description || '')}</p>` : ''}</div>`;
    const prog = (n, of) => `<div class="ix-progress"><div class="seg-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${of}" aria-valuenow="${n}"><span style="width:${(n / of) * 100}%"></span></div>${Math.round((n / of) * 100)}% discovered</div>`;
    const nt = towers.filter((t) => seenT.has(t.id)).length;
    const ne = enemies.filter((e) => seenE.has(e.id)).length;
    return `${this._cosmetics()}<h3>${icon('tower')} Towers <span class="count">${nt}/${towers.length}</span></h3>${prog(nt, towers.length)}<div class="ix-grid">${towers.map((t) => card('t', t, seenT.has(t.id))).join('')}</div>
      <h3>${icon('skull')} Enemies <span class="count" data-testid="ix-enemy-count">${ne}/${enemies.length}</span></h3>${prog(ne, enemies.length)}<div class="ix-grid">${enemies.map((e) => card('e', e, seenE.has(e.id))).join('')}</div>`;
  }

  /** Cosmetics (top of the Index): earned looks, one equipped per kind. */
  _cosmetics() {
    const all = cosmeticStatus(this.save, this.c);
    if (!all.length) return '';
    const kinds = this.c.cosmetics.kinds || {};
    const sw = (it) => (it.kind === 'uiTheme' ? [it.vars?.['--brass'] || '#ffd166', it.vars?.['--brass-2'] || '#b8903c'] : [it.colors?.coat || '#2A2766', it.colors?.coatTrim || '#FFD166', it.colors?.cape || '#7B4DFF']);
    return Object.entries(kinds).map(([kind, title]) => {
      const list = all.filter((x) => x.kind === kind);
      return `<h3>${icon('star')} ${esc(title)} <span class="count">${list.filter((x) => x.unlocked).length}/${list.length}</span></h3><div class="cos-grid">${list.map((it) => `<button class="cos ${it.equipped ? 'on' : ''} ${it.unlocked ? '' : 'locked'}" data-cosmetic="${it.id}" data-testid="cos-${it.id}" aria-pressed="${it.equipped}" ${it.unlocked ? '' : 'aria-disabled="true"'}>
        <span class="cos-sw" aria-hidden="true">${sw(it).map((c) => `<i style="background:${esc(c)}"></i>`).join('')}</span>
        <b>${it.unlocked ? '' : `${icon('lock')} `}${esc(it.name)}</b><small>${esc(it.unlocked ? it.desc : `${it.how}${it.target > 1 ? ` (${fmt(it.progress)}/${fmt(it.target)})` : ''}`)}</small>${it.equipped ? '<em>Equipped</em>' : ''}</button>`).join('')}</div>`;
    }).join('');
  }

  _quests() {
    const qs = questStatus(this.save, this.c.quests, this.c, this.date());
    const QI = { daily: 'scroll', weekly: 'gift', story: 'book', achievement: 'trophy' };
    // ready to claim first, then closest to done, claimed last (95 achievements stay scannable)
    const rank = (q) => (q.done && !q.claimed ? 0 : q.claimed ? 2 : 1);
    const sorted = (kind) => qs.filter((q) => q.kind === kind).sort((a, b) => rank(a) - rank(b) || (b.progress / b.target) - (a.progress / a.target));
    const sum = (kind) => { const l = qs.filter((q) => q.kind === kind); const d = l.filter((q) => q.done).length; return `<span class="count">${d}/${l.length} done</span>`; };
    const sec = (kind, title) => `<h3>${icon(QI[kind])} ${title} ${sum(kind)}</h3><div class="quests">${sorted(kind).map((q) => `<div class="quest ${q.done ? 'done' : ''} ${q.claimed ? 'claimed' : ''}" data-testid="quest-${q.id}">
      <i class="q-ic">${icon(q.claimed ? 'check' : q.done ? 'star' : QI[kind])}</i>
      <div><b>${esc(q.name)}</b><small>${esc(q.desc)}</small>
      <div class="qbar" role="progressbar" aria-label="${q.progress} of ${q.target}" aria-valuemin="0" aria-valuemax="${q.target}" aria-valuenow="${q.progress}"><span style="width:${(q.progress / q.target) * 100}%"></span></div><small>${fmt(q.progress)}/${fmt(q.target)} · ${rewardHtml(q.reward)}</small></div>
      ${q.claimed ? '<span class="maxed">Claimed</span>' : `<button class="btn ${q.done ? 'primary' : ''}" data-claim="${q.claimId}" ${q.done ? '' : 'disabled'}>Claim</button>`}</div>`).join('')}</div>`;
    return `${sec('daily', 'Daily quests (new set every day)')}${qs.some((q) => q.kind === 'weekly') ? sec('weekly', 'Weekly quests (new set every Monday)') : ''}${sec('story', 'Story')}${sec('achievement', 'Achievements')}<p class="note">Assisted runs do not count towards quests or achievements.</p>`;
  }

  _daily() {
    const st = dailyStatus(this.save, this.meta, this.date());
    return `<p class="note">Log in every day: the streak resets if you miss a day. Current streak: ${st.streak} day${st.streak === 1 ? '' : 's'}.</p>
      <div class="days">${st.rewards.map((r, i) => {
        const day = i + 1;
        const state = st.claimedToday ? (day <= ((st.streak - 1) % st.rewards.length) + 1 ? 'got' : '') : day < st.nextDay ? 'got' : day === st.nextDay ? 'today' : '';
        return `<div class="day ${state}">${icon(day === st.rewards.length ? 'trophy' : 'gift')}<b>Day ${day}</b><span>${rewardHtml(r)}</span>${state === 'got' ? `<i>${icon('check')}</i>` : ''}</div>`;
      }).join('')}</div>
      <button class="btn primary big" data-act="daily" data-testid="claim-daily" ${st.claimedToday ? 'disabled' : ''}>${st.claimedToday ? 'Come back tomorrow' : `Claim day ${st.nextDay}: ${rewardHtml(st.reward)}`}</button>`;
  }

  helpList() {
    const topics = filterHelp(this.c.help?.topics || [], this.helpQuery);
    if (!topics.length) return '<p class="note" data-testid="help-empty">Nothing found. Try another word, for example "flying", "save" or "speed".</p>';
    return topics.map((t) => `<h3>${esc(t.title)}</h3>${t.entries.map((e) => `<details class="help-q" ${this.helpQuery ? 'open' : ''}><summary>${esc(e.q)}</summary><p>${esc(e.a)}</p></details>`).join('')}`).join('');
  }

  _help() {
    const about = this.c.help?.about || [];
    return `<label class="search help-search">${icon('search')}<input type="search" name="helpq" value="${esc(this.helpQuery || '')}" placeholder="Search help" aria-label="Search help" autocomplete="off" data-testid="help-search"></label>
      <div class="help-list" aria-live="polite">${this.helpList()}</div>
      <h3>${icon('scroll')} Save backup</h3>
      <p class="note">Your progress lives in this browser. Export a code and keep it somewhere safe; importing a code replaces the current progress.</p>
      <div class="save-io"><button class="btn" data-act="export-save" data-testid="export-save">Export save code</button>
      <textarea name="savecode" rows="3" placeholder="Paste a save code here to import it" aria-label="Save code" spellcheck="false" data-testid="save-code"></textarea>
      <button class="btn" data-act="import-save" data-testid="import-save">Import save code</button></div>
      ${about.map((a) => `<details class="help-q about" data-testid="about-${a.id}"><summary>${esc(a.title)}</summary>${a.body.map((p) => `<p>${esc(p)}</p>`).join('')}</details>`).join('')}
      <p class="note" data-testid="version">TDS version ${VERSION} · content ${esc(String(this.c.version || ''))}</p>`;
  }

  // ------------------------------------------------------------------------- actions -------
  saved() {
    this.ctx.persist();
  }

  onChange(e) {
    if (e.target.name === 'diff') { this.cfg.difficulty = e.target.value; this.render(); }
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
    if (d.act === 'export-save') {
      const code = exportSave(this.save);
      const ta = this.el.querySelector('[name=savecode]');
      ta.value = code;
      ta.select();
      try { await navigator.clipboard.writeText(code); this.toast('Save code copied to the clipboard', 'good'); } catch { this.toast('Save code is in the box: copy it and keep it safe', 'good'); }
      return;
    }
    if (d.act === 'import-save') {
      const text = this.el.querySelector('[name=savecode]').value;
      let next;
      try { next = importSave(text, this.c); } catch (err) { this.toast(err.message, 'warn'); sfx?.play('error'); return; }
      // two presses: the first only arms the button
      if (t.dataset.armed !== text) { t.dataset.armed = text; t.textContent = `Replace current progress with this save (level ${next.profile.level})?`; t.classList.add('danger'); return; }
      const s = this.save;
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, next);
      this.saved();
      this.toast('Save imported', 'good');
      this.render();
      return;
    }
    if (d.themeFilter) { this.mapFilter.theme = d.themeFilter; sfx?.play('ui'); this.applyMapFilter(); return; }
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
    if (d.cosmetic) {
      const r = equipCosmetic(this.save, this.c, d.cosmetic);
      if (!r.ok) { this.toast(r.reason, 'warn'); sfx?.play('error'); return; }
      this.saved();
      sfx?.play('ui');
      applyUiTheme(this.save, this.c);
      // the hero model is built with the world: an outfit change reloads into it, like a hero change
      if (r.item.kind === 'heroOutfit') { this.ctx.switchHero?.(this.ctx.heroId); return; }
      this.render();
      return;
    }
    if (d.banner) { this.banner = d.banner; sfx?.play('ui'); this.render(); return; }
    if (d.pull) await this.pull(Number(d.pull));
  }

  mountSlot() {
    // one machine for the whole session, re-attached on every render (keeps reels where they stopped)
    if (!this.slot) this.slot = new SlotMachine(document.createElement('div'), { sfx: this.ctx.sfx, settings: this.ctx.settings });
    this.el.querySelector('.sm-host').appendChild(this.slot.el);
  }

  async pull(count) {
    if (this.pulling) return;
    const r = summon(this.save, this.c, this.meta, this.banner || this.meta.summon.banners[0].id, count);
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
    box.innerHTML = `<h4>Results</h4>${r.results.map((x) => `<div class="pr r-${x.rarity}"><img alt="" data-thumb="t:${x.tower}:0"><span>${rarityBadge(x.rarity, { short: true })} ${esc(this.c.towers.get(x.tower).name)}</span><small>${x.duplicate ? `duplicate +${x.crowns} Crowns` : 'NEW'}</small></div>`).join('')}`;
    this.fillThumbs();
  }
}
