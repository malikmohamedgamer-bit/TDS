// bossDamage (boss-killer towers, BUGS.md #35): multiplies damage against bosses only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDamage } from '../../src/sim/combat.js';
import { value } from '../../src/sim/bot.js';

const types = new Map([['physical', { vsShield: 1, armorApplies: true }]]);
const enemy = (boss) => ({ def: { resist: {} }, boss, armor: 0, shield: 0, markUntil: 0, flying: false });

test('bossDamage multiplies damage against bosses, not other enemies; the bot values it at a third', () => {
  const packet = { amount: 10, type: 'physical', bossDamage: 3 };
  assert.equal(resolveDamage(enemy(true), packet, types).toHp, 30);
  assert.equal(resolveDamage(enemy(false), packet, types).toHp, 10);
  const base = { damage: 10, rate: 1, range: 20 };
  assert.ok(Math.abs(value({ ...base, bossDamage: 3 }, 1, 10) / value(base, 1, 10) - (1 + 2 / 3)) < 1e-9);
});
