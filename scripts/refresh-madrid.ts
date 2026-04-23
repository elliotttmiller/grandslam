import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import admin, { ServiceAccount } from 'firebase-admin';
import { buildBracketFromDraw, applyByesToBracket, Player } from '../src/lib/bracket-utils';
import { getMadrid2026OfficialDrawSlots } from '../src/lib/madrid-2026-data';

interface ServiceAccountKey {
  project_id: string;
  client_email: string;
  private_key: string;
}

function toServiceAccount(serviceAccount: ServiceAccountKey): ServiceAccount {
  return {
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email,
    privateKey: serviceAccount.private_key,
  };
}

function parseServiceAccountJson(value: string): ServiceAccountKey {
  try {
    return JSON.parse(value) as ServiceAccountKey;
  } catch (err) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain a valid JSON object.');
  }
}

function loadServiceAccount(): ServiceAccountKey {
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonEnv) {
    return parseServiceAccountJson(jsonEnv);
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credentialsPath) {
    const resolved = path.isAbsolute(credentialsPath)
      ? credentialsPath
      : path.resolve(process.cwd(), credentialsPath);
    const raw = fs.readFileSync(resolved, 'utf8');
    return parseServiceAccountJson(raw);
  }

  throw new Error(
    'Missing backend credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON with your Firebase service account JSON or GOOGLE_APPLICATION_CREDENTIALS to a JSON file path.'
  );
}

async function initFirestore() {
  if (admin.apps.length === 0) {
    const serviceAccount = loadServiceAccount();
    admin.initializeApp({
      credential: admin.credential.cert(toServiceAccount(serviceAccount)),
      projectId: serviceAccount.project_id,
    });
  }
  return admin.firestore();
}

function normalizeMadridDraw() {
  const officialSlots = getMadrid2026OfficialDrawSlots();
  return officialSlots.map((player, index) => ({
    id: `p${index + 1}`,
    name: player.name,
    seed: player.seed,
    country: player.country,
  })) as Player[];
}

async function refreshMadridDraw() {
  const db = await initFirestore();
  const drawPlayers = normalizeMadridDraw();
  const bracket = applyByesToBracket(buildBracketFromDraw(drawPlayers));

  const tournamentRef = db.collection('tournaments').doc('madrid');
  await tournamentRef.set({
    tournamentId: 'madrid',
    tournamentName: 'Mutua Madrid Open',
    officialMatches: bracket,
    drawStatus: 'official',
    lastRefreshedAt: new Date().toISOString(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log('Madrid official draw refresh completed. Firestore tournaments/madrid updated.');
}

refreshMadridDraw().catch((error) => {
  console.error('Failed to refresh Madrid draw:', error);
  process.exit(1);
});
