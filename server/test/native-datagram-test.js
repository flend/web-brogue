const { expect } = require('chai');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const unix = require('unix-dgram');

describe('native game communication on Node 24', function() {
    it('exchanges a binary game command over a Unix datagram socket', async function() {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'brogue-ipc-'));
        const socketPath = path.join(directory, 'game.sock');
        const server = unix.createSocket('unix_dgram');
        const client = unix.createSocket('unix_dgram');
        try {
            const command = Buffer.from([0, 0, 13, 0, 0]);
            const received = new Promise((resolve, reject) => {
                server.once('message', resolve);
                server.once('error', reject);
                client.once('error', reject);
            });
            server.bind(socketPath);
            client.send(command, 0, command.length, socketPath);
            expect(await received).to.deep.equal(command);
        } finally {
            client.close();
            server.close();
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });
});
