import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { top32Players } from "../lib/mock-data";

const MODELS = [
  "gemini-3.1-flash-lite-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
];

/** Build a realistic fallback player list from the mock data. */
function getMockPlayers(tournamentName: string) {
  return top32Players.map((p, i) => ({
    name: p.name,
    seed: i + 1,
    country: p.country,
  }));
}

export async function fetchTournamentPlayers(tournamentName: string) {
  // If no API key is configured, fall back immediately — no network call needed.
  if (!process.env.GEMINI_API_KEY) {
    console.info("No Gemini API key found, using mock player data.");
    return getMockPlayers(tournamentName);
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const prompt = `Provide the top 32 tennis players for the ${tournamentName} with their seed numbers (1-32). Return the result as a JSON array of objects, each with 'name' (string), 'seed' (number), and 'country' (string).`;

  for (const model of MODELS) {
    try {
      const config: any = {
        responseMimeType: "application/json",
        responseSchema: {
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
        },
      };

      // Only add thinkingConfig for Gemini 3 series models
      if (model.startsWith("gemini-3")) {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      }

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config,
      });

      const parsed = JSON.parse(response.text || "[]");
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (error) {
      console.warn(`Model ${model} failed, trying next fallback...`, error);
    }
  }

  // All AI models failed — fall back to mock data so the app still works.
  console.warn("All AI models failed. Falling back to mock player data.");
  return getMockPlayers(tournamentName);
}
