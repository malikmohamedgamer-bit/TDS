import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { barEvents, degreeNote, midiHz, beatSeconds } from '../../src/audio/musicPatterns.js';

const C = await content();
const M = C.music;

test('music data: every map has a key, every mood is complete and uses a known scale', () => {
  assert.ok(M, 'data/music.json is listed in data/index.json');
  for (const id of C.maps.keys()) assert.ok(M.keys[id], `key for map ${id}`);
  for (const [id, md] of Object.entries(M.moods)) {
    assert.ok(md.bpm >= 50 && md.bpm <= 180, `${id} bpm`);
    assert.ok(md.progression.length >= 2, `${id} progression`);
    assert.equal(md.drums.length, 16, `${id} drums are 16 steps`);
    assert.ok(!md.scale || M.scales[md.scale], `${id} scale`);
    for (const k of ['pad', 'arp', 'bass', 'drums']) assert.ok(md.layers[k] >= 0 && md.layers[k] <= 0.5, `${id} ${k} volume`);
  }
  for (const k of Object.values(M.keys)) assert.ok(M.scales[k.scale]);
});

test('patterns are deterministic, inside the bar, in key, and change with the mood', () => {
  for (const mood of Object.keys(M.moods)) {
    for (let bar = 0; bar < 8; bar++) {
      const a = barEvents(M, { mood, key: 'riftline', bar });
      assert.deepEqual(a, barEvents(M, { mood, key: 'riftline', bar }));
      for (const e of a) {
        assert.ok(e.beat >= 0 && e.beat + e.dur <= 4.0001, `${mood} bar ${bar} event inside the bar`);
        assert.ok(e.vel > 0 && e.vel <= 0.5);
        if (e.midi !== undefined) {
          const scale = M.scales[M.moods[mood].scale || M.keys.riftline.scale];
          const pc = (((e.midi - M.keys.riftline.root) % 12) + 12) % 12;
          assert.ok(scale.includes(pc), `${mood} note ${e.midi} is in the scale`);
          assert.ok(e.midi >= 24 && e.midi <= 100);
        }
      }
    }
  }
  const voices = (mood) => new Set([0, 1, 2, 3].flatMap((bar) => barEvents(M, { mood, bar }).map((e) => e.voice)));
  assert.ok(!voices('hub').has('kick'), 'the hub is calm: no kick drum');
  assert.ok(voices('boss').has('kick') && voices('boss').has('snare'));
  assert.ok(beatSeconds(M, 'boss') < beatSeconds(M, 'hub'), 'boss music is faster');
});

test('note helpers', () => {
  assert.equal(Math.round(midiHz(69)), 440);
  assert.equal(degreeNote(50, [0, 2, 3, 5, 7, 9, 10], 7), 62, 'degree 7 is the octave');
  assert.equal(degreeNote(50, [0, 2, 3, 5, 7, 9, 10], -1), 48, 'negative degrees go below the root');
});

test('styles and extra moods: every theme style changes the piece, all moods produce notes', async () => {
  const { readFile } = await import('node:fs/promises');
  const M = JSON.parse(await readFile(new URL('../../data/music.json', import.meta.url), 'utf8'));
  const { barEvents: ev, moodDef, beatSeconds: bs } = await import('../../src/audio/musicPatterns.js');
  for (const mood of ['boss_final', 'victory', 'defeat']) assert.ok(ev(M, { mood, bar: 0 }).length > 3, mood);
  assert.ok(bs(M, 'boss_final') < bs(M, 'boss'), 'the final boss piece is faster');
  const sig = (style) => JSON.stringify(['build', 'wave', 'boss'].map((mood) => [bs(M, mood, style), ev(M, { mood, bar: 1, style }).map((e) => [e.beat, e.voice, e.midi])]));
  const styles = Object.keys(M.styles);
  assert.ok(styles.length >= 6);
  assert.equal(new Set(styles.map(sig)).size, styles.length, 'no two themes sound the same');
  for (const st of styles) for (const mood of Object.keys(M.styles[st])) {
    const md = moodDef(M, mood, st);
    assert.ok(M.moods[mood], `${st}.${mood} overrides a real mood`);
    assert.ok(md.bpm > 40 && md.drums.length === 16 && md.arp.length === 8 && M.scales[md.scale || 'dorian']);
    assert.deepEqual(Object.keys(md.layers).sort(), ['arp', 'bass', 'drums', 'pad']);
  }
  assert.deepEqual(moodDef(M, 'wave', 'no-such-style'), M.moods.wave);
});
