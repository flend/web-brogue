const { parentPort } = require('node:worker_threads');
const bcrypt = require('bcryptjs');
parentPort.on('message', ({ operation, password, hash }) => {
    try {
        const result = operation === 'hash' ? bcrypt.hashSync(password, 10) : bcrypt.compareSync(password, hash);
        parentPort.postMessage({ result });
    } catch {
        parentPort.postMessage({ error: 'Invalid password data' });
    }
});
