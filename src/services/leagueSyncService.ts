/**
 * Firestore sync service for League documents.
 *
 * Data model — Firestore collection: "leagues"
 *   Document ID : league.id  (6-char uppercase code)
 *   Fields      : all League fields (flat document, members is an array field)
 *
 * All write helpers are best-effort: failures are caught and return null/false
 * so the app continues to work with its localStorage cache when Firebase is
 * unreachable.
 */
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
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
import type { League, LeagueMember } from '@/lib/league-types';

// Helper: Recursively remove undefined values from objects/arrays
function removeUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)])
    ) as T;
  }
  return obj;
}

function toLeague(data: Record<string, unknown>): League {
  return {
    ...(data as unknown as League),
    createdAt:
      (data['createdAt'] as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString() ??
      (data['createdAt'] as string),
    updatedAt:
      (data['updatedAt'] as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString() ??
      (data['updatedAt'] as string | undefined),
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function syncGetLeague(id: string): Promise<League | null> {
  try {
    const currentUser = getAuth().currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      console.error('Aborting league fetch: user is not signed in with a full account.');
      // Mirror Firestore permission behavior for callers
      throw { code: 'permission-denied', message: 'Not signed in with a full account' };
    }
    const snap = await getDoc(doc(getDb(), 'leagues', id));
    if (!snap.exists()) return null;
    return toLeague(snap.data() as Record<string, unknown>);
  } catch (error) {
    console.error('League fetch error:', error);
    throw error;
  }
}

/** Fetch all public leagues for the browse view (non-private). */
export async function syncGetPublicLeagues(year?: number): Promise<League[]> {
  try {
    const col = collection(getDb(), 'leagues');
    const q = year
      ? query(col, where('isPrivate', '==', false), where('year', '==', year))
      : query(col, where('isPrivate', '==', false));
    const snaps = await getDocs(q);
    return snaps.docs.map(d => toLeague(d.data() as Record<string, unknown>));
  } catch (error) {
    console.error('Failed to fetch public leagues:', error);
    return [];
  }
}

/** Fetch all leagues where userId appears in the memberIds array. */
export async function syncGetUserLeagues(userId: string): Promise<League[]> {
  try {
    const currentUser = getAuth().currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      console.error('Aborting user leagues fetch: user is not signed in with a full account.');
      return [];
    }
    const col = collection(getDb(), 'leagues');
    // memberIds is a flat string[] — Firestore array-contains works correctly with scalar values.
    const q = query(col, where('memberIds', 'array-contains', userId));
    const snaps = await getDocs(q);
    return snaps.docs.map(d => toLeague(d.data() as Record<string, unknown>));
  } catch (error) {
    console.error('Failed to fetch user leagues:', error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function syncCreateLeague(league: League): Promise<League | null> {
  try {
    const currentUser = getAuth().currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      console.error('Aborting league create: user is not signed in with a full account.');
      return null;
    }
    const ref = doc(getDb(), 'leagues', league.id);
    const existing = await getDoc(ref);
    if (existing.exists()) return toLeague(existing.data() as Record<string, unknown>);
    const leagueData = removeUndefined(league);
    await setDoc(ref, { ...leagueData, updatedAt: serverTimestamp() });
    return league;
  } catch (error) {
    const err = error as { code?: string; message?: string };
    console.error('League creation failed:', err?.code, err?.message);
    return null;
  }
}

/**
 * Unconditional upsert — writes the full league document regardless of whether
 * one already exists. Use when the simulator recreates the same test league so
 * the Firestore document is always replaced with the current local state.
 */
export async function syncSaveLeague(league: League): Promise<boolean> {
  try {
    const currentUser = getAuth().currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      console.error('Aborting league save: user is not signed in with a full account.');
      return false;
    }
    const leagueData = removeUndefined(league);
    const ref = doc(getDb(), 'leagues', league.id);
    await setDoc(ref, { ...leagueData, updatedAt: serverTimestamp() });
    return true;
  } catch (error) {
    const err = error as { code?: string; message?: string };
    console.error('Failed to save league to Firestore:', err?.code, err?.message);
    return false;
  }
}

/** Delete a league document by ID. */
export async function syncDeleteLeague(leagueId: string): Promise<boolean> {
  try {
    const currentUser = getAuth().currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      console.error('Aborting league delete: user is not signed in with a full account.');
      return false;
    }
    await deleteDoc(doc(getDb(), 'leagues', leagueId));
    return true;
  } catch (error) {
    console.error('League deletion failed:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Member mutations
// ---------------------------------------------------------------------------

export async function syncAddLeagueMember(
  leagueId: string,
  member: LeagueMember,
): Promise<boolean> {
  try {
    const currentUser = getAuth().currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      console.error('Aborting add league member: user is not signed in with a full account.');
      return false;
    }
    const memberData = removeUndefined(member);
    await updateDoc(doc(getDb(), 'leagues', leagueId), {
      members: arrayUnion(memberData),
      memberIds: arrayUnion(member.userId),
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Failed to add league member:', error);
    return false;
  }
}

export async function syncRemoveLeagueMember(
  leagueId: string,
  userId: string,
): Promise<boolean> {
  try {
    const currentUser = getAuth().currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      console.error('Aborting remove league member: user is not signed in with a full account.');
      return false;
    }
    const ref = doc(getDb(), 'leagues', leagueId);
    await runTransaction(getDb(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const league = snap.data() as League;
      const members = (league.members ?? []).filter(m => m.userId !== userId);
      const memberIds = (league.memberIds ?? []).filter((id: string) => id !== userId);
      tx.update(ref, { members, memberIds, updatedAt: serverTimestamp() });
    });
    return true;
  } catch (error) {
    console.error('Failed to remove league member:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Pool mapping
// ---------------------------------------------------------------------------

/** Record the pool ID for a specific tournament in the league. */
export async function syncSetLeaguePool(
  leagueId: string,
  tournamentId: string,
  poolId: string,
): Promise<boolean> {
  try {
    const currentUser = getAuth().currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      console.error('Aborting set league pool: user is not signed in with a full account.');
      return false;
    }
    await updateDoc(doc(getDb(), 'leagues', leagueId), {
      [`tournamentPoolIds.${tournamentId}`]: poolId,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Failed to set league pool:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Real-time subscription
// ---------------------------------------------------------------------------

export function subscribeToLeague(
  leagueId: string,
  onUpdate: (league: League) => void,
): () => void {
  let unsubscribe: Unsubscribe;
  let lastData = '';

  try {
    unsubscribe = onSnapshot(
      doc(getDb(), 'leagues', leagueId),
      (snap) => {
        if (!snap.exists()) return;
        const league = toLeague(snap.data() as Record<string, unknown>);
        const current = JSON.stringify(league);
        if (current !== lastData) {
          lastData = current;
          onUpdate(league);
        }
      },
      () => { /* listener error — fall back to local data */ },
    );
  } catch {
    return () => {};
  }

  return () => unsubscribe?.();
}
