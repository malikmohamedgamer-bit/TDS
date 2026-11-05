// Pure music pattern generator (no WebAudio): data/music.json + mood + bar index -> note events.
// Deterministic for a seed, so it is unit-testable in Node and every player hears the same piece.
import { Rng } from '../core/rng.js';

/** MIDI note -> frequency in Hz. */
export const midiHz = (n) => 440 * 2 ** ((n - 69) / 12);

/** Note of scale degree `deg` (can exceed the scale length or be negative) above `root`. */
export function degreeNote(root, scale, deg) {
  const n = scale.length;
  const oct = Math.floor(deg / n);
  return root + scale[((deg % n) + n) % n] + 12 * oct;
}

/**
 * Events for one bar (4 beats). Each event: {beat, dur (beats), voice, midi?, vel}.
 * voices: pad (chord tones, whole bar), arp (8ths), bass (root on beats 1 and 3, with pickups),
 * kick / snare / hat (16 steps from the drum string).
 */
export function barEvents(music, { mood = 'hub', key = 'default', bar = 0, seed = 'tds' } = {}) {
  const md = music.moods[mood] || music.moods.hub;
  const kd = music.keys[key] || music.keys.default;
  const scale = music.scales[md.scale || kd.scale] || music.scales.dorian;
  const prog = md.progression;
  const chordDeg = prog[bar % prog.length];
  const rng = new Rng(`${seed}:${mood}:${key}:${bar}`);
  const L = md.layers;
  const ev = [];
  const chord = [0, 2, 4, 6].map((i) => degreeNote(kd.root, scale, chordDeg + i));
  if (L.pad > 0) for (const n of chord.slice(0, 3)) ev.push({ beat: 0, dur: 4, voice: 'pad', midi: n + 12, vel: L.pad });
  if (L.arp > 0) {
    // every 4th bar the arpeggio climbs an octave for the second half (a little phrase shape)
    const lift = bar % 4 === 3 ? 12 : 0;
    md.arp.forEach((idx, i) => {
      if (idx < 0) return;
      if (rng.next() < 0.08) return; // the odd dropped note keeps loops from sounding mechanical
      const up = i >= 4 ? lift : 0;
      ev.push({ beat: i * 0.5, dur: 0.45, voice: 'arp', midi: chord[idx % chord.length] + 12 + up, vel: L.arp * (i % 2 ? 0.8 : 1) });
    });
  }
  if (L.bass > 0) {
    const root = chord[0] - 12;
    ev.push({ beat: 0, dur: 1.8, voice: 'bass', midi: root, vel: L.bass });
    ev.push({ beat: 2, dur: 1.4, voice: 'bass', midi: rng.next() < 0.3 ? chord[2] - 12 : root, vel: L.bass * 0.9 });
    if (md.bpm >= 100) ev.push({ beat: 3.5, dur: 0.4, voice: 'bass', midi: root + 12, vel: L.bass * 0.7 });
  }
  if (L.drums > 0) {
    const fill = bar % 8 === 7;
    [...md.drums].forEach((c, i) => {
      const voice = c === 'k' ? 'kick' : c === 's' ? 'snare' : c === 'h' ? 'hat' : null;
      if (voice) ev.push({ beat: i * 0.25, dur: 0.25, voice, vel: L.drums * (voice === 'hat' ? 0.5 : 1) });
      else if (fill && i >= 12) ev.push({ beat: i * 0.25, dur: 0.25, voice: 'snare', vel: L.drums * 0.6 });
    });
  }
  return ev.sort((a, b) => a.beat - b.beat);
}

/** Seconds per beat for a mood. */
export const beatSeconds = (music, mood) => 60 / (music.moods[mood] || music.moods.hub).bpm;
