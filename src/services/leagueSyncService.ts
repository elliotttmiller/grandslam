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

/** Fetch all leagues where userId appears in the members array. */
export async function syncGetUserLeagues(userId: string): Promise<League[]> {
  try {
    const col = collection(getDb(), 'leagues');
    const q = query(col, where('members', 'array-contains', { userId }));
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

// ---------------------------------------------------------------------------
// Member mutations
// ---------------------------------------------------------------------------

export async function syncAddLeagueMember(
  leagueId: string,
  member: LeagueMember,
): Promise<boolean> {
  try {
    const memberData = removeUndefined(member);
    await updateDoc(doc(getDb(), 'leagues', leagueId), {
      members: arrayUnion(memberData),
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
    const ref = doc(getDb(), 'leagues', leagueId);
    await runTransaction(getDb(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const league = snap.data() as League;
      const members = (league.members ?? []).filter(m => m.userId !== userId);
      tx.update(ref, { members, updatedAt: serverTimestamp() });
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
