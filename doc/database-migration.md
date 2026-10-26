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

## Run the migration script on the destination server

Use Node 24, install the dependencies in `server` (`npm ci --omit=dev` is
sufficient), and install current MongoDB Database Tools so `mongoimport` is on
`PATH`. The script was tested with Database Tools 100.19.1 and MongoDB 8.0.34.
If needed, set `MONGOIMPORT=/full/path/to/mongoimport` instead of changing `PATH`.
The MongoDB server must already be running; this script does not install or start it.

The input is a **directory** with these five newline-delimited legacy Extended
JSON exports: `counters.json`, `users.json`, `newsrecords.json`, `chatrecords.json`,
and `gamerecords.json`. Use the source's `mongoexport` without `--jsonArray`.
For modern exports (for example MongoDB 7 with Database Tools 100.x), add
`--json-format v2` to both preflight and import commands. This accepts canonical
or relaxed Extended JSON v2 and omits mongoimport's `--legacy` option. The
default remains `legacy` for the original MongoDB 3.6 export workflow. Both
formats use the same empty-target safeguards and full document verification;
the selected format is recorded in the report.
If the export was transferred as an archive, extract it first:

```sh
mkdir -p /path/to/json-export
tar -xzf /path/to/brogue-json-export.tar.gz -C /path/to/json-export
```

On the destination, from this repository:

```sh
cd server
nvm use
export MIGRATION_MONGODB_URI='mongodb://127.0.0.1:27017/brogue_new'

# Read all input files and check the tool, target version, and empty target.
# This does not create collections or insert documents.
npm run migrate:json -- /path/to/json-export --check-only

# For the final migration, keep app writes stopped while this runs.
npm run migrate:json -- /path/to/json-export --report /path/to/new-migration-report.json
```

Set the URI to your intended new database, adding authentication options as
needed. The URI must explicitly name a database; there is no default from the
app configuration. Any existing target collection causes the script to refuse
an import, even if the collection is empty. System databases are also refused.
Keep the app stopped against this target throughout preflight, import, and
validation. The script does not stop a running application for you.

The script scans every input file before writing, detects malformed JSON and
duplicate IDs, checks the news sequence counter, and imports with
`--legacy --stopOnError`. It recreates the application's username and unique
game indexes, plus a partial unique username index for new registrations. It then compares every imported document by ID against a
fingerprint of its source JSON, checks counts, and checks that source files
have not changed. BSON IDs and dates remain typed, and numeric values are
compared without converting 64-bit integers to floating-point values. JSON
alone cannot prove the original BSON numeric subtypes; retain the BSON backup
for that additional comparison, as performed in the first rehearsal below.

`--report` is optional. It records counts, source file SHA-256 digests, tool and
server versions, index names, and the validation outcome. Its parent directory
must already exist and its file must not exist. Keep the report outside the
JSON export directory, which must contain only the five collection JSON files.
The report contains no documents or connection credentials. The temporary
MongoDB tool configuration is restricted to its owner and removed on exit.

The completed script was also run against the full rehearsal export on
2026-10-24: all 233,619 documents imported and passed its source JSON comparisons,
and the original indexes were created. The report is stored locally in
`migration-data/script-migration-report.json` (excluded from Git).

An error or interrupted import returns a nonzero exit status and may leave a
partial target database. The script never drops collections, rolls back, or
overwrites existing data. Keep writes stopped, investigate the error, and use
a fresh empty target database for a retry. Exit status zero from a real import
means all five imports, the required indexes, and all document comparisons succeeded.

After verifying existing-account login, scores, statistics, and recording paths,
start the upgraded app with `MONGODB_URI` set to the same URI. Keep the existing
session secret and restore the recording files separately. Production cutover
uses a fresh export taken during the downtime window; the rehearsal export
is only for testing.

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
MongoDB 8.0 database. For all five exported files (with MongoDB Database Tools on `PATH`):

```sh
(
  set -e
  : "${MIGRATION_MONGODB_URI:?Set an explicit URI for a new empty target database}"
  for collection in counters users newsrecords chatrecords gamerecords; do
    mongoimport --uri "$MIGRATION_MONGODB_URI" --legacy --stopOnError \
      --collection "$collection" --file "/path/to/export/$collection.json"
  done
)
```

Use matching collection names and files.
Do not use `--drop` on the original database or import application JSON into an
existing database. Preserve the source BSON dump as a fallback and for exact
comparison during validation.

## Legacy account compatibility after hardening

The existing export contains 18 duplicate username groups (46 extra user records).
The migration preserves those accounts and their password hashes. New registrations
carry `registrationVersion: 1` and a partial unique index on `users.username`
(`unique_registration_username`) arbitrates simultaneous registrations. Registration
also checks all existing usernames, so an old name cannot be claimed again. Historical
duplicates are not silently merged, deleted, renamed, or granted new access to shared
identities. Existing login selection is preserved until ownership is resolved.

Use this read-only audit to get account IDs for an explicit cleanup plan:

```sh
cd server
MIGRATION_MONGODB_URI='mongodb://127.0.0.1:27017/brogue_new' \
  npm run audit:users -- /path/to/new-account-audit.json
```

The report is owner-readable and includes usernames/IDs, not password hashes.
Choose a new report file. The script does not change accounts or game records.
Once duplicates have been resolved, a full unique username index can be planned
separately; do not add it blindly to this legacy dataset.

New registrations reject path separators, dot/dot-dot, and control characters.
Ordinary legacy game directories keep their existing paths. Historical unsafe
usernames still authenticate, but their new games live under a separate
`.escaped-users` namespace using a hash of username and variant, rather than
following the old relative path. Finish any such running games before the
upgrade; the new version intentionally does not reattach through unsafe paths.
Replays use a separate `.recordings` namespace so a username ending in
`-recording` cannot alias someone else's replay directory. Existing database
recording paths remain intact for reading old recordings.

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

## Rehearsal result: 2026-10-24

Successfully imported `brogue-json-20261024-164419.tar.gz` with MongoDB Database
Tools 100.19.1 (`mongoimport --legacy --stopOnError`) into MongoDB 8.0.34 at
`mongodb://127.0.0.1:27017/brogue_migration_20261024`. The existing local `brogue`
database and the production server were not modified.

All five collection counts match the table above: 233,619 documents in total,
with zero import failures. Every imported document was compared by `_id` against
`brogue-bson20261024.tar.gz`, using canonical BSON-aware representations with
sorted object keys. There were zero missing or unexpected IDs, zero value
changes, and zero BSON type changes. This comparison includes the existing
password hashes, BSON dates, and seed halves.

Recreated both non-default indexes from the BSON metadata: `users.username_1`
and the unique `gamerecords.date_1_username_-1`. The news counter is at least the
highest existing news sequence. Game listing, users, news, latest wins, general
statistics, and level statistics passed API checks against the imported data.
Chromium loaded the lobby, high scores, and charts with no page errors.

The local import took about 3.2 seconds, excluding extraction, index creation,
full document comparison, and application checks. This is not an estimate for
the full production downtime window, which also includes the final export and
transfer.

The detailed local report is in the ignored
`migration-data/rehearsal-report.json`; original backups remain excluded from Git.
For local testing, stop the current app and run from `server`:

```sh
MONGODB_URI=mongodb://127.0.0.1:27017/brogue_migration_20261024 npm start
```

The database image does not contain recording files. All 100 sampled recording
paths were missing locally, so replay/download testing needs a separate copy of
the production recording files at compatible paths. Real-user login can now be
checked locally with an existing account; the rehearsal did not need or inspect
any plaintext passwords.

Production cutover still requires a downtime window and a fresh final export
with app writes stopped, followed by the same import and validation procedure.

References: [mongorestore compatibility](https://www.mongodb.com/docs/database-tools/mongorestore/mongorestore-behavior-access-usage/),
[Extended JSON](https://www.mongodb.com/docs/manual/reference/mongodb-extended-json/).
