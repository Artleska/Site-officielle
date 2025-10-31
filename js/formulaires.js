import { db } from './firebaseConfig.js';
import { collection, setDoc, doc, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { genresMangas } from './mangas.js';
import { genresAnimes } from './animes.js';
import { genresFilms } from './films.js';
import { genresSeries } from './series.js';
import { genresNovels } from './novels.js';
import { slugifyTitle } from './textUtils.js';
import { cleanupBaseTitle, findBestAniListIdFromDoc } from './anilistUtils.js';

// petit helper pour respirer entre les requêtes
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const statutPossibles = ["en cours", "pause", "terminé", "abandonné"];

/* ===== Options globales (Similaires / CollectionDocs) ===== */
const normalize = (s) => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

let ALL_ITEMS_CACHE = []; // {id,label,search,image}
async function loadGlobalOptions() {
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
            ? data.otherTitles.split(/[\/,]/).map(x => x.trim()).filter(Boolean) // fallback anciens docs
            : []);
        const type = c.replace(/s$/, '');
        const label = `[${type}] ${title}`;
        const search = normalize([title, ...other, d.id, c].join(' '));
        all.push({ id: d.id, label, search, image: (data.image || '') });
      });
    } catch (e) { console.warn('⚠️ lecture Firestore impossible pour', c, e); }
  }
  ALL_ITEMS_CACHE = all;
}

function normalizeLoose(s) {
  return (s || '').toString()
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/’/g, "'")
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function similarityScore(a, b) {
  a = normalizeLoose(a); b = normalizeLoose(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const aw = new Set(a.split(/\s+/)); const bw = new Set(b.split(/\s+/));
  const inter = [...aw].filter(x => bw.has(x)).length;
  const union = new Set([...aw, ...bw]).size;
  return inter / (union || 1);
}

function guessMediaType(cat) { return (cat === 'mangas' || cat === 'novels') ? 'MANGA' : 'ANIME'; }
function extractAniListId(v) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/anilist\.co\/(anime|manga)\/(\d+)/i);
  if (m) return parseInt(m[2], 10);
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return null;
}

/* ================= helpers UI ================= */
function champ(label, name, required = false, type = "text", full = false, role = "ALL") {
  return `<div class="form-group ${full ? 'full' : ''}" data-role="${role}">
    <input type="${type}" name="${name}" placeholder="${label}" ${required ? 'required' : ''}>
  </div>`;
}
function textarea(label, name, role = "ALL") {
  return `<div class="form-group full" data-role="${role}">
    <textarea name="${name}" placeholder="${label}" rows="3"></textarea>
  </div>`;
}
function selectStatut(role = "ALL") {
  return `<div class="form-group" data-role="${role}">
    <select name="status">
      ${statutPossibles.map(s => `<option value="${s}">${s}</option>`).join('')}
    </select>
  </div>`;
}

// --- Bloc spécial : 4 petites cases pour chLus (Megane) ---
function chlusMegane4() {
  return `
  <div class="form-group col-6" data-role="M">
    <label class="chlus-label">Chapitres lus (M)</label>
    <div class="chlus-field">
      <input type="number" name="chLus_fr"     class="chlus-part" placeholder="FR"     inputmode="numeric">
      <input type="number" name="chLus_trfr"   class="chlus-part" placeholder="TR-FR"  inputmode="numeric">
      <input type="number" name="chLus_en"     class="chlus-part" placeholder="EN"     inputmode="numeric">
      <input type="number" name="chLus_other"  class="chlus-part" placeholder="Autre"  inputmode="numeric">
    </div>
  </div>`;
}

// --- Bloc 2 cases VF/VOSTFR (Anime - Megane) ---
function duoMegane(label, baseName) {
  // baseName = "episodeM" ou "saisonM"
  return `
  <div class="form-group col-6" data-role="M">
    <label class="chlus-label">${label}</label>
    <div class="duo-field">
      <input type="number" name="${baseName}_vf"   class="duo-part" placeholder="VF"     inputmode="numeric">
      <input type="number" name="${baseName}_vost" class="duo-part" placeholder="VOSTFR" inputmode="numeric">
    </div>
  </div>`;
}

/* ================= Formulaires dynamiques ================= */
function createForm(formId, genres, collectionName, fields) {
  const container = document.getElementById(formId);
  if (!container) return;

  const genreSelectId = `${formId}-genreSelect`;
  const linkContainerId = `${formId}-linksContainer`;

  const formHtml = `
    <form class="lux-form">
      <div class="form-grid">
        ${fields.join('')}

        <!-- Genres (full) -->
        <div class="form-group full">
          <select id="${genreSelectId}" name="genres" multiple placeholder="Choisir les genres..."></select>
        </div>

        <!-- Similaires (full) -->
        <div class="form-group full">
          <input type="text" id="${formId}-similar" name="similaires" placeholder="Similaires : recherche par titre / autre titre ou saisir un ID">
        </div>

        <div class="form-group full">
          <div id="${linkContainerId}" class="link-flex"></div>
          <button type="button" class="lux-btn-outline" id="${formId}-addLink">+ Ajouter un lien</button>
        </div>

        <div class="form-group full">
          <button type="submit" class="lux-btn">Ajouter</button>
        </div>

        
      </div>
    </form>`;

  container.innerHTML = formHtml;

  /* Genres */
  const genreSelect = new TomSelect(`#${genreSelectId}`, {
    options: genres.map(g => ({ value: g, text: g })),
    plugins: ['remove_button'],
    persist: false,
    create: false,
    maxOptions: 500,
    dropdownParent: document.body,
    openOnFocus: true
  });
  // ouvre/rafraîchit même si l’onglet vient d’être rendu
  const node = document.getElementById(genreSelectId);
  ['focus', 'mousedown', 'pointerdown', 'touchend', 'keydown'].forEach(ev => {
    node.addEventListener(ev, () => {
      try {
        genreSelect.refreshOptions(false);
        genreSelect.open();
        // IMPORTANT : assure le bon placement sous le champ
        if (typeof genreSelect.positionDropdown === 'function') genreSelect.positionDropdown();
      } catch { }
    }, { passive: true });
  });
  /* Collection -> multi d’œuvres (stocké dans payload.collectionDocs) */
  const collectionInput = container.querySelector('input[name="collection"]');
  let collectionDocsSelect = null;
  if (collectionInput) {
    const collGrp = collectionInput.closest('.form-group');
    if (collGrp) collGrp.classList.add('full'); // pleine largeur

    collectionDocsSelect = new TomSelect(collectionInput, {
      options: ALL_ITEMS_CACHE.map(x => ({
        id: x.id, label: x.label, search: x.search, image: x.image || ''
      })),
      valueField: 'id',
      labelField: 'label',
      searchField: ['search'],
      plugins: ['remove_button'],
      maxItems: null,
      persist: false,
      create: (input) => {
        const v = (input || '').trim();
        if (!v) return null;
        return { id: v, label: `(ID manuel) ${v}`, search: normalize(v), image: '' };
      },
      render: {
        option: (data, escape) => {
          const img = data.image
            ? `<img class="ts-thumb" src="${escape(data.image)}" alt="">`
            : `<span class="ts-thumb noimg"></span>`;
          return `<div class="ts-opt media">
                    ${img}
                    <div class="ts-lines">
                      <div class="ts-title">${escape(data.label)}</div>
                    </div>
                  </div>`;
        },
        item: (data, escape) => `<div>${escape(data.label)}</div>`
      },
      placeholder: 'Collection (ajoute des œuvres liées)'
    });

    // Ordonner : Genres AU‑DESSUS de Collection (Collection juste après Genres)
    const genresGrp = container.querySelector(`#${genreSelectId}`)?.closest('.form-group');
    if (genresGrp && collGrp && genresGrp.parentNode) {
      genresGrp.insertAdjacentElement('afterend', collGrp);
    }
  }

  /* Similaires */
  const simInput = container.querySelector(`#${formId}-similar`);
  const similarSelect = new TomSelect(simInput, {
    options: ALL_ITEMS_CACHE.map(x => ({ id: x.id, label: x.label, search: x.search, image: x.image || '' })),
    valueField: 'id',
    labelField: 'label',
    searchField: ['search'],
    maxOptions: 250,
    maxItems: 30,
    persist: false,
    create: (input) => {
      const v = (input || '').trim();
      if (!v) return null;
      return { id: v, label: `(ID manuel) ${v}`, search: normalize(v), image: '' };
    },
    render: {
      option: (data, escape) => {
        const img = data.image ? `<img class="ts-thumb" src="${escape(data.image)}" alt="">` : `<span class="ts-thumb noimg"></span>`;
        return `<div class="ts-opt media">${img}<div class="ts-lines"><div class="ts-title">${escape(data.label)}</div></div></div>`;
      },
      item: (data, escape) => `<div>${escape(data.label)}</div>`
    }
  });

  /* Bouton liens externes */
  document.getElementById(`${formId}-addLink`).addEventListener("click", () => {
    const linkContainer = document.getElementById(linkContainerId);
    const div = document.createElement("div");
    div.className = "link-pair-row";
    div.innerHTML = `
      <input type="text" placeholder="Nom du site">
      <input type="url" placeholder="Lien URL">`;
    linkContainer.appendChild(div);
  });

  /* === COMPORTEMENT SPÉCIAL : Manga -> chLus (4 cases + raccourci "/") === */
  if (formId === 'mangaForm') {
    // Remplace le champ "Chapitres lus (M)" simple par notre bloc 4 cases
    const host = container.querySelector('[data-role="M"] input[name="chLus"]')?.closest('.form-group');
    if (host) host.outerHTML = chlusMegane4();

    // Détection du raccourci avec "/"
    const fr = container.querySelector('input[name="chLus_fr"]');
    const tr = container.querySelector('input[name="chLus_trfr"]');
    const en = container.querySelector('input[name="chLus_en"]');
    const ot = container.querySelector('input[name="chLus_other"]');

    function spreadShortcut(val) {
      // exemples acceptés: "34/53/56/78" | "34//56" | "/53" | "///78"
      const parts = String(val || '').split('/').slice(0, 4);
      while (parts.length < 4) parts.push('');
      const [p1, p2, p3, p4] = parts.map(x => x.replace(/[^0-9]/g, ''));
      fr.value = p1 || '';
      tr.value = p2 || '';
      en.value = p3 || '';
      ot.value = p4 || '';
    }
    fr?.addEventListener('input', (e) => {
      const v = e.target.value;
      if (v.includes('/')) {
        spreadShortcut(v);
      }
    });

    // Navigation avec "/" et Backspace entre les 4 cases
    const parts = [fr, tr, en, ot].filter(Boolean);
    parts.forEach((inp, idx) => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === '/') {
          e.preventDefault();
          const next = parts[idx + 1];
          if (next) next.focus();
        }
        if (e.key === 'Backspace' && !inp.value && idx > 0) {
          e.preventDefault();
          const prev = parts[idx - 1];
          if (prev) prev.focus();
        }
      });
    });
  }

  /* === COMPORTEMENT SPÉCIAL : Anime -> Épisodes/Saisons (VF/VOSTFR) === */
  if (formId === 'animeForm') {
    // Remplace "Épisodes (toi)" par duo VF/VOSTFR
    const epHost = container.querySelector('[data-role="M"] input[name="episodeM"]')?.closest('.form-group');
    if (epHost) epHost.outerHTML = duoMegane('Épisodes (toi)', 'episodeM');

    // Remplace "Saisons (toi)" par duo VF/VOSTFR
    const saHost = container.querySelector('[data-role="M"] input[name="saisonM"]')?.closest('.form-group');
    if (saHost) saHost.outerHTML = duoMegane('Saisons (toi)', 'saisonM');

    // Navigation "/" et Backspace (épisodes)
    const ep_vf = container.querySelector('input[name="episodeM_vf"]');
    const ep_vost = container.querySelector('input[name="episodeM_vost"]');
    [ep_vf, ep_vost].filter(Boolean).forEach((inp, idx, arr) => {
      inp.addEventListener('keydown', e => {
        if (e.key === '/') { e.preventDefault(); arr[idx + 1]?.focus(); }
        if (e.key === 'Backspace' && !inp.value && idx > 0) { e.preventDefault(); arr[idx - 1]?.focus(); }
      });
    });

    // Navigation "/" et Backspace (saisons)
    const sa_vf = container.querySelector('input[name="saisonM_vf"]');
    const sa_vost = container.querySelector('input[name="saisonM_vost"]');
    [sa_vf, sa_vost].filter(Boolean).forEach((inp, idx, arr) => {
      inp.addEventListener('keydown', e => {
        if (e.key === '/') { e.preventDefault(); arr[idx + 1]?.focus(); }
        if (e.key === 'Backspace' && !inp.value && idx > 0) { e.preventDefault(); arr[idx - 1]?.focus(); }
      });
    });
  }

  /* Submit */
  container.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));

    // Liens externes
    const links = {};
    container.querySelectorAll(`#${linkContainerId} .link-pair-row`).forEach(row => {
      const inputs = row.querySelectorAll("input");
      const name = inputs[0].value.trim();
      const url = inputs[1].value.trim();
      if (name && url) links[name] = url;
    });

    // ✅ Autres titres : séparés par "/"
    const otherTitles = (data.otherTitles || "")
      .split('/')
      .map(t => t.trim())
      .filter(Boolean);

    // Statut unifié
    const statutSaisi = (data.status || data.statut || '').toLowerCase().trim();
    const statutUnifie = (statutSaisi === 'complet') ? 'terminé' : (statutSaisi || 'en cours');

    // ID obligatoire
    const titre = (data.title || '').trim();
    if (!titre) { alert("Le titre est obligatoire pour générer l'ID."); return; }
    const id = slugifyTitle(titre);

    // Payload de base
    const payload = {
      ...data,
      statut: statutUnifie,
      otherTitles,
      genres: genreSelect.getValue(),
      externalLinks: links,
      modifieLe: serverTimestamp()
    };
    if ('status' in payload) delete payload.status;

    // Similaires + CollectionDocs
    try {
      const simVals = (container.querySelector(`#${formId}-similar`)?.tomselect?.getValue()) ?? [];
      payload.similaires = Array.isArray(simVals) ? [...new Set(simVals)] : (simVals ? [simVals] : []);
    } catch { payload.similaires = []; }

    try {
      if (collectionDocsSelect) {
        const colVals = collectionDocsSelect.getValue();
        payload.collectionDocs = Array.isArray(colVals) ? [...new Set(colVals)] : (colVals ? [colVals] : []);
      }
    } catch { }

    // 🟣 Manga : convertir les 4 cases en chaîne "a.b.c.d" (compatible explore.js)
    if (collectionName === 'mangas') {
      const fr = form.querySelector('input[name="chLus_fr"]')?.value.trim() || '';
      const tr = form.querySelector('input[name="chLus_trfr"]')?.value.trim() || '';
      const en = form.querySelector('input[name="chLus_en"]')?.value.trim() || '';
      const ot = form.querySelector('input[name="chLus_other"]')?.value.trim() || '';
      const clean = v => v.replace(/[^0-9]/g, '');
      const a = clean(fr), b = clean(tr), c = clean(en), d = clean(ot);
      let joined = [a, b, c, d].join('.');
      joined = joined.replace(/\.*$/, '');
      if (joined) payload.chLus = joined;
      delete payload.chLus_fr; delete payload.chLus_trfr; delete payload.chLus_en; delete payload.chLus_other;
    }

    // 🟣 Anime : duo VF/VOSTFR -> garder episodeM/saisonM numériques (max), stocker les détails
    if (collectionName === 'animes') {
      const cleanNum = v => {
        const n = parseInt(String(v || '').replace(/[^0-9]/g, ''), 10);
        return Number.isFinite(n) ? n : 0;
      };
      const ep_vf = form.querySelector('input[name="episodeM_vf"]')?.value ?? '';
      const ep_vost = form.querySelector('input[name="episodeM_vost"]')?.value ?? '';
      const sa_vf = form.querySelector('input[name="saisonM_vf"]')?.value ?? '';
      const sa_vost = form.querySelector('input[name="saisonM_vost"]')?.value ?? '';

      const epVF = cleanNum(ep_vf);
      const epVOST = cleanNum(ep_vost);
      const saVF = cleanNum(sa_vf);
      const saVOST = cleanNum(sa_vost);

      if (epVF || epVOST) {
        payload.episodeM_vf = epVF;
        payload.episodeM_vost = epVOST;
      }
      if (saVF || saVOST) {
        payload.saisonM_vf = saVF;
        payload.saisonM_vost = saVOST;
      }

      const epCompat = Math.max(epVF, epVOST);
      const saCompat = Math.max(saVF, saVOST);
      if (epCompat) payload.episodeM = epCompat;
      if (saCompat) payload.saisonM = saCompat;
    }
    if ('collection' in payload) delete payload.collection;
    if (payload.anilistId != null) payload.anilistId = Number(payload.anilistId);

    try {
      await setDoc(doc(db, collectionName, id), payload, { merge: true });
      alert("✅ Ajouté avec succès");
      form.reset();
      genreSelect.clear();
      try { simInput.tomselect?.clear(); } catch { }
      try { collectionDocsSelect?.clear(); } catch { }
      container.querySelector(`#${linkContainerId}`).innerHTML = "";
    } catch (err) {
      console.error("Erreur Firestore:", err);
      alert("Erreur lors de l'ajout.");
    }
  });
}

/* ===== Onglets / rendu ===== */
function afficherFormulaire(formId) {
  onglets.forEach(o => {
    const container = document.getElementById(o.id);
    const tab = document.getElementById(`tab-${o.id}`);
    if (container) {
      container.style.display = (o.id === formId) ? "block" : "none";
      container.classList.toggle("active", o.id === formId);
    }
    if (tab) tab.classList.toggle("active", o.id === formId);
  });
}

function initialiserOnglets() {
  const ongletsHtml = document.getElementById("onglets-formulaires");
  ongletsHtml.innerHTML = '';
  onglets.forEach(o => {
    const btn = document.createElement("button");
    btn.innerHTML = `<span>${o.label}</span>`;
    btn.className = "tab-button";
    btn.id = `tab-${o.id}`;
    btn.onclick = () => afficherFormulaire(o.id);
    ongletsHtml.appendChild(btn);
  });
  afficherFormulaire("mangaForm");
}

function renderAllForms() {
  onglets.forEach(o => createForm(o.id, o.genres, o.collection, o.champs));
  initialiserOnglets();
  if (window.__lastAuthUser !== undefined) applyRoleVisibility(window.__lastAuthUser);
}

/* ===== Définition des champs ===== */
const champsManga = [
  champ("Titre", "title", true, "text", true, "ALL"),
  textarea("Autres titres (séparés par /)", "otherTitles", "ALL"),
  champ("AniList ID", "anilistId", false, "number", false, "ALL"),
  champ("Image (URL)", "image", false, "url", false, "ALL"),
  selectStatut("ALL"),
  textarea("Description", "description", "ALL"),
  champ("Chapitres total", "chTotal", false, "number", false, "ALL"),
  champ("Date", "date"),
  // (Le champ simple chLus sera remplacé par 4 cases en runtime)
  champ("Chapitres lus", "chLus", false, "text", false, "M"),
  champ("Chapitres", "chJade", false, "text", false, "J"),
  champ("Dernière lecture", "derniereLecture", false, "date", false, "M"),
  champ("Page", "page", false, "number", false, "J"),
  // Input Collection (transformé en collectionDocs multi)
  champ("Collection", "collection", false, "text", false, "ALL")
];

const champsAnime = [
  champ("Titre", "title", true, "text", true, "ALL"),
  champ("Autres titres (séparés par /)", "otherTitles", false, "text", true, "ALL"),
  champ("Image (URL)", "image", false, "text", false, "ALL"),
  champ("AniList ID", "anilistId", false, "number", false, "ALL"),
  selectStatut("ALL"),
  textarea("Description", "description", "ALL"),
  champ("Épisodes total", "episodeTotal", false, "text", false, "ALL"),
  // ces 2 champs M seront remplacés en runtime par duo VF/VOSTFR
  champ("Épisodes", "episodeM", false, "text", false, "M"),
  champ("Épisodes", "episodeJ", false, "text", false, "J"),
  champ("Saisons total", "saisonTotal", false, "text", false, "ALL"),
  champ("Saisons", "saisonM", false, "text", false, "M"),
  champ("Saisons", "saisonJ", false, "text", false, "J"),
  champ("Date", "date", false, "text", false, "ALL"),
  champ("Dernière écoute", "derniereEcoute", false, "date", false, "ALL"),
  champ("Collection", "collection", false, "text", false, "ALL")
];

const champsFilm = [
  champ("Titre", "title", true, "text", true, "ALL"),
  champ("Autres titres (séparés par /)", "otherTitles", false, "text", true, "ALL"),
  champ("Image (URL)", "image", false, "text", false, "ALL"),
  textarea("Description", "description", "ALL"),
  champ("Durée", "duree", false, "text", false, "ALL"),
  champ("Date", "date", false, "text", false, "ALL"),
  champ("Dernière écoute", "derniereEcoute", false, "date", false, "ALL"),
  champ("Collection", "collection", false, "text", false, "ALL")
];

const champsSerie = [
  champ("Titre", "title", true, "text", true, "ALL"),
  champ("Autres titres (séparés par /)", "otherTitles", false, "text", true, "ALL"),
  champ("Image (URL)", "image", false, "text", false, "ALL"),
  selectStatut("ALL"),
  textarea("Description", "description", "ALL"),
  champ("Épisodes total", "episodeTotal", false, "text", false, "ALL"),
  champ("Épisodes", "episodeM", false, "text", false, "M"),
  champ("Épisodes", "episodeJ", false, "text", false, "J"),
  champ("Saisons total", "saisonTotal", false, "text", false, "ALL"),
  champ("Saisons", "saisonM", false, "text", false, "M"),
  champ("Saisons", "saisonJ", false, "text", false, "J"),
  champ("Date", "date", false, "text", false, "ALL"),
  champ("Dernière écoute", "derniereEcoute", false, "date", false, "ALL"),
  champ("Collection", "collection", false, "text", false, "ALL")
];

const champsNovel = [
  champ("Titre", "title", true, "text", true, "ALL"),
  champ("Autres titres (séparés par /)", "otherTitles", false, "text", true, "ALL"),
  champ("Image (URL)", "image", false, "text", false, "ALL"),
  selectStatut("ALL"),
  textarea("Description", "description", "ALL"),
  champ("Chapitres total", "chTotal", false, "text", false, "ALL"),
  champ("Chapitres lus", "chLus", false, "text", false, "M"),
  champ("Chapitres lus", "chJade", false, "text", false, "J"),
  champ("Date", "date", false, "text", false, "ALL"),
  champ("Dernière lecture", "derniereLecture", false, "date", false, "ALL"),
  champ("Collection", "collection", false, "text", false, "ALL")
];

const onglets = [
  { id: "mangaForm", label: "Manga", genres: genresMangas, collection: "mangas", champs: champsManga },
  { id: "animeForm", label: "Anime", genres: genresAnimes, collection: "animes", champs: champsAnime },
  { id: "filmForm", label: "Film", genres: genresFilms, collection: "films", champs: champsFilm },
  { id: "serieForm", label: "Série", genres: genresSeries, collection: "series", champs: champsSerie },
  { id: "novelForm", label: "Novel", genres: genresNovels, collection: "novels", champs: champsNovel }
];

/* ===== Boot ===== */
async function startForms() {
  try { await loadGlobalOptions(); } catch (e) { console.warn('⚠️ Options globales non chargées', e); }
  try { renderAllForms(); } catch (e) { console.error('renderAllForms failed', e); }
}
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startForms, { once: true });
} else {
  startForms();
}

/* ===== Auth & visibilité M/J ===== */
import { auth } from './firebaseConfig.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

function setDisabledAll(disabled) {
  document.querySelectorAll('form input, form textarea, form select, form button[type="submit"]').forEach(el => {
    if (el.closest('#loginNotice')) return;
    if (el.tagName === 'BUTTON') { el.disabled = disabled; }
    else { el.readOnly = disabled; el.disabled = disabled; }
  });
}

function applyRoleVisibility(user) {
  const email = user?.email || '';
  const isMegane = /megane\.lavoie24@gmail\.com/i.test(email);
  const isJade = /jadelavoie51@gmail\.com/i.test(email);
  const role = isJade ? 'J' : isMegane ? 'M' : null;

  const notice = document.getElementById('loginNotice');

  if (!user) {
    if (notice) notice.style.display = '';
    document.querySelectorAll('[data-role]').forEach(el => { el.style.display = ''; });
    setDisabledAll(true);
    return;
  }

  if (notice) notice.style.display = 'none';
  setDisabledAll(false);

  document.querySelectorAll('[data-role]').forEach(el => {
    const who = el.getAttribute('data-role'); // M, J, ALL
    el.style.display = (who === 'ALL' || who === role) ? '' : 'none';
  });
}

window.__lastAuthUser = undefined;
onAuthStateChanged(auth, (user) => {
  window.__lastAuthUser = user || null;
  applyRoleVisibility(user);
});

// Export CSV des mangas non trouvés (utilisé par le lot)
function downloadCSV(rows, filename = 'mangas_sans_anilist_ce_lot.csv') {
  if (!Array.isArray(rows) || !rows.length) return;
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['id', 'title', 'other'].join(',');
  const body = rows.map(r => [esc(r.id), esc(r.title || ''), esc(r.other || '')].join(',')).join('\r\n');
  const blob = new Blob([header + '\r\n' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}



