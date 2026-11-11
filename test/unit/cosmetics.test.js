// Cosmetics: data is valid, ownership comes from play, only unlocked looks can be equipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { newSave, sanitize } from '../../src/save/save.js';
import { cosmeticStatus, equipCosmetic, equippedCosmetic } from '../../src/meta/cosmetics.js';

const C = await content();

test('cosmetics data: kinds have a free default first, unique ids, valid colours and conditions', () => {
  const items = C.cosmetics.items;
  assert.ok(items.length >= 12);
  assert.equal(new Set(items.map((x) => x.id)).size, items.length);
  for (const kind of Object.keys(C.cosmetics.kinds)) {
    const list = items.filter((x) => x.kind === kind);
    assert.ok(list.length >= 5, kind);
    assert.equal(list[0].unlock, undefined, `${kind}: the first item is the free default`);
    for (const it of list.slice(1)) assert.ok(it.unlock && it.how, `${it.id} is earned and says how`);
  }
  const hex = /^#[0-9a-f]{6}$/i;
  for (const it of items) {
    for (const [k, v] of Object.entries(it.vars || {})) assert.ok(k.startsWith('--') && /^(#[0-9a-f]{6}|rgba\([\d., ]+\))$/i.test(v), `${it.id} ${k}`);
    for (const v of Object.values(it.colors || {})) assert.match(v, hex, it.id);
    assert.ok(C.cosmetics.kinds[it.kind], it.id);
  }
});

test('a new save owns only the defaults; play unlocks; a locked or unknown choice falls back', () => {
  const save = newSave(1);
  const st = cosmeticStatus(save, C);
  assert.deepEqual(st.filter((x) => x.unlocked).map((x) => x.id), ['ui_brass', 'outfit_default']);
  assert.equal(equipCosmetic(save, C, 'ui_emerald').ok, false);
  assert.equal(equipCosmetic(save, C, 'nope').ok, false);
  save.cosmetics = { uiTheme: 'ui_emerald', heroOutfit: 'junk' }; // hand-edited save
  assert.equal(equippedCosmetic(save, C, 'uiTheme').id, 'ui_brass');
  assert.equal(equippedCosmetic(save, C, 'heroOutfit').id, 'outfit_default');
  save.stats.wins = 10;
  assert.deepEqual(cosmeticStatus(save, C).find((x) => x.id === 'ui_emerald').unlocked, true);
  assert.equal(equipCosmetic(save, C, 'ui_emerald').ok, true);
  const back = sanitize(JSON.parse(JSON.stringify(save)), C);
  assert.equal(equippedCosmetic(back, C, 'uiTheme').id, 'ui_emerald');
  const partial = cosmeticStatus(save, C).find((x) => x.id === 'outfit_nightops');
  assert.deepEqual([partial.progress, partial.target, partial.unlocked], [10, 25, false]);
});
