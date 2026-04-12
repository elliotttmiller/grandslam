/**
 * GrandSlam Pool Sync Server
 *
 * Lightweight Express server that provides:
 *   REST API  — CRUD operations on pools and entries
 *   SSE stream — real-time push of pool updates to connected clients
 *   JSON file  — persistent storage in ./data/pools.json
 *
 * Usage:
 *   npm run server          # start on PORT (default 3001)
 *   PORT=4000 npm run server
 *
 * The Vite dev server proxies /api/* to this process so the browser can reach
 * it without CORS issues during local development.
 */

import express, { Request, Response, NextFunction } from 'express';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Types (inline — avoids importing browser-targeted source files)
// ---------------------------------------------------------------------------

interface PoolEntry {
  id: string;
  userId?: string;
  userName: string;
  bracketName: string;
  matches: unknown[];
  tiebreakerGames?: number;
  tiebreakerSets?: number;
  submittedAt?: string;
  isSubmitted: boolean;
  updatedAt?: string;
}

interface Pool {
  id: string;
  name: string;
  tournamentId: string;
  tournamentName: string;
  createdAt: string;
  officialMatches: unknown[];
  entries: PoolEntry[];
  updatedAt?: string;
}

type PoolDatabase = Record<string, Pool>;

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'pools.json');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function loadDb(): PoolDatabase {
  try {
    if (!existsSync(DB_FILE)) return {};
    return JSON.parse(readFileSync(DB_FILE, 'utf-8')) as PoolDatabase;
  } catch {
    return {};
  }
}

function saveDb(db: PoolDatabase): void {
  writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Server-Sent Events helpers
// ---------------------------------------------------------------------------

/** Map from poolId to the set of currently connected SSE responses. */
const subscribers = new Map<string, Set<Response>>();

function notifySubscribers(pool: Pool): void {
  const clients = subscribers.get(pool.id);
  if (!clients?.size) return;
  const payload = `data: ${JSON.stringify(pool)}\n\n`;
  clients.forEach((res) => {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  });
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(express.json({ limit: '10mb' }));

// Permissive CORS so the Vite dev server (different port) can call the API.
// In production, restrict Access-Control-Allow-Origin to your domain.
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
app.options('*', (_req: Request, res: Response) => res.sendStatus(204));

/** Pool IDs are 4–10 uppercase alphanumeric characters. */
const POOL_ID_RE = /^[A-Za-z0-9]{4,10}$/;

function isValidPoolId(id: unknown): id is string {
  return typeof id === 'string' && POOL_ID_RE.test(id);
}

/** Entry IDs are 4–16 uppercase alphanumeric characters. */
const ENTRY_ID_RE = /^[A-Za-z0-9]{4,16}$/;

function isValidEntryId(id: unknown): id is string {
  return typeof id === 'string' && ENTRY_ID_RE.test(id);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** GET /api/pools/:id — fetch a single pool */
app.get('/api/pools/:id', (req: Request, res: Response) => {
  if (!isValidPoolId(req.params.id)) {
    res.status(400).json({ error: 'Invalid pool id' });
    return;
  }
  const db = loadDb();
  const pool = Object.hasOwn(db, req.params.id) ? db[req.params.id] : undefined;
  if (!pool) {
    res.status(404).json({ error: 'Pool not found' });
    return;
  }
  res.json(pool);
});

/** POST /api/pools — create a new pool */
app.post('/api/pools', (req: Request, res: Response) => {
  const body = req.body as Pool;
  if (!isValidPoolId(body?.id)) {
    res.status(400).json({ error: 'Invalid pool: missing or malformed id' });
    return;
  }
  const db = loadDb();
  if (Object.hasOwn(db, body.id)) {
    // Pool already exists — return it (idempotent)
    res.status(200).json(db[body.id]);
    return;
  }
  body.updatedAt = new Date().toISOString();
  db[body.id] = body;
  saveDb(db);
  res.status(201).json(body);
});

/** POST /api/pools/:id/entries — add a new bracket entry */
app.post('/api/pools/:id/entries', (req: Request, res: Response) => {
  if (!isValidPoolId(req.params.id)) {
    res.status(400).json({ error: 'Invalid pool id' });
    return;
  }
  const db = loadDb();
  const pool = Object.hasOwn(db, req.params.id) ? db[req.params.id] : undefined;
  if (!pool) {
    res.status(404).json({ error: 'Pool not found' });
    return;
  }
  const entry = req.body as PoolEntry;
  if (!isValidEntryId(entry?.id)) {
    res.status(400).json({ error: 'Invalid entry: missing or malformed id' });
    return;
  }
  const existing = pool.entries.find((e) => e.id === entry.id);
  if (existing) {
    // Idempotent — entry already exists
    res.status(200).json(existing);
    return;
  }
  entry.updatedAt = new Date().toISOString();
  pool.entries.push(entry);
  pool.updatedAt = new Date().toISOString();
  db[pool.id] = pool;
  saveDb(db);
  notifySubscribers(pool);
  res.status(201).json(entry);
});

/**
 * PATCH /api/pools/:id/entries/:entryId — update picks, submit, tiebreaker
 *
 * Conflict resolution: last-write-wins.  The server always stamps
 * `updatedAt` with its own current time so all clients agree on ordering.
 */
app.patch(
  '/api/pools/:id/entries/:entryId',
  (req: Request, res: Response) => {
    if (!isValidPoolId(req.params.id) || !isValidEntryId(req.params.entryId)) {
      res.status(400).json({ error: 'Invalid pool or entry id' });
      return;
    }
    const db = loadDb();
    const pool = Object.hasOwn(db, req.params.id) ? db[req.params.id] : undefined;
    if (!pool) {
      res.status(404).json({ error: 'Pool not found' });
      return;
    }
    const idx = pool.entries.findIndex((e) => e.id === req.params.entryId);
    if (idx < 0) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }
    const patch = req.body as Partial<PoolEntry>;
    pool.entries[idx] = {
      ...pool.entries[idx],
      ...patch,
      // Server-authoritative timestamp (overrides any client-supplied value)
      updatedAt: new Date().toISOString(),
    };
    pool.updatedAt = new Date().toISOString();
    db[pool.id] = pool;
    saveDb(db);
    notifySubscribers(pool);
    res.json(pool.entries[idx]);
  },
);

/** DELETE /api/pools/:id — remove a pool */
app.delete('/api/pools/:id', (req: Request, res: Response) => {
  if (!isValidPoolId(req.params.id)) {
    res.status(400).json({ error: 'Invalid pool id' });
    return;
  }
  const db = loadDb();
  if (!Object.hasOwn(db, req.params.id)) {
    res.status(404).json({ error: 'Pool not found' });
    return;
  }
  delete db[req.params.id];
  saveDb(db);
  // Clean up any lingering SSE subscribers
  subscribers.delete(req.params.id);
  res.sendStatus(204);
});

/**
 * GET /api/sync/:poolId — Server-Sent Events stream
 *
 * Immediately sends the current pool state, then streams updates as other
 * clients modify picks, submit brackets, or join the pool.
 * A heartbeat comment (:heartbeat) is sent every 30 s to keep the
 * connection alive through proxies and load balancers.
 */
app.get('/api/sync/:poolId', (req: Request, res: Response) => {
  if (!isValidPoolId(req.params.poolId)) {
    res.status(400).json({ error: 'Invalid pool id' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current state to the new subscriber immediately
  const db = loadDb();
  const pool = Object.hasOwn(db, req.params.poolId)
    ? db[req.params.poolId]
    : undefined;
  if (pool) {
    res.write(`data: ${JSON.stringify(pool)}\n\n`);
  }

  // Register subscriber
  if (!subscribers.has(req.params.poolId)) {
    subscribers.set(req.params.poolId, new Set());
  }
  subscribers.get(req.params.poolId)!.add(res);

  // Heartbeat to prevent proxy timeouts
  const poolId = req.params.poolId;
  const heartbeat = setInterval(() => {
    try {
      res.write(':heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      // Also remove this dead connection from subscribers to prevent memory leak
      subscribers.get(poolId)?.delete(res);
    }
  }, 30_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    subscribers.get(poolId)?.delete(res);
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`[grandslam] Pool sync server running on http://localhost:${PORT}`);
  console.log(`[grandslam] Database: ${DB_FILE}`);
});
