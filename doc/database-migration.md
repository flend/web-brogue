# Moving an existing database to MongoDB 8.0

Keep the original dump and original server unchanged until a rehearsal succeeds.
Record the source MongoDB version, dump tool version if known, database name,
and whether the backup is a BSON directory, an archive (possibly compressed),
JSON exports, or raw database files. Raw database files are not a mongodump backup.

MongoDB documents `mongorestore` compatibility for the same major version or
feature compatibility version as the source. Do not assume an ancient BSON dump
can be restored directly into 8.0 simply because it contains BSON.

For an ancient source, restore a copy into an isolated instance matching the
source release using compatible tools. From there, choose either MongoDB's
supported sequential upgrades or a tested logical export/import path. Do not
point MongoDB 8.0 at the old data directory.

If JSON is needed, use Extended JSON with a supported exporter/importer that
matches the bridge server. Canonical Extended JSON retains explicit BSON types;
plain JSON can silently change ObjectIds, dates, and numeric types. Very old tools
may emit legacy Extended JSON; current `mongoimport` supports this format with
`--legacy`. Rehearse the exact conversion on the actual backup before relying on it.
JSON export/import does not carry indexes, collection options, or database users.

## Known source: MongoDB 3.6.8

The existing host reports MongoDB 3.6.8 on Ubuntu 20.04. Its dump/export tools
report `built-without-version-string` (Go 1.10.1). The initial live counts are:

| Collection | Documents |
| --- | ---: |
| chatrecords | 172 |
| counters | 1 |
| gamerecords | 213697 |
| newsrecords | 83 |
| users | 19666 |

These are reference counts from a running server; collect fresh counts during
final cutover with writes stopped. For rehearsal, retain a BSON `mongodump` as
well as per-collection exports from the source's `mongoexport` (default newline
delimited Extended JSON, without `--jsonArray`).

The proposed import uses modern MongoDB Database Tools against a new, empty
MongoDB 8.0 database. For each exported file:

```sh
mongoimport --uri "$MIGRATION_MONGODB_URI" --legacy --stopOnError \
  --collection gamerecords --file /path/to/export/gamerecords.json
```

Repeat for all five collections, using the matching collection names and files.
Do not use `--drop` on the original database or import application JSON into an
existing database. Preserve the source BSON dump as a fallback while we test
this route. The actual 3.6 export/import rehearsal has not yet been completed.

## Application data to preserve

- Keep collection names: `users`, `gamerecords`, `chatrecords`, `newsrecords`, and
  `counters`. Verify the actual source collection list rather than assuming these
  are the only collections.
- Preserve `_id` values and BSON date types; retain game `seed` and `seedHigh`
  separately as stored numbers. The server combines them using BigInt and sends
  decimal seed strings to browsers.
- Preserve `users.password` verbatim. bcryptjs can verify the old bcrypt-nodejs
  hashes; no password reset or rehash is needed. Regression tests exercise a hash
  generated with the old library.
- Preserve the `counters` document with `_id: "newsrecords"` so news numbering
  continues from its current sequence.
- Back up `game-data/` and any recording files stored elsewhere. The database
  contains recording paths, not the recordings themselves. Restore compatible
  paths and retain the old Brogue binaries needed to replay recordings.
- Keep the existing session secret in configuration or `SESSION_SECRET` to retain
  saved login tokens.

## Rehearsal and cutover

1. Restore into a new, empty database on a separate MongoDB 8.0 instance. Select
   only application namespaces; provision database credentials separately.
2. Compare exact per-collection counts and representative documents against the
   source. Compare IDs, dates, password hashes, seed halves, variants, and news
   sequence values with their original types.
3. Review source indexes and collection options. The application declares
   `users: { username: 1 }` and the unique game index
   `{ date: 1, username: -1 }`. Recreate required indexes and investigate duplicate
   failures; do not silently discard documents or rely solely on app startup.
4. Run the upgraded app against the rehearsal URI and check existing-user login,
   new registration, news, scores, statistics, chat, new game saves, and downloads
   and replay of old recordings. Run `npm test` separately against its disposable
   test database, not against the migrated data.
5. At cutover, stop writes on the old server, take the final backup, repeat the
   proven migration, and compare counts again before switching `MONGODB_URI`.
   Retain the original server/data for rollback. Writes made after cutover need
   reconciliation before any rollback.

The source-specific commands and a verified import result remain pending until
we have the actual dump and its source-version information.

References: [mongorestore compatibility](https://www.mongodb.com/docs/database-tools/mongorestore/mongorestore-behavior-access-usage/),
[Extended JSON](https://www.mongodb.com/docs/manual/reference/mongodb-extended-json/).
