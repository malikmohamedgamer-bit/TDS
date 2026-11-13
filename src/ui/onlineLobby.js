// Online co-op lobby (hub tab "Online"; docs/multiplayer.md contract 5). Owns the transport and the
// Lobby for the room: create / join by code, players and ready flags, difficulty, start. The room's
// map is the map loaded when it was created; a player on another map reloads onto it once and
// rejoins with the same peer id (sessionStorage), because the world is built at page load.
import { Lobby, normalizeRoomCode, isRoomCode, MAX_PLAYERS } from '../net/lobby.js';
import { createTransport } from '../net/transports.js';
import { loadOnlineConfig } from '../net/onlineConfig.js';
import { browserReadJson } from '../core/content.js';
import { VERSION } from '../version.js';
import { icon } from './icons.js';
import { seatColor, cleanName } from './coopUi.js';
import { mapPreviewSvg } from './mapThumb.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SS = { peer: 'tds.peerId', room: 'tds.room' };
const ss = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private mode: no auto-rejoin */ } },
  del: (k) => { try { sessionStorage.removeItem(k); } catch { /* ignore */ } },
};

/** Why the host cannot start yet ('' = can start). Pure, unit-tested. */
export function startBlocker(players, mapId) {
  if (players.length < 2) return 'Waiting for at least one more player';
  const off = players.find((p) => p.map && p.map !== mapId);
  if (off) return `${off.name} is still loading the map`;
  if (players.some((p) => !p.map)) return 'Waiting for everyone to load the map';
  if (players.some((p) => !p.ready && !p.host)) return 'Waiting for everyone to be ready';
  return '';
}

export class OnlineLobbyPanel {
  /** ctx: the hub's ctx (content, save, settings, persistSettings, mapId, heroId, startOnline) + hub */
  constructor(hub) {
    this.hub = hub;
    this.state = 'start'; // start | connecting | lobby
    this.error = '';
    this.config = null;
    this.lobby = null;
    this.transport = null;
    this.offs = [];
    this.root = null;
    this.autoTried = false;
  }

  get ctx() { return this.hub.ctx; }
  get content() { return this.hub.c; }

  /** Called by the hub after it renders the Online tab. */
  async mount(root) {
    this.root = root;
    if (!this.config) {
      this.config = await loadOnlineConfig(browserReadJson());
    }
    // ?room=CODE (invite link, or our own reload onto the room's map): join automatically once
    const q = new URLSearchParams(location.search);
    const code = normalizeRoomCode(q.get('room') || '');
    if (!this.autoTried && !this.lobby && isRoomCode(code)) {
      this.autoTried = true;
      this.join(code, { rejoin: ss.get(SS.room) === code });
      return;
    }
    this.draw();
  }

  /** Back from a match (or the host left): show the same room again, or the start screen. */
  resume({ lobby, transport, message = '' } = {}) {
    this.startedId = null; // the next start (rematch) must run
    if (lobby && transport && lobby.phase !== 'closed') {
      this.attach(lobby, transport);
      lobby.setReady(false);
    } else this.reset();
    this.error = message;
  }

  get name() { return cleanName(this.ctx.settings.playerName); }

  // ------------------------------------------------------------------ actions -------------------
  async create() {
    await this.connect(async (lobby) => {
      await lobby.createRoom();
    });
  }

  async join(code, { rejoin = false } = {}) {
    const c = normalizeRoomCode(code);
    if (!isRoomCode(c)) { this.error = 'Room codes have 6 letters and digits'; this.draw(); return; }
    await this.connect(async (lobby) => {
      await lobby.joinRoom(c);
    }, { id: rejoin ? ss.get(SS.peer) || undefined : undefined });
  }

  async connect(fn, { id } = {}) {
    if (!this.config.ready) {
      this.error = this.config.kind === 'supabase' ? 'Supabase is not set up yet (data/online.json): see docs/DEPLOY-ONLINE.md' : 'No relay server is set up yet (data/online.json relayUrl): see docs/DEPLOY-ONLINE.md';
      this.draw();
      return;
    }
    this.state = 'connecting';
    this.error = '';
    this.draw();
    let transport;
    try {
      transport = await createTransport(this.config, { id });
      const lobby = new Lobby({
        transport, name: this.name, hero: this.ctx.heroId, map: this.ctx.mapId,
        version: String(this.content.version), gameVersion: VERSION,
        settings: { map: this.ctx.mapId, difficulty: 'normal' },
      });
      this.attach(lobby, transport);
      await fn(lobby);
      ss.set(SS.peer, transport.id);
      ss.set(SS.room, lobby.code);
      this.followMap();
    } catch (err) {
      this.detach();
      try { transport?.close(); } catch { /* ignore */ }
      this.state = 'start';
      this.error = err?.message || 'Could not connect';
    }
    this.draw();
  }

  attach(lobby, transport) {
    this.detach();
    this.lobby = lobby;
    this.transport = transport;
    this.state = 'lobby';
    const on = (ev, fn) => this.offs.push(lobby.on(ev, fn));
    on('players', () => this.draw());
    on('settings', () => { this.followMap(); this.draw(); });
    on('host', () => this.draw());
    on('refused', (e) => this.leave(e.reason || 'The room refused to let you in'));
    on('kicked', (e) => this.leave(e.reason || 'You were removed from the room'));
    on('error', (e) => { this.error = e?.message || String(e || ''); this.draw(); });
    on('start', (start) => this.onStart(start));
    const offSt = transport.onStatus?.((st) => { if (st === 'replaced' && this.transport === transport) this.leave('This room was opened in another tab or window'); });
    if (typeof offSt === 'function') this.offs.push(offSt);
  }

  detach() {
    for (const off of this.offs) { try { off?.(); } catch { /* ignore */ } }
    this.offs = [];
  }

  /** The room plays on the map its host had loaded: reload onto it when ours differs. */
  followMap() {
    const map = this.lobby?.settings?.map;
    if (!map || map === this.ctx.mapId) return;
    if (!this.content.maps.has(map)) { this.leave('This room uses a map your game does not have'); return; }
    ss.set(SS.peer, this.transport.id);
    ss.set(SS.room, this.lobby.code);
    const u = new URL(location.href);
    u.searchParams.set('map', map);
    u.searchParams.set('room', this.lobby.code);
    this.ctx.settings.map = map;
    this.ctx.persistSettings?.();
    location.assign(u.toString());
  }

  onStart(start) {
    const localPid = start.peers?.[this.transport.id];
    if (!localPid || this.startedId === start.id) return;
    this.startedId = start.id;
    if (start.map !== this.ctx.mapId) { this.followMap(); return; }
    this.hub.close();
    // startOnline handles its own failures (back to this room with the reason)
    this.ctx.startOnline({ lobby: this.lobby, transport: this.transport, start, localPid, config: this.config });
  }

  leave(message = '') {
    const l = this.lobby;
    this.detach();
    try { l?.leave(); } catch { /* ignore */ }
    this.reset();
    ss.del(SS.room);
    this.error = message;
    // drop ?room= so a reload does not rejoin
    const u = new URL(location.href);
    if (u.searchParams.has('room')) { u.searchParams.delete('room'); history.replaceState(null, '', u.toString()); }
    this.draw();
  }

  reset() {
    this.lobby = null;
    this.transport = null;
    this.state = 'start';
  }

  // ------------------------------------------------------------------ view ----------------------
  draw() {
    const root = this.root;
    if (!root || !root.isConnected) return;
    root.innerHTML = this.state === 'lobby' && this.lobby ? this.lobbyHtml() : this.state === 'connecting' ? this.connectingHtml() : this.startHtml();
    this.bind(root);
  }

  startHtml() {
    const c = this.config || {};
    const local = c.kind === 'local';
    return `<div class="online-start">
      <h3>${icon('globe')} Co-op online</h3>
      <p class="note">2 to 4 players defend one keep together: each with their own hero, towers and cash. Every enemy and every tower is the same for everyone.</p>
      <label class="field">Your name <input name="pname" maxlength="16" autocomplete="nickname" value="${esc(this.name)}" data-testid="online-name"></label>
      <div class="online-actions">
        <div class="online-box"><b>Host a room</b><small>On the map you have loaded: ${esc(this.content.maps.get(this.ctx.mapId)?.name || '')}. Pick another map in Play first.</small>
          <button class="btn primary big" data-act="on-create" data-testid="online-create">Create room</button></div>
        <div class="online-box"><b>Join a room</b><small>Type the 6-character code your friend sees.</small>
          <input name="code" class="code" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(this.codeDraft || '')}" placeholder="ABC123" aria-label="Room code" data-testid="online-code">
          <button class="btn big" data-act="on-join" data-testid="online-join">Join</button></div>
      </div>
      ${this.error ? `<p class="online-error" role="alert" data-testid="online-error">${esc(this.error)}</p>` : ''}
      <p class="note">Connection: <b>${esc(c.label || '')}</b>${local ? '. Local test mode only connects tabs of this browser; to play over the internet the game needs a free Supabase project or relay server (docs/DEPLOY-ONLINE.md).' : ''}</p>
    </div>`;
  }

  connectingHtml() {
    return `<div class="online-start"><h3>${icon('globe')} Connecting...</h3><p class="note" role="status">Finding the room. This takes a few seconds.</p></div>`;
  }

  lobbyHtml() {
    const l = this.lobby;
    const players = l.players;
    const map = this.content.maps.get(l.settings.map);
    const diffs = [...this.content.difficulties.values()].sort((a, b) => a.order - b.order);
    const blocker = l.isHost ? startBlocker(players, l.settings.map) : '';
    // we left a match that is still going (the host has not ended it): offer to go back in
    const running = l.state?.start?.peers?.[this.transport.id] ? l.state.start : null;
    const me = players.find((p) => p.me);
    const invite = (() => { const u = new URL(location.href); u.searchParams.set('room', l.code); u.searchParams.delete('net'); return u.toString(); })();
    const rows = players.map((p, i) => `<li class="op ${p.me ? 'me' : ''}" data-testid="online-player"><i class="dot" style="background:${seatColor(i)}"></i>
      <b>${esc(p.name)}${p.me ? ' (you)' : ''}</b><small>${esc(this.content.heroes.get(p.hero)?.name || '')}</small>
      <span class="tags">${p.host ? `<em class="host">${icon('crown')} Host</em>` : ''}${p.map && p.map !== l.settings.map ? '<em>loading map</em>' : ''}${p.host || p.ready ? `<em class="ok">${icon('check')} Ready</em>` : '<em>Not ready</em>'}</span>
      ${l.isHost && !p.me ? `<button class="btn ghost small" data-kick="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">${icon('close')}</button>` : ''}</li>`).join('');
    return `<div class="online-lobby" data-testid="online-lobby">
      <div class="room-head"><div><small>Room code</small><b class="room-code" data-testid="room-code">${esc(l.code)}</b></div>
        <button class="btn" data-act="on-copy">${icon('check')} Copy invite link</button>
        <input class="invite" readonly value="${esc(invite)}" aria-label="Invite link"></div>
      <div class="lobby-grid">
        <section><h4>Players <span class="count">${players.length}/${MAX_PLAYERS}</span></h4><ol class="op-list">${rows}</ol></section>
        <section><h4>Mission</h4>
          <div class="lobby-map">${map ? mapPreviewSvg(map, { locked: false }) : ''}<div><b>${esc(map?.name || l.settings.map)}</b><small>${esc(map?.description || '')}</small></div></div>
          <label class="field">Difficulty <select name="ldiff" ${l.isHost ? '' : 'disabled'} data-testid="online-difficulty">${diffs.map((d) => `<option value="${d.id}" ${d.id === l.settings.difficulty ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
          <p class="note">Co-op uses level 1 towers for everyone, so all players start equal. Everyone may build any tower; your hotbar shows your own six.</p>
        </section>
      </div>
      ${this.error ? `<p class="online-error" role="alert">${esc(this.error)}</p>` : ''}
      ${running ? `<p class="note running" data-testid="online-running">${icon('play')} The match is still running. <button class="btn primary" data-act="on-rejoin" data-testid="online-rejoin">Rejoin match</button></p>` : ''}
      <div class="lobby-actions">
        ${l.isHost
    ? `<button class="btn primary big" data-act="on-start" data-testid="online-start" ${blocker ? 'disabled' : ''}>${icon('play')} Start match</button>${blocker ? `<small class="why" data-testid="online-why">${esc(blocker)}</small>` : ''}`
    : `<button class="btn ${me?.ready ? '' : 'primary'} big" data-act="on-ready" data-testid="online-ready" aria-pressed="${!!me?.ready}">${me?.ready ? 'Not ready' : 'Ready'}</button><small class="why">The host starts the match when everyone is ready.</small>`}
        <button class="btn danger" data-act="on-leave" data-testid="online-leave">${icon('exit')} Leave room</button>
      </div>
    </div>`;
  }

  bind(root) {
    root.onclick = (e) => {
      // the hub has its own data-act handler on the same tree: lobby clicks stay here
      e.stopPropagation();
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      const a = b.dataset.act;
      if (a === 'on-create') this.create();
      if (a === 'on-join') this.join(root.querySelector('[name=code]')?.value || '');
      if (a === 'on-ready') this.lobby.setReady(!this.lobby.players.find((p) => p.me)?.ready);
      if (a === 'on-leave') this.leave();
      if (a === 'on-rejoin') { const st = this.lobby.state?.start; if (st) { this.startedId = null; this.onStart({ ...st, rejoin: true }); } }
      if (a === 'on-start') {
        const r = this.lobby.start({ force: true });
        if (!r.ok) { this.error = r.reason; this.draw(); }
      }
      if (a === 'on-copy') {
        const inp = root.querySelector('.invite');
        inp.select();
        navigator.clipboard?.writeText(inp.value).then(() => this.hub.toast('Invite link copied', 'good')).catch(() => this.hub.toast('Copy the link from the box', 'good'));
      }
      if (b.dataset.kick) this.lobby.kick(b.dataset.kick);
    };
    // typed text survives a redraw of the hub: the name is saved as it is typed, the code kept
    root.oninput = (e) => {
      if (e.target.name === 'pname') { this.ctx.settings.playerName = cleanName(e.target.value, ''); this.ctx.persistSettings?.(); }
      if (e.target.name === 'code') {
        const v = normalizeRoomCode(e.target.value);
        if (v !== e.target.value) e.target.value = v;
        this.codeDraft = v;
      }
    };
    root.onchange = (e) => {
      if (e.target.name === 'pname') {
        this.ctx.settings.playerName = cleanName(e.target.value);
        e.target.value = this.ctx.settings.playerName;
        this.ctx.persistSettings?.();
      }
      if (e.target.name === 'ldiff' && this.lobby?.isHost) this.lobby.setSettings({ difficulty: e.target.value });
    };
    root.onkeydown = (e) => {
      if (e.key === 'Enter' && e.target.name === 'code') this.join(e.target.value);
    };
  }
}
