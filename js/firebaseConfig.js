import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB8kcRDh17HoysCnUT9rzDR9IDkhfEENR4",
  authDomain: "site-manga-da5cc.firebaseapp.com",
  databaseURL: "https://site-manga-da5cc-default-rtdb.firebaseio.com",
  projectId: "site-manga-da5cc",
  storageBucket: "site-manga-da5cc.firebasestorage.app",
  messagingSenderId: "546213461662",
  appId: "1:546213461662:web:f1a7d06ef2dc930d38458f"
};

const app = initializeApp(firebaseConfig);

// ✅ Firestore avec cache persistant (multi-onglet)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// ✅ Auth persistée (reste connecté d’une session à l’autre)
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

(async () => {
  await setPersistence(auth, browserLocalPersistence);
  auth.languageCode = 'fr';
})();
