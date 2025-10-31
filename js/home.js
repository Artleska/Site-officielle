// js/home.js — Accueil v3 (temps réel + cache + stats + recos par similarité aux favoris)
import { db } from './firebaseConfig.js';
import {
  collection, getDocs, doc, setDoc, deleteDoc, getDoc,
  onSnapshot, query, orderBy, limit, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { afficherPopup, calculerProgression } from './visualisation.js';
import { rankBySimilarityToSet } from './explore.js';
import { buildSrcset, resolveImageFor, imgAttrsFor } from './imgUtils.js';
import { isNew } from './textUtils.js';
import { PLACEHOLDER_COVER, attachCoverGuards, renderCoverImg } from './cover.js';

attachCoverGuards();
const CATS = ['mangas', 'animes', 'films', 'series', 'novels'];
const ROW_IDS = { mangas: 'row-mangas', animes: 'row-animes', films: 'row-films', series: 'row-series', novels: 'row-novels' };

// — Restaure la clé de vue : override si présent, sinon suit le compte connecté —
(() => {
  let saved = localStorage.getItem('viewKey');
  if (saved !== 'J' && saved !== 'M') {
    saved = window.currentUserKey || 'M'; // par défaut, on suit le compte
  }
  window.__viewKey = saved;
})();

// ====== STORE ======
const STORE = {
  listsByType: { mangas: [], animes: [], films: [], series: [], novels: [] },
  heroFlat: [],
};
window.__STORE = STORE;
window.__ROW_IDS = ROW_IDS;

async function ensureStoreHydrated(type) {
  try {
    const coll = collection(db, type);
    const cntSnap = await getCountFromServer(coll);
    const serverCount = cntSnap.data().count || 0;
    const localCount = (STORE.listsByType[type] || []).length;

    // Si le serveur a plus d'items que le cache local, on recharge tout
    if (serverCount > localCount) {
      const fresh = await loadLatestFallback(type); // sans n => tout
      if (Array.isArray(fresh) && fresh.length) {
        STORE.listsByType[type] = fresh.slice();
        writeLS(); // met à jour le cache disque pour la prochaine fois
      }
    }
  } catch (e) {
    // silencieux: si l'agrégat Count n'est pas dispo, on ne casse rien
    console.warn('ensureStoreHydrated failed for', type, e?.message || e);
  }
}


// ====== Cache disque ======
const LS_KEY = 'archiveAll_v3';
function readLS() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } }
function writeLS() {
  try {
    const data = {};
    for (const c of CATS) data[c] = STORE.listsByType[c] || [];
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch { }
}
const primed = readLS();
for (const c of CATS) if (Array.isArray(primed[c]) && primed[c].length) STORE.listsByType[c] = primed[c];
async function boot() {
  // 1) charge les listes (ça remplit STORE)
  await Promise.all(CATS.map(t => renderRowsFor(t)));

  // 2) sections qui s’appuient aussi sur STORE
  await renderFavAndReco();
  await renderContinue();

  // 2bis) assurer que le STORE reflète bien TOUT le Firestore
  await Promise.all(CATS.map(t => ensureStoreHydrated(t)));

  // 3) maintenant seulement, calcule les stats
  renderStats();

  // 4) UI
  window.__applyFilterNow && window.__applyFilterNow();
}


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

// ====== Helpers ======
function getUserKey() {
  return window.__viewKey ?? window.currentUserKey ?? localStorage.getItem('viewKey') ?? 'M';
}
function setViewKey(key) { // 'J' ou 'M'
  window.__viewKey = key;
  localStorage.setItem('viewKey', key);

  // ✅ re-render partout
  rerenderAllRows();
  renderFavAndReco();
  renderContinue();
  if (window.__renderHeroFor) window.__renderHeroFor(localStorage.getItem('homeFilterCat') || 'mangas', 6);

}
window.setUserKey = setViewKey;

function getUserUid() { return window.currentUserUid || null; }
function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts?.toMillis === 'function') return ts.toMillis();        // Timestamp Firestore
  if (typeof ts === 'object' && typeof ts.seconds === 'number')
    return ts.seconds * 1000 + (ts.nanoseconds || 0) / 1e6;            // {seconds,nanoseconds}
  if (typeof ts === 'number') return ts < 1e12 ? ts * 1000 : ts;       // s → ms
  if (typeof ts === 'string') {
    const n = Number(ts);
    if (!Number.isNaN(n)) return n < 1e12 ? n * 1000 : n;              // "1695600000"
    const p = Date.parse(ts);
    return Number.isNaN(p) ? 0 : p;                                    // ISO
  }
  return 0;
}

function getCurrentCat() {
  return localStorage.getItem('homeFilterCat') || 'mangas';
}

// === Fallback "dernières modifs" façon A (si onSnapshot n'a rien encore) ===
// Charge tout si n est omis, sinon charge les n derniers par modifieLe
async function loadLatestFallback(type, n) {
  try {
    if (typeof n === 'number') {
      // Cas "dernières modifs" limitées
      const qRef = query(
        collection(db, type),
        orderBy('modifieLe', 'desc'),
        limit(n)
      );
      const snap = await getDocs(qRef);
      return snap.docs.map(d => ({ id: d.id, ...d.data(), _type: type }));
    }
  } catch (err) {
    // on tombera de toute façon sur le "charge tout" plus bas
  }

  // Par défaut: CHARGE TOUT, même si modifieLe est manquant
  const snapAll = await getDocs(collection(db, type));
  const all = snapAll.docs.map(d => ({ id: d.id, ...d.data(), _type: type }));
  // Tri côté client (les docs sans modifieLe partent en bas)
  all.sort((a, b) => (toMillis(b.modifieLe) - toMillis(a.modifieLe)));
  return all.slice(0, 120);
}

function rerenderAllRows() {
  ['mangas', 'animes', 'series', 'films', 'novels'].forEach(t => renderRowsFor(t));
}

function upsert(type, item) {
  const arr = STORE.listsByType[type] || (STORE.listsByType[type] = []);
  const i = arr.findIndex(x => x.id === item.id);
  if (i >= 0) arr[i] = item; else arr.push(item);
}
function removeDoc(type, id) {
  const arr = STORE.listsByType[type] || [];
  const i = arr.findIndex(x => x.id === id);
  if (i >= 0) arr.splice(i, 1);
}
function sortByModif(type) {
  const arr = STORE.listsByType[type] || [];
  arr.sort((a, b) => toMillis(b.modifieLe) - toMillis(a.modifieLe));
}

function cardHTML(item, type, favSet, userKey) {
  const img = resolveImageFor(item);
  const title = item.title || '(sans titre)';
  const prog = calculerProgression(item, type, userKey);
  const newBadge = isNew(item.modifieLe) ? '<span class="badge-new">NEW</span>' : '';
  const favKey = `${type}__${item.id}`;
  const favActive = favSet && favSet.has(favKey) ? 'active' : '';
  return `
    <article class="oeuvre-card work-card"  data-id="${item.id}" data-type="${type}">
      <div class="cover">
        ${renderCoverImg(img, `${title} — couverture`,
    { width: 240, height: 340, className: 'img-main cover-img', attrs: imgAttrsFor(img) }
  )}
        <span class="progress">${statusOf(item, type, userKey) === 'termine' ? 'Terminé' : prog}</span>
        ${newBadge}
        <button class="badge-fav ${favActive}" data-fav="${favKey}" title="Ajouter aux favoris"></button>
      </div>
      <div class="title">${title}</div>
    </article>`;
}
window.addEventListener('auth-ready', () => {
  if (!localStorage.getItem('viewKey')) {
    window.__viewKey = window.currentUserKey || 'M';
    // re-render des sections dépendantes
    if (typeof rerenderAllRows === 'function') rerenderAllRows();
    renderFavAndReco && renderFavAndReco();
    renderContinue && renderContinue();

  }
});

// === HERO ===
let HERO_LAST_RENDER_AT = 0;
let HERO_LAST_CAT = null;

function buildHeroSlide(it, idx) {
  const url = it.image || it.img || PLACEHOLDER_COVER;
  const lazy = idx === 0 ? '' : 'loading="lazy" decoding="async"';
  const srcset = buildSrcset(url);

  return `
    <div class="hero-slide ${idx === 0 ? 'active' : ''}" data-type="${it._type}" data-id="${it.id}">
        <img src="${url}" alt="${it.title || ''} — couverture" ${lazy} 
        onerror="handleCoverError(this)"/>
      <div class="hero-overlay">
        <div class="hero-content">
          <div class="hero-title">${it.title || '(sans titre)'}</div>
        </div>
      </div>
    </div>
  `;
}

async function renderHeroFor(cat, count = 6) {
  const hero = document.getElementById('heroSlider');
  if (!hero) return;

  const pool = (STORE.listsByType[cat] || []).slice();
  if (!pool.length) { hero.innerHTML = ''; STORE.heroFlat = []; return; }

  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picks = pool.slice(0, Math.min(count, pool.length));

  // 🔸 NOUVEAU : on pose l’image résolue sur chaque pick
  const picksWith = picks.map(it => ({
    ...it,
    image: resolveImageFor(it)
  }));
  STORE.heroFlat = picksWith;

  hero.innerHTML = picksWith.map(buildHeroSlide).join('');
  startHeroAutoplay();
}
window.__renderHeroFor = renderHeroFor;
// === Autoplay HERO ===
let HERO_INTERVAL = null;

function startHeroAutoplay() {
  const hero = document.getElementById('heroSlider');
  if (!hero) return;
  const slides = [...hero.querySelectorAll('.hero-slide')];
  if (slides.length <= 1) return;

  // remet l'état
  slides.forEach(s => s.classList.remove('active'));
  let i = 0;
  slides[i].classList.add('active');

  // (re)démarre l'intervalle
  if (HERO_INTERVAL) { clearInterval(HERO_INTERVAL); HERO_INTERVAL = null; }
  HERO_INTERVAL = setInterval(() => {
    slides[i].classList.remove('active');
    i = (i + 1) % slides.length;
    slides[i].classList.add('active');
  }, 5000);
}

// ====== Favoris ======
function getViewKeySafe() {
  return window.__viewKey ?? window.currentUserKey ?? localStorage.getItem('viewKey') ?? 'M';
}

async function loadFavoritesSet(uid) {
  if (uid) {
    const col = collection(db, `users/${uid}/favorites`);
    const snap = await getDocs(col);
    return new Set(snap.docs.map(d => d.id));
  }
  // Fallback localStorage si pas d'auth
  try {
    const vk = getViewKeySafe();           // 'J' ou 'M'
    const tryKeys = [`fav:${vk}`, 'fav:J', 'fav:M'];
    const out = new Set();
    for (const k of tryKeys) {
      const raw = localStorage.getItem(k) || '[]';
      try { JSON.parse(raw).forEach(x => out.add(x)); } catch { }
    }
    return out;
  } catch { return new Set(); }
}

async function toggleFavorite(uid, favKey) {
  // Forme "type__id"
  if (uid) {
    const [type, id] = favKey.split('__');
    const ref = doc(db, `users/${uid}/favorites`, favKey);
    const exists = await getDoc(ref);
    if (exists.exists()) await deleteDoc(ref);
    else await setDoc(ref, { type, oeuvreId: id, createdAt: new Date().toISOString() });
    return;
  }
  // Pas d'uid → fallback LS par vue (J/M)
  const vk = getViewKeySafe();
  const k = `fav:${vk}`;
  const raw = localStorage.getItem(k) || '[]';
  let arr = [];
  try { arr = JSON.parse(raw); } catch { }
  if (!Array.isArray(arr)) arr = [];
  const i = arr.indexOf(favKey);
  if (i >= 0) arr.splice(i, 1); else arr.push(favKey);
  localStorage.setItem(k, JSON.stringify(arr));
}


// ====== Rendus ciblés ======
async function renderRowsFor(type) {
  window.__renderRowsFor = renderRowsFor;

  let all = STORE.listsByType[type] || [];
  if (!all.length) {
    try {
      all = await loadLatestFallback(type);
      if (all.length) STORE.listsByType[type] = all.slice();
    } catch { }
  }

  const root = document.getElementById(ROW_IDS[type]);
  if (!root) return;

  const favSet = await loadFavoritesSet(getUserUid());

  let list = all
    .filter(it => isNew(it.modifieLe))
    .sort((a, b) => (b.modifieLe?.seconds || b.modifieLe || 0) - (a.modifieLe?.seconds || a.modifieLe || 0));

  if (!list.length) {
    list = [...all]
      .sort((a, b) => (b.modifieLe?.seconds || b.modifieLe || 0) - (a.modifieLe?.seconds || a.modifieLe || 0))
      .slice(0, 30);
  }

  const withCover = list.map(it => ({
    ...it,
    image: resolveImageFor(it),
    _type: it._type || type
  }));
  const key = getUserKey();
  root.innerHTML = withCover.map(item => cardHTML(item, type, favSet, key)).join('');
  const has = withCover.length > 0;
  root.dataset.hasItems = String(has);
  root.classList.toggle('row-hidden', !has);
  if (window.__applyFilterNow) { try { window.__applyFilterNow(); } catch { } }
}

// 🔸 Recommandés = (tout – favoris) avec relâchement pour garantir du volume
async function loadFavoritesDocs(uid) {
  if (!uid) return [];
  const col = collection(db, `users/${uid}/favorites`);
  const snap = await getDocs(col);
  return snap.docs.map(d => {
    const data = d.data() || {};
    // rétro-compatibilité : id ancien = oeuvreId tout seul
    let type = data.type, oeuvreId = data.oeuvreId;
    if (!type || !oeuvreId) {
      if (d.id.includes('__')) {
        const [t, id] = d.id.split('__');
        type = type || t;
        oeuvreId = oeuvreId || id;
      } else {
        // si très ancien format: on ne connaît pas le type → on essaiera toutes les collections
        oeuvreId = oeuvreId || d.id;
      }
    }
    return { favKey: d.id, type, oeuvreId };
  });
}

async function fetchItemByTypeId(type, id) {
  // 1) checker le STORE d'abord
  if (type && STORE.listsByType[type]) {
    const found = STORE.listsByType[type].find(x => x.id === id);
    if (found) return { ...found, _type: type };
  }
  // 2) sinon, tenter Firestore si type connu
  if (type) {
    try {
      const ref = doc(db, type, id);
      const g = await getDoc(ref);
      if (g.exists()) return { id: g.id, ...g.data(), _type: type };
    } catch { }
  } else {
    // type inconnu (vieux favoris) → essayer chaque collection jusqu’à trouver
    for (const t of CATS) {
      try {
        const g = await getDoc(doc(db, t, id));
        if (g.exists()) return { id: g.id, ...g.data(), _type: t };
      } catch { }
    }
  }
  return null;
}

async function renderFavAndReco() {
  const uid = getUserUid();

  const favRoot =
    document.getElementById('row-fav') ||
    document.getElementById('row-favoris') ||
    document.querySelector('[data-row="fav"]');
  const recoRoot =
    document.getElementById('row-reco') ||
    document.getElementById('row-recommandes') ||
    document.querySelector('[data-row="reco"]');

  if (!favRoot && !recoRoot) return;

  // 1) Lire les favoris (Firestore OU localStorage)
  let favDocs = [];
  if (uid) {
    favDocs = await loadFavoritesDocs(uid);
  } else {
    // ✅ Lire l’union des trois clés pour éviter le mismatch J/M
    const vk = getViewKeySafe();
    const keys = [`fav:${vk}`, 'fav:J', 'fav:M'];
    const seen = new Set();
    const flat = [];

    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k) || '[]';
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          for (const x of arr) {
            if (typeof x === 'string' && x.includes('__') && !seen.has(x)) {
              seen.add(x);
              flat.push(x);
            }
          }
        }
      } catch { }
    }

    favDocs = flat.map(x => {
      const [type, oeuvreId] = x.split('__');
      return { favKey: x, type, oeuvreId };
    });
  }

  // 2) Résoudre chaque œuvre
  const favItems = (await Promise.all(favDocs.map(async f => {
    const it = await fetchItemByTypeId(f.type, f.oeuvreId);
    if (!it) return null;
    const img = resolveImageFor(it);
    const item = { ...it, image: img, _type: it._type || f.type };
    // Alimente le STORE si manquant
    if (item._type && item.id) {
      const arr = STORE.listsByType[item._type] || (STORE.listsByType[item._type] = []);
      if (!arr.find(x => x.id === item.id)) arr.push(item);
    }
    return item;
  }))).filter(Boolean);

  const key = getUserKey();
  const favSetKeys = new Set(favDocs.map(f => `${(f.type || (f._type || 'mangas'))}__${f.oeuvreId}`));

  // 3) Afficher les favoris
  if (favRoot) {
    favRoot.innerHTML = favItems.length
      ? favItems.map(it => cardHTML(it, it._type, favSetKeys, key)).join('')
      : `<div class="text-muted" style="padding:8px 12px;">Aucun favori</div>`;
  }

  // ... (garde le bloc existant des recommandations, mais remplace son `favSet` par `favSetKeys`)
  if (recoRoot) {
    const all = CATS.flatMap(t => (STORE.listsByType[t] || []).map(x => ({ ...x, _type: x._type || t })));
    const pool = all.filter(x => !favSetKeys.has(`${x._type}__${x.id}`));
    const reco = rankBySimilarityToSet(pool, favItems, 60, { strict: true, alsoMatchSecondary: true, enforceLead: true, minCount: 24 });
    recoRoot.innerHTML = reco.length
      ? reco.map(it => cardHTML(it, it._type, favSetKeys, key)).join('')
      : `<div class="text-muted" style="padding:8px 12px;">Ajoute des ⭐ favoris pour générer des recommandations</div>`;
  }
}

// === "À reprendre" ===
async function renderContinue(cat) {
  const root = document.getElementById('row-continue');
  if (!root) return;

  const key = getUserKey();
  const favSet = await loadFavoritesSet(getUserUid());
  const type = cat || getCurrentCat();

  // œuvres de la catégorie courante uniquement
  const arr = (STORE.listsByType[type] || []).map(it => ({ ...it, _type: type }));

  const list = arr.filter(it => {
    // 1) doit être "commencé"
    if (statusOf(it, type, key) !== 'enCours') return false;

    // 2) exclure tout ce qui est "à jour" (calculerProgression contient ✅)
    const prog = String(calculerProgression(it, type, key));
    if (prog.includes('✅')) return false;

    // 3) sécurités supplémentaires par type pour détecter rattrapé
    if (type === 'mangas' || type === 'novels') {
      const total = Number(it.chTotal || 0);
      let lu = 0;
      const who = key === 'J' ? (it.chJade ?? 0) : (it.chLus ?? 0);
      if (typeof who === 'string') {
        const parts = who.split('.').map(n => parseInt(n)).filter(n => !isNaN(n));
        if (parts.length) lu = Math.max(...parts);
      } else if (typeof who === 'number') { lu = who; }
      if (total > 0 && lu >= total) return false; // rattrapé
    }

    if (type === 'animes' || type === 'series') {
      const epT = Number(it.episodeTotal || 0);
      const saT = Number(it.saisonTotal || 0);
      const ep = key === 'J' ? Number(it.episodeJ || 0) : Number(it.episodeM || 0);
      const sa = key === 'J' ? Number(it.saisonJ || 0) : Number(it.saisonM || 0);
      if ((epT > 0 && ep >= epT) && (saT > 0 && sa >= saT)) return false; // rattrapé
    }

    if (type === 'films') {
      const ecoute = (it.derniereEcoute || '').trim();
      if (ecoute) return false; // déjà vu → pas à reprendre
    }

    // sinon: commencé + en retard ⇒ à reprendre
    return true;
  });

  // tri par plus récemment modifié, pas de limite
  list.sort((a, b) => toMillis(b.modifieLe) - toMillis(a.modifieLe));

  root.innerHTML = list.length
    ? list.map(it => cardHTML(it, type, favSet, key)).join('')
    : `<div class="text-muted" style="padding:8px 12px;">Rien à reprendre 🎉</div>`;


  root.dataset.hasItems = String(list.length > 0);
}




function statusOf(it, type, key) {
  const s = (it.statut || it.status || '').toLowerCase().trim();

  if (type === 'mangas' || type === 'novels') {
    const totalCh = Number(it.chTotal || 0);
    const who = key === 'J' ? (it.chJade ?? 0) : (it.chLus ?? 0);
    let chLus = 0;
    if (typeof who === 'string') {
      const parts = who.split('.').map(n => parseInt(n)).filter(n => !isNaN(n));
      if (parts.length) chLus = Math.max(...parts);
    } else if (typeof who === 'number') { chLus = who; }
    if (!chLus || chLus === 0) return 'nonCommence';
    if (['terminé', 'complet', 'abandonné'].some(t => s.includes(t)) && totalCh > 0 && chLus >= totalCh) return 'termine';
    return 'enCours';
  }

  if (type === 'animes' || type === 'series') {
    const epTotal = Number(it.episodeTotal || 0);
    const saTotal = Number(it.saisonTotal || 0);
    const ep = key === 'J' ? Number(it.episodeJ || 0) : Number(it.episodeM || 0);
    const sa = key === 'J' ? Number(it.saisonJ || 0) : Number(it.saisonM || 0);
    if (!ep && !sa) return 'nonCommence';
    if (['terminé', 'complet', 'abandonné'].some(t => s.includes(t)) && ep >= epTotal && sa >= saTotal) return 'termine';
    return 'enCours';
  }

  if (type === 'films') {
    const dJ = (it.derniereEcouteJ || '').trim();
    const dM = (it.derniereEcouteM || '').trim();
    const shared = (it.derniereEcoute || '').trim();
    const has = (key === 'J' ? dJ : dM) || shared;
    return has ? 'termine' : 'nonCommence';
  }

  return 'nonCommence';
}

function renderStats() {
  const root = document.getElementById('stats');
  const key = getUserKey();
  const out = CATS.map(type => {
    const arr = STORE.listsByType[type] || [];
    const total = arr.length;
    let enCours = 0, termine = 0, nonCommence = 0;
    arr.forEach(it => {
      const st = statusOf(it, type, key);
      if (st === 'termine') termine++;
      else if (st === 'enCours') enCours++;
      else nonCommence++;
    });
    return { type, total, enCours, termine, nonCommence };
  });

  root.innerHTML = out.map(s => `
    <div class="stat-card">
      <h4>${s.type.toUpperCase()}</h4>
      <div><b>${s.total}</b> au total</div>
      <div>${s.enCours} en cours</div>
      <div>${s.nonCommence} non commencés</div>
      <div>${s.termine} terminés</div>
    </div>
  `).join('');
}

async function openItemByTypeId(type, id) {
  // 1) STORE
  const arr = STORE.listsByType[type] || [];
  let item = arr.find(x => x.id === id);

  // 2) HERO cache
  if (!item) item = (STORE.heroFlat || []).find(x => x.id === id && x._type === type);

  // 3) Firestore (favoris rendus mais pas en STORE)
  if (!item) item = await fetchItemByTypeId(type, id);

  if (!item) return; // rien trouvé

  const pool = (STORE.listsByType[type] && STORE.listsByType[type].length)
    ? STORE.listsByType[type]
    : [item];

  afficherPopup(item, type, getUserKey(), pool);
}


// ====== Temps réel ======
function startRealtimeListeners() {
  const only = getCurrentCat(); 
  [only].forEach((type) => {
    onSnapshot(collection(db, type), (snap) => {
      snap.docChanges().forEach((ch) => {
        const docData = { id: ch.doc.id, ...ch.doc.data(), _type: type };
        if (ch.type === 'removed') removeDoc(type, ch.doc.id);
        else upsert(type, docData);
      });

      sortByModif(type);
      writeLS();
      renderRowsFor(type);
      renderFavAndReco();
      renderContinue();
      renderStats();
      const cat = localStorage.getItem("homeFilterCat") || "mangas";
      if (window.__renderHeroFor) window.__renderHeroFor(cat, 6);
      window.dispatchEvent(new CustomEvent('home-ready'));
    });
  });
}

// ====== Délégation clics ======
document.addEventListener('click', async (e) => {
  const slide = e.target.closest('.hero-slide');
  if (slide) { openItemByTypeId(slide.dataset.type, slide.dataset.id); return; }

  const favBtn = e.target.closest('[data-fav]');
  if (favBtn) {
    const favKey = favBtn.getAttribute('data-fav');
    await toggleFavorite(getUserUid(), favKey);
    favBtn.classList.toggle('active');
    renderFavAndReco();
    return;
  }

  const card = e.target.closest('.work-card');
  if (!card) return;
  const type = card.getAttribute('data-type');
  const id = card.getAttribute('data-id');
  // Toujours utiliser la version robuste qui va chercher en STORE, HERO, puis Firestore
  openItemByTypeId(type, id);

});

// Démarre le temps réel après le premier paint / quand l'onglet est visible
const safeStartRealtime = (() => {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    startRealtimeListeners();
  };
})();

// 1) si l'onglet est déjà visible, on attend l'idle
if (document.visibilityState === 'visible') {
  if (window.requestIdleCallback) {
    window.requestIdleCallback(() => safeStartRealtime(), { timeout: 500 });
  } else {
    setTimeout(safeStartRealtime, 500);
  }
}

// 2) au premier passage en 'visible'
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') safeStartRealtime();
}, { once: true });

// 3) au premier scroll ou interaction sur le hero/puces de filtre
window.addEventListener('scroll', safeStartRealtime, { once: true, passive: true });
document.getElementById('homeFilter')?.addEventListener('click', safeStartRealtime, { once: true });


// ====== Réaction à l’auth ======
window.addEventListener('auth-ready', () => {
  renderFavAndReco();
  renderContinue();
  renderStats();
});



// Fire an initial render as a fallback
try { renderStats(); } catch (e) { console.error('renderStats failed', e); }






