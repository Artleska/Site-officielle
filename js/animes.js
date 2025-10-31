// 📁 js/animes.js

// 1) Genres
export const genresAnimes = [
  "abu", "abandoned", "academy", "acting", "action", "athlete", "adopted", "age gap", "alien", "androgine", "animals", "animal characteristics", "ancestor", "amnesia", "a.i.", "apocalypse", "art", "artist",
  "arts-martiaux", "aventure", "aveugle", "body swap", "badass", "beast world", "beast tamer", "business", "brother", "caretaker", "calme",
  "célèbre", "child", "child lead", "changement d'apparence", "change species", "cohabitation", "constellation", "comédie", "cooking", "crazy", "criminel", "crossdressing", "cultivation",
  "demon", "designer", "drame", "disciple", "divorce", "dungeon", "esclave", "ex-op", "fantasy", "father", "female lead", "farmer",
  "food", "game become reality", "gender transformation", "ghosts", "guerre", "handicap", "harcelé", "harem", "healer", "hell", "historical", "horreur", "hero", "isekai", "idol", "invincible", "intelligent", "inquiétude", "jeux vidéo", "kidnapping",
  "lazy", "library", "long life", "magie", "male lead", "malentendu", "maid", "manga", "mature", "mariage arrangé", "mariage", "mariage contractuel", "mécanique", "médicale", "mental hospital", "mental illness", "mendiant", "meurtre", "militaire",
  "moderne", "mort", "monstre", "mother", "monde parallèle", "murim", "multi world", "multi life", "musique", "mystère",
  "novel", "noble", "non humain", "omegaverse", "overpowered", "patisserie", "power", "police", "prof", "psychologique", "pregnancy", "rajeunissement", "reclus", "réincarnation", "relic", "remariage", "return", "retraite", "revival",
  "revenge", "rich", "romance", "saint", "school life", "science", "servant", "showbiz", "special ability", "slice of life", "seconde chance",
  "secret identity", "secte", "sick", "sport", "suicide", "supernatural", "survival",
  "système", "tattoo", "time", "time limit", "time travel", "tower", "tyrant", "transmigration", "transformation", "traître", "trahison", "ugly", "vampire", "villainess", "villain",
  "veuve", "writer", "yuri", "yaoi", "zombie"
];

// 2) Utils
export function normalizeGenreKey(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// 3) Poids (plus petit = plus important)
export const DEFAULT_GENRE_WEIGHT_ANIME = 6.0;
export const genreWeightsAnimes = {
  // Leads spéciaux
  "female lead": 0,
  "male lead": 0,
  "autre": 0,

  // === Dominants (1.x) ===
  "manga": 1.1,
  "sick": 1.11,
  "child lead": 1.12,
  "yaoi": 1.13,
  "beast world": 1.2,
  "omegaverse": 1.21,
  "moderne": 1.22,
  "historical": 1.23,
  "monde parallèle": 1.3,
  "fantasy": 1.31,
  "arts-martiaux": 1.32,
  "slice of life": 1.33,
  "dungeon": 1.34,
  "médicale": 1.4,
  "multi world": 1.41,
  "multi life": 1.42,
  "système": 1.43,
  "rich": 1.44,
  "ex-op": 1.45,
  "badass": 1.46,
  "overpowered": 1.5,
  "beast tamer": 1.51,
  "tyrant": 1.6,

  // === Très forts mais secondaires (2.x) ===
  "romance": 2.1,
  "crossdressing": 2.12,
  "academy": 2.13,
  "acting": 2.14,
  "mental hospital": 2.15,
  "body swap": 2.16,
  "secret identity": 2.17,
  "game become reality": 2.18,
  "animal characteristics": 2.2,
  "apocalypse": 2.21,
  "transmigration": 2.22,
  "isekai": 2.23,
  "return": 2.24,
  "healer": 2.3,
  "secte": 2.31,
  "murim": 2.32,
  "invincible": 2.33,
  "seconde chance": 2.34,
  "mystère": 2.4,
  "tower": 2.41,
  "designer": 2.42,
  "hell": 2.43,
  "library": 2.5,
  "reclus": 2.51,
  "maid": 2.52,
  "disciple": 2.53,
  "ancestor": 2.6,
  "time travel": 2.61,

  // === Importants mais moins prioritaires (3.x) ===
  "mariage": 3.1,
  "remariage": 3.11,
  "mariage contractuel": 3.12,
  "mariage arrangé": 3.13,
  "adopted": 3.14,
  "father": 3.15,
  "mother": 3.16,
  "brother": 3.17,
  "malentendu": 3.18,
  "calme": 3.19,
  "kidnapping": 3.2,
  "cultivation": 3.21,
  "villain": 3.22,
  "harcelé": 3.23,
  "horreur": 3.24,
  "caretaker": 3.3,
  "retraite": 3.31,
  "farmer": 3.32,
  "a.i.": 3.33,
  "aveugle": 3.34,
  "non humain": 3.35,
  "abandoned": 3.4,
  "réincarnation": 3.41,
  "time limit": 3.42,
  "long life": 3.43,
  "saint": 3.5,
  "veuve": 3.51,

  // === Moyens (4.x) ===
  "gender transformation": 4.1,
  "handicap": 4.11,
  "special ability": 4.12,
  "mental illness": 4.13,
  "intelligent": 4.14,
  "crazy": 4.15,
  "inquiétude": 5.16,
  "food": 4.2,
  "animals": 4.21,
  "business": 4.22,
  "rajeunissement": 4.23,
  "cooking": 4.24,
  "prof": 4.3,
  "abu": 4.31,
  "revenge": 4.32,
  "athlete": 4.33,
  "supernatural": 4.34,
  "survival": 4.4,
  "pregnancy": 4.41,
  "amnesia": 4.42,
  "power": 4.43,
  "militaire": 4.5,
  "guerre": 4.51,
  "esclave": 4.52,
  "child": 4.6,

  // === Plus faibles (5.x) ===
  "action": 5.1,
  "drame": 5.12,
  "school life": 5.13,
  "aventure": 5.14,
  "revival": 5.2,
  "comédie": 5.21,
  "psychologique": 5.22,
  "age gap": 5.23,
  "alien": 5.24,
  "mendiant": 5.3,
  "servant": 5.31,
  "science": 5.32,
  "patisserie": 5.33,
  "célèbre": 5.4,
  "jeux vidéo": 5.41,
  "musique": 5.42,
  "constellation": 5.43,
  "mécanique": 5.5,
  "magie": 5.51,
  "transformation": 5.52,
  "mature": 5.53,
  "idol": 5.6,
};
// Complétion auto
for (const g of genresAnimes) {
  const k = normalizeGenreKey(g);
  if (!Object.prototype.hasOwnProperty.call(genreWeightsAnimes, k)) {
    genreWeightsAnimes[k] = DEFAULT_GENRE_WEIGHT_ANIME;
  }
}

// 4) Helpers
export function weightForGenreAnime(name) {
  const k = normalizeGenreKey(name);
  return Object.prototype.hasOwnProperty.call(genreWeightsAnimes, k)
    ? Number(genreWeightsAnimes[k])
    : DEFAULT_GENRE_WEIGHT_ANIME;
}

// 5) Boot page animes
import { checkAuthAccess } from './auth.js';
import { chargerDonneesCategorie, afficherCartes } from './visualisation.js';
import { initExplorer, initCollapsible, initAdvancedSortUI } from './explore.js';

function mapUserKey(email) {
  const e = (email || '').toLowerCase().trim();
  if (e === 'jadelavoie51@gmail.com') return 'J';
  if (e.includes('jade')) return 'J';
  return 'M';
}

export async function initAnimesPage() {
  // panneau repliable & tri avancé
  initCollapsible({ arrowSel: '#toggleArrow', panelSel: '#extraFilters', defaultOpen: false });
  initAdvancedSortUI({
    primarySel: '#sortBy',
    hiddenSel: '#sortMulti',
    addSel: '#advAddSelect',
    clearSel: '#advClear',
    dropSel: '#advDrop'
  });

  let RAW = [];

  const boot = async (userKey) => {
    const oeuvres = await chargerDonneesCategorie('animes');
    // ⚠️ Pas de filtre destructif : on garde tout.
    RAW = Array.isArray(oeuvres) ? oeuvres.slice() : [];

    // TomSelect éventuels
    try {
      const mkTS = (sel) => {
        const node = document.querySelector(sel);
        if (!node) return null;
        if (node.tomselect) return node.tomselect;
        return new TomSelect(sel, {
          plugins: ['remove_button'],
          create: false, persist: false, maxOptions: 500,
          options: genresAnimes.map(g => ({ value: g, text: g }))
        });
      };
      mkTS('#genresIn'); mkTS('#genresOut');
    } catch (e) { /* ok si panneau fermé au début */ }

    initExplorer({
      type: 'animes',
      items: RAW,
      genres: genresAnimes,
      userKey,
      getWeight: (k) => weightForGenreAnime(k),
      mount: {
        titleQ: '#qTitle',
        descQ: '#qDesc',
        inSel: '#genresIn',
        outSel: '#genresOut',
        status: null,       // (pas de statut par utilisateur pour animes dans ton UI actuelle)
        minCh: null,       // (spécifique mangas/novels)
        maxCh: null,
        sortBy: '#sortBy',
        sortDir: '#sortDir',
        sortMulti: '#sortMulti',
        apply: '#applyBtn',
        reset: '#resetBtn',
        gridId: 'animeCards' // ⚠️ correspond à animes.html
      },
      render: (arr) => afficherCartes(arr, 'animes', 'animeCards', userKey)
    });
  };

  await checkAuthAccess(
    async (user) => { await boot(mapUserKey(user.email)); },
    async () => { await boot('M'); }
  );

  // Scroll top
  const topBtn = document.getElementById('scrollToTop');
  const onScroll = () => { if (window.scrollY > 300) topBtn.classList.add('show'); else topBtn.classList.remove('show'); };
  window.addEventListener('scroll', onScroll, { passive: true });
  topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  onScroll();
}




