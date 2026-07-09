// Juno — Firebase init. This config is NOT a secret (safe in a public repo);
// access is enforced by Firebase Auth + Firestore security rules.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyCTSAzNoTabUNjHfurN6FKyhRYysXc9Vkc',
  authDomain: 'juno-a6adc.firebaseapp.com',
  projectId: 'juno-a6adc',
  storageBucket: 'juno-a6adc.firebasestorage.app',
  messagingSenderId: '398767139031',
  appId: '1:398767139031:web:95667f614d559374226892',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// keep the shared login signed in across app launches
setPersistence(auth, browserLocalPersistence).catch(() => {});
