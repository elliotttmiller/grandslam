import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODELS = [
  "gemini-3.1-flash-lite-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash"
];

export async function fetchTournamentPlayers(tournamentName: string) {
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

      return JSON.parse(response.text || "[]");
    } catch (error) {
      console.warn(`Model ${model} failed, trying next fallback...`, error);
      continue;
    }
  }
  
  throw new Error("All AI models failed to generate tournament data.");
}
