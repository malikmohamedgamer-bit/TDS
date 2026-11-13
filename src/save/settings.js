// Player settings (device-local, separate from game progress so a cloud save never overrides
// someone's graphics or accessibility choices).

import { defaultQuality, QUALITY_ORDER } from '../ui/autoQuality.js';

const KEY = 'tds.settings.v1';

export function defaultSettings(env = {}) {
  return {
    quality: defaultQuality(env),
    qualityAuto: true,
    playerName: 'Commander', // co-op display name (src/ui/coopUi.js cleanName) // false once the player picks a quality: the game then never changes it
    pixelation: 1, // 1 = off, 2..4 = pixel size
    bloom: true,
    vignette: true,
    reducedMotion: !!env.prefersReducedMotion,
    highContrast: false,
    colorblind: 'none', // none | deuteranopia | protanopia | tritanopia (palette swap)
    textScale: 1,
    uiScale: 1, // 0.85 - 1.25, whole interface (on top of text size)
    resolutionScale: 1, // 0.5 - 1, 3D render resolution (UI stays sharp)
    colorGrade: true, // per-theme colour grading in the post pass
    ambientFx: true, // theme particles (snow, embers, spores ...)
    mouseSensitivity: 1,
    invertY: false,
    showFps: false,
    masterVolume: 0.8,
    musicVolume: 0.5,
    sfxVolume: 0.8,
    muted: false,
    captions: true,
    reducedSound: false,
    enemiesHurtHero: false,
    damageNumbers: true,
    skipSummonAnim: false,
    tuningPreset: 'default', // 'default' = whatever data/tuning.json says
    assistExtraCash: false,
    assistSlowEnemies: false,
    assistHeroBoost: false,
    assistFullRefund: false,
    assistSkipWave: false,
    map: 'riftline', // last map picked in the hub (?map= in the URL wins)
    hero: '', // hero picked in the hub ('' = the first hero in data/heroes.json)
  };
}

// Numbers outside these (a hand-edited or old save) are clamped; unknown choices fall back.
const RANGES = {
  pixelation: [1, 4], textScale: [0.85, 1.5], uiScale: [0.85, 1.25], resolutionScale: [0.5, 1],
  mouseSensitivity: [0.3, 2.5], masterVolume: [0, 1], musicVolume: [0, 1], sfxVolume: [0, 1],
};
const CHOICES = {
  colorblind: ['none', 'deuteranopia', 'protanopia', 'tritanopia'],
  tuningPreset: ['default', 'standard', 'original', 'relaxed'],
};

export function loadSettings(storage, env) {
  const defaults = defaultSettings(env);
  try {
    const raw = storage.get(KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw);
    const out = { ...defaults };
    for (const k of Object.keys(defaults)) {
      if (k in saved && typeof saved[k] === typeof defaults[k]) out[k] = saved[k];
    }
    if (!QUALITY_ORDER.includes(out.quality)) out.quality = defaults.quality;
    for (const [k, [lo, hi]] of Object.entries(RANGES)) out[k] = Number.isFinite(out[k]) ? Math.min(hi, Math.max(lo, out[k])) : defaults[k];
    out.pixelation = Math.round(out.pixelation);
    for (const [k, list] of Object.entries(CHOICES)) if (!list.includes(out[k])) out[k] = defaults[k];
    out.playerName = out.playerName.slice(0, 24);
    out.map = out.map.slice(0, 64);
    out.hero = out.hero.slice(0, 64);
    return out;
  } catch {
    return defaults;
  }
}

export function saveSettings(storage, settings) {
  storage.set(KEY, JSON.stringify(settings));
}
