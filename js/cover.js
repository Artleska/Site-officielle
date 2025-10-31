// js/covers.js 

const REQUEST_TIMEOUT = 6000;
const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
export const PLACEHOLDER_COVER = '/images/ImageCarte.jpg';


async function headOk(url) {
  try {
    const res = await Promise.race([fetch(url, { method: 'HEAD' }), timeout(5000)]);
    return res.ok;
  } catch { return false; }
}

// --- AniList (GraphQL) ---
async function urlFromAniListId(id) {
  if (!Number.isFinite(Number(id))) return null;
  const query = `
    query ($id: Int) {
      Media(id: $id, type: MANGA) {
        coverImage { extraLarge large medium }
      }
    }`;
  try {
    const variables = { id: Number(id) };
    const res = await Promise.race([
      fetch(ANILIST_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ query, variables })
      }),
      timeout(REQUEST_TIMEOUT)
    ]);
    if (!res.ok) return null;
    const j = await res.json();
    return j?.data?.Media?.coverImage?.extraLarge ||
      j?.data?.Media?.coverImage?.large ||
      j?.data?.Media?.coverImage?.medium || null;
  } catch { return null; }
}
// --- MyAnimeList via Jikan (fallback par Titre) ---
async function urlFromMALByTitle(title) {
  if (!title) return null;
  try {
    const r = await Promise.race([
      fetch(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(title)}&sfw=true&order_by=popularity`),
      timeout(6000)
    ]);
    if (!r.ok) return null;
    const j = await r.json();
    const first = j?.data?.[0];
    // on prend webp si présent, sinon jpg
    return first?.images?.webp?.image_url || first?.images?.jpg?.image_url || null;
  } catch { return null; }
}

// --- Open Library (par ISBN) ---
function urlFromOpenLibrary(isbn) {
  if (!isbn) return null;
  const clean = String(isbn).replace(/^ISBN:/i, '').trim();
  if (!clean) return null;
  return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(clean)}-L.jpg`;
}

// --- API publique principale ---
export async function resolveCoverUrl(item) {
  // 1) AniList d'abord
  if (item?.anilistId != null) {
    const url = await urlFromAniListId(item.anilistId);
    if (url && await headOk(url)) return url;
  }
  // 2) OpenLibrary si ISBN
  if (item?.isbn) {
    const url = urlFromOpenLibrary(item.isbn);
    if (url && await headOk(url)) return url;
  }
  // 3) rien trouvé ? -> dernier recours : MAL (Jikan) par titre
  if (item?.title) {
    const malUrl = await urlFromMALByTitle(item.title);
    if (malUrl && await headOk(malUrl)) return malUrl;
  }

  // 4) toujours rien
  return null;
}

// --- Génère la balise <img> ---
export function renderCoverImg(url, alt = 'Couverture', { width = 256, height = 384, className = 'cover-img', attrs = '' } = {}) {
  const src = url || PLACEHOLDER_COVER;
  return `
    <img 
      class="${className}"
      loading="lazy" decoding="async"
      src="${src}"
      alt="${alt}"
      width="${width}" height="${height}"
      onerror="handleCoverError(this)"
      ${attrs}

    />
  `;
}

export function handleCoverError(img) {
  try {
    img.onerror = null;
    img.removeAttribute?.('srcset');
    if (window.autoFixCover) {

      window.autoFixCover(img);
    } else {
      img.src = PLACEHOLDER_COVER;
    }
  } catch (_) {
    // en dernier recours
    img.src = PLACEHOLDER_COVER;
  }
}

// Rendez-la accessible depuis l'attribut inline
window.handleCoverError = handleCoverError;

export function attachCoverGuards() {
  document.addEventListener(
    'error',
    (e) => {
      const el = e.target;
      if (el && el.tagName === 'IMG' && el.classList.contains('cover-img')) {
        // même logique que ton ancien fallback
        try { el.removeAttribute('srcset'); } catch { }
        el.src = PLACEHOLDER_COVER;
      }
    },
    true
  );
}
