// Sound choice is data-driven: every enemy class and damage type maps to a sound the synth knows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { content } from '../helpers.js';
import { deathSound, hitSound, FIRE_SOUND } from '../../src/audio/sfx.js';

const C = await content();
const synth = readFileSync(new URL('../../src/audio/sfx.js', import.meta.url), 'utf8');
const known = (name) => synth.includes(`case '${name}':`);

test('sfx: every death, impact and firing sound exists in the synth', () => {
  const deaths = new Set();
  for (const e of C.enemies.values()) deaths.add(deathSound(e));
  for (const b of C.bosses?.values?.() || []) deaths.add(deathSound({ ...b, boss: true }));
  assert.ok(deaths.size >= 5, `death variety: ${[...deaths]}`);
  for (const d of deaths) assert.ok(known(d), `death sound ${d}`);
  for (const t of C.damageTypes?.values?.() || [{ id: 'physical' }]) assert.ok(known(hitSound({ damageType: t.id })), `hit sound for ${t.id}`);
  assert.ok(known(hitSound({ shield: true })));
  for (const t of C.towers.values()) {
    const k = t.stats?.projectile?.kind;
    if (k) assert.ok(FIRE_SOUND[k] && known(FIRE_SOUND[k]), `firing sound for ${t.id} (${k})`);
  }
});

test('sfx: deathSound picks by class', () => {
  assert.equal(deathSound({ flying: true }), 'death_air');
  assert.equal(deathSound({ stealth: true }), 'death_spirit');
  assert.equal(deathSound({ split: { into: 'x' } }), 'death_goo');
  assert.equal(deathSound({ armor: 5 }), 'death_metal');
  assert.equal(deathSound({ boss: true, flying: true }), 'bossDeath');
  assert.equal(deathSound(undefined), 'death');
  assert.equal(deathSound({}), 'death');
});
