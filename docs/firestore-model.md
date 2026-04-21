# Firestore data model for GrandSlam

This document describes the recommended Firestore schema and the reasoning
behind the security rules shipped in `firestore.rules`.

Collections

- `leagues` (document id = 6-char league code)
  - Fields: `name`, `description?`, `year`, `isPrivate`, `createdBy`, `createdByName`,
    `ownerId`, `createdAt`, `updatedAt?`, `members`, `memberIds`, `tournamentPoolIds`
  - `ownerId` is the canonical owner field required by security rules.

- `pools` (document id = 6-char pool code)
  - Fields: `name`, `tournamentId`, `tournamentName`, `createdAt`, `officialMatches`,
    `entries`, `createdBy?`, `ownerId?`, `participantIds?`, `leagueId?`, `updatedAt?`
  - `ownerId` is optional but recommended for rules that require ownership checks.

Design notes

- We keep `createdBy` for backwards compatibility but write `ownerId` on new
  documents so Firestore rules can unambiguously check ownership.
- `memberIds` and `participantIds` are flat string arrays used for efficient
  `array-contains` queries.

Security summary

- Leagues are owner-controlled: only `ownerId` may update or delete a league.
- Pools are owner-controlled for structural changes; participants may append
  entries using a constrained client-side update (see `firestore.rules`) or
  use a server-mediated Cloud Function for stricter validation.

Migration

- To migrate existing documents that only have `createdBy`, set `ownerId = createdBy`.
  See `docs/migration.md` for an admin script template.
