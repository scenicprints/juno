// Juno — data layer: shared-account auth + live Firestore sync.
// One shared login ("two people in one account"). All data lives under
// users/{uid}/... so both phones on the same account share one dataset.
import { auth, db } from './firebase.js';
import {
  onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, arrayUnion,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ---- auth ----
export function onAuth(cb) { return onAuthStateChanged(auth, cb); }
export function signIn(email, pw) { return signInWithEmailAndPassword(auth, email, pw); }
export function signUp(email, pw) { return createUserWithEmailAndPassword(auth, email, pw); }
export function logout() { return signOut(auth); }

function uid() { return auth.currentUser?.uid; }
function col(name) { return collection(db, `users/${uid()}/${name}`); }

// ---- live subscription ----
// Calls cb({ cycles:[...], days:{date:{...}}, settings:{...}, ready }) on every change.
export function subscribe(cb) {
  const state = { cycles: [], days: {}, settings: {}, ready: { cycles: false, days: false, settings: false } };
  const emit = () => cb({
    cycles: state.cycles, days: state.days, settings: state.settings,
    ready: state.ready.cycles && state.ready.days && state.ready.settings,
  });

  const unsubs = [];
  unsubs.push(onSnapshot(query(col('cycles'), orderBy('startDate')), snap => {
    state.cycles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.ready.cycles = true; emit();
  }, () => { state.ready.cycles = true; emit(); }));

  unsubs.push(onSnapshot(col('days'), snap => {
    const days = {};
    snap.docs.forEach(d => { days[d.id] = d.data(); });
    state.days = days; state.ready.days = true; emit();
  }, () => { state.ready.days = true; emit(); }));

  unsubs.push(onSnapshot(doc(db, `users/${uid()}/meta/settings`), snap => {
    state.settings = snap.exists() ? snap.data() : {};
    state.ready.settings = true; emit();
  }, () => { state.ready.settings = true; emit(); }));

  return () => unsubs.forEach(u => u());
}

// ---- mutations ----
export function startPeriod(dateStr) { return addDoc(col('cycles'), { startDate: dateStr }); }
export function endPeriod(cycleId, dateStr) {
  return updateDoc(doc(db, `users/${uid()}/cycles/${cycleId}`), { endDate: dateStr });
}
export function deleteCycle(id) { return deleteDoc(doc(db, `users/${uid()}/cycles/${id}`)); }
export function setDay(dateStr, patch) {
  return setDoc(doc(db, `users/${uid()}/days/${dateStr}`), patch, { merge: true });
}
export function setSettings(patch) {
  return setDoc(doc(db, `users/${uid()}/meta/settings`), patch, { merge: true });
}
// store an FCM device token (the daily notifier reads users/{uid}/meta/push.tokens[])
export function saveToken(token) {
  return setDoc(doc(db, `users/${uid()}/meta/push`), { tokens: arrayUnion(token) }, { merge: true });
}
