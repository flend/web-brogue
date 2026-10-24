const path = require('node:path');
const { createHash } = require('node:crypto');

function isSafeComponent(value) {
    return typeof value === 'string' && value.length > 0 &&
        value !== '.' && value !== '..' && !/[\/\\\x00-\x1f\x7f]/.test(value);
}
function isRegistrationName(value) {
    return isSafeComponent(value) && value.trim().length > 0 &&
        value.length <= 30 && !/[<>]/.test(value);
}
function gameDirectory(root, username, variant, recording = false) {
    if (typeof username !== 'string' || !username.length || !isSafeComponent(variant)) {
        throw new Error('Invalid game identity');
    }
    // Preserve existing ordinary game directories. Legacy names containing path
    // separators get a disjoint, bounded namespace instead of becoming paths.
    // Replays use their own namespace, so "alice-recording" cannot alias Alice.
    const legacyDirectory = path.resolve(root, variant, username);
    const fitsSocketPath = directory => Buffer.byteLength(path.join(directory, 'client-socket')) <= 107;
    if (!recording && isSafeComponent(username) && fitsSocketPath(legacyDirectory)) return legacyDirectory;
    const id = createHash('sha256').update(JSON.stringify([username, variant])).digest('hex').slice(0, 32);
    const directory = path.resolve(root, recording ? '.recordings' : '.escaped-users', id);
    if (!fitsSocketPath(directory)) throw new Error('GAME_DATA_DIR is too long for Unix sockets.');
    return directory;
}
module.exports = { isRegistrationName, gameDirectory };
