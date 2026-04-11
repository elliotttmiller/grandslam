import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const TODAY_STR = new Date().toISOString().split('T')[0];
const GROUNDING_MODEL = "gemini-2.5-flash";
const PRIMARY_MODEL = "gemini-3.1-flash-lite-preview";
const FALLBACK_MODEL = "gemini-2.5-flash";

const CACHE_KEY_TOURNAMENTS = 'tennis_tournaments_cache_v5';
const CACHE_KEY_PLAYERS_PREFIX = 'tennis_players_cache_v5_';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

export interface TournamentData {
  id: string;
  name: string;
  startDate: string; // ISO format
  endDate: string;
  logo?: string;
}

function extractJsonArray(text: string): any[] {
  try {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(text.substring(start, end + 1));
    }
  } catch (e) {
    console.error("Failed to parse JSON array from text", e);
  }
  return [];
}

const TOURNAMENT_LOGOS: Record<string, string> = {
  'ao': '/Australian-Open-Logo-360x225.png',
  'rg': '/Roland-Garros-Logo-1536x960.png',
  'wim': '/Wimbledon-Logo.png',
  'uso': '/new-US-Open-logo-png-large-size.png'
};

export async function fetchTournamentsWithDates() {
  // Check cache first
  const cached = localStorage.getItem(CACHE_KEY_TOURNAMENTS);
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_EXPIRY) {
      return data as TournamentData[];
    }
  }

  const prompt = `Today is ${TODAY_STR}. Find the dates for the NEXT upcoming edition of the four Grand Slam tennis tournaments (Australian Open, French Open/Roland Garros, Wimbledon, US Open) relative to today. 
  Return a JSON array of exactly 4 objects with:
  - 'id': short string (e.g., 'ao', 'rg', 'wim', 'uso')
  - 'name': full tournament name including the year (e.g., 'Wimbledon 2026')
  - 'startDate': the start date of the main draw in YYYY-MM-DD format
  - 'endDate': the end date of the main draw in YYYY-MM-DD format
  - 'logo': a high-quality public URL for the tournament logo if possible, otherwise null
  
  Do not include any markdown formatting or extra text outside the JSON array.`;

  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        name: { type: Type.STRING },
        startDate: { type: Type.STRING },
        endDate: { type: Type.STRING },
        logo: { type: Type.STRING, nullable: true },
      },
      required: ["id", "name", "startDate", "endDate"],
    },
  };

  let data: TournamentData[] = [];

  // Tier 1: Grounded Search
  try {
    const response = await ai.models.generateContent({
      model: GROUNDING_MODEL,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    data = extractJsonArray(response.text || "");
  } catch (e) {
    console.warn("Tier 1 (Grounded) error:", e);
  }

  // Tier 2: Primary Model (Structured)
  if (!data || data.length === 0) {
    try {
      const response = await ai.models.generateContent({
        model: PRIMARY_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        },
      });
      data = JSON.parse(response.text || "[]");
    } catch (e) {
      console.warn("Tier 2 (Primary) error:", e);
    }
  }

  // Tier 3: Fallback Model (Structured)
  if (!data || data.length === 0) {
    try {
      const response = await ai.models.generateContent({
        model: FALLBACK_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });
      data = JSON.parse(response.text || "[]");
    } catch (e) {
      console.warn("Tier 3 (Fallback) error:", e);
    }
  }

  if (data && data.length > 0) {
    // Map reliable PNG logos
    data = data.map(t => ({
      ...t,
      logo: TOURNAMENT_LOGOS[t.id] || t.logo
    }));
    localStorage.setItem(CACHE_KEY_TOURNAMENTS, JSON.stringify({ data, timestamp: Date.now() }));
    return data as TournamentData[];
  }

  console.error("All AI models failed to fetch tournaments with dates.");
  // Fallback to basic list if search fails
  const fallback = [
    { id: 'ao', name: 'Australian Open', startDate: '2026-01-12', endDate: '2026-01-25', logo: TOURNAMENT_LOGOS['ao'] },
    { id: 'rg', name: 'French Open', startDate: '2026-05-24', endDate: '2026-06-07', logo: TOURNAMENT_LOGOS['rg'] },
    { id: 'wim', name: 'Wimbledon', startDate: '2026-06-29', endDate: '2026-07-12', logo: TOURNAMENT_LOGOS['wim'] },
    { id: 'uso', name: 'US Open', startDate: '2026-08-31', endDate: '2026-09-13', logo: TOURNAMENT_LOGOS['uso'] },
  ];
  return fallback;
}

export async function fetchTournamentPlayers(tournamentName: string) {
  const cacheKey = `${CACHE_KEY_PLAYERS_PREFIX}${tournamentName.replace(/\s+/g, '_').toLowerCase()}`;
  
  // Check cache first
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_EXPIRY) {
      return data;
    }
  }

  const prompt = `Today is ${TODAY_STR}. Search for the actual, real-time top 32 seeded players for the ${tournamentName} edition closest to today. 
  If official seedings aren't published yet, generate a professional pre-tournament predicted bracket from current world rankings with surface-based adjustments.
  Return the result strictly as a JSON array of exactly 32 objects, each with 'name' (string), 'seed' (number), and 'country' (string). Do not include any markdown formatting or extra text outside the JSON array.`;

  const schema = {
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

  let data: any[] = [];

  // Tier 1: Grounded Search
  try {
    const response = await ai.models.generateContent({
      model: GROUNDING_MODEL,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    data = extractJsonArray(response.text || "");
    if (data && data.length === 32) {
      localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
      return data;
    }
    console.warn(`Tier 1 (Grounded) failed: returned ${data?.length} players instead of 32.`);
  } catch (e) {
    console.warn("Tier 1 (Grounded) error:", e);
  }

  // Tier 2: Primary Model (Structured)
  try {
    const response = await ai.models.generateContent({
      model: PRIMARY_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      },
    });
    data = JSON.parse(response.text || "[]");
    if (data && data.length === 32) {
      localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
      return data;
    }
    console.warn(`Tier 2 (Primary) failed: returned ${data?.length} players instead of 32.`);
  } catch (e) {
    console.warn("Tier 2 (Primary) error:", e);
  }

  // Tier 3: Fallback Model (Structured)
  try {
    const response = await ai.models.generateContent({
      model: FALLBACK_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });
    data = JSON.parse(response.text || "[]");
    if (data && data.length === 32) {
      localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
      return data;
    }
    console.warn(`Tier 3 (Fallback) failed: returned ${data?.length} players instead of 32.`);
  } catch (e) {
    console.warn("Tier 3 (Fallback) error:", e);
  }
  
  throw new Error("All AI models failed to generate exactly 32 players.");
}
