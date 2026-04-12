/**
 * Firebase Authentication service.
 *
 * Wraps firebase/auth calls so the rest of the app imports from here rather
 * than touching the Firebase SDK directly.  All functions are best-effort:
 * errors are surfaced as thrown Error objects with human-readable messages so
 * callers can display them in the UI.
 */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as _signOut,
  onAuthStateChanged as _onAuthStateChanged,
  type User,
  type Unsubscribe,
} from 'firebase/auth';
import { getAuth } from '@/lib/firebase';

/** Create a new account with email + password. Returns the new User. */
export async function signUp(email: string, password: string): Promise<User> {
  try {
    const { user } = await createUserWithEmailAndPassword(getAuth(), email, password);
    return user;
  } catch (err: unknown) {
    throw new Error(friendlyAuthError(err));
  }
}

/** Sign in with email + password. Returns the signed-in User. */
export async function signIn(email: string, password: string): Promise<User> {
  try {
    const { user } = await signInWithEmailAndPassword(getAuth(), email, password);
    return user;
  } catch (err: unknown) {
    throw new Error(friendlyAuthError(err));
  }
}

/** Sign out the currently authenticated user. */
export async function signOut(): Promise<void> {
  try {
    await _signOut(getAuth());
  } catch {
    // Ignore sign-out errors — the local session is considered cleared.
  }
}

/**
 * Subscribe to authentication state changes.
 *
 * The callback fires immediately with the current user (or `null` when
 * signed out) and then on every subsequent auth state change.
 *
 * Returns a cleanup function — call it from a React `useEffect` cleanup to
 * avoid memory leaks.
 */
export function onAuthStateChanged(callback: (user: User | null) => void): Unsubscribe {
  return _onAuthStateChanged(getAuth(), callback);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map Firebase auth error codes to user-facing messages. */
function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return (err instanceof Error ? err.message : null) ?? 'Authentication failed.';
  }
}
