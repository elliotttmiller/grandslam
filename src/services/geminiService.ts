import { GoogleGenAI, Type } from "@google/genai";
import { top32Players } from "../lib/mock-data";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PlayerData {
  name: string;
  seed: number;
  country: string;
}

interface CacheEntry {
  players: PlayerData[];
  fetchedAt: number;
  source: "ai" | "mock";
}

// ─── Constants ────────────────────────────────────────────────────────────────
// Primary model requested by product. Fallback to a stable GA model only if the
// preview endpoint is unavailable.
const PRIMARY_MODEL = "gemini-3-flash-preview";
const FALLBACK_MODEL = "gemini-2.5-flash";

const CACHE_KEY_PREFIX = "grandslam_players_";

// ─── In-memory cache (module singleton) ───────────────────────────────────────
// Keyed by tournament name (lower-cased). Survives React re-renders without any
// network call.
const memCache = new Map<string, CacheEntry>();

// ─── SessionStorage helpers ───────────────────────────────────────────────────
// Persist cache across hard-refreshes within the same browser session so the
// user never waits for Gemini on a simple page reload.

function storageKey(tournamentName: string): string {
  return CACHE_KEY_PREFIX + tournamentName.toLowerCase().replace(/\s+/g, "_");
}

function loadFromStorage(tournamentName: string): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(storageKey(tournamentName));
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function saveToStorage(tournamentName: string, entry: CacheEntry): void {
  try {
    sessionStorage.setItem(storageKey(tournamentName), JSON.stringify(entry));
  } catch {
    // sessionStorage may be unavailable (private-browsing quota, iframe, etc.)
  }
}

function removeFromStorage(tournamentName: string): void {
  try {
    sessionStorage.removeItem(storageKey(tournamentName));
  } catch {
    // ignore
  }
}

// ─── Public cache management ──────────────────────────────────────────────────
/**
 * Clear the player cache for a specific tournament (or all tournaments).
 * Call this before a forced refresh so `fetchTournamentPlayers` hits the AI.
 */
export function clearPlayerCache(tournamentName?: string): void {
  if (tournamentName) {
    memCache.delete(tournamentName.toLowerCase());
    removeFromStorage(tournamentName);
  } else {
    memCache.clear();
    try {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith(CACHE_KEY_PREFIX)) sessionStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
  }
}

// ─── Mock fallback ────────────────────────────────────────────────────────────
function getMockPlayers(): PlayerData[] {
  return top32Players.map((p, i) => ({
    name: p.name,
    seed: i + 1,
    country: p.country,
  }));
}

// ─── Core fetch ───────────────────────────────────────────────────────────────
/**
 * Fetch the top-32 seeded players for a Grand Slam tournament.
 *
 * Results are cached in memory AND sessionStorage so re-rendering or navigating
 * back never wastes an API call.  Pass `forceRefresh: true` only when the user
 * explicitly triggers a "Refresh Players" action.
 */
export async function fetchTournamentPlayers(
  tournamentName: string,
  { forceRefresh = false }: { forceRefresh?: boolean } = {}
): Promise<PlayerData[]> {
  // ── 1. Return from cache unless a refresh was requested ──────────────────
  if (!forceRefresh) {
    const key = tournamentName.toLowerCase();

    // Check in-memory cache first (fastest path)
    const memHit = memCache.get(key);
    if (memHit) {
      console.info(`[GeminiService] Cache HIT (memory) for "${tournamentName}"`);
      return memHit.players;
    }

    // Check sessionStorage (survives React re-mounts / page reloads)
    const storageHit = loadFromStorage(tournamentName);
    if (storageHit) {
      memCache.set(key, storageHit); // warm the memory cache
      console.info(`[GeminiService] Cache HIT (session) for "${tournamentName}"`);
      return storageHit.players;
    }
  }

  // ── 2. No API key → fall back to static mock data immediately ────────────
  if (!process.env.GEMINI_API_KEY) {
    console.info("[GeminiService] No API key — using mock player data.");
    const players = getMockPlayers();
    const entry: CacheEntry = { players, fetchedAt: Date.now(), source: "mock" };
    const key = tournamentName.toLowerCase();
    memCache.set(key, entry);
    saveToStorage(tournamentName, entry);
    return players;
  }

  // ── 3. Call Gemini ────────────────────────────────────────────────────────
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Include the current year so the model targets the most recent draw
  // rather than guessing the season.
  const currentYear = new Date().getFullYear();

  const prompt =
    `You are a tennis data expert. List the top 32 seeded players for the ` +
    `${tournamentName} ${currentYear} tournament. ` +
    `If ${currentYear} data is unavailable, use the most recent completed edition. ` +
    `Return a JSON array of exactly 32 objects ordered by seed (1 = top seed). ` +
    `Each object must have: "name" (full player name), "seed" (integer 1-32), ` +
    `"country" (3-letter IOC country code).`;

  const responseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        seed: { type: Type.INTEGER },
        country: { type: Type.STRING },
      },
      required: ["name", "seed", "country"],
    },
  };

  // Try primary model, then fallback — no unnecessary retries.
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      console.info(`[GeminiService] Fetching "${tournamentName}" via ${model}…`);

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema,
        },
      });

      const parsed: unknown = JSON.parse(response.text ?? "[]");

      if (Array.isArray(parsed) && parsed.length > 0) {
        const players = parsed as PlayerData[];
        const entry: CacheEntry = { players, fetchedAt: Date.now(), source: "ai" };
        const key = tournamentName.toLowerCase();
        memCache.set(key, entry);
        saveToStorage(tournamentName, entry);
        console.info(
          `[GeminiService] Fetched & cached ${players.length} players for "${tournamentName}" (${model})`
        );
        return players;
      }

      console.warn(`[GeminiService] ${model} returned empty array — trying fallback.`);
    } catch (err) {
      console.warn(`[GeminiService] ${model} failed:`, err);
    }
  }

  // ── 4. All models failed → return mock data and cache it ─────────────────
  console.warn("[GeminiService] All models failed — falling back to mock data.");
  const players = getMockPlayers();
  const entry: CacheEntry = { players, fetchedAt: Date.now(), source: "mock" };
  const key = tournamentName.toLowerCase();
  memCache.set(key, entry);
  saveToStorage(tournamentName, entry);
  return players;
}
