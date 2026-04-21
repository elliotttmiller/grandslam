# Migration and server-mediated write guidance

This document provides a small admin-side migration template and guidance for
handling participant writes via a Cloud Function when you need stricter
validation than Firestore security rules can express.

1) Admin migration: copy `createdBy` -> `ownerId`

Use the Firebase Admin SDK (Node.js) to set `ownerId = createdBy` for existing
documents. Run this from a trusted environment (your admin machine or CI) and
ensure you have a recent backup.

Example (template):

```js
// migration-set-ownerId.js (run with `node migration-set-ownerId.js`)
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('./service-account.json'); // path to admin key
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function migrateLeagues() {
  const snaps = await db.collection('leagues').get();
  for (const doc of snaps.docs) {
    const data = doc.data();
    if (!data.ownerId && data.createdBy) {
      console.log('Patching league', doc.id, '-> ownerId=', data.createdBy);
      await doc.ref.update({ ownerId: data.createdBy });
    }
  }
}

async function migratePools() {
  const snaps = await db.collection('pools').get();
  for (const doc of snaps.docs) {
    const data = doc.data();
    if (!data.ownerId && data.createdBy) {
      console.log('Patching pool', doc.id, '-> ownerId=', data.createdBy);
      await doc.ref.update({ ownerId: data.createdBy });
    }
  }
}

(async () => {
  await migrateLeagues();
  await migratePools();
  console.log('Migration complete');
})();
```

2) Server-mediated writes (Cloud Function)

If you need to strictly guarantee that appended entries belong to the
requesting user (e.g. the entry.userId must equal the request.auth.uid), use
a Cloud Function HTTP endpoint that:

- receives the intended entry payload from the client,
- verifies `auth.uid` from the Firebase Authentication token (the function
  runs with admin rights so it can write safely),
- performs any necessary business validation, and
- writes the entry to the pool document in Firestore (using `arrayUnion` or
  a transaction) while setting `participantIds` as needed.

This pattern keeps client-side rules strict while enabling complex validation
server-side.
