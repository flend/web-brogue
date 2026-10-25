// Native-process lifecycle stand-in: a real child with Unix sockets. It can emit
// background screen output or ignore SIGTERM without requiring a two-week wait.
const unix = require('unix-dgram');
const path = require('node:path');
const mode = process.argv[2];
if (mode === 'ignore-term') process.on('SIGTERM', () => {});
const input = unix.createSocket('unix_dgram');
input.on('error', () => {});
input.bind(path.join(process.cwd(), 'server-socket'));
if (mode !== 'silent') {
    const output = unix.createSocket('unix_dgram');
    output.on('error', () => {});
    const cell = Buffer.from([0, 0, 0, 64, 255, 255, 255, 0, 0, 0]);
    setInterval(() => output.send(cell, 0, cell.length, path.join(process.cwd(), 'client-socket'), () => {}), 10);
}
