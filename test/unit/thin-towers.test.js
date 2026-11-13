// The thin-class batch (data/towers/thin_b1.json) works in a real match: each tower is placed beside
// the road, waves run, and it deals damage (air units fly, traps arm, troopers deploy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { Match } from '../../src/sim/match.js';

const C = await content();
const IDS = ['strike_jet', 'storm_drake', 'claymore_nest', 'frost_glyph', 'fireteam_post'];

for (const id of IDS) {
  test(`thin batch: ${id} places, acts and deals damage`, () => {
    const map = C.maps.get('riftline');
    const m = new Match({ content: C, mapWorld: buildMapWorld(map, C.props), seed: `thin-${id}`, difficulty: 'easy', loadout: [id], options: { infiniteCash: true } });
    const path = m.paths[0];
    let placed = 0;
    for (let d = 20; d < path.length && placed < 2; d += 15) {
      const pt = path.pointAt(d, {});
      for (const off of [5, -5, 7, -7]) {
        const x = pt.x + off * pt.dz;
        const z = pt.z - off * pt.dx;
        if (m.validate({ type: 'place', tower: id, x, z }).ok) { m.command({ type: 'place', tower: id, x, z }); placed++; break; }
      }
    }
    m.step();
    assert.equal(m.towers.length, placed, 'placed');
    assert.ok(placed >= 1);
    m.command({ type: 'skip' });
    for (let i = 0; i < 60 * 90 && m.phase !== 'lost' && m.phase !== 'won'; i++) m.step();
    const own = m.towers.filter((t) => t.defId === id);
    const dealt = own.reduce((a, t) => a + (t.damage || 0), 0) + (m.allies || []).reduce((a, x) => a + (x.damage || 0), 0);
    if (C.towers.get(id).air) assert.ok(own.every((t) => t.unit && t.unit.y > t.y + 5), 'flies');
    assert.ok(own.some((t) => t.kills > 0) || dealt > 0, `${id} dealt no damage (${dealt})`);
  });
}
