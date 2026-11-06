import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOSS_BODIES, BOSS_PARTS, MECHANIC_PART, MECHANIC_BODY, buildBossRig } from '../../src/engine/bossKit.js';

/** Records every primitive a build adds and checks its numbers are finite. */
function mockBuilder() {
  const calls = [];
  const rec = (kind) => (...args) => {
    const opts = args[args.length - 1] || {};
    for (const k of ['pos', 'rot']) for (const v of opts[k] || []) assert.ok(Number.isFinite(v), `${kind} ${k} not finite`);
    for (const v of args) if (typeof v === 'number') assert.ok(Number.isFinite(v) && v >= 0, `${kind} size ${v}`);
    calls.push({ kind, glow: !!opts.glow, pos: opts.pos || [0, 0, 0] });
  };
  return { calls, b: Object.fromEntries(['box', 'cyl', 'cone', 'ico', 'dodeca', 'octa', 'torus', 'sphere', 'extrude'].map((k) => [k, rec(k)])) };
}
const geometry = (rig) => rig.parts.map((pd) => { const m = mockBuilder(); pd.build(m.b); return { name: pd.name, calls: m.calls }; });

test('boss kit: every body builds with every part, finite geometry and poses', () => {
  for (const body of Object.keys(BOSS_BODIES)) {
    const bare = geometry(buildBossRig({ body, parts: [] }));
    const bareCount = bare.reduce((n, p) => n + p.calls.length, 0);
    for (const part of Object.keys(BOSS_PARTS)) {
      const rig = buildBossRig({ body, parts: [part], accent: 'toxic' });
      const g = geometry(rig);
      assert.ok(g.reduce((n, p) => n + p.calls.length, 0) > bareCount, `${body}+${part} adds geometry`);
      assert.equal(new Set(rig.parts.map((p) => p.name)).size, rig.parts.length, 'part names unique');
      for (const [name, clip] of Object.entries(rig.clips)) {
        for (const u of [0, 0.37, 1]) {
          const o = {};
          clip.pose(u, o);
          for (const tr of Object.values(o)) for (const k of ['r', 'p']) for (const v of tr[k] || []) assert.ok(Number.isFinite(v), `${body}+${part} ${name} pose`);
        }
      }
      // every part keeps the model on the ground and inside a sane boss footprint
      for (const p of g) for (const c of p.calls) { assert.ok(c.pos[1] > -0.5 && c.pos[1] < 4.5, `${body}+${part} height ${c.pos[1]}`); assert.ok(Math.hypot(c.pos[0], c.pos[2]) < 3, `${body}+${part} footprint`); }
    }
    for (const want of ['idle', 'move', 'attack', 'death']) assert.ok(BOSS_BODIES[body].clips[want], `${body} has ${want}`);
  }
});

test('boss kit: looped extra parts animate seamlessly and every mechanic maps to a part and body', () => {
  const rig = buildBossRig({ body: 'colossus', parts: ['shieldRing', 'crystals', 'wings'] });
  for (const name of ['idle', 'move']) {
    const a = {}; const b = {};
    rig.clips[name].pose(0, a); rig.clips[name].pose(1, b);
    for (const k of ['ring', 'aura', 'wings']) for (let i = 0; i < 3; i++) assert.ok(Math.abs(Math.sin(a[k].r[i]) - Math.sin(b[k].r[i])) < 1e-9, `${name} ${k} loops`);
  }
  for (const [mech, part] of Object.entries(MECHANIC_PART)) { assert.ok(BOSS_PARTS[part], mech); assert.ok(BOSS_BODIES[MECHANIC_BODY[mech]], mech); }
  assert.throws(() => buildBossRig({ body: 'nope', parts: [] }));
  assert.throws(() => buildBossRig({ body: 'brute', parts: ['nope'] }));
});
