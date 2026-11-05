// Exploration HUD: top bar, camera mode chip, controls card, crosshair, toasts, settings dialog.
import { ICONS } from './icons.js';
import { CAMERA_LABELS, CAMERA_MODES } from '../engine/cameraRig.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class Hud {
  constructor(root, { settings, onSettings, onCamera, mapName }) {
    this.root = root;
    this.settings = settings;
    this.onSettings = onSettings;
    this.onCamera = onCamera;
    root.insertAdjacentHTML('beforeend', `
      <header class="hud-top" role="banner">
        <div class="brand"><span class="brand-mark" aria-hidden="true">◆</span><span class="brand-name">TDS</span><span class="brand-map" data-testid="map-name">${esc(mapName)}</span></div>
        <div class="hud-actions">
          <span class="fps" data-testid="fps" hidden></span>
          <button class="chip cam-chip" data-testid="camera-mode" aria-label="Camera mode (click to cycle)"><span class="ico"></span><span class="lbl"></span></button>
          <button class="icon-btn" data-act="help" aria-label="Controls help (H)" aria-expanded="true">${ICONS.help}</button>
          <button class="icon-btn" data-act="settings" aria-label="Settings">${ICONS.gear}</button>
        </div>
      </header>
      <section class="controls-card panel" aria-label="Controls" data-testid="controls-card">
        <h2>Controls</h2>
        <dl>
          <dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dt><dd>Walk</dd>
          <dt><kbd>Space</kbd></dt><dd>Jump</dd>
          <dt><kbd>Shift</kbd></dt><dd>Sprint</dd>
          <dt><kbd>RMB</kbd> drag</dt><dd>Look around</dd>
          <dt><kbd>L</kbd> / <kbd>MMB</kbd></dt><dd>Mouse-lock look</dd>
          <dt><kbd>Wheel</kbd></dt><dd>Zoom / fly speed</dd>
          <dt><kbd>V</kbd></dt><dd>First person</dd>
          <dt><kbd>F</kbd></dt><dd>Free camera (<kbd>Q</kbd>/<kbd>E</kbd> down/up)</dd>
          <dt><kbd>T</kbd></dt><dd>Map overview</dd>
          <dt><kbd>C</kbd></dt><dd>Back to character</dd>
          <dt><kbd>H</kbd></dt><dd>Hide this card</dd>
        </dl>
      </section>
      <div class="crosshair" aria-hidden="true"></div>
      <div class="toasts" role="status" aria-live="polite" data-testid="toasts"></div>
      <dialog class="settings panel" aria-labelledby="settings-title" data-testid="settings">
        <form method="dialog">
          <header><h2 id="settings-title">Settings</h2><button class="icon-btn" value="close" aria-label="Close settings">${ICONS.close}</button></header>
          <fieldset><legend>Graphics</legend>
            <div class="seg" role="radiogroup" aria-label="Quality">
              ${['low', 'medium', 'high'].map((q) => `<label><input type="radio" name="quality" value="${q}"><span>${q[0].toUpperCase() + q.slice(1)}</span></label>`).join('')}
            </div>
            <label class="row">Pixelation
              <select name="pixelation"><option value="1">Off</option><option value="2">2x</option><option value="3">3x</option><option value="4">4x</option></select></label>
            <label class="row"><input type="checkbox" name="bloom"> Glow (bloom)</label>
            <label class="row"><input type="checkbox" name="vignette"> Vignette</label>
            <label class="row"><input type="checkbox" name="showFps"> Show frame time</label>
          </fieldset>
          <fieldset><legend>Accessibility</legend>
            <label class="row"><input type="checkbox" name="reducedMotion"> Reduced motion</label>
            <label class="row"><input type="checkbox" name="highContrast"> High contrast UI</label>
            <label class="row">Text size <input type="range" name="textScale" min="0.85" max="1.5" step="0.05"><output name="textScaleOut"></output></label>
          </fieldset>
          <fieldset><legend>Audio</legend>
            <label class="row"><input type="checkbox" name="muted"> Mute all sound</label>
            <label class="row">Master volume <input type="range" name="masterVolume" min="0" max="1" step="0.05"><output name="masterOut"></output></label>
            <label class="row">Effects volume <input type="range" name="sfxVolume" min="0" max="1" step="0.05"><output name="sfxOut"></output></label>
            <label class="row"><input type="checkbox" name="captions"> Sound captions</label>
          </fieldset>
          <fieldset><legend>Gameplay</legend>
            <label class="row"><input type="checkbox" name="damageNumbers"> Damage numbers</label>
            <label class="row"><input type="checkbox" name="enemiesHurtHero"> Enemies can hurt the Commander (next match)</label>
          </fieldset>
          <fieldset><legend>Difficulty tuning</legend>
            <label class="row">Preset <select name="tuningPreset" data-testid="tuning-preset">
              <option value="default">Default (from tuning.json)</option><option value="standard">Standard (intended challenge)</option>
              <option value="original">Original (easier slice tuning)</option><option value="relaxed">Relaxed (easiest)</option></select></label>
            <p class="note">Applies from the next match.</p>
          </fieldset>
          <fieldset data-testid="assist"><legend>Assist</legend>
            <label class="row"><input type="checkbox" name="assistExtraCash"> Extra starting cash (+$400)</label>
            <label class="row"><input type="checkbox" name="assistSlowEnemies"> Slower enemies (75% speed)</label>
            <label class="row"><input type="checkbox" name="assistHeroBoost"> Stronger Commander (2.5x damage)</label>
            <label class="row"><input type="checkbox" name="assistFullRefund"> Selling refunds 100%</label>
            <label class="row"><input type="checkbox" name="assistSkipWave"> Allow skipping a whole wave</label>
            <p class="note">Assisted runs are marked ✚ Assist: they still give crowns, but do not set records, complete achievements or count for the daily challenge. Applies from the next match.</p>
          </fieldset>
          <fieldset><legend>Controls</legend>
            <label class="row">Look sensitivity <input type="range" name="mouseSensitivity" min="0.3" max="2.5" step="0.1"><output name="sensOut"></output></label>
            <label class="row"><input type="checkbox" name="invertY"> Invert look Y</label>
          </fieldset>
        </form>
      </dialog>`);
    this.camChip = root.querySelector('.cam-chip');
    this.fps = root.querySelector('.fps');
    this.card = root.querySelector('.controls-card');
    this.toasts = root.querySelector('.toasts');
    this.dialog = root.querySelector('dialog.settings');
    this.form = this.dialog.querySelector('form');
    this.helpBtn = root.querySelector('[data-act="help"]');

    this.camChip.addEventListener('click', () => {
      const i = CAMERA_MODES.indexOf(this.mode);
      this.onCamera(CAMERA_MODES[(i + 1) % CAMERA_MODES.length]);
    });
    this.helpBtn.addEventListener('click', () => this.toggleHelp());
    root.querySelector('[data-act="settings"]').addEventListener('click', () => this.openSettings());
    this.form.addEventListener('input', () => this._readForm());
    this.form.addEventListener('change', () => this._readForm());
    this.applyAccessibility();
  }

  toggleHelp(force) {
    const show = force ?? this.card.hidden;
    this.card.hidden = !show;
    this.helpBtn.setAttribute('aria-expanded', String(show));
  }

  openSettings() {
    const s = this.settings;
    const f = this.form.elements;
    for (const r of f.quality) r.checked = r.value === s.quality;
    f.pixelation.value = String(s.pixelation);
    for (const k of ['bloom', 'vignette', 'showFps', 'reducedMotion', 'highContrast', 'invertY', 'muted', 'captions', 'damageNumbers', 'enemiesHurtHero', 'assistExtraCash', 'assistSlowEnemies', 'assistHeroBoost', 'assistFullRefund', 'assistSkipWave']) f[k].checked = !!s[k];
    f.masterVolume.value = s.masterVolume;
    f.tuningPreset.value = s.tuningPreset || 'default';
    f.sfxVolume.value = s.sfxVolume;
    f.textScale.value = s.textScale;
    f.mouseSensitivity.value = s.mouseSensitivity;
    this._outputs();
    if (!this.dialog.open) this.dialog.showModal();
  }

  get settingsOpen() {
    return this.dialog.open;
  }

  _outputs() {
    const f = this.form.elements;
    f.textScaleOut.value = `${Math.round(f.textScale.value * 100)}%`;
    f.sensOut.value = `${Number(f.mouseSensitivity.value).toFixed(1)}x`;
    f.masterOut.value = `${Math.round(f.masterVolume.value * 100)}%`;
    f.sfxOut.value = `${Math.round(f.sfxVolume.value * 100)}%`;
  }

  _readForm() {
    const f = this.form.elements;
    const s = this.settings;
    s.quality = [...f.quality].find((r) => r.checked)?.value || s.quality;
    s.pixelation = Number(f.pixelation.value);
    for (const k of ['bloom', 'vignette', 'showFps', 'reducedMotion', 'highContrast', 'invertY', 'muted', 'captions', 'damageNumbers', 'enemiesHurtHero', 'assistExtraCash', 'assistSlowEnemies', 'assistHeroBoost', 'assistFullRefund', 'assistSkipWave']) s[k] = f[k].checked;
    s.masterVolume = Number(f.masterVolume.value);
    s.tuningPreset = f.tuningPreset.value;
    s.sfxVolume = Number(f.sfxVolume.value);
    s.textScale = Number(f.textScale.value);
    s.mouseSensitivity = Number(f.mouseSensitivity.value);
    this._outputs();
    this.applyAccessibility();
    this.onSettings(s);
  }

  applyAccessibility() {
    const s = this.settings;
    document.documentElement.style.setProperty('--text-scale', s.textScale);
    document.body.classList.toggle('high-contrast', !!s.highContrast);
    document.body.classList.toggle('reduced-motion', !!s.reducedMotion);
    this.fps.hidden = !s.showFps;
  }

  setCameraMode(mode, locked) {
    this.mode = mode;
    this.camChip.querySelector('.ico').innerHTML = ICONS[mode];
    this.camChip.querySelector('.lbl').textContent = CAMERA_LABELS[mode];
    this.camChip.dataset.mode = mode;
    document.body.dataset.camera = mode;
    document.body.classList.toggle('locked', !!locked);
  }

  toast(text, ms = 2600) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 400);
  }

  setFps(fps, frameMs, gpuMs) {
    if (this.fps.hidden) return;
    this.fps.textContent = `${fps.toFixed(0)} fps · ${frameMs.toFixed(1)} ms · draw ${gpuMs.toFixed(1)} ms`;
  }
}
