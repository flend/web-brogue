const { expect } = require('chai');
const { io } = require('socket.io-client');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const _ = require('underscore');
const User = require('../user/user-model');
const server = require('./server-test');
const Router = require('../controllers/router');
const Auth = require('../controllers/authentication-controller');
const AuthLimiter = require('../security/auth-limiter');
const clientAddress = require('../security/client-address');
const { gameDirectory, isRegistrationName } = require('../security/username');
const { PasswordPool } = require('../user/passwords');
const Game = require('../brogue/brogue-interface');
const Lobby = require('../controllers/lobby-controller');
const Brogue = require('../controllers/brogue-controller');
const config = require('./config-test');

async function connect() {
    const socket = io('http://127.0.0.1:' + server.app.httpServer.address().port, { transports: ['websocket'], reconnection: false });
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return socket;
}
function request(socket, payload) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('No socket response')), 5000);
        socket.once('message', message => { clearTimeout(timer); resolve(message); });
        socket.send(payload);
    });
}
const auth = (type, data) => ({ controller: 'auth', type, data });

describe('security regressions', function() {
    let sockets;
    beforeEach(function() { sockets = []; });
    afterEach(async function() {
        for (const socket of sockets) socket.disconnect();
        await User.deleteMany({});
    });

    it('rejects malformed and inherited-property messages while keeping the connection usable', async function() {
        const socket = await connect(); sockets.push(socket);
        for (const payload of [null, [], {}, { controller: 'constructor', type: 'anything' },
            { controller: 'auth', type: '__proto__' }, { controller: 'auth', type: 'constructor' },
            auth('register', {}), auth('login', { username: { $ne: null }, password: 'guess' }),
            { controller: 'chat', type: 'message', data: { data: 1, channel: 'lobby' } }]) {
            const response = await request(socket, payload);
            expect(['auth', 'error']).to.include(response.type);
            if (response.type === 'auth') expect(response.data.result).to.equal('fail');
        }
        expect((await request(socket, auth('anon-login'))).data.result).to.equal('success');
    });

    it('contains both synchronous and asynchronous handler failures', async function() {
        let errors = 0;
        const router = new Router({
            error: { controllerName: 'error', send() { errors++; } },
            test: { controllerName: 'test', handlerCollection: { fail() {} },
                handleIncomingMessage() { throw new Error('bad input'); } }
        });
        await router.route({ controller: 'test', type: 'fail' });
        router.routeCollection.test.handleIncomingMessage = async () => { throw new Error('async failure'); };
        await router.route({ controller: 'test', type: 'fail' });
        expect(errors).to.equal(2);
    });

    it('rejects new path-traversing usernames', async function() {
        const socket = await connect(); sockets.push(socket);
        for (const username of ['../BROGUECEV151/target', '..', '.', 'a\\b', 'a\u0000b']) {
            expect((await request(socket, auth('register', { username, password: 'password', repeat: 'password' }))).data.result).to.equal('fail');
        }
        expect(await User.countDocuments()).to.equal(0);
    });

    it('keeps legacy directories compatible while isolating unsafe identities and replays', function() {
        const root = path.resolve('/tmp/brogue-games');
        const normal = gameDirectory(root, 'alice', 'BROGUECEV151');
        expect(normal).to.equal(path.join(root, 'BROGUECEV151', 'alice'));
        for (const username of ['../BROGUECEV151/alice', '../../outside', 'a\\b', '.', '..']) {
            const directory = gameDirectory(root, username, 'BROGUECEV151');
            expect(directory).not.to.equal(normal);
            expect(path.relative(root, directory)).not.to.match(/^\.\./);
        }
        expect(gameDirectory(root, 'alice', 'BROGUECEV151', true)).not.to.equal(gameDirectory(root, 'alice-recording', 'BROGUECEV151'));
        const unicodeDirectory = gameDirectory(root, '\u{1f600}'.repeat(30), 'BROGUECEV151');
        expect(Buffer.byteLength(path.join(unicodeDirectory, 'client-socket'))).to.be.at.most(107);
        expect(() => gameDirectory('/tmp/' + 'x'.repeat(120), 'alice', 'BROGUECEV151')).to.throw('too long');
        expect(isRegistrationName('an ordinary-name')).to.equal(true);
    });

    it('checks binary input types and lengths before reading bytes', function() {
        const game = new Game('test', 'BROGUECEV151');
        for (const message of [null, {}, 'not binary', Buffer.alloc(0), Buffer.alloc(1), Buffer.alloc(4), Buffer.alloc(6)]) {
            let error;
            expect(() => game.handleIncomingBinaryMessage(message, value => { error = value; })).not.to.throw();
            expect(error).to.be.instanceOf(Error);
        }
        let sent = false;
        game.sendToBrogue = () => { sent = true; };
        game.handleIncomingBinaryMessage(Buffer.from([0, 0, 13, 0, 0]), () => {});
        expect(sent).to.equal(true);
    });

    it('lets only one concurrent registration claim a new username', async function() {
        const first = await connect(), second = await connect(); sockets.push(first, second);
        const credentials = { username: 'concurrent-player', password: 'a-password', repeat: 'a-password' };
        const responses = await Promise.all([request(first, auth('register', credentials)), request(second, auth('register', credentials))]);
        expect(responses.filter(response => response.data.result === 'success')).to.have.length(1);
        expect(await User.countDocuments({ username: credentials.username })).to.equal(1);
        const user = await User.findOne({ username: credentials.username });
        expect(user.registrationVersion).to.equal(1);
        const error = await User.create({ username: credentials.username, password: 'unused', registrationVersion: 1 }).then(() => null, error => error);
        expect(error.code).to.equal(11000);
    });

    it('preserves historical duplicates and refuses new registrations under their name', async function() {
        await User.collection.insertMany([{ username: 'legacy-duplicate', password: 'hash-one' }, { username: 'legacy-duplicate', password: 'hash-two' }]);
        const socket = await connect(); sockets.push(socket);
        expect((await request(socket, auth('register', { username: 'legacy-duplicate', password: 'password', repeat: 'password' }))).data.result).to.equal('fail');
        expect(await User.countDocuments({ username: 'legacy-duplicate' })).to.equal(2);
    });

    it('shares authentication throttles across connections and expires them without timers', function() {
        let now = 0;
        const limiter = new AuthLimiter({ ipLimit: 2, accountLimit: 1, windowMs: 1000, now: () => now });
        const make = () => new Auth({ handshake: { address: '203.0.113.1' }, send() {} }, { config, authLimiter: limiter });
        const first = make(), second = make();
        expect(first.beginAuthentication('player')).to.equal(true);
        expect(second.beginAuthentication('player')).to.equal(false);
        now = 1001;
        expect(second.beginAuthentication('player')).to.equal(true);
        const bounded = new AuthLimiter({ maxEntries: 1 });
        expect(bounded.take('one', null)).to.equal(true);
        expect(bounded.take('two', null)).to.equal(false);
    });

    it('does not trust client-supplied forwarding headers outside configured proxies', function() {
        const socket = address => ({ handshake: { address, headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.5' } } });
        expect(clientAddress(socket('203.0.113.8'))).to.equal('203.0.113.8');
        expect(clientAddress(socket('127.0.0.1'))).to.equal('203.0.113.5');
    });

    it('bounds password work and leaves the main event loop available', async function() {
        const pool = new PasswordPool({ size: 1, maxQueue: 1 });
        try {
            let completed = false;
            const first = pool.run('hash', 'password').then(result => { completed = true; return result; });
            const second = pool.run('hash', 'another-password');
            const busy = await pool.run('hash', 'too-many').then(() => null, error => error);
            expect(busy.message).to.include('busy');
            await new Promise(resolve => setImmediate(resolve));
            expect(completed).to.equal(false);
            const [hash] = await Promise.all([first, second]);
            expect(await pool.run('compare', 'password', hash)).to.equal(true);
        } finally { await pool.close(); }
    });

    it('renders locally generated lobby action icons while escaping player data', function() {
        const html = fs.readFileSync(path.join(__dirname, '../../client/index.html'), 'utf8');
        const template = _.template(html.match(/<script id="current-games-row"[^>]*>([\s\S]*?)<\/script>/)[1]);
        let View;
        const Backbone = { View: { extend(properties) {
            function View() {}
            View.prototype = properties;
            return View;
        } } };
        function User() { this.get = () => 'owner'; }
        function State() {}
        function RowModel(data) { this.data = data; }
        function RowView(options) {
            this.render = () => ({ el: template(Object.assign({ prettySeeded: 'Random', prettyVariant: 'Brogue',
                easyMode: false, deepestLevel: 1, prettyScore: 0, formattedIdle: '1s' }, options.model.data)) });
            this.remove = () => {};
        }
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../client/views/current-games-view.js'), 'utf8'), {
            define(dependencies, factory) {
                View = factory(() => ({ html: () => '' }), _, Backbone, () => {}, {}, RowView, State, RowModel, User);
            }
        });
        for (const [userName, label] of [['owner', 'Resume'], ['<img src=x onerror="pwned=1">', 'Watch']]) {
            let rendered;
            const view = Object.assign({}, View.prototype, {
                tableState: { set() {} }, renderHeadingOnEmptyChange() {},
                $tableElement: { append(row) { rendered = row; } }
            });
            // Incoming action HTML must be replaced by the client's fixed icons.
            view.updateRowModelData([{ gameName: 'test', userName, action: '<img src=x>', linkAction: '<img src=x>' }]);
            const dom = new JSDOM('<table><tbody><tr>' + rendered + '</tr></tbody></table>');
            try {
                const document = dom.window.document;
                expect(document.querySelector('#observe-game svg')).not.to.equal(null);
                expect(document.querySelector('#observe-game').textContent).to.equal(label);
                expect(document.querySelector('#link-game svg')).not.to.equal(null);
                expect(document.querySelector('#link-game').textContent).to.equal('Link');
                expect(document.querySelector('img')).to.equal(null);
                expect(document.querySelector('#observe-game').getAttribute('data-username')).to.equal(userName);
            } finally { dom.window.close(); }
        }
    });

    it('escapes malicious names in lobby attributes and chat HTML', function() {
        const html = fs.readFileSync(path.join(__dirname, '../../client/index.html'), 'utf8');
        const template = html.match(/<script id="current-games-row"[^>]*>([\s\S]*?)<\/script>/)[1];
        const username = 'x" onmouseover="pwned=1';
        const row = _.template(template)({ userName: username, prettySeeded: '', prettyVariant: 'Brogue', easyMode: false, deepestLevel: 1, prettyScore: 0, formattedIdle: '', action: 'Observe', linkAction: 'Link' });
        const dom = new JSDOM('<table><tbody><tr>' + row + '</tr></tbody></table>');
        try {
            const link = dom.window.document.getElementById('observe-game');
            expect(link.getAttribute('data-username')).to.equal(username);
            expect(link.hasAttribute('onmouseover')).to.equal(false);
        } finally { dom.window.close(); }
        let model;
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../client/models/chat.js'), 'utf8'), {
            define(dependencies, factory) { model = factory({}, _, { Model: { extend: value => value } }, {}); }
        });
        model.formatDate = () => 'now';
        const payload = '<img src=x onerror=pwned=1>';
        expect(model.colorize(payload)).to.include('&lt;img');
        expect(model.formatSystemMessage(new Date(), payload)).not.to.include('<img');
    });

    it('cleans recording lobby timers, pending refreshes, and native idle timers', function() {
        const timers = new Set();
        const originalSet = global.setInterval, originalClear = global.clearInterval;
        global.setInterval = (...args) => { const timer = originalSet(...args); timers.add(timer); return timer; };
        global.clearInterval = timer => { timers.delete(timer); originalClear(timer); };
        try {
            const lobby = new Lobby({ send() {} });
            lobby.stopUserDataListen();
            const controller = new Brogue({ send() {} });
            controller.controllers = { lobby, chat: { leaveRoom() {} } };
            controller.mode = 2;
            const replay = { disconnected: false, killBrogue() { this.disconnected = true; } };
            controller.brogueInterface = replay;
            controller.handlerCollection.leave.call(controller, {});
            expect(replay.disconnected).to.equal(true);
            expect(controller.brogueInterface).to.equal(null);
            expect(timers.size).to.equal(1);
            lobby.userDataListen();
            expect(timers.size).to.equal(1);
            lobby.stopUserDataListen();
            expect(timers.size).to.equal(0);
            const game = new Game('test', 'BROGUECEV151');
            game.attachChildIdleKiller();
            expect(timers.size).to.equal(1);
            game.resetBrogueConnection(game);
            expect(timers.size).to.equal(0);
            const failedGame = new Game('failed', 'BROGUECEV151');
            failedGame.attachChildEvents = () => { failedGame.disconnected = true; };
            failedGame.attachChildProcess();
            expect(timers.size).to.equal(0);
        } finally {
            for (const timer of timers) originalClear(timer);
            global.setInterval = originalSet; global.clearInterval = originalClear;
        }
    });
});
