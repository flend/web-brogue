const { expect } = require('chai');
const { JSDOM, requestInterceptor, VirtualConsole } = require('jsdom');
const server = require('./server-test');

// This checks AMD loading and app initialization; a real browser is still needed
// to check canvas rendering and game input visually.
describe('upgraded browser libraries', function() {
    it('initializes the client and connects Socket.IO without script errors', async function() {
        const port = server.app.httpServer.address().port;
        const origin = 'http://127.0.0.1:' + port;
        const errors = [];
        const resources = {
            interceptors: [requestInterceptor(request => {
                // Keep tests independent of external fonts and other sites.
                if (new URL(request.url).host !== new URL(origin).host) return new Response('');
                if (request.url === origin + '/config.js') {
                    const source = require('node:fs').readFileSync(
                        require('node:path').join(__dirname, '../../client/config.js'), 'utf8');
                    return new Response(source.replace('websocketPort: 8080', 'websocketPort: ' + port), {
                        headers: { 'Content-Type': 'application/javascript' }
                    });
                }
            })]
        };
        const console = new VirtualConsole();
        console.on('jsdomError', error => errors.push(error.message));
        const dom = await JSDOM.fromURL(origin + '/', {
            runScripts: 'dangerously', resources,
            pretendToBeVisual: true, virtualConsole: console
        });
        let socket;
        try {
            const deadline = Date.now() + 7000;
            while (Date.now() < deadline && errors.length === 0) {
                const loader = dom.window.requirejs;
                if (loader?.defined('dataIO/socket')) socket = loader('dataIO/socket');
                if (socket?.connected && dom.window.document.querySelector('#login-button') &&
                    dom.window.jQuery.active === 0) break;
                await new Promise(resolve => setTimeout(resolve, 25));
            }
            expect(errors).to.deep.equal([]);
            expect(dom.window.document.querySelector('#login-button')).not.to.equal(null);
            expect(socket?.connected).to.equal(true);
            expect(dom.window.jQuery.fn.jquery).to.match(/^4\./);
            expect(dom.window.Backbone.VERSION).to.match(/^1\.6\./);
            expect(dom.window.requirejs('chart').version).to.match(/^4\./);
        } finally {
            if (socket) socket.disconnect();
            dom.window.close();
        }
    });
});
