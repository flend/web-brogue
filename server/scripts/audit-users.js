// Read-only audit: legacy duplicate accounts and unsafe path components are
// preserved. Decide account ownership/renames explicitly before changing them.
const fs = require('node:fs/promises');
const { MongoClient } = require('mongoose').mongo;
const { isRegistrationName } = require('../security/username');
const { targetName } = require('./migrate-json');
async function main() {
    const uri = process.env.MIGRATION_MONGODB_URI;
    const database = targetName(uri);
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
    try {
        await client.connect();
        const users = client.db(database).collection('users');
        const duplicates = await users.aggregate([
            { $group: { _id: '$username', ids: { $push: '$_id' }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } }, { $sort: { _id: 1 } }
        ]).toArray();
        const legacyNames = [];
        for await (const user of users.find({}, { projection: { username: 1 } })) {
            if (!isRegistrationName(user.username)) legacyNames.push({ id: user._id, username: user.username });
        }
        const report = { database, duplicates, legacyNames };
        if (process.argv.length !== 3) throw new Error('Usage: MIGRATION_MONGODB_URI=... npm run audit:users -- /path/to/new-report.json');
        await fs.writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        console.log(`Audit complete: ${duplicates.length} duplicate username groups; ${legacyNames.length} names outside the current registration policy. No database records changed.`);
    } finally {
        await client.close();
    }
}
main().catch(() => {
    console.error('User audit failed. Set MIGRATION_MONGODB_URI to an explicit database and pass a new writable report filename.');
    process.exitCode = 1;
});
