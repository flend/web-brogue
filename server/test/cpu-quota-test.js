const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const Game = require('../brogue/brogue-interface');
const config = require('../config');

describe('per-game CPU launcher', function() {
    const variant = Object.keys(config.brogueVariants)[0];
    it('wraps the executable and preserves individual arguments', function() {
        let invocation;
        const child = new EventEmitter();
        const game = new Game('quota-test', variant, {
            lifecycle: { cpuQuotaPercent: 20 },
            spawn: (...args) => { invocation = args; return child; }
        });
        const argumentsForGame = ['a space', '$literal', ';literal'];
        game.spawnChildProcess(argumentsForGame, '/tmp');
        assert.equal(invocation[0], '/bin/sh');
        assert.match(invocation[1][0], /limit-game-cpu\.sh$/);
        assert.equal(invocation[1][1], path.resolve(__dirname, '../..', config.brogueVariants[variant].binaryPath));
        assert.deepEqual(invocation[1].slice(2), argumentsForGame);
        assert.equal(invocation[2].env.BROGUE_CPU_QUOTA_PERCENT, '20');
        assert.equal(game.brogueChild, child);
    });
    it('rejects invalid quotas before starting a game', function() {
        for (const cpuQuotaPercent of [0, 101, NaN, 1.5]) {
            assert.throws(() => new Game('quota-test', variant, {
                lifecycle: { cpuQuotaPercent }
            }), /CPU quota/);
        }
    });
    it('rejects invalid direct wrapper input without executing the target', function() {
        for (const quota of ['0', '101', 'invalid']) {
            const result = spawnSync('/bin/sh', [path.resolve(__dirname, '../scripts/limit-game-cpu.sh'), '/bin/true'], {
                env: { ...process.env, BROGUE_CPU_QUOTA_PERCENT: quota }
            });
            assert.equal(result.status, 64);
        }
    });
});
