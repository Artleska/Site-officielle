// js/siteCache.js
import { db } from './firebaseConfig.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CATS = ['mangas', 'animes', 'films', 'series', 'novels'];
const LS_KEY = 'archiveCache_v3';  // clé unique pour tout le site

// --- état en mémoire (format: { mangas: {id:doc}, ... })
const STATE = Object.fromEntries(CATS.map(c => [c, {}]));
const SUBS = [];
const listeners = new Set();

// --- bootstrap depuis localStorage pour affichage instantané
try {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    const data = JSON.parse(raw);
    for (const c of CATS) {
      if (data?.[c]) STATE[c] = data[c];
    }
  }
} catch { /* ignore */ }

function saveToLS() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(STATE)); } catch { }
}

function publish() {
  const snapshot = getAllAsArrays();
  listeners.forEach(fn => fn(snapshot));
}

export function getAllAsArrays() {
  // { mangas:[...], animes:[...], ... }  (chaque item a _type)
  const out = {};
  for (const c of CATS) {
    out[c] = Object.values(STATE[c]);
  }
  return out;
}

export function onAllCollections(cb) {
  // abonne un listener (reçoit {cat:[]...})
  listeners.add(cb);
  // push initial immédiat
  cb(getAllAsArrays());
  return () => listeners.delete(cb);
}

export function startSiteCache() {
  if (SUBS.length) return; // déjà démarré
  for (const cat of CATS) {
    const ref = collection(db, cat);
    const unsub = onSnapshot(ref, (querySnap) => {
      querySnap.docChanges().forEach(ch => {
        const id = ch.doc.id;
        if (ch.type === 'removed') {
          delete STATE[cat][id];
        } else {
          STATE[cat][id] = { id, ...ch.doc.data(), _type: cat };
        }
      });
      saveToLS();
      publish();
    }, (err) => {
      console.error(`[cache] ${cat} onSnapshot error:`, err);
    });
    SUBS.push(unsub);
  }
}

export function stopSiteCache() {
  SUBS.splice(0).forEach(u => u());
}
