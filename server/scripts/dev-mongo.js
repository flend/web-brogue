// A standalone MongoDB for local development, using the test binary downloader.
// Data is persistent; stopping this process never removes server/db.
const fs = require('node:fs');
const path = require('node:path');
const { MongoMemoryServer } = require('mongodb-memory-server-core');

async function main() {
    const dbPath = path.resolve(__dirname, '../db');
    fs.mkdirSync(dbPath, { recursive: true });
    const database = await MongoMemoryServer.create({
        binary: { version: '8.0.34' },
        instance: {
            ip: '127.0.0.1', port: 27017, portGeneration: false,
            dbPath, dbName: 'brogue', storageEngine: 'wiredTiger'
        }
    });
    console.log('Development MongoDB: ' + database.getUri('brogue'));
    console.log('Data directory: ' + dbPath);
    console.log('Leave this terminal running; start the app with npm start in another terminal.');
    let stopping = false;
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.once(signal, async () => {
            if (stopping) return;
            stopping = true;
            await database.stop({ doCleanup: false });
        });
    }
}
main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
