import type { Pool, PoolEntry } from '@/lib/pool-types';

/**
 * Base URL for the sync API. Reads VITE_SYNC_API_URL at build-time; falls
 * back to '/api' which Vite proxies to the local sync server during
 * development.  For production deployments, set VITE_SYNC_API_URL to the
 * full URL of the running server (e.g. "https://your-server.example.com").
 */
const API_BASE: string =
  (import.meta.env.VITE_SYNC_API_URL as string | undefined) ?? '/api';

/** Fetch a pool by its 6-char code from the central server. */
export async function syncGetPool(id: string): Promise<Pool | null> {
  try {
    const res = await fetch(`${API_BASE}/pools/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as Pool;
  } catch {
    return null;
  }
}

/** Push a newly-created pool to the server. */
export async function syncCreatePool(pool: Pool): Promise<Pool | null> {
  try {
    const res = await fetch(`${API_BASE}/pools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pool),
    });
    if (!res.ok) return null;
    return (await res.json()) as Pool;
  } catch {
    return null;
  }
}

/** Add a new bracket entry to an existing pool on the server. */
export async function syncAddEntry(
  poolId: string,
  entry: PoolEntry,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/pools/${poolId}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Patch an existing entry on the server (picks, submit, tiebreaker). */
export async function syncUpdateEntry(
  poolId: string,
  entryId: string,
  patch: Partial<PoolEntry>,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/pools/${poolId}/entries/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Subscribe to live pool updates via Server-Sent Events.
 * The callback is invoked immediately with the current pool state and then
 * on every subsequent change pushed by the server.
 *
 * Returns a cleanup function that closes the SSE connection.
 */
export function subscribeToPool(
  poolId: string,
  onUpdate: (pool: Pool) => void,
): () => void {
  let es: EventSource | null = null;
  try {
    es = new EventSource(`${API_BASE}/sync/${poolId}`);
    es.onmessage = (e) => {
      try {
        const pool = JSON.parse(e.data as string) as Pool;
        onUpdate(pool);
      } catch {
        // ignore malformed messages
      }
    };
    es.onerror = () => {
      // EventSource will auto-reconnect; no action required.
    };
  } catch {
    // SSE not supported or server unavailable — caller gracefully degrades.
  }
  return () => {
    es?.close();
  };
}
