const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { parseArgs } = require('node:util');
const { MongoClient, BSON } = require('mongoose').mongo;

const COLLECTIONS = ['counters', 'users', 'newsrecords', 'chatrecords', 'gamerecords'];
const HELP = `Usage: MIGRATION_MONGODB_URI=mongodb://localhost:27017/brogue_new
  npm run migrate:json -- /path/to/json-export [--check-only] [--report /path/to/report.json]

Requires Node 24, server dependencies, MongoDB 8+, and current MongoDB Database Tools.
The export directory must contain one newline-delimited legacy Extended JSON file
per collection: ${COLLECTIONS.map(name => name + '.json').join(', ')}.
Set MONGOIMPORT to the tool's full path if mongoimport is not on PATH.
The target URI must include a database name. The database must have no collections.
Stop app writes for the final migration. This script never drops or overwrites data.
`;

// Preserve BSON dates, IDs and other tagged types while comparing numeric values
// across JSON and BSON. JSON alone cannot establish the original numeric subtype.
function normalize(value) {
    if (typeof value === 'number') return { $numeric: Object.is(value, -0) ? '-0' : String(value) };
    if (value === null || typeof value !== 'object') return value;
    if (value instanceof Date) return { $date: value.toISOString() };
    if (value._bsontype) {
        if (['Int32', 'Double', 'Long'].includes(value._bsontype)) {
            return { $numeric: Object.is(value.valueOf(), -0) ? '-0' : value.toString() };
        }
        return BSON.EJSON.serialize(value, { relaxed: false });
    }
    if (Array.isArray(value)) return value.map(normalize);
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]));
}
function fingerprint(value) {
    return createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');
}
function documentKey(document) {
    return BSON.EJSON.stringify(document._id, { relaxed: false });
}
function targetName(uri) {
    const match = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/i.exec(uri || '');
    if (!match) throw new Error('Set MIGRATION_MONGODB_URI with an explicit target database name.');
    const name = decodeURIComponent(match[1]);
    if (['admin', 'config', 'local'].includes(name)) throw new Error('A system database cannot be a migration target.');
    return name;
}

async function scanExports(directory, signal) {
    const expectedFiles = COLLECTIONS.map(name => name + '.json');
    const entries = await fsp.readdir(directory);
    const unexpected = entries.filter(name => name.endsWith('.json') && !expectedFiles.includes(name));
    if (unexpected.length) throw new Error('Unexpected JSON files in export directory; use a directory containing only the five collection exports.');
    const sources = [];
    let newsCounter;
    let highestNewsSequence = 0;
    for (const name of COLLECTIONS) {
        signal?.throwIfAborted();
        const file = path.join(directory, name + '.json');
        if (!(await fsp.stat(file)).isFile()) throw new Error(name + '.json must be a regular file.');
        const hashes = new Map();
        const fileHash = createHash('sha256');
        const input = fs.createReadStream(file);
        input.on('data', chunk => fileHash.update(chunk));
        const lines = readline.createInterface({ input, crlfDelay: Infinity });
        let lineNumber = 0;
        try {
            for await (const line of lines) {
                signal?.throwIfAborted();
                lineNumber++;
                if (!line.trim()) continue;
                let document;
                try {
                    document = BSON.EJSON.parse(line, { relaxed: false });
                    if (!document || Array.isArray(document) || typeof document !== 'object' ||
                        !Object.hasOwn(document, '_id')) throw new Error('Invalid document');
                    const key = documentKey(document);
                    if (hashes.has(key)) throw new Error('Duplicate _id');
                    hashes.set(key, fingerprint(document));
                } catch {
                    throw new Error(`${name}.json: invalid document or duplicate _id at line ${lineNumber}. Expected one Extended JSON document per line.`);
                }
                if (name === 'counters' && document._id === 'newsrecords') newsCounter = Number(document.seq);
                if (name === 'newsrecords') {
                    const sequence = Number(document.seq);
                    if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error('News sequences must be nonnegative safe integers.');
                    highestNewsSequence = Math.max(highestNewsSequence, sequence);
                }
            }
        } finally {
            lines.close();
            input.destroy();
        }
        sources.push({ name, file, count: hashes.size, hashes, sha256: fileHash.digest('hex') });
    }
    const hasNews = sources.find(source => source.name === 'newsrecords').count > 0;
    if ((hasNews || newsCounter !== undefined) &&
        (!Number.isSafeInteger(newsCounter) || newsCounter < highestNewsSequence)) {
        throw new Error('The newsrecords counter is missing, invalid, or behind the exported news sequence.');
    }
    return sources;
}

function runTool(executable, args, signal) {
    return new Promise((resolve, reject) => {
        const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], signal });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-16384); });
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16384); });
        child.once('error', () => reject(new Error('Unable to run mongoimport. Install MongoDB Database Tools or set MONGOIMPORT to the executable path.')));
        child.once('close', code => {
            if (code === 0) resolve(stdout);
            else {
                // Tool errors can contain document values. Report the failure category,
                // not passwords, URI credentials, or user documents.
                const reason = /E11000/.test(stderr) ? 'duplicate key' : /authenticat/i.test(stderr) ? 'authentication failed' : 'tool or input error';
                reject(new Error(`mongoimport exited with code ${code} (${reason}).`));
            }
        });
    });
}
async function fileDigest(file) {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}

async function migrate({ directory, uri, checkOnly = false, reportFile, mongoimport = process.env.MONGOIMPORT || 'mongoimport', signal, log = console.log }) {
    const databaseName = targetName(uri);
    if (reportFile) {
        await fsp.access(path.dirname(path.resolve(reportFile)), fs.constants.W_OK);
        try {
            await fsp.access(reportFile);
            throw new Error('Report file already exists; choose a new report path.');
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }
    const sources = await scanExports(path.resolve(directory), signal);
    const toolVersion = (await runTool(mongoimport, ['--version'], signal)).split('\n')[0];
    const toolRelease = /mongoimport version:\s*(\d+)\.(\d+)/i.exec(toolVersion);
    if (!toolRelease || Number(toolRelease[1]) < 100 ||
        (Number(toolRelease[1]) === 100 && Number(toolRelease[2]) < 3)) {
        throw new Error('Install current MongoDB Database Tools; mongoimport 100.3 or newer is required for tool configuration support.');
    }
    log(toolVersion);
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
    let configDirectory;
    let writesStarted = false;
    const started = Date.now();
    try {
        await client.connect();
        const db = client.db(databaseName);
        const { version } = await db.admin().command({ buildInfo: 1 });
        if (Number(version.split('.')[0]) < 8) throw new Error('The migration target must run MongoDB 8.0 or newer.');
        if ((await db.listCollections({}, { nameOnly: true }).toArray()).length) {
            throw new Error('Target database contains collections. Refusing to import; choose a new empty database.');
        }
        log(`Target database: ${databaseName} (MongoDB ${version})`);
        for (const source of sources) log(`${source.name}: ${source.count} source documents`);
        const report = {
            database: databaseName, mongodbVersion: version, toolVersion,
            checkOnly, collections: sources.map(({ name, count, sha256 }) => ({ name, count, sha256 }))
        };
        if (!checkOnly) {
            // MongoDB tools accept YAML; JSON is a YAML-compatible format. Keeping
            // the URI here avoids putting credentials in subprocess arguments.
            configDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), 'brogue-import-'));
            const configFile = path.join(configDirectory, 'tools-config.json');
            await fsp.writeFile(configFile, JSON.stringify({ uri }), { mode: 0o600 });
            for (const source of sources) {
                signal?.throwIfAborted();
                if (await fileDigest(source.file) !== source.sha256) throw new Error('Export file changed after preflight: ' + source.name);
                // Check again immediately before the first write, after preflight work.
                if (!writesStarted && (await db.listCollections({}, { nameOnly: true }).toArray()).length) {
                    throw new Error('Target database changed during preflight. Refusing to import.');
                }
                writesStarted = true;
                // Keep exported empty collections, and refuse a collection that
                // another process created after the initial empty-target check.
                await db.createCollection(source.name);
                await runTool(mongoimport, ['--config', configFile, '--legacy', '--stopOnError',
                    '--collection', source.name, '--file', source.file], signal);
                log('Imported ' + source.name);
            }
            await db.collection('users').createIndex({ username: 1 }, { name: 'username_1' });
            await db.collection('gamerecords').createIndex({ date: 1, username: -1 }, {
                name: 'date_1_username_-1', unique: true
            });
            for (const source of sources) {
                signal?.throwIfAborted();
                const remaining = new Map(source.hashes);
                let count = 0;
                for await (const document of db.collection(source.name).find({}, { promoteValues: false })) {
                    signal?.throwIfAborted();
                    const key = documentKey(document);
                    if (remaining.get(key) !== fingerprint(document)) throw new Error('Imported document mismatch in ' + source.name);
                    remaining.delete(key);
                    count++;
                }
                if (remaining.size || count !== source.count || await db.collection(source.name).countDocuments() !== source.count) {
                    throw new Error('Imported count mismatch in ' + source.name);
                }
                if (await fileDigest(source.file) !== source.sha256) throw new Error('Export file changed during import: ' + source.name);
                log(`Verified ${source.name}: ${count} documents`);
            }
            const names = await db.listCollections({}, { nameOnly: true }).toArray();
            if (names.length !== COLLECTIONS.length || names.some(({ name }) => !COLLECTIONS.includes(name))) {
                throw new Error('Unexpected collections appeared during import.');
            }
            report.verified = true;
            report.indexes = ['users.username_1', 'gamerecords.date_1_username_-1 (unique)'];
        }
        report.elapsedSeconds = (Date.now() - started) / 1000;
        if (reportFile) await fsp.writeFile(reportFile, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        log(checkOnly ? 'Preflight passed. No database writes were made.' : 'Migration verified. Configure the app with this target URI after your application checks.');
        return report;
    } catch (error) {
        if (writesStarted) throw new Error(error.message + ' The target may contain partial data; no data was deleted. Keep app writes stopped and retry with a fresh empty database.');
        throw error;
    } finally {
        try {
            await client.close();
        } finally {
            if (configDirectory) await fsp.rm(configDirectory, { recursive: true, force: true });
        }
    }
}

async function main() {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: { 'check-only': { type: 'boolean' }, report: { type: 'string' }, help: { type: 'boolean' } }
    });
    if (values.help) return console.log(HELP);
    if (positionals.length !== 1) throw new Error(HELP);
    const controller = new AbortController();
    const interrupted = () => controller.abort(new Error('Migration interrupted.'));
    process.once('SIGINT', interrupted);
    process.once('SIGTERM', interrupted);
    try {
        await migrate({ directory: positionals[0], uri: process.env.MIGRATION_MONGODB_URI,
            checkOnly: values['check-only'], reportFile: values.report, signal: controller.signal });
    } finally {
        process.removeListener('SIGINT', interrupted);
        process.removeListener('SIGTERM', interrupted);
    }
}
if (require.main === module) main().catch(error => {
    const message = error.message.replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, '[MongoDB URI]');
    console.error('Migration failed: ' + message);
    process.exitCode = 1;
});
module.exports = { migrate, scanExports, targetName, fingerprint };
