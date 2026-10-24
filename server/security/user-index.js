// Existing duplicate identities must not be silently merged during migration.
// New registrations carry this marker and are protected by a unique index.
const registrationIndex = {
    name: 'unique_registration_username', unique: true,
    partialFilterExpression: { registrationVersion: 1 }
};
async function ensureRegistrationIndex(collection) {
    await collection.createIndex({ username: 1 }, registrationIndex);
}
module.exports = { registrationIndex, ensureRegistrationIndex };
