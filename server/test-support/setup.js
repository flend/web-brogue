const { MongoMemoryServer } = require('mongodb-memory-server-core');
const config = require('../test/config-test');
const server = require('../test/server-test');
let database;

exports.mochaHooks = {
    async beforeAll() {
        this.timeout(180000);
        if (!process.env.TEST_MONGODB_URI) {
            database = await MongoMemoryServer.create({
                binary: { version: '8.0.34' },
                instance: { dbName: 'server_test' }
            });
            config.db.url = database.getUri('server_test');
        }
        // Every suite removes its fixtures. Refuse an ordinary application database.
        const databaseName = new URL(config.db.url).pathname.slice(1);
        if (!databaseName.endsWith('_test')) {
            throw new Error('TEST_MONGODB_URI must use a database name ending in _test');
        }
        server.app = await require('../httpServer')(config);
        await Promise.all(Object.values(require('mongoose').models).map(model => model.init()));
    },
    async afterAll() {
        this.timeout(30000);
        if (server.app) await server.app.close();
        if (database) await database.stop();
    }
};
