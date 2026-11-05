// Procedural music player: schedules bars from musicPatterns.js on the shared WebAudio context
// (through the master bus, so Mute and Master volume apply). Mood changes land on the next bar,
// with a short volume dip so the switch never clicks. Nothing plays until audio is unlocked.
import { barEvents, beatSeconds, midiHz } from './musicPatterns.js';

const LOOKAHEAD = 0.35; // seconds of music scheduled ahead of the audio clock

export class Music {
  constructor(sfx, settings, data) {
    this.sfx = sfx;
    this.settings = settings;
    this.data = data;
    this.mood = null;
    this.key = 'default';
    this.bar = 0;
    this.nextBar = 0;
    this.timer = null;
    this.bus = null;
  }

  get ctx() { return this.sfx.ctx; }

  _ensureBus() {
    if (this.bus || !this.ctx) return !!this.bus;
    this.bus = this.ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(this.sfx.master);
    return true;
  }

  applyVolume() {
    if (!this.bus) return;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(this.mood ? this.settings.musicVolume : 0, t, 0.3);
  }

  /** mood: hub | build | wave | boss | null (silence). key: map id. */
  setMood(mood, key = this.key) {
    if (!this.data) return;
    const changed = mood !== this.mood || key !== this.key;
    this.mood = mood;
    this.key = this.data.keys[key] ? key : 'default';
    if (!this._ensureBus()) return; // audio not unlocked yet; the mood is remembered
    if (!this.timer) this.timer = setInterval(() => this._tick(), 60);
    if (changed && this.nextBar > this.ctx.currentTime) {
      // dip, then recover on the next bar
      const g = this.bus.gain;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.setTargetAtTime(this.settings.musicVolume * 0.35, this.ctx.currentTime, 0.15);
      g.setTargetAtTime(mood ? this.settings.musicVolume : 0, this.nextBar, 0.4);
    } else this.applyVolume();
  }

  /** Call after the audio context is unlocked (a user gesture) to start the remembered mood. */
  resume() {
    if (this.mood && this._ensureBus()) this.setMood(this.mood, this.key);
  }

  _tick() {
    const ctx = this.ctx;
    if (!ctx || !this.mood) return;
    if (this.nextBar < ctx.currentTime) this.nextBar = ctx.currentTime + 0.05;
    while (this.nextBar < ctx.currentTime + LOOKAHEAD) {
      const spb = beatSeconds(this.data, this.mood);
      if (this.settings.musicVolume > 0 && !this.settings.muted) {
        for (const e of barEvents(this.data, { mood: this.mood, key: this.key, bar: this.bar })) this._voice(e, this.nextBar + e.beat * spb, e.dur * spb);
      }
      this.nextBar += 4 * spb;
      this.bar++;
    }
  }

  _voice(e, t, dur) {
    const ctx = this.ctx;
    const out = this.bus;
    const s = this.sfx;
    switch (e.voice) {
      case 'pad': {
        // two detuned soft saws through a low-pass, slow attack and release
        const f = midiHz(e.midi);
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(e.vel * 0.22, t + Math.min(0.8, dur * 0.3));
        g.gain.setValueAtTime(e.vel * 0.22, t + dur * 0.7);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        filt.connect(g).connect(out);
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = det;
          o.connect(filt);
          o.start(t);
          o.stop(t + dur + 0.05);
        }
        break;
      }
      case 'arp': s._osc('triangle', midiHz(e.midi), midiHz(e.midi), t, dur, e.vel * 0.5, out); break;
      case 'bass': s._osc('sine', midiHz(e.midi), midiHz(e.midi), t, dur, e.vel * 0.9, out); s._osc('triangle', midiHz(e.midi), midiHz(e.midi), t, dur * 0.6, e.vel * 0.25, out); break;
      case 'kick': s._osc('sine', 120, 42, t, 0.22, e.vel * 1.2, out); break;
      case 'snare': s._noiseBurst(t, 0.16, e.vel * 0.7, out, { type: 'bandpass', f0: 2200, f1: 1200, q: 0.8 }); break;
      case 'hat': s._noiseBurst(t, 0.05, e.vel * 0.5, out, { type: 'highpass', f0: 7000, f1: 6000, q: 0.5 }); break;
      default: break;
    }
  }

  stop() {
    this.setMood(null);
  }
}
