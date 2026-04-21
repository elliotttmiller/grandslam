/**
 * Firebase Firestore sync service for pool data.
 *
 * Data model — Firestore collection: "pools"
 *   Document ID : pool.id  (6-char uppercase code)
 *   Fields      : all Pool fields (flat document, entries is an array field)
 *
 * All write helpers are best-effort: failures are caught and return null/false
 * so the app continues to work with its localStorage cache when Firebase is
 * unreachable (e.g. offline or permission denied).
 */
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  arrayUnion,
  serverTimestamp,
  runTransaction,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { getAuth } from '@/lib/firebase';
import type { Pool, PoolEntry } from '@/lib/pool-types';
import type { Match } from '@/lib/bracket-utils';

// Helper: Recursively remove undefined values from objects/arrays
function removeUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => [k, removeUndefined(v)])
    ) as T;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Fetch a pool document by its 6-char code. Returns null if the pool does
 * not exist.  Throws a `FirebaseError` if the Firestore read fails (e.g.
 * `permission-denied` when security rules block the request, or network
 * unavailability) so callers can distinguish "not found" from "server error"
 * and show an appropriate message.
 * 
 * On success, converts Firestore Timestamp objects to ISO string format. */
export async function syncGetPool(id: string): Promise<Pool | null> {
  try {
    const currentUser = getAuth().currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      console.error('Aborting pool fetch: user is not signed in with a full account.');
      throw { code: 'permission-denied', message: 'Not signed in with a full account' };
    }
    const snap = await getDoc(doc(getDb(), 'pools', id));
    if (!snap.exists()) return null;
    const data = snap.data();
    // Firestore timestamps → ISO strings
    return {
      ...(data as Pool),
      createdAt: data['createdAt']?.toDate?.()?.toISOString() ?? data['createdAt'],
      updatedAt: data['updatedAt']?.toDate?.()?.toISOString() ?? data['updatedAt'],
    };
  } catch (error) {
    const err = error as any;
    const errorCode = err?.code ?? 'unknown';
    if (errorCode === 'permission-denied') {
      console.error('Pool fetch blocked by Firestore security rules. Auth may not be ready.');
    } else if (errorCode === 'unavailable') {
      console.error('Firebase service unavailable when fetching pool.');
    }
    // Re-throw so callers can distinguish between "not found" (null) and "error" (throw)
    throw error;
  }
}

/** Fetch pools where the user is a participant or creator. */
export async function syncGetUserPools(userId: string): Promise<Pool[]> {
  try {
    const currentUser = getAuth().currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      console.error('Aborting user pools fetch: user is not signed in with a full account.');
      return [];
    }
    const col = collection(getDb(), 'pools');
    const [participantSnaps, createdSnaps] = await Promise.all([
      getDocs(query(col, where('participantIds', 'array-contains', userId))),
      getDocs(query(col, where('createdBy', '==', userId))),
    ]);

    const byId = new Map<string, Pool>();
    for (const snap of [...participantSnaps.docs, ...createdSnaps.docs]) {
      const data = snap.data();
      byId.set(snap.id, {
        ...(data as Pool),
        createdAt: data['createdAt']?.toDate?.()?.toISOString() ?? data['createdAt'],
        updatedAt: data['updatedAt']?.toDate?.()?.toISOString() ?? data['updatedAt'],
      });
    }
    return Array.from(byId.values());
  } catch (error) {
    console.error('Failed to fetch user pools:', error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Write a new pool document.  Idempotent — if the doc already exists the
 * call is a no-op (we don't overwrite an existing pool).
 * 
 * Catches and logs errors silently. Returns null on any failure (network,
 * permission denied, or other Firestore errors) so the app can continue with
 * local storage as fallback.
 */
export async function syncCreatePool(pool: Pool): Promise<Pool | null> {
  try {
    const currentUser = getAuth().currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      console.error('Aborting pool create: user is not signed in with a full account.');
      return null;
    }
    const ref = doc(getDb(), 'pools', pool.id);
    const existing = await getDoc(ref);
    if (existing.exists()) return existing.data() as Pool;
    
    // Remove undefined fields recursively (including entries array)
    const poolData = removeUndefined(pool);
    
    const participantIds = [
      ...new Set(
        [
          ...(poolData.participantIds ?? []),
          ...(poolData.entries ?? []).map(e => e.userId).filter((id): id is string => !!id),
          poolData.createdBy,
        ].filter((id): id is string => !!id)
      ),
    ];

    await setDoc(ref, { ...poolData, participantIds, updatedAt: serverTimestamp() });
    return pool;
  } catch (error) {
    const err = error as any;
    const errorCode = err?.code ?? 'unknown';
    const errorMessage = err?.message ?? String(error);
    if (errorCode === 'permission-denied') {
      console.error('Pool creation blocked by Firestore security rules:', errorMessage);
    } else if (errorCode === 'unavailable') {
      console.error('Firebase service is unavailable (network or service issue):', errorMessage);
    } else {
      console.error('Pool creation failed:', errorCode, errorMessage);
    }
    return null;
  }
}

/**
 * Unconditional upsert — writes the full pool document regardless of whether
 * one already exists. Use this when resetting or re-creating a pool (e.g. the
 * simulator "Reset Pool" action) so the Firestore document is always replaced
 * with the current local state.
 */
export async function syncSavePool(pool: Pool): Promise<boolean> {
  try {
    const currentUser = getAuth().currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      console.error('Aborting pool save: user is not signed in with a full account.');
      return false;
    }
    const poolData = removeUndefined(pool);
    const participantIds = [
      ...new Set(
        [
          ...(poolData.participantIds ?? []),
          ...(poolData.entries ?? []).map(e => e.userId).filter((id): id is string => !!id),
          poolData.createdBy,
        ].filter((id): id is string => !!id),
      ),
    ];
    const ref = doc(getDb(), 'pools', pool.id);
    await setDoc(ref, { ...poolData, participantIds, updatedAt: serverTimestamp() });
    return true;
  } catch (error) {
    const err = error as { code?: string; message?: string };
    console.error('Failed to save pool to Firestore:', err?.code, err?.message);
    return false;
  }
}

/** Delete a pool document by ID. */
export async function syncDeletePool(poolId: string): Promise<boolean> {
  try {
    const currentUser = getAuth().currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      console.error('Aborting pool delete: user is not signed in with a full account.');
      return false;
    }
    await deleteDoc(doc(getDb(), 'pools', poolId));
    return true;
  } catch (error) {
    console.error('Failed to delete pool from Firestore:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Entry mutations
// ---------------------------------------------------------------------------

/**
 * Append a new bracket entry to the pool's `entries` array.
 * Uses `arrayUnion` so concurrent adds from different devices don't clobber
 * each other (Firestore applies the union atomically).
 */
export async function syncAddEntry(
  poolId: string,
  entry: PoolEntry,
): Promise<boolean> {
  try {
    const currentUser = getAuth().currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      console.error('Aborting add pool entry: user is not signed in with a full account.');
      return false;
    }
    // Remove undefined fields before writing to Firestore (Firestore rejects undefined)
    const entryData = removeUndefined(entry);
    
    const updatePayload: Record<string, unknown> = {
      entries: arrayUnion(entryData),
      updatedAt: serverTimestamp(),
    };
    if (entry.userId) {
      updatePayload['participantIds'] = arrayUnion(entry.userId);
    }

    await updateDoc(doc(getDb(), 'pools', poolId), updatePayload);
    return true;
  } catch (error) {
    const err = error as any;
    const errorCode = err?.code ?? 'unknown';
    const errorMessage = err?.message ?? String(error);
    console.error('Failed to add entry to pool:', errorCode, errorMessage);
    return false;
  }
}

/**
 * Apply a partial patch to a single entry inside the pool document.
 *
 * Firestore doesn't support patching individual array elements natively, so
 * we fetch the document, apply the patch in-memory (last-write-wins), then
 * write the updated entries array back.
 *
 * For small groups (1-10 users) this is safe.  A Firestore Transaction
 * ensures atomicity for concurrent edits.
 */
export async function syncUpdateEntry(
  poolId: string,
  entryId: string,
  patch: Partial<PoolEntry>,
): Promise<boolean> {
  try {
    const ref = doc(getDb(), 'pools', poolId);
    await runTransaction(getDb(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const pool = snap.data() as Pool;
      
      // Filter out undefined values from patch before applying
      const cleanPatch = Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined)
      );
      
      const entries = (pool.entries ?? []).map((e) => {
        const updatedEntry = e.id === entryId
          ? { ...e, ...cleanPatch, updatedAt: new Date().toISOString() }
          : e;
        // Filter out undefined values from each entry before writing back to Firestore
        return Object.fromEntries(
          Object.entries(updatedEntry).filter(([, v]) => v !== undefined)
        );
      });
      tx.update(ref, { entries, updatedAt: serverTimestamp() });
    });
    return true;
  } catch (error) {
    console.error('Failed to update pool entry:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Official results
// ---------------------------------------------------------------------------

/**
 * Replace the pool's `officialMatches` array with the provided matches.
 *
 * Used by the pool creator to record actual tournament results as matches are
 * played.  All connected clients receive the update via `subscribeToPool`.
 *
 * Uses a Firestore Transaction so the update is atomic.  Returns true on
 * success, false on failure.
 */
export async function syncUpdateOfficialMatches(
  poolId: string,
  officialMatches: Match[],
): Promise<boolean> {
  try {
    const ref = doc(getDb(), 'pools', poolId);
    await runTransaction(getDb(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const cleanMatches = removeUndefined(officialMatches);
      tx.update(ref, { officialMatches: cleanMatches, updatedAt: serverTimestamp() });
    });
    return true;
  } catch (error) {
    console.error('Failed to update official matches:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Real-time subscription
// ---------------------------------------------------------------------------

/**
 * Subscribe to live pool updates via Firestore `onSnapshot`.
 *
 * The callback fires immediately with the current server state (if the doc
 * exists) and then on every subsequent write by any client.
 *
 * Returns a cleanup function that unsubscribes the listener — call it from
 * a React `useEffect` cleanup to avoid memory leaks.
 */
export function subscribeToPool(
  poolId: string,
  onUpdate: (pool: Pool) => void,
): () => void {
  let unsubscribe: Unsubscribe;
  let lastPoolData: string = '';
  
  try {
    unsubscribe = onSnapshot(
      doc(getDb(), 'pools', poolId),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const pool: Pool = {
          ...(data as Pool),
          createdAt:
            data['createdAt']?.toDate?.()?.toISOString() ?? data['createdAt'],
          updatedAt:
            data['updatedAt']?.toDate?.()?.toISOString() ?? data['updatedAt'],
        };
        
        // Only trigger update if the data actually changed (avoid flickering from no-op updates)
        const currentPoolData = JSON.stringify(pool);
        if (currentPoolData !== lastPoolData) {
          lastPoolData = currentPoolData;
          onUpdate(pool);
        }
      },
      () => {
        // Listener error — ignore silently (network issue or permission denied
        // before the pool exists).  The component falls back to local data.
      },
    );
  } catch {
    return () => {};
  }
  return () => unsubscribe?.();
}
