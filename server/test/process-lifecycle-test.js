const { expect } = require('chai');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Game = require('../brogue/brogue-interface');
const comms = require('../brogue/brogue-comms');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate) {
    const deadline = Date.now() + 4000;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for game lifecycle');
        await sleep(10);
    }
}

describe('native process ownership and reaping', function() {
    let directory;
    let games;
    let children;
    let clock;
    beforeEach(function() {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'brogue-reaper-'));
        games = []; children = []; clock = { now: 0 };
    });
    afterEach(async function() {
        for (const game of games) game.killBrogue(game);
        for (const child of children) {
            if (child.pid && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        }
        for (const child of children) {
            if (child.pid) await waitFor(() => child.exitCode !== null || child.signalCode !== null);
        }
        for (const game of games) await waitFor(() => game.brogueChild === null);
        fs.rmSync(directory, { recursive: true, force: true });
    });

    async function start(mode = 'heartbeat', missing = false) {
        const game = new Game('fixture-' + games.length, 'BROGUECEV151', {
            now: () => clock.now,
            lifecycle: { idleTimeoutMs: 100, reaperIntervalMs: 10, killGraceMs: 50, exitDrainMs: 30 },
            spawn(file, args, options) {
                const child = missing ? spawn(path.join(directory, 'missing-binary'), [], options) :
                    spawn(process.execPath, [path.join(__dirname, '../test-support/game-process-fixture.js'), mode], options);
                children.push(child);
                return child;
            }
        });
        game.brogueGameDirectoryPath = () => path.join(directory, game.username);
        games.push(game);
        game.start({}, 0);
        if (!missing) await waitFor(() => fs.existsSync(path.join(game.childDir, 'server-socket')));
        return game;
    }

    it('reaps an abandoned child even while it keeps sending screen output', async function() {
        const game = await start();
        clock.now = 50;
        await waitFor(() => game.lastOutputTime === 50);
        expect(game.lastActiveTime).to.equal(0);
        clock.now = 101;
        await waitFor(() => game.brogueChild === null);
        expect(children[0].signalCode).to.equal('SIGTERM');
        expect(game.disconnected).to.equal(true);
        expect(game.intervalKiller).to.equal(null);
    });

    it('reaps a child that never produced an initial frame', async function() {
        const game = await start('silent');
        clock.now = 101;
        await waitFor(() => game.brogueChild === null);
        expect(children[0].signalCode).to.equal('SIGTERM');
    });

    it('renews retention on actual player input but not refresh/graphics queries', async function() {
        const game = await start();
        clock.now = 90;
        game.sendRefreshScreenAndInitialiseCommands();
        game.handleIncomingBinaryMessage(Buffer.from([51, 0, 0, 0, 0]), () => {});
        expect(game.lastActiveTime).to.equal(0);
        game.handleIncomingBinaryMessage(Buffer.from([0, 0, 13, 0, 0]), () => {});
        expect(game.lastActiveTime).to.equal(90);
        clock.now = 150;
        game.checkIdleTimeAndKill();
        expect(game.hasLiveChild()).to.equal(true);
        clock.now = 191;
        await waitFor(() => game.brogueChild === null);
    });

    it('retains ownership and escalates when SIGTERM does not stop the child', async function() {
        const game = await start('ignore-term');
        const child = game.brogueChild;
        let removed = 0;
        game.onDisconnect = () => { removed++; };
        game.killBrogue(game);
        expect(game.brogueChild).to.equal(child);
        expect(game.isTerminating()).to.equal(true);
        expect(removed).to.equal(0);
        await waitFor(() => game.brogueChild === null);
        expect(child.signalCode).to.equal('SIGKILL');
        expect(removed).to.equal(1);
        expect(game.killTimer).to.equal(null);
    });

    it('does not orphan a live child when its socket fails', async function() {
        const game = await start('ignore-term');
        const child = game.brogueChild;
        game.brogueSocket.emit('error', Object.assign(new Error('fixture transport failure'), { code: 'ENOBUFS' }));
        expect(game.disconnected).to.equal(true);
        expect(game.brogueChild).to.equal(child);
        await waitFor(() => game.brogueChild === null);
        expect(child.signalCode).to.equal('SIGKILL');
    });

    it('keeps a game alive on transient EAGAIN and still reaps it later', async function() {
        const game = await start();
        game.brogueSocket.emit('error', { code: 'EAGAIN' });
        expect(game.disconnected).to.equal(false);
        expect(game.hasLiveChild()).to.equal(true);
        clock.now = 101;
        await waitFor(() => game.brogueChild === null);
    });

    it('cleans up an unexpected exit, allowing final events to drain first', async function() {
        const game = await start();
        const events = [];
        game.addEventListener(() => events.push('final event'));
        game.addQuitListener(() => events.push('quit'));
        const child = game.brogueChild;
        const exited = new Promise(resolve => child.once('exit', resolve));
        child.kill('SIGKILL');
        await exited;
        // Models the already-queued final datagram arriving after the OS exit.
        game.brogueEvents.emit('event', {});
        expect(events).to.deep.equal(['final event']);
        await waitFor(() => game.brogueChild === null);
        expect(events).to.deep.equal(['final event', 'quit']);
        expect(game.intervalKiller).to.equal(null);
    });

    it('cleans up failed spawns without waiting for a nonexistent exit event', async function() {
        const game = await start('silent', true);
        await waitFor(() => game.disconnected);
        expect(game.brogueChild).to.equal(null);
        expect(game.intervalKiller).to.equal(null);
    });

    it('releases allocated sockets when startup/observation throws synchronously', function() {
        const original = Game.prototype.start;
        let allocated;
        let closed = 0;
        Game.prototype.start = function() {
            allocated = this;
            this.brogueSocket = { close() { closed++; } };
            throw new Error('fixture setup failure');
        };
        try {
            expect(() => comms.getBrogueInterface('failed-observer', 'BROGUECEV151', {}, 1)).to.throw('fixture setup failure');
            expect(closed).to.equal(1);
            expect(allocated.disconnected).to.equal(true);
            expect(Object.values(comms.brogueInterface)).not.to.include(allocated);
        } finally { Game.prototype.start = original; }
    });

    it('releases every child, timer and socket through repeated abandon/reap cycles', async function() {
        for (let i = 0; i < 6; i++) {
            const game = await start('silent');
            clock.now += 101;
            await waitFor(() => game.brogueChild === null);
            expect(game.intervalKiller).to.equal(null);
            expect(game.killTimer).to.equal(null);
            expect(game.exitTimer).to.equal(null);
            expect(game.brogueSocket).to.equal(null);
            expect(game.brogueClientSocket).to.equal(null);
        }
        expect(children.every(child => child.signalCode !== null || child.exitCode !== null)).to.equal(true);
    });
});
