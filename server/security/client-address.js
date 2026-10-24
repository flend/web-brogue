const { isIP } = require('node:net');
const normalize = address => typeof address === 'string' ? address.replace(/^::ffff:/, '') : 'unknown';
function clientAddress(socket, trusted = ['127.0.0.1', '::1']) {
    const remote = normalize(socket.handshake?.address || socket.conn?.remoteAddress);
    const proxies = new Set(trusted.map(normalize));
    if (!proxies.has(remote)) return remote;
    const forwarded = socket.handshake?.headers?.['x-forwarded-for'];
    if (typeof forwarded !== 'string' || forwarded.length > 1024) return remote;
    const chain = forwarded.split(',').map(address => normalize(address.trim()));
    if (!chain.length || chain.some(address => !isIP(address))) return remote;
    // Walk from the trusted proxy toward the client; ignore any client-supplied
    // prefix before the first untrusted hop.
    for (let i = chain.length - 1; i >= 0; i--) if (!proxies.has(chain[i])) return chain[i];
    return chain[0];
}
module.exports = clientAddress;
