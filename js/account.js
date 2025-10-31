// js/account.js
import { onAuth } from './auth.js';
import { db } from './firebaseConfig.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// utilitaires
const $ = (s) => document.querySelector(s);
const accountIcon = $('#accountIcon');
const accountAvatar = $('#accountAvatar');

function svgAvatar(letter, a, b) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='${a}'/><stop offset='100%' stop-color='${b}'/>
    </linearGradient></defs>
    <rect width='100%' height='100%' rx='100' fill='url(#g)'/>
    <text x='50%' y='58%' dominant-baseline='middle' text-anchor='middle'
      font-size='110' font-family='Inter,Arial,sans-serif' fill='rgba(255,255,255,.96)'>${letter}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
const firstLetter = (email) => (email?.trim()?.[0] || 'U').toUpperCase();

async function getProfileAvatar(uid) {
  try {
    const snap = await getDoc(doc(db, `users/${uid}/settings/profile`));
    return snap.exists() ? (snap.data().avatarUrl || null) : null;
  } catch {
    return null;
  }
}

onAuth(async (state) => {
  // propage si d'autres scripts en ont besoin
  window.currentUserUid = state.isLogged ? state.uid : null;
  window.currentUserKey = (state.email || '').includes('jade') ? 'J' : 'M';
  window.dispatchEvent(new CustomEvent('auth-ready', {
    detail: { uid: window.currentUserUid, key: window.currentUserKey, canWrite: !!state.canWrite }
  }));

  // si pas de bouton dans la page, on sort proprement
  if (!accountIcon || !accountAvatar) return;

  if (state.isLogged) {
    const profUrl = await getProfileAvatar(state.uid);
    // ✅ petit correctif : utiliser photoURL directement si fourni par onAuth
    const fallback = state.photoURL || svgAvatar(firstLetter(state.email), '#2e6df6', '#8a2df8');
    const url = profUrl || fallback;

    accountAvatar.src = url;
    accountAvatar.style.display = 'block';
    accountIcon.style.display = 'none';
  } else {
    accountAvatar.style.display = 'none';
    accountIcon.style.display = 'inline-block';
  }
});

