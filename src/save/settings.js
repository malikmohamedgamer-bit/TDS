// Player settings (device-local, separate from game progress so a cloud save never overrides
// someone's graphics or accessibility choices).

const KEY = 'tds.settings.v1';

export function defaultSettings(env = {}) {
  const coarse = !!env.coarsePointer;
  return {
    quality: coarse ? 'low' : 'medium',
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
    return out;
  } catch {
    return defaults;
  }
}

export function saveSettings(storage, settings) {
  storage.set(KEY, JSON.stringify(settings));
}
