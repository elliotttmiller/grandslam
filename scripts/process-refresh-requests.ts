import 'dotenv/config';
import admin, { ServiceAccount } from 'firebase-admin';
import { refreshMadridDraw } from './refresh-madrid';

type ServiceAccountKey = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function parseServiceAccountJson(value: string): ServiceAccountKey {
  try {
    return JSON.parse(value) as ServiceAccountKey;
  } catch (err) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain a valid JSON object.');
  }
}

function loadServiceAccount(): ServiceAccountKey {
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!jsonEnv) {
    throw new Error('Missing backend credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON in the workflow secrets.');
  }
  return parseServiceAccountJson(jsonEnv);
}

function toServiceAccount(serviceAccount: ServiceAccountKey): ServiceAccount {
  return {
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email,
    privateKey: serviceAccount.private_key,
  };
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

async function processRefreshRequests() {
  const db = await initFirestore();
  const pending = await db.collection('system').where('status', '==', 'pending').get();

  if (pending.empty) {
    console.log('No pending refresh requests.');
    return;
  }

  for (const requestDoc of pending.docs) {
    const requestData = requestDoc.data();
    const tournamentId = requestData.tournamentId as string | undefined;
    const tournamentName = requestData.tournamentName as string | undefined;

    if (!tournamentId || !tournamentName) {
      console.warn(`Skipping refresh request ${requestDoc.id}: missing tournamentId or tournamentName.`);
      await requestDoc.ref.update({
        status: 'failed',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        message: 'Invalid refresh request payload.',
      });
      continue;
    }

    try {
      console.log(`Processing refresh request for ${tournamentId} (${tournamentName})`);
      await requestDoc.ref.update({
        status: 'running',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        message: 'Refresh request is being processed.',
      });

      if (tournamentId === 'madrid') {
        await refreshMadridDraw();
      } else {
        throw new Error(`Unsupported tournament refresh: ${tournamentId}`);
      }

      await requestDoc.ref.update({
        status: 'complete',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        message: 'Refresh completed successfully.',
      });
      console.log(`Refresh request completed for ${tournamentId}.`);
    } catch (error) {
      console.error(`Failed to process refresh request ${requestDoc.id}:`, error);
      await requestDoc.ref.update({
        status: 'failed',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        message: `Refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}

processRefreshRequests().catch((error) => {
  console.error('Failed to process refresh requests:', error);
  process.exit(1);
});
