// js/textUtils.js
export function stripDiacritics(s) {
  return s?.normalize('NFD').replace(/\p{Diacritic}/gu, '') ?? '';
}
// ID depuis le titre
export function slugifyTitle(s) {
  const t = stripDiacritics(String(s || '')).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return t || 'untitled';
}

export function parseFSDate(v) {
  if (!v) return null;
  if (typeof v === 'string') return new Date(v);
  if (typeof v === 'number') return new Date(v);
  if (v && typeof v === 'object' && 'seconds' in v) return new Date(v.seconds * 1000);
  return null;
}

export function isNew(modifieLe, days = 31) {
  const d = parseFSDate(modifieLe); if (!d) return false;
  return (Date.now() - d.getTime()) <= days * 86400000;
}

export function chlusStringToArray(s) {
  if (!s) return [0, 0, 0, 0];
  if (Array.isArray(s)) return s.map(n => Number(n || 0)).concat([0, 0, 0, 0]).slice(0, 4);
  return String(s).split(/[./]/).map(x => Number(x || 0)).concat([0, 0, 0, 0]).slice(0, 4);
}

export function chlusArrayToString(a) {
  const arr = Array.isArray(a) ? a : [0, 0, 0, 0];
  return `${arr[0] || 0}.${arr[1] || 0}.${arr[2] || 0}.${arr[3] || 0}`;
}
