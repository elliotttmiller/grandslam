import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';

/**
 * Firebase project configuration for "grand-slam-bracket".
 * These values are safe to include in client-side code — Firebase security is
 * enforced by Firestore Security Rules, not by keeping this config secret.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyDODBmb8JRhtT6D1kPy91eyRQIK765qOUo',
  authDomain: 'grand-slam-bracket.firebaseapp.com',
  projectId: 'grand-slam-bracket',
  storageBucket: 'grand-slam-bracket.firebasestorage.app',
  messagingSenderId: '890333029783',
  appId: '1:890333029783:web:65b694e4cc99154ebe10d2',
  measurementId: 'G-XZMDX695ZF',
};

/** Singleton Firebase app — safe to call from any module. */
function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApps()[0]!;
  return initializeApp(firebaseConfig);
}

/** Singleton Firestore instance. */
export function getDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

/**
 * Initialize Firebase Analytics.
 * Uses `isSupported()` to guard against environments that don't support it
 * (e.g. Node.js SSR, browsers with cookies/tracking disabled).
 * Call once at app startup; the returned Promise can be ignored.
 */
export async function initAnalytics(): Promise<Analytics | null> {
  try {
    const supported = await isSupported();
    if (!supported) return null;
    return getAnalytics(getFirebaseApp());
  } catch {
    return null;
  }
}
