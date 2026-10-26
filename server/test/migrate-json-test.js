const { expect } = require('chai');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { MongoClient, BSON } = require('mongoose').mongo;
const config = require('./config-test');
const { migrate, scanExports, targetName, fingerprint } = require('../scripts/migrate-json');

const names = ['counters', 'users', 'newsrecords', 'chatrecords', 'gamerecords'];
async function rejection(operation) {
    try { await operation(); } catch (error) { return error; }
    throw new Error('Expected operation to fail');
}
describe('legacy JSON migration safeguards', function() {
    let directory;
    let client;
    let db;
    let tool;
    beforeEach(async function() {
        directory = await fs.mkdtemp(path.join(os.tmpdir(), 'brogue-import-test-'));
        for (const name of names) await fs.writeFile(path.join(directory, name + '.json'), '');
        // Preflight only needs a version response, not an actual import executable.
        tool = path.join(directory, 'mongoimport');
        await fs.writeFile(tool, '#!/bin/sh\nprintf "mongoimport version: 100.19.1\\n"\n', { mode: 0o700 });
        client = await MongoClient.connect(config.db.url);
        db = client.db();
    });
    afterEach(async function() {
        await client.close();
        await fs.rm(directory, { recursive: true, force: true });
    });

    it('requires an explicit target database and rejects MongoDB system databases', function() {
        for (const uri of [undefined, 'mongodb://localhost:27017', 'mongodb://localhost:27017/?authSource=admin',
            'mongodb://localhost/admin', 'mongodb://localhost/config', 'mongodb://localhost/local']) {
            expect(() => targetName(uri)).to.throw();
        }
        expect(targetName('mongodb://host1:27017,host2:27017/brogue_new?replicaSet=rs0')).to.equal('brogue_new');
    });

    it('rejects unsupported JSON formats before scanning files or writing', async function() {
        const error = await rejection(() => migrate({ jsonFormat: 'automatic' }));
        expect(error.message).to.include('JSON format must be legacy or v2');
    });

    for (const jsonFormat of ['legacy', 'v2']) {
        it('uses the ' + jsonFormat + ' parser mode and records it in the report', async function() {
            const empty = client.db('migration_format_' + jsonFormat + '_' + Date.now() + '_test');
            const uri = new URL(config.db.url);
            uri.pathname = '/' + empty.databaseName;
            const argsFile = path.join(directory, 'arguments');
            await fs.writeFile(tool, '#!/bin/sh\nif [ "$1" = "--version" ]; then\n' +
                'printf "mongoimport version: 100.19.1\\n"\nelse\n' +
                'printf "%s\\n" "$@" >> "' + argsFile + '"\nfi\n', { mode: 0o700 });
            try {
                const report = await migrate({ directory, uri: uri.toString(), jsonFormat, mongoimport: tool, log() {} });
                const args = (await fs.readFile(argsFile, 'utf8')).split('\n');
                expect(args.filter(arg => arg === '--legacy')).to.have.length(jsonFormat === 'legacy' ? 5 : 0);
                expect(report.jsonFormat).to.equal(jsonFormat);
                expect(report.verified).to.equal(true);
            } finally { await empty.dropDatabase(); }
        });
    }

    it('checks every source file before allowing database writes', async function() {
        await fs.writeFile(path.join(directory, 'gamerecords.json'), '{broken JSON}\n');
        const error = await rejection(() => migrate({ directory, uri: config.db.url, mongoimport: tool, log() {} }));
        expect(error.message).to.include('gamerecords.json');
        expect(await db.collection('gamerecords').countDocuments()).to.equal(0);
    });

    it('rejects duplicate IDs and JSON arrays before import', async function() {
        await fs.writeFile(path.join(directory, 'users.json'), '{"_id":"duplicate"}\n{"_id":"duplicate"}\n');
        expect((await rejection(() => scanExports(directory))).message).to.include('duplicate _id');
        await fs.writeFile(path.join(directory, 'users.json'), '[{"_id":"user"}]\n');
        expect((await rejection(() => scanExports(directory))).message).to.include('one Extended JSON document per line');
    });

    it('refuses an occupied database without altering its records', async function() {
        const marker = await db.collection('users').insertOne({ username: 'existing-local-player' });
        try {
            const error = await rejection(() => migrate({ directory, uri: config.db.url, mongoimport: tool, log() {} }));
            expect(error.message).to.include('Target database contains collections');
            expect(await db.collection('users').countDocuments({ _id: marker.insertedId })).to.equal(1);
        } finally {
            await db.collection('users').deleteOne({ _id: marker.insertedId });
        }
    });

    it('rejects an exported news counter that would reuse an existing sequence', async function() {
        await fs.writeFile(path.join(directory, 'counters.json'), '{"_id":"newsrecords","seq":5}\n');
        await fs.writeFile(path.join(directory, 'newsrecords.json'), '{"_id":"story","seq":8}\n');
        expect((await rejection(() => scanExports(directory))).message).to.include('behind the exported news sequence');
    });

    it('preflights an empty target without creating any collections', async function() {
        const empty = client.db('migration_preflight_' + Date.now() + '_test');
        const uri = new URL(config.db.url);
        uri.pathname = '/' + empty.databaseName;
        const report = await migrate({ directory, uri: uri.toString(), checkOnly: true, mongoimport: tool, log() {} });
        expect(report.checkOnly).to.equal(true);
        expect(report.collections).to.have.length(5);
        expect(await empty.listCollections().toArray()).to.have.length(0);
    });

    it('rejects ancient import tools during preflight', async function() {
        await fs.writeFile(tool, '#!/bin/sh\nprintf "mongoimport version: 3.6.8\\n"\n', { mode: 0o700 });
        const error = await rejection(() => migrate({ directory, uri: config.db.url, checkOnly: true, mongoimport: tool, log() {} }));
        expect(error.message).to.include('current MongoDB Database Tools');
    });

    it('retains all five collections and builds indexes for an empty export', async function() {
        const empty = client.db('migration_empty_' + Date.now() + '_test');
        const uri = new URL(config.db.url);
        uri.pathname = '/' + empty.databaseName;
        try {
            const report = await migrate({ directory, uri: uri.toString(), mongoimport: tool, log() {} });
            expect(report.verified).to.equal(true);
            const collections = await empty.listCollections().toArray();
            expect(collections.map(collection => collection.name).sort()).to.deep.equal([...names].sort());
            const indexes = await empty.collection('gamerecords').indexes();
            expect(indexes.find(index => index.name === 'date_1_username_-1').unique).to.equal(true);
        } finally {
            await empty.dropDatabase();
        }
    });

    it('leaves a failed import target in place and refuses to retry over it', async function() {
        const empty = client.db('migration_failure_' + Date.now() + '_test');
        const uri = new URL(config.db.url);
        uri.pathname = '/' + empty.databaseName;
        await fs.writeFile(tool, '#!/bin/sh\nif [ "$1" = "--version" ]; then\n  printf "mongoimport version: 100.19.1\\n"\nelse\n  exit 3\nfi\n', { mode: 0o700 });
        const run = () => migrate({ directory, uri: uri.toString(), mongoimport: tool, log() {} });
        try {
            expect((await rejection(run)).message).to.include('target may contain partial data');
            expect((await empty.listCollections().toArray()).map(collection => collection.name)).to.deep.equal(['counters']);
            expect((await rejection(run)).message).to.include('Target database contains collections');
        } finally {
            await empty.dropDatabase();
        }
    });

    it('compares IDs, dates, passwords and 64-bit integer values without losing precision', function() {
        const exported = BSON.EJSON.parse('{"_id":{"$oid":"000000000000000000000001"},"date":{"$date":"2020-01-01T00:00:00Z"},"password":"old-hash","seed":{"$numberLong":"9223372036854775807"}}', { relaxed: false });
        const imported = BSON.deserialize(BSON.serialize(exported), { promoteValues: false });
        expect(fingerprint(exported)).to.equal(fingerprint(imported));
        expect(fingerprint({ ...imported, password: 'changed' })).not.to.equal(fingerprint(exported));
        expect(fingerprint({ ...imported, date: '2020-01-01T00:00:00Z' })).not.to.equal(fingerprint(exported));
        expect(fingerprint({ ...imported, seed: Number(imported.seed) })).not.to.equal(fingerprint(exported));
    });
});
