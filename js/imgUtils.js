// js/imgUtils.js// 

import { PLACEHOLDER_COVER } from './cover.js';

export function buildSrcset(url) {
  if (!url) return '';
  let u; try { u = new URL(url, location.origin); } catch { return ''; }
  const isSameOrigin = (u.origin === location.origin);
  const isLocalImage = u.pathname.startsWith('/images/');
  if (!isSameOrigin || !isLocalImage) return '';
  const cleanPath = u.pathname.replace(/\.(jpe?g|png|webp)$/i, '');
  return `${cleanPath}-768.webp 768w, ${cleanPath}-1280.webp 1280w, ${cleanPath}-1920.webp 1920w`;
}

export function imgAttrsFor(url) {
  const ss = buildSrcset(url);
  return ss ? `srcset="${ss}" sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"` : '';
}

export function resolveImageFor(item) {
  if (!item) return PLACEHOLDER_COVER;

  const candidates = [
    item.cover,
    item.image,
    item.img,
    item.poster,
    item.banner,
  ].filter(Boolean);
  const first = candidates.find(u => typeof u === 'string' && u.trim().length);
  return first || PLACEHOLDER_COVER;
}

