// js/anilistUtils.js
export const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

export function guessMediaTypeByCol(col) {
  return (col === 'mangas' || col === 'novels') ? 'MANGA' : 'ANIME';
}

// Nettoyage titre brut pour les recherches
export function cleanupBaseTitle(raw) {
  if (!raw) return '';
  const STOP = /\b(tome|vol(?:ume)?|volume|chap(?:itre)?|chapter|season|saison|part|partie)\b[\s\d\-–.]*/gi;
  const s = String(raw).normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return s.replace(STOP, '').replace(/\s{2,}/g, ' ').trim();
}

/* =======================  AniList  ======================= */

export async function anilistLookup({ id = null, search = null, mediaType }) {
  const query = `
    query($id:Int,$type:MediaType,$search:String){
      Media(id:$id, type:$type, search:$search){
        id type siteUrl
        title { romaji english native }
        coverImage { extraLarge large medium color }
      }
    }`;
  const variables = { id, type: mediaType, search };

  const res = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
  const json = await res.json();
  return json?.data?.Media ?? null;
}

export async function getAniListIdFromMalId(malId) {
  if (!malId) return null;
  const q = `query($idMal:Int){ Media(idMal:$idMal){ id } }`;
  const res = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ query: q, variables: { idMal: Number(malId) } })
  });
  if (!res.ok) return null;
  const j = await res.json();
  return j?.data?.Media?.id || null;
}

/* =======================  Jikan (fallback)  ======================= */

export async function searchJikanMalId(query, mediaType = 'MANGA') {
  try {
    const kind = mediaType === 'ANIME' ? 'anime' : 'manga';
    const url = `https://api.jikan.moe/v4/${kind}?q=${encodeURIComponent(query)}&sfw=true&order_by=popularity`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    return j?.data?.[0]?.mal_id || null;
  } catch {
    return null;
  }
}

/* ============  Choisir le meilleur AniList ID à partir d’un doc  ============ */

export async function findBestAniListIdFromDoc(data, mediaType = 'MANGA') {
  const title = data?.title || '';
  const other = Array.isArray(data?.otherTitles)
    ? data.otherTitles.filter(Boolean)
    : (typeof data?.otherTitles === 'string'
      ? data.otherTitles.split(/[\/,|]/).map(x => x.trim()).filter(Boolean)
      : []);

  // 1) direct par recherche sur le titre principal
  const q1 = cleanupBaseTitle(title);
  let media = q1 ? await anilistLookup({ search: q1, mediaType }) : null;
  if (media?.id) return media.id;

  // 2) essais via autres titres
  for (const alt of other) {
    const q2 = cleanupBaseTitle(alt);
    media = q2 ? await anilistLookup({ search: q2, mediaType }) : null;
    if (media?.id) return media.id;
  }

  // 3) fallback Jikan -> conversion ID
  const mal = q1 ? await searchJikanMalId(q1, mediaType) : null;
  const alid = await getAniListIdFromMalId(mal);
  return alid || null;
}
