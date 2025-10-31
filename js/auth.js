// js/auth.js — sépare "connecté" (UID/favs) et "peut écrire" (admins)
import { auth, provider } from './firebaseConfig.js';
import {
  signInWithPopup, onAuthStateChanged, signOut,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const ADMIN_EMAILS = ['megane.lavoie24@gmail.com', 'jadelavoie51@gmail.com'];

export async function connectWithGoogle() {
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithPopup(auth, provider);
    location.reload();
  } catch (e) {
    console.warn('[auth] Sign-in échoué', e);
    alert('Connexion annulée ou échouée.');
  }
}

export function disconnectUser() {
  return signOut(auth).then(() => location.reload());
}

// Un seul callback avec l’état complet
export function onAuth(cb) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      const email = (user.email || '').toLowerCase();
      const canWrite = ADMIN_EMAILS.includes(email);
      window.currentUserUid = user.uid;
      window.currentUserKey = email.includes('jade') ? 'J' : 'M';
      // 🔁 Si on a changé de compte, on remet la vue par défaut sur le compte courant
      const lastEmail = localStorage.getItem('lastAuthEmail');
      if (lastEmail && lastEmail !== email) {
        // on efface l'ancien override pour éviter "M" collé si on passe à Jade
        localStorage.removeItem('viewKey');
      }
      localStorage.setItem('lastAuthEmail', email);

      // Si aucun override n'est présent, on aligne la vue sur l'utilisateur connecté
      if (!localStorage.getItem('viewKey')) {
        window.__viewKey = window.currentUserKey;
        localStorage.setItem('viewKey', window.currentUserKey);
      }

      console.log('[auth] Utilisateur connecté :', email, 'UID:', user.uid);
      cb({ isLogged: true, uid: user.uid, email, canWrite, user });
      window.__lastAuthUser = user;
      window.dispatchEvent(new Event('auth-ready'));
    } else {
      window.currentUserUid = null;
      window.currentUserKey = null;
      console.log('[auth] Aucun utilisateur connecté');
      cb({ isLogged: false, uid: null, email: null, canWrite: false, user: null });
      window.__lastAuthUser = null;
      window.dispatchEvent(new Event('auth-ready'));
    }
  });
}


// 🔧 Petit helper "checkAuthAccess" pour compat avec tes pages
export function checkAuthAccess(onLogged, onLoggedOut) {
  onAuth((state) => {
    if (state.isLogged) onLogged(state.user);
    else onLoggedOut && onLoggedOut();
  });
}

