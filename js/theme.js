// js/theme.js — thèmes, packs d’images et personnalisation avancée

const DEFAULTS = {
  theme: localStorage.getItem('theme:name') || 'cosmic',
  custom: JSON.parse(localStorage.getItem('theme:custom') || '{}')
};

/* ===== Thèmes prédéfinis ===== */
const presets = {
  cosmic: { '--primary': '#00aaff', '--primary-glow': '#00c3ff', '--border-glow': '#66d9ff', '--card-bg': 'rgba(25,30,45,.30)', '--text-light': '#cfd9ff', '--text-muted': '#8aa0c7' },
  coral: { '--primary': '#ff6b6b', '--primary-glow': '#ff8e8e', '--border-glow': '#ffc1c1', '--card-bg': 'rgba(45,25,25,.35)', '--text-light': '#ffe6e6', '--text-muted': '#ffb3b3' },
  emerald: { '--primary': '#2ecc71', '--primary-glow': '#5ee4a0', '--border-glow': '#a8f5c8', '--card-bg': 'rgba(20,40,28,.35)', '--text-light': '#e6fff0', '--text-muted': '#b8e8cf' },
  violet: { '--primary': '#9b59b6', '--primary-glow': '#b07bd1', '--border-glow': '#d6b6ee', '--card-bg': 'rgba(35,20,40,.35)', '--text-light': '#f1e6ff', '--text-muted': '#d4b8f0' },
  gold: { '--primary': '#f1c40f', '--primary-glow': '#ffe066', '--border-glow': '#fff3b0', '--card-bg': 'rgba(45,40,20,.35)', '--text-light': '#fff9e6', '--text-muted': '#e6dca8' },
  fire: { '--primary': '#e74c3c', '--primary-glow': '#ff7666', '--border-glow': '#ffb3a1', '--card-bg': 'rgba(45,20,20,.35)', '--text-light': '#ffeaea', '--text-muted': '#f0b3b3' },
  aqua: { '--primary': '#1abc9c', '--primary-glow': '#48e1c1', '--border-glow': '#a0f5e2', '--card-bg': 'rgba(20,45,40,.35)', '--text-light': '#e6fffb', '--text-muted': '#b3e8de' },
  ocean: { '--primary': '#0077ff', '--primary-glow': '#4aa3ff', '--border-glow': '#a8d1ff', '--card-bg': 'rgba(18,24,40,.35)', '--text-light': '#eaf3ff', '--text-muted': '#b6c9e6' },
  forest: { '--primary': '#3fa34d', '--primary-glow': '#6ddb7c', '--border-glow': '#b9f2c6', '--card-bg': 'rgba(18,32,24,.35)', '--text-light': '#e9fff1', '--text-muted': '#bfe6c9' },
  sunset: { '--primary': '#ff8856', '--primary-glow': '#ffb08c', '--border-glow': '#ffd0b8', '--card-bg': 'rgba(48,28,22,.35)', '--text-light': '#fff0e9', '--text-muted': '#ffd2c0' },
  slate: { '--primary': '#8ea0b6', '--primary-glow': '#b7c6d6', '--border-glow': '#d7e2ec', '--card-bg': 'rgba(22,26,32,.35)', '--text-light': '#edf2f7', '--text-muted': '#c5cfdb' },
  neon: { '--primary': '#39ff14', '--primary-glow': '#7bff66', '--border-glow': '#c8ffc0', '--card-bg': 'rgba(10,18,10,.35)', '--text-light': '#eaffea', '--text-muted': '#c6f3c6' },
  mono: { '--primary': '#ffffff', '--primary-glow': '#d9d9d9', '--border-glow': '#aaaaaa', '--card-bg': 'rgba(0,0,0,.35)', '--text-light': '#ffffff', '--text-muted': '#c7c7c7' },
  pastel: { '--primary': '#ff9ad5', '--primary-glow': '#ffc3e8', '--border-glow': '#ffe0f3', '--card-bg': 'rgba(68,36,64,.25)', '--text-light': '#ffeefe', '--text-muted': '#f3c9e4' },
};

/* ===== Packs d’images ===== */
const BG_PACKS = {
  fond: { "768": "fond-768.webp", "1280": "fond-1280.webp", "1536": "fond-1536.webp" },
  fond1: { "768": "fond1-768.webp", "1280": "fond1-1280.webp", "1536": "fond1-1536.webp", "1920": "fond1-1920.webp", "jpg": "fond1.jpg" },
  fond2: { "768": "fond2-768.webp", "1280": "fond2-1280.webp", "1536": "fond2-1536.webp", "1920": "fond2-1920.webp", "jpg": "fond2.jpg" },
  fond3: { "768": "fond3-768.webp", "1280": "fond3-1280.webp", "1920": "fond3-1920.webp", "jpg": "fond3.jpg" },
  fond4: { "768": "fond4-768.webp", "1280": "fond4-1280.webp", "1536": "fond4-1536.webp", "1920": "fond4-1920.webp", "jpg": "fond4.jpg" },
  fond5: { "768": "fond5-768.webp", "1280": "fond5-1280.webp", "1536": "fond5-1536.webp", "1920": "fond5-1920.webp", "jpg": "fond5.jpg" },
  fond6: { "768": "fond6-768.webp", "1280": "fond6-1280.webp", "1536": "fond6-1536.webp", "1920": "fond6-1920.webp", "jpg": "fond6.jpg" },
  fond7: { "768": "fond7-768.webp", "1280": "fond7-1280.webp", "1536": "fond7-1536.webp", "1920": "fond7-1920.webp", "jpg": "fond7.jpg" },
  fond8: { "768": "fond8-768.webp", "1280": "fond8-1280.webp", "1536": "fond8-1536.webp", "1920": "fond8-1920.webp", "jpg": "fond8.jpg" },
  fond9: { "768": "fond9-768.webp", "1280": "fond9-1280.webp", "1536": "fond9-1536.webp", "1920": "fond9-1920.webp", "jpg": "fond9.jpg" },
  fond10: { "768": "fond10-768.webp", "1280": "fond10-1280.webp", "1536": "fond10-1536.webp", "1920": "fond10-1920.webp", "jpg": "fond10.jpg" },
  fond11: { "768": "fond11-768.webp", "1280": "fond11-1280.webp", "1536": "fond11-1536.webp", "1920": "fond11-1920.webp", "jpg": "fond11.jpg" },
  fond12: { "768": "fond12-768.webp", "1280": "fond12-1280.webp", "1536": "fond12-1536.webp", "1920": "fond12-1920.webp", "jpg": "fond12.jpg" },
  fond13: { "768": "fond13-768.webp", "1280": "fond13-1280.webp", "1536": "fond13-1536.webp", "1920": "fond13-1920.webp", "jpg": "fond13.jpg" },
  fond14: { "768": "fond14-768.webp", "1280": "fond14-1280.webp", "1536": "fond14-1536.webp", "1920": "fond14-1920.webp", "jpg": "fond14.jpg" },
  fond15: { "768": "fond15-768.webp", "1280": "fond15-1280.webp", "1536": "fond15-1536.webp", "1920": "fond15-1920.webp", "jpg": "fond15.jpg" },
  fond16: { "768": "fond16-768.webp", "1280": "fond16-1280.webp", "1536": "fond16-1536.webp", "1920": "fond16-1920.webp", "jpg": "fond16.jpg" },
};

/* ===== Utils ===== */
function setVar(k, v) { document.documentElement.style.setProperty(k, v); }
function hexToRgb(hex) {
  hex = (hex || '').trim();
  if (!hex) return { r: 0, g: 0, b: 0 };
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return { r, g, b };
  }
  if (hex.length >= 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b };
  }
  return { r: 0, g: 0, b: 0 };
}
function persistCustom(patch) {
  const custom = JSON.parse(localStorage.getItem('theme:custom') || '{}');
  const next = { ...custom, ...patch };
  localStorage.setItem('theme:custom', JSON.stringify(next));
  return next;
}

/* ===== API : Thème ===== */
export function applyTheme(opts = {}) {
  const state = { ...DEFAULTS, ...opts };
  const preset = presets[state.theme] || presets.cosmic;
  for (const [k, v] of Object.entries(preset)) setVar(k, v);

  const custom = JSON.parse(localStorage.getItem('theme:custom') || '{}');
  for (const [k, v] of Object.entries(custom)) setVar(k, v);

  localStorage.setItem('theme:name', state.theme);
  localStorage.setItem('theme:custom', JSON.stringify(custom));
  window.dispatchEvent(new Event('theme-applied'));
}

/* ===== API : Packs de fond ===== */
export function applyBackgroundPack(name) {
  const p = BG_PACKS[name];
  if (!p) return;
  const mk = (key, fallback) => {
    const f = p[key] || p[fallback] || p["jpg"];
    return f ? `url("../images/${f}")` : 'none'; // ../images/ obligatoire
  };
  setVar('--bg-768', mk("768", "1280"));
  setVar('--bg-1280', mk("1280", "768"));
  setVar('--bg-1536', mk("1536", "1280"));
  setVar('--bg-1920', mk("1920", "1536"));

  localStorage.setItem('theme:bgPack', name);
  window.dispatchEvent(new Event('theme-applied'));
}

/* ===== API : Options avancées ===== */
export function setOverlay(hex, opacity01) {
  const { r, g, b } = hexToRgb(hex);
  setVar('--overlay-r', String(r));
  setVar('--overlay-g', String(g));
  setVar('--overlay-b', String(b));
  setVar('--overlay-a', String(opacity01));
  setVar('--overlay-rgba', `rgba(${r},${g},${b},${opacity01})`);
  persistCustom({ '--overlay-r': r, '--overlay-g': g, '--overlay-b': b, '--overlay-a': opacity01, '--overlay-rgba': `rgba(${r},${g},${b},${opacity01})` });
  window.dispatchEvent(new Event('theme-applied'));
}
export function setBgFilters({ brightness, contrast, saturate, blurPx }) {
  if (brightness != null) setVar('--bg-brightness', String(brightness));
  if (contrast != null) setVar('--bg-contrast', String(contrast));
  if (saturate != null) setVar('--bg-saturate', String(saturate));
  if (blurPx != null) setVar('--bg-blur', `${parseInt(blurPx) || 0}px`);
  persistCustom({
    '--bg-brightness': brightness ?? getComputedStyle(document.documentElement).getPropertyValue('--bg-brightness').trim(),
    '--bg-contrast': contrast ?? getComputedStyle(document.documentElement).getPropertyValue('--bg-contrast').trim(),
    '--bg-saturate': saturate ?? getComputedStyle(document.documentElement).getPropertyValue('--bg-saturate').trim(),
    '--bg-blur': blurPx != null ? `${parseInt(blurPx) || 0}px` : getComputedStyle(document.documentElement).getPropertyValue('--bg-blur').trim(),
  });
  window.dispatchEvent(new Event('theme-applied'));
}
export function setBgPosition(pos) {
  setVar('--bg-pos', pos);
  persistCustom({ '--bg-pos': pos });
  window.dispatchEvent(new Event('theme-applied'));
}
export function setVignette(strength01) {
  const v = Math.max(0, Math.min(1, Number(strength01)));
  setVar('--vignette', String(v));
  persistCustom({ '--vignette': v });
  window.dispatchEvent(new Event('theme-applied'));
}
export function setCardStyle({ radiusPx, backdropBlurPx }) {
  if (radiusPx != null) setVar('--card-radius', `${parseInt(radiusPx) || 0}px`);
  if (backdropBlurPx != null) setVar('--card-backdrop-blur', `${parseInt(backdropBlurPx) || 0}px`);
  persistCustom({
    '--card-radius': `${parseInt(radiusPx || getComputedStyle(document.documentElement).getPropertyValue('--card-radius'))}px`,
    '--card-backdrop-blur': `${parseInt(backdropBlurPx || getComputedStyle(document.documentElement).getPropertyValue('--card-backdrop-blur'))}px`,
  });
  window.dispatchEvent(new Event('theme-applied'));
}

/* ===== Defaults avancés & resets ===== */
const DEFAULT_ADV = {
  '--overlay-r': 0, '--overlay-g': 0, '--overlay-b': 0, '--overlay-a': 0.28, '--overlay-rgba': 'rgba(0,0,0,0.28)',
  '--bg-brightness': 1, '--bg-contrast': 1, '--bg-saturate': 1, '--bg-blur': '0px',
  '--bg-pos': 'center top', '--vignette': 0,
  '--card-radius': '14px', '--card-backdrop-blur': '0px',
};
function _applyAndPersist(vars) {
  const custom = JSON.parse(localStorage.getItem('theme:custom') || '{}');
  const next = { ...custom, ...vars };
  for (const [k, v] of Object.entries(vars)) setVar(k, String(v));
  localStorage.setItem('theme:custom', JSON.stringify(next));
  window.dispatchEvent(new Event('theme-applied'));
}
export function resetAdvancedSection(section) {
  const map = {
    overlay: ['--overlay-r', '--overlay-g', '--overlay-b', '--overlay-a', '--overlay-rgba'],
    filters: ['--bg-brightness', '--bg-contrast', '--bg-saturate', '--bg-blur'],
    position: ['--bg-pos', '--vignette'],
    cards: ['--card-radius', '--card-backdrop-blur'],
  };
  const patch = {};
  (map[section] || []).forEach(k => patch[k] = DEFAULT_ADV[k]);
  _applyAndPersist(patch);
}
export function resetAllAdvanced() {
  const custom = JSON.parse(localStorage.getItem('theme:custom') || '{}');
  const next = { ...custom };
  Object.keys(DEFAULT_ADV).forEach(k => next[k] = DEFAULT_ADV[k]);
  localStorage.setItem('theme:custom', JSON.stringify(next));
  for (const [k, v] of Object.entries(DEFAULT_ADV)) setVar(k, String(v));
  window.dispatchEvent(new Event('theme-applied'));
}

/* ===== Reapply customs ===== */
export function reapplyCustomFromStorage() {
  const custom = JSON.parse(localStorage.getItem('theme:custom') || '{}');
  for (const [k, v] of Object.entries(custom)) setVar(k, v);
}

/* ===== Auto-apply ===== */
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  const saved = localStorage.getItem('theme:bgPack');
  if (saved) applyBackgroundPack(saved);
});




