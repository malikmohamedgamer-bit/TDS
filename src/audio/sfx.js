// Synthesized sound effects (WebAudio, no audio files). Rate-limited, distance attenuated,
// with mute / volume settings and optional captions for important cues.

const CAPTIONS = {
  waveStart: 'Horn: wave incoming', boss: 'Boss roars', leak: 'Alarm: the keep is hit', telegraph: 'Warning: ground slam',
  win: 'Victory fanfare', lose: 'Defeat', evolve: 'Tower evolved',
};

export class Sfx {
  constructor(settings, onCaption) {
    this.settings = settings;
    this.onCaption = onCaption;
    this.ctx = null;
    this.last = new Map();
    this.listener = { x: 0, z: 0 };
    this._noise = null;
  }

  /** Must be called from a user gesture (browsers block audio before one). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.comp = this.ctx.createDynamicsCompressor();
    this.master.connect(this.comp).connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.applyVolume();
    const len = this.ctx.sampleRate;
    this._noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  applyVolume() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.muted ? 0 : s.masterVolume;
    this.sfx.gain.value = s.sfxVolume;
  }

  setListener(x, z) {
    this.listener.x = x;
    this.listener.z = z;
  }

  _env(gain, t, a, peak, d, end = 0.0001) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    gain.gain.exponentialRampToValueAtTime(end, t + a + d);
  }

  _osc(type, f0, f1, t, dur, vol, out) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this._env(g, t, 0.005, vol, dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noiseBurst(t, dur, vol, out, { type = 'lowpass', f0 = 2000, f1 = 300, q = 0.7 } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    this._env(g, t, 0.004, vol, dur);
    src.connect(filt).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** Play a named sound. pos {x, z} attenuates by distance from the listener (camera / hero). */
  play(name, pos = null, { gap = 0.04 } = {}) {
    if (CAPTIONS[name] && this.settings.captions && this.onCaption) this.onCaption(CAPTIONS[name]);
    if (!this.ctx || this.settings.muted) return;
    const now = this.ctx.currentTime;
    if ((this.last.get(name) || 0) + gap > now) return;
    this.last.set(name, now);
    let vol = 1;
    if (pos) {
      const d = Math.hypot(pos.x - this.listener.x, pos.z - this.listener.z);
      vol = Math.max(0.12, Math.min(1, 14 / (d + 6)));
    }
    const out = this.ctx.createGain();
    out.gain.value = vol;
    out.connect(this.sfx);
    const t = now + 0.005;
    switch (name) {
      case 'bullet': this._noiseBurst(t, 0.06, 0.35, out, { type: 'highpass', f0: 3000, f1: 1500 }); this._osc('square', 220, 90, t, 0.05, 0.08, out); break;
      case 'tracer': this._noiseBurst(t, 0.18, 0.5, out, { type: 'bandpass', f0: 2600, f1: 500, q: 1.2 }); this._osc('sawtooth', 160, 40, t, 0.2, 0.15, out); break;
      case 'grenade': this._osc('sine', 300, 120, t, 0.12, 0.2, out); break;
      case 'rocket': this._noiseBurst(t, 0.35, 0.35, out, { type: 'bandpass', f0: 600, f1: 2400, q: 0.8 }); break;
      case 'fireball': this._noiseBurst(t, 0.3, 0.3, out, { type: 'lowpass', f0: 900, f1: 2500 }); this._osc('sine', 180, 260, t, 0.25, 0.08, out); break;
      case 'frostbolt': this._osc('sine', 1400, 2200, t, 0.18, 0.1, out); this._osc('triangle', 2100, 2800, t + 0.04, 0.16, 0.06, out); break;
      case 'sunbolt': this._osc('triangle', 880, 1320, t, 0.2, 0.12, out); break;
      case 'lightning': this._noiseBurst(t, 0.25, 0.4, out, { type: 'highpass', f0: 5000, f1: 800 }); this._osc('square', 90, 40, t, 0.2, 0.12, out); break;
      case 'explosion': this._noiseBurst(t, 0.6, 0.6, out, { type: 'lowpass', f0: 1800, f1: 120 }); this._osc('sine', 110, 35, t, 0.45, 0.5, out); break;
      case 'mine': this._noiseBurst(t, 0.5, 0.6, out, { type: 'lowpass', f0: 1200, f1: 80 }); this._osc('sine', 90, 30, t, 0.4, 0.5, out); break;
      case 'hit': this._osc('square', 600, 300, t, 0.03, 0.04, out); break;
      case 'death': this._osc('square', 420, 90, t, 0.18, 0.08, out); this._noiseBurst(t, 0.15, 0.12, out, { f0: 1500, f1: 400 }); break;
      case 'bossDeath': this._noiseBurst(t, 1.6, 0.7, out, { f0: 1200, f1: 60 }); this._osc('sawtooth', 110, 30, t, 1.4, 0.4, out); break;
      case 'place': this._osc('sine', 140, 70, t, 0.15, 0.4, out); this._osc('triangle', 660, 660, t + 0.06, 0.12, 0.12, out); break;
      case 'upgrade': [523, 659, 784].forEach((f, i) => this._osc('triangle', f, f, t + i * 0.06, 0.14, 0.14, out)); break;
      case 'evolve': [523, 659, 784, 1047, 1319].forEach((f, i) => this._osc('triangle', f, f, t + i * 0.07, 0.25, 0.16, out)); this._noiseBurst(t, 0.8, 0.12, out, { type: 'highpass', f0: 4000, f1: 9000 }); break;
      case 'sell': [988, 1319].forEach((f, i) => this._osc('square', f, f, t + i * 0.07, 0.1, 0.08, out)); break;
      case 'cash': this._osc('square', 1319, 1319, t, 0.06, 0.04, out); break;
      case 'error': this._osc('sawtooth', 140, 110, t, 0.2, 0.12, out); break;
      case 'ui': this._osc('triangle', 880, 990, t, 0.05, 0.06, out); break;
      case 'waveStart': [220, 277, 330].forEach((f) => this._osc('sawtooth', f, f * 1.01, t, 0.9, 0.08, out)); break;
      case 'boss': this._noiseBurst(t, 1.4, 0.5, out, { f0: 400, f1: 90, q: 2 }); this._osc('sawtooth', 70, 45, t, 1.3, 0.35, out); this._osc('sawtooth', 72, 46, t, 1.3, 0.3, out); break;
      case 'telegraph': this._osc('square', 880, 880, t, 0.12, 0.1, out); this._osc('square', 660, 660, t + 0.18, 0.12, 0.1, out); this._osc('square', 880, 880, t + 0.36, 0.12, 0.1, out); break;
      case 'stomp': this._osc('sine', 80, 30, t, 0.6, 0.7, out); this._noiseBurst(t, 0.5, 0.5, out, { f0: 600, f1: 60 }); break;
      case 'leak': this._osc('square', 740, 740, t, 0.15, 0.12, out); this._osc('square', 554, 554, t + 0.17, 0.2, 0.12, out); break;
      case 'ability': this._noiseBurst(t, 0.5, 0.3, out, { type: 'bandpass', f0: 400, f1: 3000, q: 1 }); this._osc('triangle', 660, 1320, t, 0.4, 0.1, out); break;
      case 'jet': this._noiseBurst(t, 1.3, 0.45, out, { type: 'bandpass', f0: 300, f1: 1800, q: 0.6 }); break;
      case 'slash': this._noiseBurst(t, 0.12, 0.25, out, { type: 'highpass', f0: 2500, f1: 6000 }); break;
      case 'heal': [880, 1175].forEach((f, i) => this._osc('sine', f, f, t + i * 0.08, 0.2, 0.06, out)); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this._osc('triangle', f, f, t + i * 0.15, 0.5, 0.18, out)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this._osc('sawtooth', f, f, t + i * 0.22, 0.4, 0.1, out)); break;
      default: break;
    }
  }
}

/** Sound for a tower's projectile kind. */
export const FIRE_SOUND = { bullet: 'bullet', tracer: 'tracer', grenade: 'grenade', rocket: 'rocket', fireball: 'fireball', frostbolt: 'frostbolt', sunbolt: 'sunbolt', lightning: 'lightning' };
