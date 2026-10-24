Web Brogue
==========

A web[sockets] server for playing the Brogue over the internet.  Brogue is a game for Mac OS X, Windows, and Linux by Brian Walker.  For more information go https://sites.google.com/site/broguegame/.  The server only can be run on a POSIX environment at the moment.

Build Instructions
-----------------------

### Step 1: Get Dependencies ###
Use **Node.js 24 LTS** and **MongoDB 8.0** (latest patch releases).
The repository's `.nvmrc` selects Node 24:

```sh
nvm install
nvm use
```

Install a C++ compiler, `make`, and Python 3 for the `unix-dgram` native module
(on Ubuntu: `sudo apt-get install build-essential python3`).
For local MongoDB, install MongoDB 8.0 or run `docker compose up -d mongo`.
The Compose database is bound to localhost and persists in a named volume.
Alternatively, after installing server dependencies, run `npm run db` in `server`.
This downloads MongoDB 8.0.34 if needed, listens on localhost:27017, and persists
its data in the ignored `server/db/` directory. Leave it running in a separate
terminal; Ctrl+C stops the database without deleting its data. This development
command requires dev dependencies; production uses a separately managed MongoDB.

### Step 2: Get node packages
Navigate to the `server` directory and run `npm ci`. Lockfiles are committed
for reproducible installs. Also run `npm ci` in `scripts/news` if you use the news utility.

Browser libraries are committed in `client/libs`. To regenerate them from the
client lockfile, run `npm ci && npm run build` inside `client`.
The custom autocomplete view and the small paginator adapter are local application code.

### Step 3: Build Brogue Executables ##
The paths to the binaries is stored in `server/config.js`.
Brogue binaries are stored in the `binaries/` directory. Linux ELF binaries are included in the distribution for all supported brogue versions. If there's a new version of a brogue variant, or a replay-breaking change is added to a brogue version without changing the version, create a new variant and add a new brogue binary. This allows old recordings to still work. (Note that a new variant means separate high scores for now.)

The lineage of each brogue version and build instructions is given below. You shouldn't need to follow these unless you're building for a different platform.

* Brogue (1.7.4): `cd brogue` `make web`
* Brogue (1.7.5): `cd brogue-1.7.5` `make web`
* gBrogue: `cd gbrogue` `make -f Makefile.linux web`
* unBrogue: `cd unBrogue` `make web`
* broguePlus: `cd brogueplus` `make web`
* Brogue CE (1.8): Clone `https://github.com/flend/BrogueCE` and checkout branch `tracking/web-brogue`. `make bin/brogue` then copy binary to `binaries/brogue-ce18`
* Brogue CE (1.9): Clone `https://github.com/flend/BrogueCE` and checkout branch `tracking/web-brogue-v193`. `make bin/brogue` then copy binary to `binaries/brogue-ce19-c813284` (or similar filename)
* Brogue CE (1.10): Clone `https://github.com/flend/BrogueCE` and checkout branch `tracking/web-brogue-v110`. `make bin/brogue` then copy binary to `binaries/brogue-ce110` (or similar filename)
* Brogue CE (1.11+): Clone `https://github.com/flend/BrogueCE` and checkout branch `tracking/web-brogue-v1XX`. `make bin/brogue` then copy binary to `binaries/brogue-ce111` (or similar filename). This binary also includes RapidBrogue from v1.5+
* Rapid Brogue (v1.4 and earlier): Clone `https://github.com/flend/rapidbrogue` and checkout branch `tracking/rapid-brogue-vXXX`. `make bin/brogue` then copy binary to `binaries/rapid-brogue-vXXX` (or similar filename)

Starting the Server
----------------------------

Starting the server should be as simple as starting up mongoDB and starting the node process.

1. To start the mongodb daemon type `mongod` (this should be started at system init in most cases)
2. To start the server type `npm start` in the `server` directory.

You will probably want to edit `server/config.js` and `client/config.js` to set the ports and the server secret.

If everything is running correctly it should say "Server listening on port XXXX"

Note that you might need root access if you are running on a privileged port (e.g. 80).

Configuration
--------------------------------
Server global configuration variables are defined in `server/config.js`.
`MONGODB_URI` overrides the default `mongodb://127.0.0.1:27017/brogue`;
`PORT` overrides HTTP port 8080; `SESSION_SECRET` overrides the configured token secret.
Keep your existing session secret during migration to preserve saved login tokens.
Client configuration variables are defined in `client/config.js`.

In particular, make sure to get the client and server to agree on the websocketPort.

Restarting the server
--------------------------------
When you restart (kill and run again) the server to start running a new version, games in progress are not affected.
However, the server will forget about its registry of games that it uses to kill inactive games from over 2 weeks ago.
Therefore you probably want to kill old games.
A good command is `killall --older-than 1M -r ".*brogue.*"` which kills all brogue process started more than 1 month ago.

Tests
----------------------------
Run `npm test` in `server`. By default it starts a temporary MongoDB 8.0.34
process and removes it afterward. The first run downloads the MongoDB binary;
subsequent runs reuse the cached binary. No running database service is needed.
The suite covers APIs, legacy bcrypt password hashes, new registration,
Socket.IO 4 login/token/chat flows, 64-bit seed output, native Unix datagram
communication, and client initialization in a DOM environment. Full browser
canvas rendering and interactive gameplay still need a real-browser check.

To use an existing disposable test database, set `TEST_MONGODB_URI`.
Its database name must end in `_test`; tests delete their fixtures.

Database migration
----------------------------
The tested MongoDB 3.6 export path uses per-collection legacy Extended JSON.
From `server`, set `MIGRATION_MONGODB_URI` to a new empty database and run
`npm run migrate:json -- /path/to/json-export --check-only`, then repeat without
`--check-only` to import and validate it. Current MongoDB Database Tools must be
installed. See [the migration instructions](doc/database-migration.md) for setup,
reports, and final cutover. The script never overwrites an existing database.
