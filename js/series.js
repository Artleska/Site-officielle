// === 1) Genres Séries ===
export const genresSeries = [
  "action", "aventure", "comédie", "drame", "enquête", "fantasy", "sci-fi", "slice of life",
  "romance", "horreur", "thriller", "mystère", "police", "psychologique", "historique",
  "school life",
  "female lead", "male lead"
];

// === 2) Utils ===
export function normalizeGenreKey(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// === 3) Poids ===
export const DEFAULT_GENRE_WEIGHT = 6.0;
export const genreWeightsSeries = {
  "female lead": 0,
  "male lead": 0,

  "fantasy": 1.1,
  "sci-fi": 1.2,
  "historique": 1.3,
  "thriller": 1.4,

  "romance": 2.1,
  "drame": 2.2,
  "enquête": 2.21,
  "mystère": 2.3,
  "horreur": 2.4,

  "action": 3.1,
  "aventure": 3.2,
  "slice of life": 3.3,
  "school life": 3.4,

  "comédie": 4.1,
  "police": 4.2,
  "psychologique": 4.3
};

for (const g of genresSeries) {
  const k = normalizeGenreKey(g);
  if (!Object.prototype.hasOwnProperty.call(genreWeightsSeries, k)) {
    genreWeightsSeries[k] = DEFAULT_GENRE_WEIGHT;
  }
}

// === 4) Helpers ===
export function weightForGenre(name) {
  const k = normalizeGenreKey(name);
  return Object.prototype.hasOwnProperty.call(genreWeightsSeries, k)
    ? Number(genreWeightsSeries[k])
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
export function estSerie(oeuvre) {
  return typeof oeuvre?.saisonTotal !== 'undefined' || typeof oeuvre?.episodeTotal !== 'undefined';
}

/* ==========================================================
 * 5) Boot Séries
 * ========================================================== */
import { checkAuthAccess } from './auth.js';
import { chargerDonneesCategorie, afficherCartes } from './visualisation.js';
import { initExplorer, initCollapsible, initAdvancedSortUI } from './explore.js';

function mapUserKey(email) {
  const e = (email || '').toLowerCase().trim();
  if (e === 'jadelavoie51@gmail.com' || e.includes('jade')) return 'J';
  return 'M';
}

export async function initSeriesPage() {
  initCollapsible({ arrowSel: '#toggleArrow', panelSel: '#extraFilters', defaultOpen: false });
  initAdvancedSortUI({
    primarySel: '#sortBy', hiddenSel: '#sortMulti', addSel: '#advAddSelect', clearSel: '#advClear', dropSel: '#advDrop',
    labels: { title: 'Titre A→Z', modif: 'Dernière modification', date: 'Date (champ date)', similarity: 'Similarité (priorités 1.x)' }
  });

  const boot = async (userKey) => {
    const oeuvres = await chargerDonneesCategorie('series');
    const series = oeuvres.filter(estSerie);

    try {
      const mkTS = (sel) => {
        const node = document.querySelector(sel);
        if (!node) return null;
        if (node.tomselect) return node.tomselect;
        return new TomSelect(sel, {
          plugins: ['remove_button'], create: false, persist: false, maxOptions: 500,
          options: genresSeries.map(g => ({ value: g, text: g }))
        });
      };
      mkTS('#genresIn'); mkTS('#genresOut');
    } catch { }

    initExplorer({
      type: 'series',
      items: series,
      genres: genresSeries,
      userKey,
      getWeight: (k) => weightForGenre(k),
      mount: {
        titleQ: '#qTitle', descQ: '#qDesc',
        inSel: '#genresIn', outSel: '#genresOut',
        status: '#userStatus',
        sortBy: '#sortBy', sortDir: '#sortDir', sortMulti: '#sortMulti',
        apply: '#applyBtn', reset: '#resetBtn',
        gridId: 'seriesCards'
      },
      render: (arr) => afficherCartes(arr, 'series', 'seriesCards', userKey)
    });
  };

  await checkAuthAccess(async (user) => boot(mapUserKey(user.email)), async () => boot('M'));

  const topBtn = document.getElementById('scrollToTop');
  const onScroll = () => topBtn.classList.toggle('show', window.scrollY > 300);
  window.addEventListener('scroll', onScroll, { passive: true });
  topBtn?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  onScroll();
}

