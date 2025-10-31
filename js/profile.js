// js/profile.js
import { onAuth, connectWithGoogle, disconnectUser } from './auth.js';
import { db } from './firebaseConfig.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/** ---------- Configuration ---------- */

// 1) Palette de dégradés (tu peux en ajouter)
const COLOR_PRESETS = [
  ['#2e6df6', '#8a2df8'],
  ['#ff7aa6', '#f9417a'],
  ['#1db954', '#24c6dc'],
  ['#ffb347', '#ffcc33'],
  ['#00c6ff', '#0072ff'],
  ['#8EC5FC', '#E0C3FC'],
];

// 2) Images dispos (mets tes URLs : /images/avatars/*.png, ou externes)
const IMAGE_PRESETS = [
  'images/avatars1.jpg',
  'images/avatars2.jpg',
  'images/avatars3.jpg',
  'images/avatars4.jpg',
];

/** ---------- Helpers ---------- */

const $ = (sel) => document.querySelector(sel);

function svgAvatar(letter, gradA, gradB) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='${gradA}'/><stop offset='100%' stop-color='${gradB}'/>
    </linearGradient></defs>
    <rect width='100%' height='100%' rx='100' fill='url(#g)'/>
    <text x='50%' y='58%' dominant-baseline='middle' text-anchor='middle'
      font-size='110' font-family='Inter, Arial, sans-serif' fill='rgba(255,255,255,.96)'>${letter}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
const firstLetter = (email) => (email?.trim()?.[0] || 'U').toUpperCase();

/** ---------- State ---------- */

let CURRENT = { isLogged: false, uid: null, email: null, canWrite: false, user: null, avatarUrl: null };
let SELECTED_URL = null;

/** ---------- Firestore profile ---------- */

async function loadProfile(uid) {
  if (!uid) return {};
  const ref = doc(db, `users/${uid}/settings/profile`);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : {};
}
async function saveAvatar(uid, url) {
  if (!uid) return;
  const ref = doc(db, `users/${uid}/settings/profile`);
  await setDoc(ref, { avatarUrl: url }, { merge: true });
}

/** ---------- UI bindings (assume ids from settings.html) ---------- */

const nameEl = $('#profileName');
const emailEl = $('#profileEmail');
const roleChip = $('#roleChip');
const avatarImg = $('#profileAvatar');
const accountIcon = $('#accountIcon');
const accountAvatar = $('#accountAvatar');

const btnToggleAuth = $('#btnToggleAuth');
const btnChangeAvatar = $('#btnChangeAvatar');
const choicesRoot = $('#avatarChoices');
const btnSaveAvatar = $('#btnSaveAvatar');

function render(state) {
  const name = state.user?.displayName || state.email || 'Utilisateur';
  const email = state.email || '—';

  if (nameEl) nameEl.textContent = name;
  if (emailEl) emailEl.textContent = email;
  if (roleChip) roleChip.textContent = state.canWrite ? 'Administrateur' : (state.isLogged ? 'Utilisateur' : 'Invité');

  if (btnToggleAuth) btnToggleAuth.textContent = state.isLogged ? 'Déconnexion' : 'Connexion Google';

  const fallback = svgAvatar(firstLetter(email), COLOR_PRESETS[0][0], COLOR_PRESETS[0][1]);
  const pic = state.avatarUrl || state.user?.photoURL || fallback;
  if (avatarImg) avatarImg.src = pic;

  if (accountAvatar && accountIcon) {
    if (state.isLogged) {
      accountAvatar.src = pic; accountAvatar.style.display = 'block';
      accountIcon.style.display = 'none';
    } else {
      accountAvatar.style.display = 'none';
      accountIcon.style.display = 'inline-block';
    }
  }
}

function mountAvatarChoices() {
  if (!choicesRoot) return;
  choicesRoot.innerHTML = '';
  const email = CURRENT.email || 'user@example.com';
  const L = firstLetter(email);

  // Couleurs (avatars lettre)
  COLOR_PRESETS.forEach(([a, b]) => {
    const url = svgAvatar(L, a, b);
    const div = document.createElement('div');
    div.className = 'choice';
    div.innerHTML = `<img src="${url}" alt="Avatar ${L}"><div class="small">Dégradé</div>`;
    div.addEventListener('click', () => selectChoice(div, url));
    choicesRoot.appendChild(div);
  });

  // Images
  IMAGE_PRESETS.forEach((imgUrl) => {
    const div = document.createElement('div');
    div.className = 'choice';
    div.innerHTML = `<img src="${imgUrl}" alt="Image avatar"><div class="small">Image</div>`;
    div.addEventListener('click', () => selectChoice(div, imgUrl));
    choicesRoot.appendChild(div);
  });
}

function selectChoice(div, url) {
  if (!choicesRoot) return;
  [...choicesRoot.children].forEach(c => c.classList.remove('active'));
  div.classList.add('active');
  SELECTED_URL = url;
  if (btnSaveAvatar) btnSaveAvatar.disabled = false;
}

/** ---------- Events ---------- */

if (btnToggleAuth) {
  btnToggleAuth.addEventListener('click', () => {
    if (CURRENT.isLogged) disconnectUser(); else connectWithGoogle();
  });
}

if (btnChangeAvatar) {
  btnChangeAvatar.addEventListener('click', () => {
    SELECTED_URL = null; if (btnSaveAvatar) btnSaveAvatar.disabled = true;
    mountAvatarChoices();
    const modalEl = document.getElementById('avatarModal');
    // garde en cas d’absence de bootstrap
    if (modalEl && window.bootstrap?.Modal) {
      new window.bootstrap.Modal(modalEl).show();
    }
  });
}

if (btnSaveAvatar) {
  btnSaveAvatar.addEventListener('click', async () => {
    if (!CURRENT.isLogged || !SELECTED_URL) return;
    await saveAvatar(CURRENT.uid, SELECTED_URL);
    CURRENT.avatarUrl = SELECTED_URL;
    render(CURRENT);
    const modalEl = document.getElementById('avatarModal');
    if (modalEl && window.bootstrap?.Modal) {
      window.bootstrap.Modal.getInstance(modalEl)?.hide();
    }
  });
}

/** ---------- Auth subscription ---------- */

onAuth(async (state) => {
  CURRENT = { ...state, avatarUrl: null };
  if (state.isLogged) {
    const prof = await loadProfile(state.uid);
    CURRENT.avatarUrl = prof.avatarUrl || null;
  }
  render(CURRENT);

  // Propage à l'appli si tu t'en sers ailleurs
  window.currentUserUid = state.isLogged ? state.uid : null;
  window.currentUserKey = (state.email || '').includes('jade') ? 'J' : 'M';
  window.dispatchEvent(new CustomEvent('auth-ready', {
    detail: { uid: window.currentUserUid, key: window.currentUserKey, canWrite: !!state.canWrite }
  }));
});

