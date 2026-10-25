var expect = require("chai").expect;

var brogueConstants = require("../brogue/brogue-constants.js");
var config = require("./config-test");

var stats = require("../stats/stats.js");

describe('death cause classification', function() {
    const death = brogueConstants.notifyEvents.GAMEOVER_DEATH;

    it('counts overlapping lava descriptions exactly once without mutating records', function() {
        const game = Object.freeze({ result: death, description: 'Killed by lava on depth 8.' });
        const classified = stats.deathGamesWithCauses([game]);
        expect(classified).to.have.length(1);
        expect(classified[0].cause).to.equal('lava');
        expect(classified[0]).not.to.equal(game);
        expect(game).not.to.have.property('cause');
    });

    it('retains environmental categories and parses causes without articles', function() {
        const descriptions = [
            ['Burned to death on depth 3.', 'burned to death'],
            ['Killed by poison on depth 3.', 'poison'],
            ['Starved to death on depth 3.', 'starved'],
            ['Killed by a rat on depth 3.', 'rat'],
            ['Killed by an ogre on depth 3.', 'ogre'],
            ['Killed by thorned vines on depth 3.', 'thorned vines'],
            ['Drained by a cursed ring on depth 3.', 'cursed ring']
        ];
        const classified = stats.deathGamesWithCauses(descriptions.map(([description]) => ({ result: death, description })));
        expect(classified.map(game => game.cause)).to.deep.equal(descriptions.map(([, cause]) => cause));
    });

    it('includes deaths with missing or unrecognised descriptions as unknown', function() {
        const classified = stats.deathGamesWithCauses([
            { result: death }, { result: death, description: '' },
            { result: death, description: 'An unexpected demise.' }
        ]);
        expect(classified.map(game => game.cause)).to.deep.equal(['unknown', 'unknown', 'unknown']);
    });

    it('excludes non-death outcomes even if their descriptions mention a cause', function() {
        const games = [0, 2, 3, 4, undefined].map(result => ({ result, description: 'Killed by lava on depth 8.' }));
        expect(stats.deathGamesWithCauses(games)).to.deep.equal([]);
    });
});
