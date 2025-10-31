// js/visualisation.js
import { db } from './firebaseConfig.js';
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { autoSimilarFor } from './explore.js';
import { buildSrcset, imgAttrsFor, resolveImageFor } from './imgUtils.js';
import { slugifyTitle, isNew, chlusStringToArray, chlusArrayToString } from './textUtils.js';
import {
  ANILIST_ENDPOINT, cleanupBaseTitle, guessMediaTypeByCol,
  anilistLookup, searchJikanMalId, getAniListIdFromMalId
} from './anilistUtils.js';
import { PLACEHOLDER_COVER, renderCoverImg } from './cover.js';
/* === Genres par catégorie (pour l’édition) === */
import { genresMangas } from './mangas.js';
import { genresAnimes } from './animes.js';
import { genresFilms } from './films.js';
import { genresSeries } from './series.js';
import { genresNovels } from './novels.js';

// 🔧 Fonction globale appelée quand une <img> casse
window.autoFixCover = async function (imgEl) {
  try {
    if (!imgEl || imgEl.__autofixed) return;
    imgEl.__autofixed = true;

    // on cherche l’id/type autour de l’image
    const host = imgEl.closest('[data-id][data-type]') || imgEl.closest('.work-card, .oeuvre-card');
    const id = host?.dataset?.id || null;
    const type = host?.dataset?.type || null; // ex: "mangas", "animes", ...

    // lire le doc si possible (titre, otherTitles, anilistId)
    let data = null;
    if (id && type) {
      try {
        const snap = await getDoc(doc(db, type, id));
        if (snap.exists()) data = { id, ...snap.data() };
      } catch { }
    }
    const title = data?.title || host?.querySelector('h3')?.textContent || '';
    const other = Array.isArray(data?.otherTitles) ? data.otherTitles : (data?.otherTitles ? String(data.otherTitles).split(/[\/,|]/).map(s => s.trim()).filter(Boolean) : []);

    const mediaType = guessMediaTypeByCol(type || 'mangas');

    // 1) via AniList ID si déjà présent
    let media = null;
    let aid = data?.anilistId ? Number(data.anilistId) : null;
    if (aid) media = await anilistLookup({ id: aid, mediaType });

    // 2) sinon: recherche par titre (version nettoyée + autres titres)
    const candidates = [cleanupBaseTitle(title), ...other.map(cleanupBaseTitle)].filter(Boolean);
    for (const q of candidates) {
      if (media) break;
      media = await anilistLookup({ search: q, mediaType });
    }

    // 3) fallback Jikan(MAL) -> conversion AniList
    if (!media && candidates[0]) {
      const mal = await searchJikanMalId(candidates[0], mediaType);
      const alid = await getAniListIdFromMalId(mal);
      if (alid) media = await anilistLookup({ id: alid, mediaType });
    }

    const cover = media?.coverImage?.extraLarge || media?.coverImage?.large || media?.coverImage?.medium || '';
    if (cover) {
      imgEl.src = cover; // affiche tout de suite
      // persiste dans Firestore
      if (id && type) {
        const payload = { image: cover, cover: cover };
        if (media?.id && !data?.anilistId) payload.anilistId = media.id;
        try { await setDoc(doc(db, type, id), payload, { merge: true }); } catch { }
      }
    } else {
      imgEl.src = PLACEHOLDER_COVER; // fallback local
    }
  } catch (e) {
    console.warn('autoFixCover error', e);
    imgEl.src = PLACEHOLDER_COVER;
  }
};

/* ================== Dates & badges ================== */
function toMillisMaybe(ts) {
  if (!ts) return 0;
  if (typeof ts?.toMillis === 'function') return ts.toMillis();
  if (typeof ts === 'object' && typeof ts.seconds === 'number') {
    return ts.seconds * 1000 + (ts.nanoseconds || 0) / 1e6;
  }
  if (typeof ts === 'number') return ts < 1e12 ? ts * 1000 : ts;
  if (typeof ts === 'string') {
    const n = Number(ts);
    if (!Number.isNaN(n)) return n < 1e12 ? n * 1000 : n;
    const p = Date.parse(ts);
    return Number.isNaN(p) ? 0 : p;
  }
  return 0;
}
function formatDateFrFromAny(value) {
  const ms = toMillisMaybe(value); if (!ms) return '—';
  const d = new Date(ms); const j = d.getDate();
  const day = j === 1 ? '1er' : String(j);
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${day} ${mois[d.getMonth()]} ${d.getFullYear()}`;
}

/* ================== Helpers format ================== */
function chlusDotToSlash(v) {
  const raw = String(v || '').trim(); if (!raw) return '';
  const parts = raw.split('.').slice(0, 4);
  while (parts.length < 4) parts.push('');
  return parts.join('/').replace(/\/+$/, '');
}
function duoToSlash(vf, vost) {
  const a = (vf ?? '') === 0 ? 0 : vf;
  const b = (vost ?? '') === 0 ? 0 : vost;
  const A = (a === 0 || !!a) ? String(a) : '';
  const B = (b === 0 || !!b) ? String(b) : '';
  return `${A}/${B}`.replace(/\/+$/, '');
}

/* ================== Favoris ================== */
function getUserUid() { return window.currentUserUid || null; }
async function isFavorite(favKey) {
  const uid = getUserUid(); if (!uid) return false;
  const ref = doc(db, `users/${uid}/favorites`, favKey);
  const snap = await getDoc(ref);
  return snap.exists();
}
async function toggleFavorite(favKey, meta = {}) {
  const uid = getUserUid();
  if (!uid) { alert("Connecte-toi pour gérer les favoris."); return false; }
  const ref = doc(db, `users/${uid}/favorites`, favKey);
  const snap = await getDoc(ref);
  if (snap.exists()) { await deleteDoc(ref); return false; }
  await setDoc(ref, { ...meta, createdAt: new Date().toISOString() });
  return true;
}

/* ================== Data ================== */
export async function chargerDonneesCategorie(nomCollection) {
  try {
    const snap = await getDocs(collection(db, nomCollection));
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.warn('[chargerDonneesCategorie] Erreur Firestore pour', nomCollection, e);
    return [];
  }
}

// 🔑 Vue courante (J/M) fiable même si l'appelant n'envoie rien
function currentViewKey(explicit) {
  if (explicit === 'J' || explicit === 'M') return explicit;
  return window.__viewKey ?? window.currentUserKey ?? localStorage.getItem('viewKey') ?? 'M';
}

/* ================== Progression pour cartes ================== */
export function calculerProgression(oeuvre, type, userKey) {

  const key = userKey
    ?? (window.__viewKey ?? window.currentUserKey ?? localStorage.getItem('viewKey') ?? 'M');
  const statut = (oeuvre.statut || oeuvre.status || '').toLowerCase();
  if (type === 'mangas' || type === 'novels') {
    const total = Number(oeuvre.chTotal || 0);
    const lusField = (key === 'J') ? oeuvre.chJade : oeuvre.chLus;
    let lus = 0;
    if (typeof lusField === 'string') {
      const parts = lusField.split('.').map(n => parseInt(n)).filter(n => !isNaN(n));
      if (parts.length) lus = Math.max(...parts);
    } else if (typeof lusField === 'number') { lus = lusField; }
    const termine = ((oeuvre.statut || oeuvre.status || '') + '').toLowerCase().includes('termin') && total > 0 && lus >= total;
    return `${lus}/${total || '—'}` + (termine ? ' ✅' : '');
  } else if (type === 'animes' || type === 'series') {
    const epTotal = oeuvre.episodeTotal || 0, saTotal = oeuvre.saisonTotal || 0;
    const ep = key === 'J' ? (oeuvre.episodeJ || 0) : (oeuvre.episodeM || 0);
    const sa = key === 'J' ? (oeuvre.saisonJ || 0) : (oeuvre.saisonM || 0);
    const termine = ep >= epTotal && sa >= saTotal && ((oeuvre.statut || oeuvre.status || '') + '').toLowerCase().includes('termin');
    return `${ep}/${epTotal} ép. – ${sa}/${saTotal} s.` + (termine ? ' ✅' : '');
  } else if (type === 'films') {
    const key = userKey ?? (window.__viewKey ?? window.currentUserKey ?? localStorage.getItem('viewKey') ?? 'M');

    // Champs par utilisateur
    const dJ = (oeuvre.derniereEcouteJ ?? '').toString().trim();
    const dM = (oeuvre.derniereEcouteM ?? '').toString().trim();
    // Ancien champ partagé (pour rétro-compat seulement si J & M sont vides)
    const shared = (oeuvre.derniereEcoute ?? '').toString().trim();

    const perUserEmpty = (!dJ && !dM);
    const hasForKey = (key === 'J') ? dJ : dM;

    const s = (oeuvre.statut || oeuvre.status || '').toLowerCase();
    const doneByStatus = /termin|complet|abandonn/.test(s);

    // 👉 Priorité: champ de l'utilisateur ; sinon (rétro-compat) champ partagé seulement si J & M sont vides
    const seen = hasForKey ? true : (perUserEmpty && !!shared);

    return (seen || doneByStatus) ? 'Visionné ✅' : 'Non commencé';
  }

  return '';
}

/* ================== Cartes ================== */
export function creerCarte(oeuvre, type, currentUserKey) {
  const key = currentUserKey ?? (window.__viewKey ?? window.currentUserKey ?? localStorage.getItem('viewKey') ?? 'M');
  const progression = calculerProgression(oeuvre, type, key);
  const newBadge = isNew(oeuvre.modifieLe) ? '<span class="badge-new">NEW</span>' : '';
  const statut = (oeuvre.statut || oeuvre.status || '').toLowerCase();
  const isTermine = statut.includes('termin') || statut.includes('abandonné');
  const termineBadge = isTermine ? '<span class="badge-finish">Terminé</span>' : '';

  return `
    <div class="oeuvre-card work-card" data-id="${oeuvre.id}" data-type="${type}">
      <div class="img-wrapper">
        ${newBadge}
        ${termineBadge}
        ${renderCoverImg(resolveImageFor(oeuvre), `${oeuvre.title} — couverture`)}

        </div>
      <h3>${oeuvre.title}</h3>
      <p class="progression">${progression}</p>
    </div>`;
}

export function afficherCartes(oeuvres, type, containerId, currentUserKey) {
  const container = document.getElementById(containerId);
  const viewKey =
    (currentUserKey)
    ?? (window.__viewKey ?? window.currentUserKey ?? localStorage.getItem('viewKey') ?? 'M');
  if (!container) return;
  container.innerHTML = oeuvres.map(o => creerCarte(o, type, viewKey)).join('');
  container.querySelectorAll(".oeuvre-card").forEach(card => {
    card.addEventListener("click", () => {
      const id = card.dataset.id;
      const oeuvre = oeuvres.find(o => o.id === id);
      if (oeuvre) afficherPopup(oeuvre, type, viewKey, oeuvres);
    });
  });
}

/* ================== Utilitaires ================== */
function formatDateFr(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${day === '01' ? '1er' : parseInt(day)} ${mois[parseInt(month) - 1]} ${year}`;
}
function isLoggedIn() { return !!window.currentUserUid; }
function unifyStatus(s) {
  const v = (s || '').toString().toLowerCase().trim();
  if (v === 'complet') return 'terminé';
  if (!v) return 'en cours';
  return v;
}
function fourBoxesToDot(a, b, c, d) {
  const clean = v => String(v || '').replace(/[^0-9]/g, '');
  const parts = [clean(a), clean(b), clean(c), clean(d)];
  while (parts.length && !parts.at(-1)) parts.pop();
  return parts.join('.');
}
function dotToFourBoxes(dot) {
  const p = String(dot || '').split('.').slice(0, 4);
  while (p.length < 4) p.push('');
  return p.map(x => x.replace(/[^0-9]/g, ''));
}
const normalize = (s) => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/* ========= Options globales pour Similar/Collection ========= */
let ALL_ITEMS_CACHE = []; // {id,label,search,image}
async function loadGlobalOptionsForPopup() {
  if (ALL_ITEMS_CACHE.length) return ALL_ITEMS_CACHE;
  const cols = ['mangas', 'animes', 'films', 'series', 'novels'];
  const all = [];
  for (const c of cols) {
    try {
      const snap = await getDocs(collection(db, c));
      snap.forEach(d => {
        const data = d.data() || {};
        const title = data.title || d.id;
        const other = Array.isArray(data.otherTitles)
          ? data.otherTitles.filter(Boolean)
          : (typeof data.otherTitles === 'string'
            ? data.otherTitles.split(/[\/,]/).map(x => x.trim()).filter(Boolean)
            : []);
        const type = c.replace(/s$/, '');
        const label = `[${type}] ${title}`;
        const search = normalize([title, ...other, d.id, c].join(' '));
        all.push({ id: d.id, label, search, image: (data.image || '') });
      });
    } catch (e) { /* ignore */ }
  }
  ALL_ITEMS_CACHE = all;
  return all;
}

/* ================== POPUP ================== */
export function afficherPopup(oeuvre, type, currentUserKey, allOeuvres) {
  const viewKey = currentUserKey ?? (window.__viewKey ?? window.currentUserKey ?? localStorage.getItem('viewKey') ?? 'M');
  const popup = document.createElement('div');
  if (!document.getElementById('hidden-field-style')) {
    const style = document.createElement('style');
    style.id = 'hidden-field-style';
    style.textContent = `
    .hidden-field{display:none;}
    .hidden-field.show{display:block;}
  `;
    document.head.appendChild(style);
  }
  popup.className = 'modal-lux';

  // Autres titres → normalisation
  const mainTitle = (oeuvre.title || '').trim();
  const rawOther = oeuvre.otherTitles ?? [];
  const pieces = Array.isArray(rawOther)
    ? rawOther.flatMap(t => String(t).split(/[\/|•·]+/g))
    : String(rawOther).split(/[\/|•·]+/g);
  const autresArr = Array.from(new Set(
    pieces.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
      .filter(s => s.toLowerCase() !== mainTitle.toLowerCase())
  ));
  const autresTitresHtml = autresArr.map(t => `<span class="alt-title">${t}</span>`).join('');

  const description = oeuvre.description || "";
  const genresBadges = (oeuvre.genres || []).map(g => `<span class="badge-genre">${g}</span>`).join('');
  const linksBadges = Object.entries(oeuvre.externalLinks || {}).map(([name, url]) => `<a class="badge-link" href="${url}" target="_blank" rel="noopener noreferrer">${name}</a>`).join('');

  // Formats spéciaux
  const chLusSlash_M = chlusDotToSlash(oeuvre.chLus);
  const chLusSlash_J = chlusDotToSlash(oeuvre.chJade);
  const epSlash_M = duoToSlash(oeuvre.episodeM_vf, oeuvre.episodeM_vost);
  const saSlash_M = duoToSlash(oeuvre.saisonM_vf, oeuvre.saisonM_vost);

  const dernierLecture = (oeuvre.derniereLecture || oeuvre.dernierLecture || '');
  const page = oeuvre.page || '';

  // Similaires
  const manIds = new Set(oeuvre.similaires || []);
  const manItems = (oeuvre.similaires || []).map(id => allOeuvres.find(o => o.id === id)).filter(Boolean);
  const autoItems = autoSimilarFor(oeuvre, allOeuvres, 24).filter(x => !manIds.has(x.id));
  const allSim = [...manItems, ...autoItems];
  const similaires = allSim.map(match => `
  <div class="oeuvre-card mini" data-id="${match.id}" data-type="${type}">
    <div class="img-wrapper">
      ${renderCoverImg(resolveImageFor(match), `${match.title} — couverture`,
    { className: 'cover-img', attrs: imgAttrsFor(resolveImageFor(match)) })}

      </div>
    <h3>${match.title}</h3>
  </div>`).join('');

  // Placeholder Collections
  const collectionsPlaceholder = `
    <div class="modal-section hide-when-edit" id="collections-sec" style="display:none;">
      <div class="collections-wrapper">
        <div class="collections-scroll" id="collections-scroll"></div>
      </div>
    </div>
  `;

  // Mini-infos
  let userInfo = '';
  if (currentUserKey === 'M') {
    if (type === 'mangas' || type === 'novels') {
      userInfo = `<div class="popup-mini-fields hide-when-edit">
         <div><b>Ch total</b><br>${oeuvre.chTotal || '—'}</div>
         <div><b>Date</b><br>${oeuvre.date || '—'}</div>
         <div><b>Ch lus</b><br>${chLusSlash_M || '—'}</div>
         <div><b>Lecture</b><br>${formatDateFr(dernierLecture) || '—'}</div>
       </div>`;
    } else if (type === 'animes' || type === 'series') {
      userInfo = `<div class="popup-mini-fields hide-when-edit">
         <div><b>Ép. total</b><br>${oeuvre.episodeTotal || '—'}</div>
         <div><b>Sais. total</b><br>${oeuvre.saisonTotal || '—'}</div>
         <div><b>Épisodes</b><br>${epSlash_M || '—'}</div>
         <div><b>Saisons</b><br>${saSlash_M || '—'}</div>
       </div>`;
    } else if (type === 'films') {
      userInfo = `<div class="popup-mini-fields hide-when-edit">
         <div><b>Durée</b><br>${oeuvre.duree || '—'}</div>
         <div><b>Date</b><br>${oeuvre.date || '—'}</div>
         <div><b>Visionné</b><br>${oeuvre.derniereEcoute ? formatDateFr(oeuvre.derniereEcoute) : '—'}</div>
         <div><b>&nbsp;</b><br>&nbsp;</div>
       </div>`;
    }
  } else {
    if (type === 'mangas' || type === 'novels') {
      userInfo = `<div class="popup-mini-fields hide-when-edit">
         <div><b>Ch total</b><br>${oeuvre.chTotal || '—'}</div>
         <div><b>Date</b><br>${oeuvre.date || '—'}</div>
         <div><b>Ch lus</b><br>${chLusSlash_J || '—'}</div>
         <div><b>Page</b><br>${page || '—'}</div>
       </div>`;
    } else if (type === 'animes' || type === 'series') {
      const epSlash_J = duoToSlash(oeuvre.episodeJ_vf, oeuvre.episodeJ_vost);
      const saSlash_J = duoToSlash(oeuvre.saisonJ_vf, oeuvre.saisonJ_vost);
      userInfo = `<div class="popup-mini-fields hide-when-edit">
         <div><b>Ép. total</b><br>${oeuvre.episodeTotal || '—'}</div>
         <div><b>Sais. total</b><br>${oeuvre.saisonTotal || '—'}</div>
         <div><b>Épisodes</b><br>${epSlash_J || (oeuvre.episodeJ ?? '—')}</div>
         <div><b>Saisons</b><br>${saSlash_J || (oeuvre.saisonJ ?? '—')}</div>
       </div>`;
    } else if (type === 'films') {
      userInfo = `<div class="popup-mini-fields hide-when-edit">
         <div><b>Durée</b><br>${oeuvre.duree || '—'}</div>
         <div><b>Date</b><br>${oeuvre.date || '—'}</div>
         <div><b>Visionné</b><br>${oeuvre.derniereEcoute ? formatDateFr(oeuvre.derniereEcoute) : '—'}</div>
         <div><b>&nbsp;</b><br>&nbsp;</div>
       </div>`;
    }
  }
  // ==== Helpers d'affichage conditionnel des "petits carrés" ====
  function safeHas(v) {
    return v !== undefined && v !== null && String(v).trim() !== '' && String(v) !== '—';
  }
  function renderHiddenField(role, html, valueToCheck) {
    return safeHas(valueToCheck)
      ? `<div class="hidden-field hide-when-edit" data-role="${role}">${html}</div>`
      : '';
  }
  function renderIdBlock(id) {
    if (!safeHas(id)) return '';
    return `
      <span class="id-badge" onclick="this.nextElementSibling.classList.toggle('show')">ID</span>
      <div class="hidden-field"><span>${id}</span>
        <button class="id-copy" onclick="navigator.clipboard.writeText('${id}')">Copy</button>
      </div>
    `;
  }
  // Construit le contenu des carrés selon qui regarde (M ou J) et le type
  function buildHiddenSquares() {
    const parts = [];

    // --- modif
    if (safeHas(oeuvre.modifieLe)) {
      parts.push(renderHiddenField('modif',
        `Modifié : ${formatDateFrFromAny(oeuvre.modifieLe)}`,
        oeuvre.modifieLe
      ));
    }

    if (currentUserKey === 'M') {
      if (type === 'mangas' || type === 'novels') {
        const chJade = chlusDotToSlash(oeuvre.chJade);
        parts.push(renderHiddenField('J', `<b>Ch.</b> : ${chJade}`, chJade));
        parts.push(renderHiddenField('page', `<b>Page</b> : ${oeuvre.page}`, oeuvre.page));
      } else if (type === 'animes' || type === 'series') {
        const epSlash_J = duoToSlash(oeuvre.episodeJ_vf, oeuvre.episodeJ_vost) || (safeHas(oeuvre.episodeJ) ? oeuvre.episodeJ : '');
        const saSlash_J = duoToSlash(oeuvre.saisonJ_vf, oeuvre.saisonJ_vost) || (safeHas(oeuvre.saisonJ) ? oeuvre.saisonJ : '');
        parts.push(renderHiddenField('J', `<b>Épisodes (J)</b> : ${epSlash_J}`, epSlash_J));
        parts.push(renderHiddenField('J', `<b>Saisons (J)</b> : ${saSlash_J}`, saSlash_J));
      }
    } else {
      if (type === 'mangas' || type === 'novels') {
        parts.push(renderHiddenField('M', `<b>Ch.</b> : ${chLusSlash_M}`, chLusSlash_M));
        const dL = (oeuvre.derniereLecture || oeuvre.dernierLecture || '');
        parts.push(renderHiddenField('lecture', `<b>Dernière lecture (M)</b> : ${formatDateFr(dL)}`, dL));
      } else if (type === 'animes' || type === 'series') {
        const epM = duoToSlash(oeuvre.episodeM_vf, oeuvre.episodeM_vost);
        const saM = duoToSlash(oeuvre.saisonM_vf, oeuvre.saisonM_vost);
        parts.push(renderHiddenField('M', `<b>Épisodes (M)</b> : ${epM}`, epM));
        parts.push(renderHiddenField('M', `<b>Saisons (M)</b> : ${saM}`, saM));
        const dE = oeuvre.derniereEcoute || '';
        parts.push(renderHiddenField('lecture', `<b>Dernière écoute</b> : ${formatDateFr(dE)}`, dE));
      } else if (type === 'films') {
        const dE = oeuvre.derniereEcoute || '';
        parts.push(renderHiddenField('lecture', `<b>Dernière écoute</b> : ${formatDateFr(dE)}`, dE));
      }
    }


    return parts.join('');
  }
  // Masquer les boutons de toggle quand il n'y a rien à montrer
  function computeToggleFlags() {
    const flags = {
      showJ: false,
      showPage: false,
      showM: false,
      showLecture: false,
      showModif: safeHas(oeuvre.modifieLe),
    };

    if (currentUserKey === 'M') {
      if (type === 'mangas' || type === 'novels') {
        const chJade = chlusDotToSlash(oeuvre.chJade);
        flags.showJ = safeHas(chJade);
        flags.showPage = safeHas(oeuvre.page);
      } else if (type === 'animes' || type === 'series') {
        const epJ = duoToSlash(oeuvre.episodeJ_vf, oeuvre.episodeJ_vost) || (safeHas(oeuvre.episodeJ) ? oeuvre.episodeJ : '');
        const saJ = duoToSlash(oeuvre.saisonJ_vf, oeuvre.saisonJ_vost) || (safeHas(oeuvre.saisonJ) ? oeuvre.saisonJ : '');
        flags.showJ = safeHas(epJ) || safeHas(saJ);
        flags.showPage = false; // pas de "page" pertinent ici
      }
    } else {
      if (type === 'mangas' || type === 'novels') {
        flags.showM = safeHas(chLusSlash_M);
        const dL = (oeuvre.derniereLecture || oeuvre.dernierLecture || '');
        flags.showLecture = safeHas(dL);
      } else if (type === 'animes' || type === 'series') {
        const epM = duoToSlash(oeuvre.episodeM_vf, oeuvre.episodeM_vost);
        const saM = duoToSlash(oeuvre.saisonM_vf, oeuvre.saisonM_vost);
        flags.showM = safeHas(epM) || safeHas(saM);
        const dE = oeuvre.derniereEcoute || '';
        flags.showLecture = safeHas(dE);
      } else if (type === 'films') {
        const dE = oeuvre.derniereEcoute || '';
        flags.showLecture = safeHas(dE);
      }
    }
    return flags;
  }

  const statut = (oeuvre.statut || oeuvre.status || '');
  const favKey = `${type}__${oeuvre.id}`;

  const hiddenSquaresHTML = buildHiddenSquares();
  const idBadgeHTML = renderIdBlock(oeuvre.id);

  // juste avant popup.innerHTML = `...`
  const flags = computeToggleFlags();
  const toggleButtonsHTML = (() => {
    const btns = [];
    if (currentUserKey === 'M') {
      if (flags.showJ) btns.push('<span class="toggle-btn" data-target="J">J</span>');
      if (flags.showPage) btns.push('<span class="toggle-btn" data-target="page">📖</span>');
    } else {
      if (flags.showM) btns.push('<span class="toggle-btn" data-target="M">M</span>');
      if (flags.showLecture) btns.push('<span class="toggle-btn" data-target="lecture">📅</span>');
    }
    if (flags.showModif) btns.push('<span class="toggle-btn" data-target="modif">🕓</span>');
    return btns.length ? `<div class="popup-toggle-group hide-when-edit">${btns.join('')}</div>` : '';
  })();

  popup.innerHTML = `
  <div class="modal-content-lux" data-id="${oeuvre.id}" data-type="${type}">
    <button type="button" class="modal-close" aria-label="Fermer" title="Fermer">×</button>

    <div class="modal-scroll">
      <div class="modal-illustration hide-when-edit">
        <img class="img-blur" alt="" aria-hidden="true">
        ${renderCoverImg(resolveImageFor(oeuvre), `${oeuvre.title} — couverture`,
    { className: 'img-main cover-img', attrs: imgAttrsFor(resolveImageFor(oeuvre)) }
  )}
      </div>

      <div class="popup-header hide-when-edit">
        <div class="title-id-row">
          <h2>${oeuvre.title}</h2>
          <button class="fav-toggle" data-fav="${favKey}" title="Ajouter aux favoris">★</button>
          ${idBadgeHTML}
        </div>
      </div>

      ${autresArr.length ? `<div class="popup-titres hide-when-edit">${autresTitresHtml}</div>` : ''}

      <div class="genres-scroll hide-when-edit">${genresBadges}</div>
      ${statut ? `<div class="popup-statut hide-when-edit"><strong>Statut :</strong> ${statut}</div>` : ''}
      ${userInfo}
      <div class="popup-desc hide-when-edit">${description}</div>
      <div class="popup-links hide-when-edit">${linksBadges}</div>

      ${toggleButtonsHTML}

      <!-- ✅ Petits carrés conditionnels (affichés seulement si une valeur existe) -->
      ${hiddenSquaresHTML}

      ${collectionsPlaceholder}
      ${similaires ? `
        <div class="modal-section hide-when-edit">
          <div class="similaires-wrapper">
            <div class="similaires-scroll">
              ${similaires}
            </div>
          </div>
        </div>` : ''}

      <!-- Zone d'édition -->
      <div id="editBox" class="modal-section" style="display:none;"></div>

      ${isLoggedIn() ? `
      <div class="popup-actions bottom" onclick="event.stopPropagation()">
        <button type="button" class="lux-btn-outline" id="editToggleBtn">✎ Modifier</button>
        <button type="button" class="lux-btn-outline danger" id="deleteBtn">Supprimer</button>
        <button type="button" class="lux-btn" id="saveBtn" style="display:none;">Enregistrer</button>
        <button type="button" class="lux-btn-outline" id="cancelBtn" style="display:none;">Annuler</button>
      </div>
      `: ''}
    </div>
  </div>`;


  /* ===== Scrollers horizontaux ===== */
  function enableWheelToHorizontal(el) {
    if (!el) return;
    el.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });
  }
  document.body.appendChild(popup);
  document.body.classList.add('modal-open');
  const scrollers = popup.querySelectorAll('.genres-scroll, .collections-scroll, .similaires-scroll');
  if (window.matchMedia && window.matchMedia('(any-pointer: fine)').matches) {
    scrollers.forEach(enableWheelToHorizontal);
  }
  // === Similaires : 1 ligne par défaut, 2 lignes seulement si la 1re déborde ===
  (function setupSimilairesRows() {
    const scroller = popup.querySelector('.similaires-scroll');
    if (!scroller) return;

    const fit = () => {
      const card = scroller.querySelector('.oeuvre-card.mini');
      if (!card) { scroller.classList.remove('rows-2'); return; }
      const cs = getComputedStyle(scroller);
      const gap = parseFloat(cs.columnGap || cs.gap || 0) || 0;
      const cw = card.getBoundingClientRect().width;
      const cols = Math.max(1, Math.floor((scroller.clientWidth + gap) / (cw + gap)));
      const items = scroller.children.length;
      scroller.classList.toggle('rows-2', items > cols);
    };

    requestAnimationFrame(fit);
    window.addEventListener('resize', fit, { passive: true });
    new MutationObserver(fit).observe(scroller, { childList: true });
  })();

  /* ===== Images ===== */
  const cover = resolveImageFor(oeuvre);
  const imgMain = popup.querySelector('.img-main');
  const imgBlur = popup.querySelector('.img-blur');
  const pre = new Image();
  pre.onload = () => {
    if (imgMain) imgMain.src = pre.src;
    if (imgBlur) imgBlur.src = pre.src;
    const illu = popup.querySelector('.modal-illustration');
    if (illu) {
      const blurPx = Math.min(36, Math.max(18, Math.round(window.innerWidth / 40)));
      illu.style.setProperty('--blur-intensity', blurPx + 'px');
    }
  };
  pre.onerror = () => {
    if (imgMain) window.handleCoverError?.(imgMain);
    if (imgBlur) imgBlur.src = PLACEHOLDER_COVER;
  };
  pre.src = cover;

  /* ===== Fermetures ===== */
  const closeBtn = popup.querySelector('.modal-close');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation(); document.body.classList.remove('modal-open'); popup.remove();
  });
  popup.addEventListener('click', e => {
    if (e.target === popup) { document.body.classList.remove('modal-open'); popup.remove(); }
  });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { document.body.classList.remove('modal-open'); popup.remove(); document.removeEventListener('keydown', onEsc); }
  });

  /* ===== Favoris ===== */
  const favBtn = popup.querySelector('.fav-toggle');
  if (favBtn) {
    isFavorite(favBtn.dataset.fav).then(active => { if (active) favBtn.classList.add('active'); });
    favBtn.addEventListener('click', async () => {
      const becameActive = await toggleFavorite(favBtn.dataset.fav, {
        type, oeuvreId: oeuvre.id, title: oeuvre.title || '', image: oeuvre.image || oeuvre.imageUrl || ''
      });
      favBtn.classList.toggle('active', becameActive);
    });
  }

  /* ===== Toggles d’infos secondaires (affichage) ===== */
  popup.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.onclick = () => {
      const role = btn.dataset.target;
      popup.querySelectorAll(`.hidden-field[data-role="${role}"]`).forEach(el => el.classList.toggle('show'));
    };
  });

  /* ===== Navigation similaires ===== */
  popup.querySelectorAll(".oeuvre-card.mini").forEach(card => {
    card.addEventListener("click", () => {
      popup.remove();
      const id = card.dataset.id;
      const match = allOeuvres.find(o => o.id === id);
      afficherPopup(match, type, currentUserKey, allOeuvres);
    });
  });

  /* ===== Chargement des "Collections" ===== */
  (async function renderCollections() {
    const ids = Array.isArray(oeuvre.collectionDocs) ? [...new Set(oeuvre.collectionDocs)].filter(Boolean) : [];
    if (!ids.length) return;
    const byIdInLocal = new Map(allOeuvres.map(o => [o.id, o]));
    const results = [];
    const cols = ['mangas', 'animes', 'films', 'series', 'novels'];
    for (const id of ids) {
      let found = byIdInLocal.get(id);
      let foundType = found ? type : null;
      if (!found) {
        for (const c of cols) {
          try {
            const snap = await getDoc(doc(db, c, id));
            if (snap.exists()) {
              const data = snap.data() || {};
              found = { id, ...data };
              foundType = c;
              break;
            }
          } catch (e) { /* ignore */ }
        }
      }
      if (found) {
        results.push({ id: found.id, title: found.title || id, image: found.image || '', type: foundType });
      }
    }
    if (!results.length) return;
    const sec = popup.querySelector('#collections-sec');
    const wrap = popup.querySelector('#collections-scroll');
    if (!sec || !wrap) return;
    wrap.innerHTML = results.map(it => `
      <div class="oeuvre-card mini" data-id="${it.id}" data-type="${it.type}">
        <div class="img-wrapper">
          ${renderCoverImg(resolveImageFor(it), `${it.title} — couverture`)}


      </div>
<h3>${it.title}</h3>
      </div>
    `).join('');
    sec.style.display = '';
    wrap.querySelectorAll('.oeuvre-card.mini').forEach(card => {
      card.addEventListener('click', async () => {
        const cid = card.dataset.id;
        const ctype = card.dataset.type;
        if (ctype === type) {
          const match = allOeuvres.find(o => o.id === cid);
          if (match) {
            popup.remove();
            afficherPopup(match, type, currentUserKey, allOeuvres);
          }
          return;
        }
        try {
          const data = await chargerDonneesCategorie(ctype);
          const match = data.find(o => o.id === cid);
          if (match) {
            popup.remove();
            afficherPopup(match, ctype, currentUserKey, data);
          }
        } catch (e) { /* ignore */ }
      });
    });
    enableWheelToHorizontal(wrap);
  })();

  // ==== Helpers Tom Select (pré-sélection + normalisation + valeurs fiables) ====
  function tsEnsureItems(ts, values = [], makeOptionLabel = (v) => v) {
    if (!ts) return;
    const arr = Array.isArray(values) ? values : [values];
    arr.forEach(v => {
      const val = String(v).trim();
      if (!val) return;
      if (!ts.options[val]) {
        ts.addOption({ value: val, label: makeOptionLabel(val), search: val, image: '' });
      }
      ts.addItem(val, true);
    });
  }
  function normTS(s) {
    return (s || '').toString().toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function tsGetValues(ts) {
    if (!ts) return [];
    const v = ts.getValue();
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
      const delim = ts.settings?.delimiter ?? ',';
      return v ? v.split(delim).map(s => s.trim()).filter(Boolean) : [];
    }
    return [];
  }

  /* ================== ÉDITION ================== */
  const editBox = popup.querySelector('#editBox');
  const editBtn = popup.querySelector('#editToggleBtn');
  const saveBtn = popup.querySelector('#saveBtn');
  const cancelBtn = popup.querySelector('#cancelBtn');
  const delBtn = popup.querySelector('#deleteBtn');

  let editOpen = false;

  function hideNonEdit(hide) {
    popup.querySelectorAll('.hide-when-edit').forEach(el => {
      el.style.display = hide ? 'none' : '';
    });
  }

  function chlusMegane4Row(values = ['', '', '', '']) {
    const [vFR, vTR, vEN, vOT] = values;
    return `
      <div class="form-group col-6" data-role="M">
        <label class="chlus-label">Chapitres lus (M)</label>
        <div class="chlus-field">
          <input type="number" name="chLus_fr"    class="chlus-part" placeholder="FR"     inputmode="numeric" pattern="[0-9]*" value="${vFR}">
          <input type="number" name="chLus_trfr"  class="chlus-part" placeholder="TR-FR"  inputmode="numeric" pattern="[0-9]*" value="${vTR}">
          <input type="number" name="chLus_en"    class="chlus-part" placeholder="EN"     inputmode="numeric" pattern="[0-9]*" value="${vEN}">
          <input type="number" name="chLus_other" class="chlus-part" placeholder="Autre"  inputmode="numeric" pattern="[0-9]*" value="${vOT}">
        </div>
      </div>`;
  }
  function duoMegane(label, baseName, vals = ['', '']) {
    const [vf, vost] = vals;
    return `
      <div class="form-group col-6" data-role="M">
        <label class="chlus-label">${label}</label>
        <div class="duo-field">
          <input type="number" name="${baseName}_vf"   class="duo-part" placeholder="VF"     inputmode="numeric" pattern="[0-9]*" value="${vf}">
          <input type="number" name="${baseName}_vost" class="duo-part" placeholder="VOSTFR" inputmode="numeric" pattern="[0-9]*" value="${vost}">
        </div>
      </div>`;
  }

  function genresFor(cat) {
    if (cat === 'mangas') return genresMangas;
    if (cat === 'animes') return genresAnimes;
    if (cat === 'films') return genresFilms;
    if (cat === 'series') return genresSeries;
    if (cat === 'novels') return genresNovels;
    return [];
  }

  const DROPDOWN_PARENT = popup;

  async function renderEditForm() {
    if (!editBox) return;
    await loadGlobalOptionsForPopup();

    const statutPossibles = ["en cours", "pause", "terminé", "abandonné"];

    const otherTitlesSlash = Array.isArray(oeuvre.otherTitles)
      ? oeuvre.otherTitles.filter(Boolean).join(' / ')
      : String(oeuvre.otherTitles || '').split('/').map(s => s.trim()).filter(Boolean).join(' / ');

    const [FR, TR, EN, OT] = dotToFourBoxes(oeuvre.chLus);
    const epValsM = [oeuvre.episodeM_vf ?? '', oeuvre.episodeM_vost ?? ''];
    const saValsM = [oeuvre.saisonM_vf ?? '', oeuvre.saisonM_vost ?? ''];

    editBox.innerHTML = `
      <form id="editForm" class="lux-form">
        <div class="form-grid">
          <div class="form-group full" data-role="ALL">
            <input type="text" name="title" placeholder="Titre" required value="${oeuvre.title || ''}">
          </div>
          <div class="form-group full" data-role="ALL">
            <textarea name="otherTitles" placeholder="Autres titres (séparés par /)" rows="2">${otherTitlesSlash}</textarea>
          </div>

          <div class="form-group" data-role="ALL">
            <input type="url" name="image" placeholder="Image (URL)" value="${oeuvre.image || ''}">
          </div>
          <div class="form-group" data-role="ALL">
            <select name="status">
              ${statutPossibles.map(s => `<option value="${s}" ${unifyStatus(oeuvre.statut || oeuvre.status) === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>

          <div class="form-group full" data-role="ALL">
            <textarea name="description" placeholder="Description" rows="3">${oeuvre.description || ''}</textarea>
          </div>

          ${(type === 'mangas' || type === 'novels') ? `
            <div class="form-group" data-role="ALL">
              <input type="text" name="chTotal" placeholder="Chapitres total" value="${oeuvre.chTotal ?? ''}">
            </div>
          ` : ''}

          ${(type === 'animes' || type === 'series') ? `
            <div class="form-group" data-role="ALL">
              <input type="text" name="episodeTotal" placeholder="Épisodes total" value="${oeuvre.episodeTotal ?? ''}">
            </div>
            <div class="form-group" data-role="ALL">
              <input type="text" name="saisonTotal" placeholder="Saisons total" value="${oeuvre.saisonTotal ?? ''}">
            </div>
          ` : ''}

          <div class="form-group" data-role="ALL">
            <input type="text" name="date" placeholder="Date" value="${oeuvre.date || ''}">
          </div>
          ${(type === 'films' || type === 'animes' || type === 'series') ? `
            <div class="form-group" data-role="ALL">
              <input type="date" name="derniereEcoute" placeholder="Dernière écoute" value="${oeuvre.derniereEcoute || ''}">
            </div>
          ` : ''}

          ${(currentUserKey === 'M' && (type === 'mangas' || type === 'novels')) ? `
            ${chlusMegane4Row([FR, TR, EN, OT])}
            <div class="form-group" data-role="M">
              <input type="date" name="derniereLecture" placeholder="Dernière lecture (M)" value="${oeuvre.derniereLecture || oeuvre.dernierLecture || ''}">
            </div>
          ` : ''}

          ${(currentUserKey !== 'M' && (type === 'mangas' || type === 'novels')) ? `
            <div class="form-group" data-role="J">
              <input type="text" name="chJade" placeholder="Chapitres (Jade) ex: 12.34" value="${oeuvre.chJade || ''}">
            </div>
            <div class="form-group" data-role="J">
              <input type="text" name="page" placeholder="Page (Jade)" value="${oeuvre.page ?? ''}">
            </div>
          ` : ''}

          ${(currentUserKey === 'M' && (type === 'animes' || type === 'series')) ? `
            ${duoMegane('Épisodes (toi)', 'episodeM', epValsM)}
            ${duoMegane('Saisons (toi)', 'saisonM', saValsM)}
          ` : ''}

          ${(currentUserKey !== 'M' && (type === 'animes' || type === 'series')) ? `
            <div class="form-group" data-role="J">
              <input type="text" name="episodeJ" placeholder="Épisodes (J)" value="${oeuvre.episodeJ ?? ''}">
            </div>
            <div class="form-group" data-role="J">
              <input type="text" name="saisonJ" placeholder="Saisons (J)" value="${oeuvre.saisonJ ?? ''}">
            </div>
          ` : ''}

          <!-- Genres -->
          <div class="form-group full" data-role="ALL">
            <select id="edit-genreSelect" name="genres" multiple placeholder="Choisir les genres..."></select>
          </div>

          <!-- Similaires -->
          <div class="form-group full" data-role="ALL">
            <input type="text" id="edit-similar" name="similaires" placeholder="Similaires : recherche par titre / autre titre ou saisir un ID">
          </div>

          <!-- CollectionDocs -->
          <div class="form-group full" data-role="ALL">
            <input type="text" id="edit-collection" name="collection" placeholder="Collection (ajoute des œuvres liées)">
          </div>

          <!-- Liens externes -->
          <div class="form-group full" data-role="ALL">
            <label class="form-label">Liens externes</label>
            <div id="linksBox" class="link-flex"></div>
            <button type="button" class="lux-btn-outline" id="addLinkRow">+ Ajouter un lien</button>
          </div>
        </div>
      </form>
    `;

    // ===== Genres (TomSelect)
    try {
      const node = editBox.querySelector('#edit-genreSelect');
      const ts = new TomSelect(node, {
        options: genresFor(type).map(g => ({ value: g, text: g })),
        items: (oeuvre.genres || []),
        plugins: ['remove_button'],
        persist: false,
        create: false,
        hideSelected: true,
        maxOptions: 500,
        dropdownParent: document.body,   // déjà présent, on garde
        openOnFocus: true,
        searchField: ['text'],
        render: { option: (d, esc) => `<span class="ts-opt-label">${esc(d.text)}</span>` }
      });

      (oeuvre.genres || []).forEach(v => {
        if (!ts.options[v]) ts.addOption({ value: v, text: v });
        ts.addItem(v, true);
      });

      // ✅ Ouvre & recalcule la position à chaque interaction utile
      const openAndPos = () => {
        try { ts.refreshOptions(false); ts.open(); ts.positionDropdown(); } catch { }
      };
      ['focus', 'mousedown', 'pointerdown', 'touchend', 'keydown'].forEach(ev => {
        node.addEventListener(ev, openAndPos, { passive: true });
      });

      // ✅ z-index de sécurité
      try { ts.dropdown?.style?.setProperty('z-index', '10050'); } catch { }

      // ✅ Au cas où l’édition vient d’être montrée: ouvre/repositionne après le rendu
      setTimeout(openAndPos, 0);
    } catch { }



    // ===== Similar (TomSelect)
    try {
      const sim = editBox.querySelector('#edit-similar');
      const similarSelect = new TomSelect(sim, {
        options: ALL_ITEMS_CACHE.map(x => ({
          id: x.id,
          label: x.label,
          search: x.search,
          image: x.image || ''
        })),
        valueField: 'id',
        labelField: 'label',
        searchField: ['search', 'label'],
        plugins: ['remove_button'],
        hideSelected: true,
        maxOptions: 250,
        maxItems: 30,
        persist: false,
        dropdownParent: document.body,
        openOnFocus: true,
        create: (input) => {
          const v = (input || '').trim(); if (!v) return null;
          return { id: v, label: `(ID manuel) ${v}`, search: normalize(v), image: '' };
        },
        render: {
          option: (d, escape) => {
            const img = d.image
              ? `<img class="ts-thumb cover-img"
               src="${escape(d.image)}" alt=""
               loading="lazy" decoding="async"
               onerror="handleCoverError(this)">`
              : `<span class="ts-thumb noimg"></span>`;
            return `<div class="ts-opt media">${img}<div class="ts-lines"><div class="ts-title">${escape(d.label)}</div><div class="ts-sub">${escape(d.id)}</div></div></div>`;
          },
          item: (d, escape) => `<div>${escape(d.label)}</div>`
        }
      });
      (oeuvre.similaires || []).forEach(v => {
        if (!similarSelect.options[v]) {
          similarSelect.addOption({ id: v, label: `(ID) ${v}`, search: normalize(v), image: '' });
        }
        similarSelect.addItem(v, true);
      });
      ['focus', 'mousedown', 'pointerdown', 'touchend'].forEach(ev => {
        sim.addEventListener(ev, () => { similarSelect.refreshOptions(false); similarSelect.open(); }, { passive: true });
      });
      try { similarSelect.dropdown?.style?.setProperty('z-index', '10005'); } catch { }
    } catch { }

    // ===== CollectionDocs (TomSelect)
    try {
      const collInput = editBox.querySelector('#edit-collection');
      const collectionDocsSelect = new TomSelect(collInput, {
        options: ALL_ITEMS_CACHE.map(x => ({
          id: x.id,
          label: x.label,
          search: x.search,
          image: x.image || ''
        })),
        valueField: 'id',
        labelField: 'label',
        searchField: ['search', 'label'],
        plugins: ['remove_button'],
        hideSelected: true,
        maxItems: null,
        persist: false,
        dropdownParent: document.body,
        openOnFocus: true,
        create: (input) => {
          const v = (input || '').trim(); if (!v) return null;
          return { id: v, label: `(ID manuel) ${v}`, search: normalize(v), image: '' };
        },
        render: {
          option: (d, escape) => {
            const img = d.image
              ? `<img class="ts-thumb cover-img"
               src="${escape(d.image)}" alt=""
               loading="lazy" decoding="async"
               onerror="handleCoverError(this)">`
              : `<span class="ts-thumb noimg"></span>`;
            return `<div class="ts-opt media">${img}<div class="ts-lines"><div class="ts-title">${escape(d.label)}</div><div class="ts-sub">${escape(d.id)}</div></div></div>`;
          },
          item: (d, escape) => `<div>${escape(d.label)}</div>`
        },
        placeholder: 'Collection (ajoute des œuvres liées)'
      });
      (oeuvre.collectionDocs || []).forEach(v => {
        if (!collectionDocsSelect.options[v]) {
          collectionDocsSelect.addOption({ id: v, label: `(ID) ${v}`, search: normalize(v), image: '' });
        }
        collectionDocsSelect.addItem(v, true);
      });
      ['focus', 'mousedown', 'pointerdown', 'touchend'].forEach(ev => {
        collInput.addEventListener(ev, () => { collectionDocsSelect.refreshOptions(false); collectionDocsSelect.open(); }, { passive: true });
      });
      try { collectionDocsSelect.dropdown?.style?.setProperty('z-index', '10005'); } catch { }
    } catch { }

    // ===== Liens externes =====
    const linksBox = editBox.querySelector('#linksBox');
    function addLinkRow(name = '', url = '') {
      const row = document.createElement('div');
      row.className = 'link-pair-row';
      row.innerHTML = `
        <input type="text" name="linkName" placeholder="Nom du site" value="${name}">
        <input type="url"  name="linkUrl"  placeholder="https://..." value="${url}">
        <button type="button" class="link-del" title="Supprimer" aria-label="Supprimer">×</button>
      `;
      row.querySelector('.link-del')?.addEventListener('click', () => row.remove());
      linksBox.appendChild(row);
    }
    const entries = Object.entries(oeuvre.externalLinks || {});
    if (entries.length) { entries.forEach(([n, u]) => addLinkRow(n, u)); } else { addLinkRow(); }
    editBox.querySelector('#addLinkRow')?.addEventListener('click', () => addLinkRow());

    // ===== Raccourcis chLus ("/") Megane
    if (currentUserKey === 'M' && (type === 'mangas' || type === 'novels')) {
      const fr = editBox.querySelector('input[name="chLus_fr"]');
      const tr = editBox.querySelector('input[name="chLus_trfr"]');
      const en = editBox.querySelector('input[name="chLus_en"]');
      const ot = editBox.querySelector('input[name="chLus_other"]');
      const parts = [fr, tr, en, ot].filter(Boolean);
      fr?.addEventListener('input', e => {
        const v = e.target.value;
        if (v.includes('/')) {
          const p = String(v).split('/').slice(0, 4); while (p.length < 4) p.push('');
          [fr.value, tr.value, en.value, ot.value] = p.map(x => x.replace(/[^0-9]/g, ''));
        }
      });
      parts.forEach((inp, i, arr) => {
        inp.addEventListener('keydown', ev => {
          if (ev.key === '/') { ev.preventDefault(); (arr[i + 1] || arr[i])?.focus(); }
          if (ev.key === 'Backspace' && !inp.value && i > 0) { ev.preventDefault(); (arr[i - 1])?.focus(); }
        });
      });
    }

    // ===== Duo VF/VOST ("/")
    if (currentUserKey === 'M' && (type === 'animes' || type === 'series')) {
      [['episodeM_vf', 'episodeM_vost'], ['saisonM_vf', 'saisonM_vost']].forEach(([a, b]) => {
        const A = editBox.querySelector(`input[name="${a}"]`);
        const B = editBox.querySelector(`input[name="${b}"]`);
        [A, B].filter(Boolean).forEach((inp, idx, arr) => {
          inp.addEventListener('keydown', e => {
            if (e.key === '/') { e.preventDefault(); arr[idx ^ 1]?.focus(); }
            if (e.key === 'Backspace' && !inp.value && idx === 1) { e.preventDefault(); arr[0]?.focus(); }
          });
        });
      });
    }
  }

  function toggleEdit(open) {
    const want = (open === undefined) ? !editOpen : !!open;
    editOpen = want && isLoggedIn();
    if (!editOpen) {
      hideNonEdit(false);
      editBox && (editBox.style.display = 'none');
      saveBtn && (saveBtn.style.display = 'none');
      cancelBtn && (cancelBtn.style.display = 'none');
      editBtn && (editBtn.textContent = '✎ Modifier');
      return;
    }
    hideNonEdit(true);
    editBox && (editBox.style.display = '');   // visible AVANT init TomSelect
    saveBtn && (saveBtn.style.display = '');
    cancelBtn && (cancelBtn.style.display = '');
    editBtn && (editBtn.textContent = '⏸ Édition');
    renderEditForm();                        // init TomSelect maintenant que c’est visible
    editBox?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Après renderEditForm();
    setTimeout(() => {
      editBox.querySelectorAll('select').forEach(sel => {
        const ts = sel.tomselect;
        if (ts) { try { ts.refreshOptions(false); ts.positionDropdown(); } catch { } }
      });
    }, 0);

  }

  editBtn?.addEventListener('click', () => toggleEdit());
  cancelBtn?.addEventListener('click', () => toggleEdit(false));

  saveBtn?.addEventListener('click', async () => {
    const form = editBox?.querySelector('#editForm'); if (!form) return;
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());

    const statutUnifie = unifyStatus(data.status || oeuvre.statut || oeuvre.status);

    const payload = {
      title: (data.title || '').trim(),
      image: (data.image || '').trim(),
      description: (data.description || '').trim(),
      statut: statutUnifie,
      date: (data.date || '').trim()
    };

    // Genres
    try {
      const ts = editBox.querySelector('#edit-genreSelect')?.tomselect;
      payload.genres = ts ? tsGetValues(ts) : (oeuvre.genres || []);
    } catch { payload.genres = (oeuvre.genres || []); }

    // Autres titres
    payload.otherTitles = String(data.otherTitles || '').split('/').map(t => t.trim()).filter(Boolean);

    // Liens externes
    const names = Array.from(form.querySelectorAll('input[name="linkName"]')).map(i => i.value.trim());
    const urls = Array.from(form.querySelectorAll('input[name="linkUrl"]')).map(i => i.value.trim());
    const linksObj = {};
    for (let i = 0; i < Math.max(names.length, urls.length); i++) {
      const n = names[i]; const u = urls[i];
      if (n && u) linksObj[n] = u;
    }
    payload.externalLinks = linksObj;

    // Totaux + champs M/J
    if (type === 'mangas' || type === 'novels') {
      if (data.chTotal !== undefined) payload.chTotal = Number(String(data.chTotal).replace(/[^0-9]/g, '')) || 0;
      if (currentUserKey === 'M') {
        const dot = fourBoxesToDot(data.chLus_fr, data.chLus_trfr, data.chLus_en, data.chLus_other);
        payload.chLus = dot || '';
        payload.derniereLecture = (data.derniereLecture || '').trim();
      } else {
        payload.chJade = (data.chJade || '').trim();
        payload.page = (data.page || '').trim();
      }
    }

    if (type === 'animes' || type === 'series') {
      const toNum = (v) => Number(String(v || '').replace(/[^0-9]/g, '')) || 0;
      if (data.episodeTotal !== undefined) payload.episodeTotal = toNum(data.episodeTotal);
      if (data.saisonTotal !== undefined) payload.saisonTotal = toNum(data.saisonTotal);
      if (data.derniereEcoute !== undefined) payload.derniereEcoute = (data.derniereEcoute || '').trim();

      if (currentUserKey === 'M') {
        payload.episodeM_vf = data.episodeM_vf === '' ? '' : toNum(data.episodeM_vf);
        payload.episodeM_vost = data.episodeM_vost === '' ? '' : toNum(data.episodeM_vost);
        payload.saisonM_vf = data.saisonM_vf === '' ? '' : toNum(data.saisonM_vf);
        payload.saisonM_vost = data.saisonM_vost === '' ? '' : toNum(data.saisonM_vost);
      } else {
        payload.episodeJ = (data.episodeJ || '').trim();
        payload.saisonJ = (data.saisonJ || '').trim();
      }
    }

    // Similaires & CollectionDocs
    const safeGetTS = sel => editBox.querySelector(sel)?.tomselect;
    try {
      const simTS = safeGetTS('#edit-similar');
      payload.similaires = simTS ? [...new Set(tsGetValues(simTS))] : (oeuvre.similaires || []);
    } catch { payload.similaires = oeuvre.similaires || []; }

    try {
      const colTS = safeGetTS('#edit-collection');
      payload.collectionDocs = colTS ? [...new Set(tsGetValues(colTS))] : (oeuvre.collectionDocs || []);
    } catch { payload.collectionDocs = oeuvre.collectionDocs || []; }

    payload.modifieLe = serverTimestamp();

    // — Harmonisation avant écriture —
    if (payload.anilistId != null) payload.anilistId = Number(payload.anilistId);
    if (payload.status && !payload.statut) { payload.statut = payload.status; delete payload.status; }

    // rétro-compat 'dernierLecture' -> 'derniereLecture'
    if (payload.dernierLecture && !payload.derniereLecture) {
      payload.derniereLecture = payload.dernierLecture;
      delete payload.dernierLecture;
    }

    try {
      await setDoc(doc(db, type, oeuvre.id), payload, { merge: true });
      let fresh = null;
      try {
        const snap = await getDoc(doc(db, type, oeuvre.id));
        if (snap.exists()) fresh = { id: oeuvre.id, ...snap.data() };
      } catch { }

      const updated = fresh || { ...oeuvre, ...payload };

      alert('✅ Modifié');
      document.body.classList.remove('modal-open');
      popup.remove();
      afficherPopup(updated, type, currentUserKey, allOeuvres);

    } catch (e) {
      console.error(e);
      alert('❌ Échec de sauvegarde');
    }
  });

  delBtn?.addEventListener('click', async () => {
    if (!confirm(`Supprimer définitivement « ${oeuvre.title || oeuvre.id} » ?`)) return;
    try {
      await deleteDoc(doc(db, type, oeuvre.id));
      alert('Supprimé');
      document.body.classList.remove('modal-open');
      popup.remove();
      const card = document.querySelector(`.oeuvre-card[data-id="${oeuvre.id}"][data-type="${type}"]`);
      card?.remove();
    } catch (e) {
      console.error(e);
      alert('❌ Échec de suppression');
    }
  });
}

// === Réparation de cover en lot (console) ===
function isImageOk(url) {
  return new Promise(resolve => {
    if (!url) { resolve(false); return; }
    const t = setTimeout(() => resolve(false), 6000);
    const i = new Image();
    i.onload = () => { clearTimeout(t); resolve(true); };
    i.onerror = () => { clearTimeout(t); resolve(false); };
    i.src = url;
  });
}

async function _repairCoverForCollection(colName, limit = 150) {
  const snap = await getDocs(collection(db, colName));
  let seen = 0, fixed = 0;

  for (const d of snap.docs) {
    if (seen >= limit) break;
    seen++;

    const data = d.data() || {};
    const url = data.image || '';
    const ok = await isImageOk(url);

    if (!ok) {
      const mediaType = guessMediaTypeByCol(colName);
      let media = null;

      if (data.anilistId) {
        media = await anilistLookup({ id: Number(data.anilistId), mediaType });
      }
      if (!media) {
        const q = cleanupBaseTitle(data.title || d.id);
        if (q) media = await anilistLookup({ search: q, mediaType });
      }
      if (!media && (data.otherTitles?.length)) {
        for (const alt of (Array.isArray(data.otherTitles) ? data.otherTitles : [data.otherTitles])) {
          const q = cleanupBaseTitle(alt);
          media = await anilistLookup({ search: q, mediaType });
          if (media) break;
        }
      }
      if (!media && data.title) {
        const mal = await searchJikanMalId(cleanupBaseTitle(data.title), mediaType);
        const alid = await getAniListIdFromMalId(mal);
        if (alid) media = await anilistLookup({ id: alid, mediaType });
      }

      const cover = media?.coverImage?.extraLarge || media?.coverImage?.large || media?.coverImage?.medium || '';
      if (cover) {
        await setDoc(doc(db, colName, d.id), { image: cover, cover: cover, anilistId: media.id }, { merge: true });
        fixed++;
      }
      await new Promise(r => setTimeout(r, 120)); // respirer un peu
    }
  }
  console.log(`✔ ${colName}: ${fixed}/${seen} réparés (limite ${limit})`);
}

window.repairAllCover = async function (cols = ['mangas', 'animes', 'series', 'films', 'novels'], limitPerCol = 150) {
  for (const c of cols) { await _repairCoverForCollection(c, limitPerCol); }
  alert('Réparation des covers terminée — voir la console pour le détail.');
};


