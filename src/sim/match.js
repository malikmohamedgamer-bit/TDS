// The match simulation. Pure (no DOM / Three.js), deterministic for a given seed, content and
// command log, stepped at a fixed 60 Hz. The renderer only reads its state and drains events.
//
// Player actions are commands: they are validated, logged with the tick they apply on, and
// applied at the start of the next step. Replaying (seed, content version, log) reproduces the
// match exactly, which is what a server needs to validate results later (docs/online-plan.md).
import { Rng } from '../core/rng.js';
import { Path } from './path.js';
import { towerStats, nextStep, DEFAULT_PROGRESSION } from './stats.js';
import { resolveDamage, pickTarget, canTarget, TARGET_MODES } from './combat.js';
import { resolveTuning, roundCost } from './tuning.js';

export const SIM_DT = 1 / 60;
export const SELL_REFUND = 0.7;
export const PLACE_MAX_SLOPE = 24;
const MELEE_DEFAULT = 6;

const r2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;

export class Match {
  /**
   * @param {object} o
   * @param {object} o.content      loadContent() result
   * @param {object} o.mapWorld     buildMapWorld() result (owned by this match: tower colliders are added to it)
   * @param {string} [o.difficulty] difficulty id
   * @param {string} [o.seed]
   * @param {string[]} [o.loadout]  tower ids the player brought (default: all)
   * @param {object} [o.levels]     lobby levels per tower id
   * @param {string} [o.hero]       hero id
   * @param {object} [o.options]    {enemiesHurtHero, startCash, cashMul, infiniteCash, waveSet, progression}
   */
  constructor(o) {
    this.content = o.content;
    this.mw = o.mapWorld;
    this.map = o.mapWorld.map;
    this.options = { enemiesHurtHero: false, ...(o.options || {}) };
    this.seed = String(o.seed ?? 'match');
    this.rng = new Rng(`${this.seed}:sim`);
    // global tuning (data/tuning.json preset) + player assists; everything below reads this.tune
    this.tune = resolveTuning(this.content.tuning, this.options.preset, this.options.assist);
    this.difficulty = this.content.difficulties.get(o.difficulty || 'normal');
    if (!this.difficulty) throw new Error(`Unknown difficulty ${o.difficulty}`);
    this.waveSet = this.content.waves.get(this.options.waveSet || this.map.waves);
    if (!this.waveSet) throw new Error(`Map ${this.map.id} has no wave set`);
    this.loadout = o.loadout ? [...o.loadout] : [...this.content.towers.keys()];
    this.levels = { ...(o.levels || {}) };
    this.progression = this.options.progression || this.content.progression?.towerLevels || DEFAULT_PROGRESSION;
    this.paths = this.map.paths.map((p) => new Path(p.id, p.points));
    this.pathWidth = Math.max(...this.map.paths.map((p) => p.width ?? 5));

    this.tick = 0;
    this.time = 0;
    this.phase = 'prep'; // prep | wave | won | lost
    this.wave = 0; // last started wave (1-based), 0 = none yet
    this.waveStartTime = 0;
    // manualStart: the first wave waits for the player's "start" (skip) command
    this.nextWaveAt = this.options.manualStart ? Infinity : this.waveSet.firstWaveDelay ?? 10;
    this.paidWaves = 0;
    this.cash = Math.round((this.options.startCash ?? this.waveSet.startCash) * this.tune.startCash * (this.difficulty.id === 'relaxed' ? this.difficulty.cashMul : 1)) + this.tune.startCashAdd;
    this.baseMax = Math.round(this.waveSet.baseHp * (this.difficulty.baseHpMul ?? 1) * this.tune.keepHp);
    this.baseHp = this.baseMax;
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.allies = [];
    this.mines = [];
    this.telegraphs = [];
    this.pendingAbilities = [];
    this.spawnQueue = [];
    this.events = [];
    this.log = [];
    this.queue = [];
    this.nextId = 1;
    this.stats = { kills: 0, leaks: 0, cashEarned: 0, damage: 0, spawned: 0, bossesKilled: 0, placed: 0, upgrades: 0, evolutions: 0, abilities: 0 };
    this.seen = new Set();
    this.auraDirty = true;

    const heroDef = this.content.heroes.get(o.hero || [...this.content.heroes.keys()][0]);
    this.hero = heroDef ? {
      def: heroDef, x: this.map.playerSpawn.x, y: 0, z: this.map.playerSpawn.z,
      hp: heroDef.hp, maxHp: heroDef.hp, cooldown: 0, downUntil: 0, kills: 0,
    } : null;
    this.abilities = (heroDef?.abilities || []).map((id) => ({ id, def: this.content.abilities.get(id), ready: 0, mode: 'manual' }));
  }

  // ---------------------------------------------------------------- commands ---------------
  /** Validate and queue a player command. Returns {ok, reason}. */
  command(cmd) {
    const v = this.validate(cmd);
    if (!v.ok) return v;
    this.queue.push(cmd);
    return v;
  }

  validate(cmd) {
    if (this.phase === 'won' || this.phase === 'lost') return { ok: false, reason: 'Match is over', code: 'over' };
    switch (cmd.type) {
      case 'place': return this.canPlace(cmd.tower, cmd.x, cmd.z);
      case 'move': {
        const t = this.towerById(cmd.uid);
        if (!t) return { ok: false, reason: 'No such tower', code: 'missing' };
        return this.canPlace(t.defId, cmd.x, cmd.z, t.uid, true);
      }
      case 'upgrade': {
        const t = this.towerById(cmd.uid);
        if (!t) return { ok: false, reason: 'No such tower', code: 'missing' };
        const n = nextStep(t.def, t.up, cmd.branch);
        if (!n) return { ok: false, reason: 'Fully upgraded', code: 'max' };
        if (n.needsBranch) return { ok: false, reason: 'Choose a path', code: 'branch', options: n.options };
        const sc = this.stepCost(n.step);
        if (this.cash < sc && !this.options.infiniteCash) return { ok: false, reason: `Need ${sc - this.cash} more cash`, code: 'cash' };
        return { ok: true, cost: sc, step: n.step };
      }
      case 'sell': return this.towerById(cmd.uid) ? { ok: true } : { ok: false, reason: 'No such tower', code: 'missing' };
      case 'target': {
        if (!this.towerById(cmd.uid)) return { ok: false, reason: 'No such tower', code: 'missing' };
        return TARGET_MODES.includes(cmd.mode) ? { ok: true } : { ok: false, reason: 'Bad mode', code: 'mode' };
      }
      case 'ability': {
        const a = this.abilities.find((x) => x.id === cmd.id);
        if (!a) return { ok: false, reason: 'Ability not equipped', code: 'missing' };
        if (a.ready > this.time) return { ok: false, reason: `Ready in ${Math.ceil(a.ready - this.time)} s`, code: 'cooldown' };
        if (this.hero && this.hero.downUntil > this.time) return { ok: false, reason: 'Commander is down', code: 'down' };
        return { ok: true };
      }
      case 'abilityMode': return this.abilities.some((x) => x.id === cmd.id) && ['manual', 'auto'].includes(cmd.mode) ? { ok: true } : { ok: false, reason: 'Bad ability mode', code: 'mode' };
      case 'skip': return this.phase === 'prep' || this.canSkip() ? { ok: true } : { ok: false, reason: 'Cannot skip yet', code: 'skip' };
      case 'assistSkip': return this.tune.skipWave && this.phase === 'wave' ? { ok: true } : { ok: false, reason: 'Turn on the Skip wave assist first', code: 'assist' };
      case 'hero': return Number.isFinite(cmd.x) && Number.isFinite(cmd.z) ? { ok: true } : { ok: false, reason: 'Bad position', code: 'pos' };
      default: return { ok: false, reason: `Unknown command ${cmd.type}`, code: 'unknown' };
    }
  }

  /** Assist: remove the current wave entirely (no rewards for it) and move on. */
  _assistSkip() {
    for (const e of this.enemies) e.alive = false;
    this.spawnQueue = [];
    this.stats.assistSkips = (this.stats.assistSkips || 0) + 1;
    this.events.push({ type: 'assistSkip', wave: this.wave });
    if (this.wave >= this.waveCount()) { this.phase = 'won'; this.events.push({ type: 'won', wave: this.wave }); return; }
    this.paidWaves = Math.max(this.paidWaves, this.wave); // no bonus for a skipped wave
    this._startWave(this.wave + 1);
  }

  canSkip() {
    return this.phase === 'wave' && this.spawnQueue.length === 0 && this.wave < this.waveSet.waves.length && this.nextWaveAt > this.time;
  }

  /** Placement check used by the preview and by the command itself. */
  canPlace(towerId, x, z, ignoreUid = null, isMove = false) {
    const def = this.content.towers.get(towerId);
    if (!def) return { ok: false, reason: 'Unknown tower', code: 'unknown' };
    if (!isMove && !this.loadout.includes(towerId)) return { ok: false, reason: 'Not in your loadout', code: 'locked' };
    const cost = this.costOf(def);
    if (!isMove && !this.options.infiniteCash && this.cash < cost) return { ok: false, reason: `Need ${cost - this.cash} more cash`, code: 'cash' };
    if (!isMove && def.limit && this.towers.filter((t) => t.defId === towerId).length >= def.limit) return { ok: false, reason: `Limit ${def.limit} reached`, code: 'limit' };
    const b = this.mw.world.bounds;
    const fp = def.footprint ?? 1;
    if (x < b.minX + fp || x > b.maxX - fp || z < b.minZ + fp || z > b.maxZ - fp) return { ok: false, reason: 'Outside the map', code: 'bounds' };
    const pi = this.mw.terrain.pathInfo(x, z);
    if (pi.d < pi.path.half + fp + 0.3) return { ok: false, reason: 'Cannot build on the road', code: 'path' };
    if (this.mw.terrain.slope(x, z) > PLACE_MAX_SLOPE) return { ok: false, reason: 'Ground too steep', code: 'slope' };
    for (const c of this.mw.world.query(x, z, fp)) {
      if (!c.blocksPlacement) continue;
      if (ignoreUid !== null && c.ref && c.ref.uid === ignoreUid) continue;
      if (this.mw.world.penetration(c, x, z, fp)) return { ok: false, reason: c.tag === 'tower' ? 'Too close to another tower' : 'Something is in the way', code: 'blocked' };
    }
    return { ok: true, cost };
  }

  /** Tuned tower price. */
  costOf(def) {
    return roundCost(def.cost * this.tune.towerCost);
  }

  /** Tuned upgrade-step price. */
  stepCost(step) {
    return roundCost(step.cost * this.tune.upgradeCost);
  }

  /** What selling this tower returns right now. */
  refundOf(t) {
    return Math.floor(t.spent * this.tune.sellRefund);
  }

  towerById(uid) {
    return this.towers.find((t) => t.uid === uid) || null;
  }

  _apply(cmd) {
    const v = this.validate(cmd);
    if (!v.ok) { this.events.push({ type: 'rejected', cmd, reason: v.reason }); return; }
    this.log.push({ tick: this.tick, ...cmd });
    switch (cmd.type) {
      case 'place': this._place(cmd); break;
      case 'move': this._move(cmd); break;
      case 'upgrade': this._upgrade(cmd, v); break;
      case 'sell': this._sell(cmd); break;
      case 'target': this.towerById(cmd.uid).targeting = cmd.mode; break;
      case 'ability': this._castAbility(cmd.id, cmd.x, cmd.z); break;
      case 'abilityMode': this.abilities.find((a) => a.id === cmd.id).mode = cmd.mode; break;
      case 'skip': this._startWave(this.wave + 1); break;
      case 'assistSkip': this._assistSkip(); break;
      case 'hero': if (this.hero) { this.hero.x = cmd.x; this.hero.y = cmd.y ?? 0; this.hero.z = cmd.z; } break;
      default: break;
    }
  }

  _place({ tower, x, z, rot = 0 }) {
    const def = this.content.towers.get(tower);
    const paid = this.costOf(def);
    if (!this.options.infiniteCash) this.cash -= paid;
    const t = {
      spent: paid,
      uid: this.nextId++, defId: tower, def, x, z, y: this.mw.terrain.height(x, z), rot,
      up: { linear: 0, branch: null, branchLevel: 0 }, targeting: def.stats.targeting || 'first',
      cooldown: 0.2, stunUntil: 0, kills: 0, damage: 0, placedAt: this.time, hits: 0,
      summonTimer: 1, trapTimer: 0.5, aura: null, buffs: [], unit: null,
    };
    this._refreshTower(t);
    if (def.air) t.unit = { x, y: t.y + def.air.altitude, z, angle: this.rng.range(0, Math.PI * 2) };
    t.collider = this.mw.world.add({ shape: 'circle', x, z, r: def.footprint ?? 1, h: 2.6, tag: 'tower', ref: t });
    this.towers.push(t);
    this.stats.placed++;
    this.auraDirty = true;
    this.events.push({ type: 'place', uid: t.uid, tower, x, z });
  }

  _move({ uid, x, z }) {
    const t = this.towerById(uid);
    this.mw.world.remove(t.collider.id);
    t.x = x; t.z = z; t.y = this.mw.terrain.height(x, z);
    t.collider = this.mw.world.add({ shape: 'circle', x, z, r: t.def.footprint ?? 1, h: 2.6, tag: 'tower', ref: t });
    t.stunUntil = Math.max(t.stunUntil, this.time + 2); // relocating
    for (const m of this.mines) if (m.owner === t.uid) m.dead = true;
    this._refreshTower(t);
    this.auraDirty = true;
    this.events.push({ type: 'move', uid, x, z });
  }

  _upgrade({ uid, branch }, v) {
    const t = this.towerById(uid);
    const n = nextStep(t.def, t.up, branch);
    if (!this.options.infiniteCash) this.cash -= v.cost;
    t.spent += v.cost;
    if (n.kind === 'linear') t.up.linear++;
    else { t.up.branch = n.branch; t.up.branchLevel++; }
    const before = t.name;
    this._refreshTower(t);
    this.stats.upgrades++;
    if (n.step.evolve) this.stats.evolutions++;
    this.auraDirty = true;
    this.events.push({ type: 'upgrade', uid, step: n.step.name, evolved: n.step.evolve ? { from: before, to: t.name } : null });
  }

  _sell({ uid }) {
    const t = this.towerById(uid);
    const refund = this.refundOf(t);
    if (!this.options.infiniteCash) this.cash += refund;
    this.mw.world.remove(t.collider.id);
    this.towers = this.towers.filter((x) => x !== t);
    for (const m of this.mines) if (m.owner === uid) m.dead = true;
    for (const a of this.allies) if (a.owner === uid) a.dead = true;
    this.auraDirty = true;
    this.events.push({ type: 'sell', uid, refund });
  }

  _refreshTower(t) {
    const s = towerStats(t.def, t.up, this.levels[t.defId] || 1, this.progression);
    t.base = s.stats;
    t.name = s.name;
    t.tier = s.tier;
    t.evolved = s.evolvedInMatch;
    t.lobbyLevel = s.lobbyLevel;
    if (t.base.trap) t.minePoints = this._minePoints(t);
  }

  _minePoints(t) {
    const pts = [];
    for (const p of this.paths) for (const d of p.samplesWithin(t.x, t.z, t.base.range, 0.75)) pts.push({ path: p, d });
    return pts;
  }

  /** Effective stats: base + support auras (strongest of each kind) + temporary buffs. */
  _computeAuras() {
    for (const t of this.towers) t.aura = { damage: 0, range: 0, rate: 0, detection: false };
    for (const s of this.towers) {
      const a = s.base.aura;
      if (!a) continue;
      const rad = s.base.range || 12;
      for (const t of this.towers) {
        if (t === s) continue;
        if (r2(t.x, t.z, s.x, s.z) > rad * rad) continue;
        t.aura.damage = Math.max(t.aura.damage, a.damage || 0);
        t.aura.range = Math.max(t.aura.range, a.range || 0);
        t.aura.rate = Math.max(t.aura.rate, a.rate || 0);
        t.aura.detection = t.aura.detection || !!a.detection;
      }
    }
    this.auraDirty = false;
  }

  effective(t) {
    const b = t.base;
    const a = t.aura || { damage: 0, range: 0, rate: 0, detection: false };
    let rate = (b.rate || 0) * (1 + a.rate);
    for (const bf of t.buffs) if (bf.until > this.time) rate *= 1 + (bf.rate || 0);
    return {
      damage: (b.damage || 0) * (1 + a.damage),
      range: (b.range || 0) * (1 + a.range),
      rate,
      detection: !!b.detection || a.detection,
    };
  }

  // ---------------------------------------------------------------- waves ------------------
  waveCount() {
    return this.waveSet.waves.length;
  }

  enemyHpScale(waveNo) {
    return this.difficulty.hpMul * this.tune.enemyHp * (1 + (this.waveSet.hpScalePerWave ?? 0) * (waveNo - 1));
  }

  _startWave(n) {
    if (n > this.waveCount()) return;
    this._payWaveRewards();
    this.wave = n;
    this.phase = 'wave';
    this.waveStartTime = this.time;
    this.nextWaveAt = this.time + (this.waveSet.maxDuration ?? 60);
    const w = this.waveSet.waves[n - 1];
    w.groups.forEach((g, gi) => {
      const count = Math.max(1, Math.round(g.count * (this.content.enemies.get(g.enemy)?.boss ? 1 : this.tune.enemyCount)));
      const interval = (g.interval || 1) * g.count / count; // same group duration, denser or sparser
      for (let i = 0; i < count; i++) {
        this.spawnQueue.push({ at: this.time + (g.delay || 0) + i * interval, enemy: g.enemy, hpMul: g.hpMul || 1, leak: g.leak, pathIdx: g.path ?? (i + gi) % this.paths.length, wave: n, order: gi * 1000 + i });
      }
    });
    this.spawnQueue.sort((a, b) => a.at - b.at || a.order - b.order);
    this.events.push({ type: 'waveStart', wave: n, boss: !!w.boss, total: this.waveCount() });
  }

  /** Wave clear bonus + income for every finished wave, paid once each. */
  _payWaveRewards() {
    while (this.paidWaves < this.wave) {
      this.paidWaves++;
      const bonus = (this.waveSet.bonusBase ?? 100) + (this.waveSet.bonusPerWave ?? 0) * this.paidWaves;
      let income = 0;
      for (const t of this.towers) income += t.base.income || 0;
      this._gainCash(bonus * this.tune.waveBonus + income, 'wave');
      this.events.push({ type: 'waveReward', wave: this.paidWaves, bonus, income });
    }
  }

  _gainCash(n, why) {
    const v = Math.round(n * (this.options.cashMul ?? 1) * (this.difficulty.cashMul ?? 1) * (why === 'kill' ? this.tune.killIncome : 1));
    this.cash += v;
    this.stats.cashEarned += v;
    return v;
  }

  spawnEnemy(id, { pathIdx = 0, d = 0, hpMul = 1, wave = this.wave, parent = null, leak } = {}) {
    const def = this.content.enemies.get(id);
    if (!def) throw new Error(`Unknown enemy "${id}"`);
    if (!Number.isFinite(d)) throw new Error(`spawnEnemy: bad path distance ${d}`);
    const scale = this.enemyHpScale(Math.max(1, wave)) * hpMul * (def.boss ? this.tune.bossHp : 1);
    const e = {
      id: this.nextId++, defId: id, def, path: this.paths[pathIdx % this.paths.length],
      d, progress: d, x: 0, y: 0, z: 0, hp: def.hp * scale, maxHp: def.hp * scale,
      shield: (def.shield || 0) * scale, maxShield: (def.shield || 0) * scale,
      armor: def.armor || 0, flying: !!def.flying, stealth: !!def.stealth, alive: true,
      baseSpeed: def.speed * (this.difficulty.speedMul ?? 1) * this.tune.enemySpeed, speedMul: 1, curSpeed: def.speed,
      slow: 0, slowUntil: 0, stunUntil: 0, burnDps: 0, burnUntil: 0, burnSrc: null, mark: 0, markUntil: 0,
      phase: 0, healT: def.heal?.interval ?? 0, summonT: def.summon?.interval ?? 0, attackT: def.attack?.interval ?? 0,
      blocked: false, wave, boss: !!def.boss, heading: 0, spawnedAt: this.time, parent, leak: leak ?? def.leak,
    };
    this._placeEnemy(e);
    this.enemies.push(e);
    this.seen.add(id);
    this.stats.spawned++;
    this.events.push({ type: 'spawn', id: e.id, enemy: id, boss: e.boss });
    if (e.boss) this.events.push({ type: 'bossSpawn', id: e.id, enemy: id, name: def.name });
    return e;
  }

  _placeEnemy(e) {
    const p = e.path.pointAt(e.d, this._pt || (this._pt = {}));
    e.x = p.x;
    e.z = p.z;
    e.heading = Math.atan2(p.dx, p.dz);
    e.y = this.mw.terrain.height(p.x, p.z) + (e.flying ? (e.def.altitude ?? 4) : 0);
    e.progress = e.d;
  }

  // ---------------------------------------------------------------- step -------------------
  step() {
    const dt = SIM_DT;
    if (this.queue.length) {
      const q = this.queue;
      this.queue = [];
      for (const c of q) this._apply(c);
    }
    if (this.phase === 'won' || this.phase === 'lost') { this.tick++; return; }
    this.time += dt;
    this.tick++;

    // wave flow
    if (this.phase === 'prep' && this.time >= this.nextWaveAt) this._startWave(1);
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.time) {
      const s = this.spawnQueue.shift();
      this.spawnEnemy(s.enemy, { pathIdx: s.pathIdx, hpMul: s.hpMul, wave: s.wave, leak: s.leak });
    }
    if (this.auraDirty) this._computeAuras();

    this._updateEnemies(dt);
    this._updateTowers(dt);
    this._updateProjectiles(dt);
    this._updateAllies(dt);
    this._updateMines();
    this._updateHero(dt);
    this._updateAbilities();
    this._updateTelegraphs();

    // cleanup
    if (this.enemies.some((e) => !e.alive)) this.enemies = this.enemies.filter((e) => e.alive);
    if (this.allies.some((a) => a.dead)) this.allies = this.allies.filter((a) => !a.dead);
    if (this.mines.some((m) => m.dead)) this.mines = this.mines.filter((m) => !m.dead);

    // end conditions / next wave
    if (this.baseHp <= 0) {
      this.baseHp = 0;
      this.phase = 'lost';
      this.events.push({ type: 'lost', wave: this.wave });
      return;
    }
    if (this.phase === 'wave' && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      if (this.wave >= this.waveCount()) {
        this._payWaveRewards();
        this.phase = 'won';
        this.events.push({ type: 'won', wave: this.wave });
        return;
      }
      if (!this._clearedAt || this._clearedWave !== this.wave) {
        this._clearedAt = this.time;
        this._clearedWave = this.wave;
        this.nextWaveAt = Math.min(this.nextWaveAt, this.time + (this.waveSet.intermission ?? 5));
        this.events.push({ type: 'waveCleared', wave: this.wave });
      }
    }
    if (this.phase === 'wave' && this.time >= this.nextWaveAt && this.wave < this.waveCount()) this._startWave(this.wave + 1);
  }

  _updateEnemies(dt) {
    const now = this.time;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const def = e.def;
      // damage over time
      if (e.burnUntil > now) this._damage(e, { amount: e.burnDps * dt, type: 'fire', dot: true }, e.burnSrc);
      if (!e.alive) continue;
      if (def.regen && e.burnUntil <= now) e.hp = Math.min(e.maxHp, e.hp + def.regen * e.maxHp * dt);
      // abilities
      if (def.heal) {
        e.healT -= dt;
        if (e.healT <= 0) {
          e.healT = def.heal.interval;
          const rr = def.heal.radius * def.heal.radius;
          let n = 0;
          for (const o of this.enemies) {
            if (!o.alive || o === e || r2(o.x, o.z, e.x, e.z) > rr || o.hp >= o.maxHp) continue;
            o.hp = Math.min(o.maxHp, o.hp + def.heal.amount * o.maxHp);
            n++;
          }
          this.events.push({ type: 'heal', id: e.id, x: e.x, z: e.z, radius: def.heal.radius, count: n });
        }
      }
      if (def.summon) {
        e.summonT -= dt;
        if (e.summonT <= 0) {
          e.summonT = def.summon.interval;
          for (let i = 0; i < def.summon.count; i++) this.spawnEnemy(def.summon.into, { pathIdx: this.paths.indexOf(e.path), d: Math.max(0, e.d - 0.6 * (i + 1)), wave: e.wave, parent: e.id });
          this.events.push({ type: 'summon', id: e.id, x: e.x, z: e.z });
        }
      }
      if (def.attack) {
        e.attackT -= dt;
        if (e.attackT <= 0) {
          e.attackT = def.attack.interval;
          this._enemyAttack(e);
        }
      }
      // movement
      const stunned = e.stunUntil > now;
      const slow = e.slowUntil > now ? e.slow : 0;
      e.curSpeed = stunned ? 0 : e.baseSpeed * e.speedMul * (1 - slow);
      e.blocked = false;
      if (!e.flying) {
        for (const a of this.allies) {
          if (!a.dead && a.path === e.path && Math.abs(a.d - e.d) < 1.1 + (def.size || 1) * 0.4) {
            e.blocked = true;
            if (!stunned) {
              a.hp -= (def.melee ?? (e.boss ? 60 : MELEE_DEFAULT)) * dt;
              if (a.hp <= 0 && !a.dead) { a.dead = true; this.events.push({ type: 'allyDeath', id: a.id, x: a.x, z: a.z }); }
            }
            break;
          }
        }
      }
      if (!e.blocked) e.d += e.curSpeed * dt;
      if (e.d >= e.path.length) {
        e.alive = false;
        this.baseHp -= e.leak;
        this.stats.leaks++;
        this.events.push({ type: 'leak', id: e.id, enemy: e.defId, damage: e.leak, x: e.x, z: e.z });
        continue;
      }
      this._placeEnemy(e);
    }
  }

  _enemyAttack(e) {
    const a = e.def.attack;
    let best = null;
    let bd = a.range * a.range;
    for (const t of this.towers) {
      const d = r2(t.x, t.z, e.x, e.z);
      if (d <= bd) { bd = d; best = t; }
    }
    if (best) {
      best.stunUntil = Math.max(best.stunUntil, this.time + (a.stun || 0));
      this.events.push({ type: 'hex', id: e.id, uid: best.uid, x: best.x, z: best.z, duration: a.stun || 0 });
    }
    const h = this.hero;
    if (h && this.options.enemiesHurtHero && a.damage > 0 && h.downUntil <= this.time && r2(h.x, h.z, e.x, e.z) <= a.range * a.range) {
      h.hp -= a.damage;
      if (h.hp <= 0) this._heroDown();
    }
  }

  _heroDown() {
    const h = this.hero;
    h.hp = 0;
    h.downUntil = this.time + 6;
    this.events.push({ type: 'heroDown', until: h.downUntil });
  }

  _updateTowers(dt) {
    const now = this.time;
    for (const t of this.towers) {
      const b = t.base;
      if (t.unit) {
        const air = t.def.air;
        t.unit.angle += air.speed * dt;
        t.unit.x = t.x + Math.cos(t.unit.angle) * air.patrol;
        t.unit.z = t.z + Math.sin(t.unit.angle) * air.patrol;
        t.unit.y = t.y + air.altitude;
      }
      if (t.stunUntil > now) continue;
      const eff = this.effective(t);
      if (b.summon) { this._towerSummon(t, dt); continue; }
      if (b.trap) { this._towerTrap(t, dt); continue; }
      if (!b.damage || !eff.rate) continue;
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const ox = t.unit ? t.unit.x : t.x;
      const oz = t.unit ? t.unit.z : t.z;
      const target = pickTarget(this.enemies, { x: ox, z: oz, range: eff.range, targets: b.targets, detection: eff.detection, mode: t.targeting });
      if (!target) { t.cooldown = 0; continue; }
      t.cooldown += 1 / eff.rate;
      if (t.cooldown < 0) t.cooldown = 0;
      t.target = target.id;
      t.hits++;
      const packet = {
        amount: eff.damage, type: b.damageType || 'physical', splash: b.splash || 0, armorPierce: b.armorPierce || 0,
        burn: b.burn, slow: b.slow, stun: b.stun, mark: b.mark, airBonus: b.airBonus,
        freeze: b.freeze && t.hits % b.freeze.every === 0 ? b.freeze.duration : 0,
        chain: b.chain, targets: b.targets, detection: eff.detection,
      };
      const oy = t.unit ? t.unit.y : t.y + 2;
      const speed = b.projectile?.speed ?? 0;
      this.events.push({ type: 'fire', uid: t.uid, target: target.id, kind: b.projectile?.kind || 'bullet', x: ox, y: oy, z: oz, tx: target.x, ty: target.y + 1, tz: target.z });
      if (!speed) this._hit(target, packet, t, target.x, target.z);
      else this.projectiles.push({ id: this.nextId++, kind: b.projectile.kind, x: ox, y: oy, z: oz, target: target.id, tx: target.x, ty: target.y + 1, tz: target.z, speed, packet, src: t.uid });
    }
  }

  _towerSummon(t, dt) {
    const s = t.base.summon;
    t.summonTimer -= dt;
    if (t.summonTimer > 0) return;
    t.summonTimer = s.interval;
    if (this.phase !== 'wave') return;
    const mine = this.allies.filter((a) => a.owner === t.uid && !a.dead).length;
    if (mine >= s.max) return;
    const u = s.unit;
    const path = this.paths[t.uid % this.paths.length];
    const a = {
      id: this.nextId++, owner: t.uid, kind: u.id, path, d: path.length - 1, x: 0, z: 0, y: 0,
      hp: u.hp, maxHp: u.hp, damage: u.damage * (1 + (t.aura?.damage || 0)), rate: u.rate, cd: 0, speed: u.speed, range: u.range,
      splash: u.splash || 0, damageType: u.damageType || 'physical', dead: false, fighting: false, heading: 0,
    };
    this._placeAlly(a);
    this.allies.push(a);
    this.events.push({ type: 'allySpawn', id: a.id, uid: t.uid, kind: a.kind, x: a.x, z: a.z });
  }

  _placeAlly(a) {
    const p = a.path.pointAt(a.d, this._pa || (this._pa = {}));
    a.x = p.x;
    a.z = p.z;
    a.heading = Math.atan2(-p.dx, -p.dz);
    a.y = this.mw.terrain.height(p.x, p.z);
  }

  _updateAllies(dt) {
    for (const a of this.allies) {
      if (a.dead) continue;
      let target = null;
      let best = Infinity;
      for (const e of this.enemies) {
        if (!e.alive || e.flying || e.path !== a.path) continue;
        const gap = Math.abs(e.d - a.d);
        if (gap < best && gap <= a.range + 0.6) { best = gap; target = e; }
      }
      a.fighting = !!target;
      if (target) {
        a.cd -= dt;
        if (a.cd <= 0) {
          a.cd += 1 / a.rate;
          this._hit(target, { amount: a.damage, type: a.damageType, splash: a.splash, targets: { ground: true, air: false }, detection: true }, null, target.x, target.z);
          this.events.push({ type: 'allyHit', id: a.id, target: target.id });
        }
      } else {
        a.d -= a.speed * dt;
        if (a.d <= 0) { a.dead = true; continue; }
        this._placeAlly(a);
      }
    }
  }

  _towerTrap(t, dt) {
    const tr = t.base.trap;
    t.trapTimer -= dt;
    if (t.trapTimer > 0 || !t.minePoints?.length) return;
    t.trapTimer = tr.interval;
    if (this.mines.filter((m) => m.owner === t.uid && !m.dead).length >= tr.max) return;
    const pick = t.minePoints[this.rng.int(0, t.minePoints.length - 1)];
    const p = pick.path.pointAt(pick.d, {});
    const jitter = (this.rng.next() - 0.5) * (this.pathWidth * 0.5);
    const x = p.x - p.dz * jitter;
    const z = p.z + p.dx * jitter;
    this.mines.push({ id: this.nextId++, owner: t.uid, x, z, y: this.mw.terrain.height(x, z), dead: false });
    this.events.push({ type: 'minePlaced', uid: t.uid, x, z });
  }

  _updateMines() {
    for (const m of this.mines) {
      if (m.dead) continue;
      const t = this.towerById(m.owner);
      if (!t) { m.dead = true; continue; }
      const trig = t.base.trap.trigger;
      for (const e of this.enemies) {
        if (!e.alive || e.flying || r2(e.x, e.z, m.x, m.z) > trig * trig) continue;
        m.dead = true;
        const eff = this.effective(t);
        this._splash({ amount: eff.damage, type: t.base.damageType, splash: t.base.splash, stun: t.base.stun, targets: { ground: true, air: false }, detection: true }, t, m.x, m.z);
        this.events.push({ type: 'explosion', x: m.x, y: m.y, z: m.z, radius: t.base.splash, kind: 'mine' });
        break;
      }
    }
  }

  _updateProjectiles(dt) {
    const keep = [];
    for (const p of this.projectiles) {
      const tgt = this.enemies.find((e) => e.id === p.target && e.alive);
      if (tgt) { p.tx = tgt.x; p.ty = tgt.y + 1; p.tz = tgt.z; }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dz = p.tz - p.z;
      const dist = Math.hypot(dx, dy, dz);
      const stepLen = p.speed * dt;
      if (dist <= stepLen || dist < 0.3) {
        const src = this.towerById(p.src);
        if (tgt) this._hit(tgt, p.packet, src, tgt.x, tgt.z);
        else if (p.packet.splash) this._splash(p.packet, src, p.tx, p.tz);
        continue;
      }
      p.x += (dx / dist) * stepLen;
      p.y += (dy / dist) * stepLen;
      p.z += (dz / dist) * stepLen;
      keep.push(p);
    }
    this.projectiles = keep;
  }

  /** Primary hit: splash or single target, then chain. */
  _hit(target, packet, src, x, z) {
    if (packet.splash) this._splash(packet, src, x, z, target);
    else this._damage(target, packet, src);
    if (packet.chain && packet.chain.count > 1) {
      const hit = new Set([target.id]);
      let cur = target;
      let amt = packet.amount;
      for (let i = 1; i < packet.chain.count; i++) {
        amt *= packet.chain.falloff;
        let next = null;
        let bd = packet.chain.range * packet.chain.range;
        for (const e of this.enemies) {
          if (hit.has(e.id) || !canTarget(e, packet.targets, packet.detection)) continue;
          const d = r2(e.x, e.z, cur.x, cur.z);
          if (d <= bd) { bd = d; next = e; }
        }
        if (!next) break;
        hit.add(next.id);
        this.events.push({ type: 'chain', from: cur.id, to: next.id, x0: cur.x, y0: cur.y + 1, z0: cur.z, x1: next.x, y1: next.y + 1, z1: next.z });
        this._damage(next, { ...packet, amount: amt, chain: null, splash: 0 }, src);
        cur = next;
      }
    }
  }

  _splash(packet, src, x, z, primary = null) {
    const rr = packet.splash * packet.splash;
    this.events.push({ type: 'explosion', x, y: primary ? primary.y : this.mw.terrain.height(x, z), z, radius: packet.splash, damageType: packet.type });
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e !== primary && (r2(e.x, e.z, x, z) > rr || (e.flying ? !packet.targets?.air : !packet.targets?.ground))) continue;
      this._damage(e, packet, src);
    }
  }

  /** Apply one damage packet (and its status effects) to an enemy. */
  _damage(e, packet, src) {
    if (!e.alive) return;
    const now = this.time;
    const { toShield, toHp } = resolveDamage(e, packet, this.content.damageTypes, now);
    e.shield = Math.max(0, e.shield - toShield);
    e.hp -= toHp;
    const dealt = toShield + toHp;
    this.stats.damage += dealt;
    if (src) src.damage += dealt;
    if (!packet.dot && dealt > 0) this.events.push({ type: 'damage', id: e.id, amount: dealt, damageType: packet.type, x: e.x, y: e.y, z: e.z, shield: toShield > 0 });
    if (!packet.dot) {
      if (packet.slow) { e.slow = Math.max(e.slowUntil > now ? e.slow : 0, packet.slow.amount); e.slowUntil = Math.max(e.slowUntil, now + packet.slow.duration); }
      if (packet.burn) { if (e.burnUntil <= now || packet.burn.dps >= e.burnDps) { e.burnDps = packet.burn.dps; e.burnSrc = src; } e.burnUntil = now + packet.burn.duration; }
      const stun = Math.max(packet.stun || 0, packet.freeze || 0) * (e.boss ? 0.25 : 1);
      if (stun) { e.stunUntil = Math.max(e.stunUntil, now + stun); if (packet.freeze) this.events.push({ type: 'freeze', id: e.id, duration: stun }); }
      if (packet.mark) { e.mark = Math.max(e.markUntil > now ? e.mark : 0, packet.mark.amount); e.markUntil = now + packet.mark.duration; }
    }
    if (e.boss) this._bossPhases(e);
    if (e.hp <= 0) this._kill(e, src);
  }

  _kill(e, src) {
    e.alive = false;
    e.hp = 0;
    const reward = this._gainCash(e.def.reward, 'kill');
    this.stats.kills++;
    if (src) src.kills++;
    if (e.boss) this.stats.bossesKilled++;
    this.events.push({ type: 'death', id: e.id, enemy: e.defId, x: e.x, y: e.y, z: e.z, reward, boss: e.boss });
    if (e.def.split) {
      for (let i = 0; i < e.def.split.count; i++) this.spawnEnemy(e.def.split.into, { pathIdx: this.paths.indexOf(e.path), d: Math.max(0, e.d - 0.5 * i), wave: e.wave, parent: e.id });
    }
  }

  _bossPhases(e) {
    const phases = e.def.phases || [];
    while (e.phase < phases.length && e.hp / e.maxHp <= phases[e.phase].at) {
      const ph = phases[e.phase++];
      this.events.push({ type: 'bossPhase', id: e.id, name: ph.name, index: e.phase });
      for (const a of ph.actions) {
        if (a.type === 'telegraph') {
          const tg = { id: this.nextId++, x: e.x, z: e.z, radius: a.radius, effect: a.effect, duration: a.duration, at: this.time + a.delay, from: e.id };
          this.telegraphs.push(tg);
          this.events.push({ type: 'telegraph', ...tg, delay: a.delay });
        } else if (a.type === 'summon') {
          for (let i = 0; i < a.count; i++) this.spawnEnemy(a.into, { pathIdx: this.paths.indexOf(e.path), d: Math.max(0, e.d - 1 - i * 0.7), wave: e.wave, parent: e.id });
        } else if (a.type === 'shield') {
          e.shield += e.maxHp * a.amount;
          e.maxShield = Math.max(e.maxShield, e.shield);
        } else if (a.type === 'speed') {
          e.speedMul *= 1 + (a.mul - 1) * this.tune.bossPhaseSpeed;
        }
      }
    }
  }

  _updateTelegraphs() {
    if (!this.telegraphs.length) return;
    const keep = [];
    for (const tg of this.telegraphs) {
      if (tg.at > this.time) { keep.push(tg); continue; }
      if (tg.effect === 'stunTowers') {
        for (const t of this.towers) {
          if (r2(t.x, t.z, tg.x, tg.z) <= tg.radius * tg.radius) t.stunUntil = Math.max(t.stunUntil, this.time + tg.duration);
        }
      }
      this.events.push({ type: 'telegraphHit', id: tg.id, x: tg.x, z: tg.z, radius: tg.radius, effect: tg.effect });
    }
    this.telegraphs = keep;
  }

  _updateHero(dt) {
    const h = this.hero;
    if (!h) return;
    if (h.downUntil > this.time) return;
    if (h.hp <= 0) { h.hp = h.maxHp; this.events.push({ type: 'heroUp' }); }
    const at = h.def.attack;
    h.cooldown -= dt;
    if (h.cooldown > 0) return;
    const target = pickTarget(this.enemies, { x: h.x, z: h.z, range: at.range, targets: { ground: true, air: true }, detection: true, mode: 'closest' });
    if (!target) { h.cooldown = 0; return; }
    h.cooldown = 1 / at.rate;
    this.events.push({ type: 'heroAttack', target: target.id, x: h.x, z: h.z, tx: target.x, tz: target.z });
    const before = this.stats.kills;
    this._hit(target, { amount: at.damage * this.tune.heroDamage, type: at.damageType, splash: at.splash || 0, targets: { ground: true, air: true }, detection: true }, null, target.x, target.z);
    h.kills += this.stats.kills - before;
  }

  // ---------------------------------------------------------------- abilities --------------
  _castAbility(id, x, z) {
    const a = this.abilities.find((ab) => ab.id === id);
    const def = a.def;
    a.ready = this.time + def.cooldown;
    this.stats.abilities++;
    if (def.target === 'self' && this.hero) { x = this.hero.x; z = this.hero.z; }
    this.pendingAbilities.push({ id, def, x, z, at: this.time + (def.delay || 0) });
    this.events.push({ type: 'abilityCast', id, x, z, delay: def.delay || 0, radius: def.radius });
  }

  _updateAbilities() {
    for (const a of this.abilities) {
      if (a.mode !== 'auto' || a.ready > this.time || this.phase !== 'wave') continue;
      if (this.hero && this.hero.downUntil > this.time) continue;
      const spot = this._bestAbilitySpot(a.def);
      if (spot) {
        this.log.push({ tick: this.tick, type: 'autoAbility', id: a.id, x: spot.x, z: spot.z });
        this._castAbility(a.id, spot.x, spot.z);
      }
    }
    if (!this.pendingAbilities.length) return;
    const keep = [];
    for (const p of this.pendingAbilities) {
      if (p.at > this.time) { keep.push(p); continue; }
      const fx = p.def.effects;
      if (fx.damage || fx.freeze || fx.stun) {
        this._splash({ amount: fx.damage || 0, type: fx.damageType || 'physical', splash: p.def.radius, stun: fx.stun, freeze: fx.freeze, targets: { ground: true, air: true }, detection: true }, null, p.x, p.z);
      }
      if (fx.towerBuff) {
        for (const t of this.towers) {
          if (r2(t.x, t.z, p.x, p.z) <= p.def.radius * p.def.radius) {
            t.buffs = t.buffs.filter((b) => b.until > this.time);
            t.buffs.push({ rate: fx.towerBuff.rate, until: this.time + fx.towerBuff.duration });
          }
        }
      }
      this.events.push({ type: 'abilityHit', id: p.id, x: p.x, z: p.z, radius: p.def.radius });
    }
    this.pendingAbilities = keep;
  }

  /** Automatic abilities aim at the densest group (or the boss); null if not worth it. */
  _bestAbilitySpot(def) {
    if (def.target === 'self') {
      if (!this.hero || !this.enemies.length) return null;
      const near = this.towers.filter((t) => r2(t.x, t.z, this.hero.x, this.hero.z) <= def.radius * def.radius).length;
      return near >= 2 ? { x: this.hero.x, z: this.hero.z } : null;
    }
    let best = null;
    let bestN = 0;
    const rr = def.radius * def.radius;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      let n = e.boss ? 5 : 0;
      for (const o of this.enemies) if (o.alive && r2(o.x, o.z, e.x, e.z) <= rr) n++;
      if (n > bestN) { bestN = n; best = e; }
    }
    return bestN >= 4 ? { x: best.x, z: best.z } : null;
  }

  // ---------------------------------------------------------------- output -----------------
  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  /** Deterministic fingerprint of the match state (determinism tests, replay validation). */
  hash() {
    let h = 2166136261;
    const mix = (n) => {
      const v = Math.round(n * 1000) | 0;
      h ^= v;
      h = Math.imul(h, 16777619);
    };
    mix(this.tick); mix(this.cash); mix(this.baseHp); mix(this.wave); mix(this.stats.kills);
    for (const e of this.enemies) { mix(e.id); mix(e.hp); mix(e.d); }
    for (const t of this.towers) { mix(t.uid); mix(t.x); mix(t.z); mix(t.up.linear); mix(t.up.branchLevel); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  /** Result summary for rewards and (later) server validation. */
  result() {
    return {
      map: this.map.id,
      difficulty: this.difficulty.id,
      waveSet: this.waveSet.id,
      seed: this.seed,
      contentVersion: this.content.version,
      preset: this.tune.id,
      assists: this.tune.assists.slice(),
      assisted: this.tune.assisted,
      won: this.phase === 'won',
      lost: this.phase === 'lost',
      wave: this.wave,
      waves: this.waveCount(),
      ticks: this.tick,
      baseHp: this.baseHp,
      stats: { ...this.stats },
      log: this.log.slice(),
      seen: [...this.seen].sort(),
      loadout: this.loadout.slice(),
      mode: this.options.mode || 'campaign',
      rewardMul: this.tune.rewardMul,
      hash: this.hash(),
    };
  }

  dispose() {
    for (const t of this.towers) this.mw.world.remove(t.collider.id);
    this.towers = [];
  }
}
