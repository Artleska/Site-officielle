// === 1) Genres Films ===
export const genresFilms = [
  "action", "aventure", "comédie", "drame", "fantasy", "sci-fi", "slice of life",
  "romance", "horreur", "thriller", "mystère", "musique", "historique", "sport",
  "female lead", "male lead"
];

// === 2) Utils ===
export function normalizeGenreKey(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// === 3) Poids ===
export const DEFAULT_GENRE_WEIGHT = 6.0;
export const genreWeightsFilms = {
  "female lead": 0,
  "male lead": 0,

  "fantasy": 1.1,
  "sci-fi": 1.2,
  "historique": 1.3,
  "thriller": 1.4,
  "horreur": 1.5,

  "romance": 2.1,
  "drame": 2.2,
  "mystère": 2.3,
  "aventure": 2.4,
  "action": 2.5,

  "slice of life": 3.1,
  "sport": 3.2,
  "comédie": 3.3,
  "musique": 3.4
};

for (const g of genresFilms) {
  const k = normalizeGenreKey(g);
  if (!Object.prototype.hasOwnProperty.call(genreWeightsFilms, k)) {
    genreWeightsFilms[k] = DEFAULT_GENRE_WEIGHT;
  }
}

// === 4) Helpers ===
export function weightForGenre(name) {
  const k = normalizeGenreKey(name);
  return Object.prototype.hasOwnProperty.call(genreWeightsFilms, k)
    ? Number(genreWeightsFilms[k])
    : DEFAULT_GENRE_WEIGHT;
}
export function detectLeadFromGenres(it) {
  const g = (it.genres || []).map(normalizeGenreKey);
  if (g.includes('female lead')) return 'FEMALE';
  if (g.includes('male lead')) return 'MALE';
  return 'OTHER';
}
export function bestPrimaryFromGenres(it) {
  const arr = (it.genres || []).slice();
  if (!arr.length) return [];
  arr.sort((a, b) => weightForGenre(a) - weightForGenre(b));
  return [arr[0] || '', arr[1] || ''];
}
export function estFilm(oeuvre) {
  // film : pas d'épisodes/saisons, éventuellement "duree"
  return typeof oeuvre?.duree !== 'undefined' || (typeof oeuvre?.episodeTotal === 'undefined' && typeof oeuvre?.saisonTotal === 'undefined');
}

/* ==========================================================
 * 5) Boot Films
 * ========================================================== */
import { checkAuthAccess } from './auth.js';
import { chargerDonneesCategorie, afficherCartes } from './visualisation.js';
import { initExplorer, initCollapsible, initAdvancedSortUI } from './explore.js';

function getStoredViewKey() {
  const k = window.__viewKey ?? window.currentUserKey ?? localStorage.getItem('viewKey');
  return (k === 'J' || k === 'M') ? k : null;
}

function resolveUserKey(email) {
  // 1) si l’utilisateur a choisi une vue (pill / localStorage), on la respecte
  const sel = getStoredViewKey();
  if (sel) return sel;

  // 2) sinon on retombe sur la déduction par email
  const e = (email || '').toLowerCase().trim();
  return (e === 'jadelavoie51@gmail.com' || e.includes('jade')) ? 'J' : 'M';
}
function mapUserKey(email) {
  const e = (email || '').toLowerCase().trim();
  return (e === 'jadelavoie51@gmail.com' || e.includes('jade')) ? 'J' : 'M';
}

// Bloque toute lecture de localStorage pour Films (évite les interférences globales)
function hardUserKey(email) {
  const k = mapUserKey(email);
  // Rend la clé visible pour debug
  console.warn('[films] userKey utilisé =', k);
  // Optionnel: synchroniser une variable globale pour d’autres modules
  window.__viewKey = k;
  return k;
}

export async function initFilmsPage() {
  initCollapsible({ arrowSel: '#toggleArrow', panelSel: '#extraFilters', defaultOpen: false });
  initAdvancedSortUI({
    primarySel: '#sortBy', hiddenSel: '#sortMulti', addSel: '#advAddSelect', clearSel: '#advClear', dropSel: '#advDrop',
    labels: { title: 'Titre A→Z', modif: 'Dernière modification', date: 'Date (champ date)', similarity: 'Similarité (priorités 1.x)' }
  });

  const boot = async (userKey) => {
    const oeuvres = await chargerDonneesCategorie('films');
    const films = oeuvres.filter(estFilm);

    try {
      const mkTS = (sel) => {
        const node = document.querySelector(sel);
        if (!node) return null;
        if (node.tomselect) return node.tomselect;
        return new TomSelect(sel, {
          plugins: ['remove_button'], create: false, persist: false, maxOptions: 500,
          options: genresFilms.map(g => ({ value: g, text: g }))
        });
      };
      mkTS('#genresIn'); mkTS('#genresOut');
    } catch { }


    initExplorer({
      type: 'films',
      items: films,
      genres: genresFilms,
      userKey,                         // ← passe clairement la clé
      getWeight: (k) => weightForGenre(k),
      mount: {
        titleQ: '#qTitle', descQ: '#qDesc',
        inSel: '#genresIn', outSel: '#genresOut',
        status: '#userStatus',
        sortBy: '#sortBy', sortDir: '#sortDir', sortMulti: '#sortMulti',
        apply: '#applyBtn', reset: '#resetBtn',
        gridId: 'filmCards'
      },
      render: (arr) => afficherCartes(arr, 'films', 'filmCards', userKey) // ← idem ici
    });
  };

  // Auth: **même logique que séries**, pas de localStorage
  await checkAuthAccess(
    async (user) => boot(hardUserKey(user?.email || '')),
    async () => boot('M') // visiteur non connecté
  );

  const topBtn = document.getElementById('scrollToTop');
  const onScroll = () => topBtn.classList.toggle('show', window.scrollY > 300);
  window.addEventListener('scroll', onScroll, { passive: true });
  topBtn?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  onScroll();
}

