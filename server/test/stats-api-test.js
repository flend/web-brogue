var request = require('supertest');
var mongoose = require("mongoose");
var gameRecord = require("../database/game-record-model");
var brogueConstants = require("../brogue/brogue-constants.js");
var expect = require("chai").expect;
var server = require("./server-test");
var config = require("./config-test");

describe('general statistics include masteries in victory totals', function() {
    beforeEach(async function() {
        const events = brogueConstants.notifyEvents;
        const outcomes = [events.GAMEOVER_VICTORY, events.GAMEOVER_SUPERVICTORY,
            events.GAMEOVER_SUPERVICTORY, events.GAMEOVER_DEATH, events.GAMEOVER_QUIT];
        const games = [];
        for (const easyMode of [false, true]) {
            for (const result of outcomes) {
                games.push({ username: 'victory-count-test',
                    date: new Date(1700000000000 + games.length),
                    variant: 'BROGUE', result, easyMode });
            }
        }
        await gameRecord.create(games);
    });
    afterEach(async function() { await gameRecord.deleteMany({}); });

    it('includes each mastery once and keeps easy and normal modes separate', async function() {
        const response = await request(server.app).get('/api/stats/general')
            .query({ variant: 'BROGUE', username: 'victory-count-test' })
            .set('Accept', 'application/json').expect(200);
        for (const mode of ['Normal', 'Easy']) {
            expect(response.body['total' + mode + 'ModeVictories']).to.equal(3);
            expect(response.body['total' + mode + 'ModeSuperVictories']).to.equal(2);
            expect(response.body['total' + mode + 'ModeDeaths']).to.equal(1);
            expect(response.body['total' + mode + 'ModeQuits']).to.equal(1);
        }
        expect(response.body.totalGames).to.equal(10);
    });

    it('counts a mastery-only history as one victory and one mastery', async function() {
        await gameRecord.deleteMany({ result: { $ne: brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY } });
        // Retain one normal-mode mastery to exercise the original 0-victory case.
        const mastery = await gameRecord.findOne({ easyMode: false });
        await gameRecord.deleteMany({ _id: { $ne: mastery._id } });
        const response = await request(server.app).get('/api/stats/general')
            .set('Accept', 'application/json').expect(200);
        expect(response.body.totalNormalModeVictories).to.equal(1);
        expect(response.body.totalNormalModeSuperVictories).to.equal(1);
        expect(response.body.totalEasyModeVictories).to.equal(0);
        expect(response.body.totalEasyModeSuperVictories).to.equal(0);
    });
});

describe('death statistics count each normal-mode death once', function() {
    beforeEach(async function() {
        const descriptions = [
            'Killed by lava on depth 3.',
            'Drained by a cursed ring on depth 3.',
            'An unexpected demise.',
            'Killed by lava on depth 3.',
            'Killed by lava on depth 3.'
        ];
        await gameRecord.create(descriptions.map((description, index) => ({
            username: 'death-count-test', date: new Date(1700000000000 + index),
            variant: 'BROGUE', level: 3, description,
            result: index === 4 ? brogueConstants.notifyEvents.GAMEOVER_QUIT : brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: index === 3
        })));
    });
    afterEach(async function() { await gameRecord.deleteMany({}); });

    it('counts lava, previously omitted deaths and unknown deaths in level totals', async function() {
        const response = await request(server.app).get('/api/stats/levels').set('Accept', 'application/json').expect(200);
        expect(response.body).to.deep.equal([{ level: 3, frequency: 3 }]);
    });

    it('uses all deaths as the cause percentage denominator, including before cropping', async function() {
        const response = await request(server.app).get('/api/stats/levels/monsters').set('Accept', 'application/json').expect(200);
        expect(response.body).to.have.length(3);
        expect(response.body.map(row => row.cause)).to.have.members(['lava', 'cursed ring', 'unknown']);
        for (const row of response.body) {
            expect(row.frequency).to.equal(1);
            expect(row.percentage).to.be.closeTo(100 / 3, 1e-9);
        }
        const cropped = await request(server.app).get('/api/stats/levels/monsters?maxCauses=1').set('Accept', 'application/json').expect(200);
        expect(cropped.body).to.have.length(1);
        expect(cropped.body[0].percentage).to.be.closeTo(100 / 3, 1e-9);
    });
});



describe("stats/general", function(){

    beforeEach(function(done) {

        var gameRecord1 = {
            username: "flend",
            date: new Date("2011-05-26T07:56:00.123Z"),
            score: 100,
            seed: 200,
            level: 3,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly on depth 3.",
            recording: "file1",
            variant: "BROGUE"
        };

        var gameRecord2 = {
            username: "flend",
            date: new Date("2011-06-26T07:56:00.123Z"),
            score: 150,
            seed: 250,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a violent explosion on depth 5.",
            recording: "file2",
            variant: "GBROGUE"
        };

        var gameRecord3 = {
            username: "ccc",
            date: new Date("2013-06-27T07:56:01.123Z"),
            score: 150,
            seed: 250,
            level: 26,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped the Dungeons of Doom with 3 lumenstones!",
            recording: "file3",
            variant: "GBROGUE"
        };

        var gameRecord4 = {
            username: "dave",
            date: new Date("2012-06-26T07:56:01.123Z"),
            score: 150,
            seed: 250,
            level: 26,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped the Dungeons of Doom!",
            recording: "file4",
            variant: "BROGUE"
        };

        gameRecord.create([gameRecord1, gameRecord2, gameRecord3, gameRecord4]).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    afterEach(function(done) {

        gameRecord.deleteMany({}).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    it("returns status 200", function(done) {
      request(server.app)
          .get("/api/stats/general")
          .set('Accept', 'application/json')
          .expect('Content-Type', /json/)
          .expect(200, done)
    });

    it("totalGames is calculated correctly over all variants", function(done) {
        request(server.app)
            .get("/api/stats/general")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var bodyObj = JSON.parse(res.text);
                expect(bodyObj).to.have.property('totalGames', 4);
                done();
            });
    });

    it("last victory is calculated from victories over all variants", function(done) {
        request(server.app)
            .get("/api/stats/general")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var bodyObj = JSON.parse(res.text);
                expect(bodyObj).to.have.nested.property('lastVictory.date', "2013-06-27T07:56:01.123Z");
                expect(bodyObj).to.have.nested.property('lastVictory.username', "ccc");
                done();
            });
    });
});

describe("stats/general filters by variant", function() {

    beforeEach(function (done) {

        var gameRecord1 = {
            username: "flend",
            date: new Date("2011-05-26T07:56:00.123Z"),
            score: 100,
            seed: 200,
            level: 3,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly on depth 3.",
            recording: "file1",
            variant: "BROGUE"
        };

        var gameRecord2 = {
            username: "flend",
            date: new Date("2011-06-26T07:56:00.123Z"),
            score: 150,
            seed: 250,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a violent explosion on depth 5.",
            recording: "file2",
            variant: "BROGUE"
        };

        var gameRecord3 = {
            username: "ccc",
            date: new Date("2013-06-27T07:56:01.123Z"),
            score: 150,
            seed: 250,
            level: 26,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped the Dungeons of Doom with 3 lumenstones!",
            recording: "file3",
            variant: "GBROGUE"
        };

        var gameRecord4 = {
            username: "dave",
            date: new Date("2012-06-26T07:56:01.123Z"),
            score: 150,
            seed: 250,
            level: 26,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped the Dungeons of Doom!",
            recording: "file4",
            variant: "GBROGUE"
        };

        gameRecord.create([gameRecord1, gameRecord2, gameRecord3, gameRecord4]).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    afterEach(function (done) {

        gameRecord.deleteMany({}).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    it("totalGames is calculated correctly when filtering by variant", function (done) {
        request(server.app)
            .get("/api/stats/general")
            .set('Accept', 'application/json')
            .query({ variant: 'BROGUE' })
            .end(function (err, res) {
                var bodyObj = JSON.parse(res.text);
                expect(bodyObj).to.have.property('totalGames', 2);
                done();
            });
    });
});

describe("stats/general filters by variant and user", function() {

    beforeEach(function (done) {

        var gameRecord1 = {
            username: "flend",
            date: new Date("2011-05-26T07:56:00.123Z"),
            score: 100,
            seed: 201,
            level: 3,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly on depth 3.",
            recording: "file1",
            variant: "BROGUE"
        };

        var gameRecord2 = {
            username: "flend",
            date: new Date("2011-06-26T07:56:00.123Z"),
            score: 150,
            seed: 202,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a violent explosion on depth 5.",
            recording: "file2",
            variant: "BROGUE"
        };

        var gameRecord3 = {
            username: "ccc",
            date: new Date("2013-06-27T07:56:01.123Z"),
            score: 150,
            seed: 203,
            level: 26,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped the Dungeons of Doom with 3 lumenstones!",
            recording: "file3",
            variant: "BROGUE"
        };

        var gameRecord4 = {
            username: "flend",
            date: new Date("2012-06-26T07:56:01.123Z"),
            score: 150,
            seed: 204,
            level: 26,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped the Dungeons of Doom!",
            recording: "file4",
            variant: "GBROGUE"
        };

        gameRecord.create([gameRecord1, gameRecord2, gameRecord3, gameRecord4]).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    afterEach(function (done) {

        gameRecord.deleteMany({}).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    it("totalGames is calculated correctly when filtering by user and variant with user having played 1 variant", function (done) {
        request(server.app)
            .get("/api/stats/general")
            .set('Accept', 'application/json')
            .query({ variant: 'BROGUE', username: 'ccc' })
            .end(function (err, res) {
                var bodyObj = JSON.parse(res.text);
                expect(bodyObj).to.have.property('totalGames', 1);
                done();
            });
    });

    it("totalGames is calculated correctly when filtering by user and variant with user having played >1 variant", function (done) {
        request(server.app)
            .get("/api/stats/general")
            .set('Accept', 'application/json')
            .query({ variant: 'BROGUE', username: 'flend' })
            .end(function (err, res) {
                var bodyObj = JSON.parse(res.text);
                expect(bodyObj).to.have.property('totalGames', 2);
                done();
            });
    });
});

describe("stats/general calculates total lumenstones correctly", function() {

    beforeEach(function (done) {

        var gameRecord1 = {
            username: "ccc",
            date: new Date("2013-06-27T07:56:01.123Z"),
            score: 150,
            seed: 203,
            level: 26,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped the Dungeons of Doom with 3 lumenstones!",
            recording: "file1",
            variant: "BROGUE"
        };

        var gameRecord2 = {
            username: "ccc",
            date: new Date("2013-06-28T07:56:01.123Z"),
            score: 151,
            seed: 204,
            level: 27,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped the Dungeons of Doom with a lumenstone!",
            recording: "file32",
            variant: "GBROGUE"
        };

        var gameRecord3 = {
            username: "ccb",
            date: new Date("2013-06-29T07:56:01.123Z"),
            score: 152,
            seed: 205,
            level: 27,
            result: brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY,
            easyMode: false,
            description: "Escaped the Dungeons of Doom with 4 lumenstones!",
            recording: "file35",
            variant: "BROGUE"
        };

        var gameRecord4 = {
            username: "ccd",
            date: new Date("2013-06-30T07:56:01.123Z"),
            score: 153,
            seed: 206,
            level: 27,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped the Dungeons of Doom with a lumenstone!",
            recording: "file38",
            variant: "GBROGUE"
        };

        gameRecord.create([gameRecord1, gameRecord2, gameRecord3, gameRecord4]).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    afterEach(function (done) {

        gameRecord.deleteMany({}).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    it("totalLumenstones is calculated correctly for numeric lumenstones", function (done) {
        request(server.app)
            .get("/api/stats/general")
            .set('Accept', 'application/json')
            .query({ variant: 'BROGUE' })
            .end(function (err, res) {
                var bodyObj = JSON.parse(res.text);
                expect(bodyObj).to.have.property('totalLumenstones', 7);
                done();
            });
    });

    it("totalLumenstones is calculated correctly for 'a lumenstone'", function (done) {
        request(server.app)
            .get("/api/stats/general")
            .set('Accept', 'application/json')
            .query({ variant: 'GBROGUE' })
            .end(function (err, res) {
                var bodyObj = JSON.parse(res.text);
                expect(bodyObj).to.have.property('totalLumenstones', 2);
                done();
            });
    });

    it("totalLumenstones is calculated correctly sum of both numeric and 'a lumenstone'", function (done) {
        request(server.app)
            .get("/api/stats/general")
            .set('Accept', 'application/json')
            .end(function (err, res) {
                var bodyObj = JSON.parse(res.text);
                expect(bodyObj).to.have.property('totalLumenstones', 9);
                done();
            });
    });

});

describe("stats/general", function(){

    beforeEach(function(done) {

        var gameRecord5 = {
            username: "yyy",
            date: new Date("2011-05-25T07:56:00.123Z"),
            score: 150,
            seed: 250,
            level: 40,
            result: brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY,
            easyMode: false,
            description: "Mastered the Dungeons of Doom!",
            recording: "file5",
            variant: "BROGUE"
        };

        var gameRecord4 = {
            username: "yyy",
            date: new Date("2011-05-26T07:56:00.123Z"),
            score: 150,
            seed: 250,
            level: 40,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly",
            recording: "file4",
            variant: "BROGUE"
        };

        var gameRecord3 = {
            username: "yyy",
            date: new Date("2011-05-27T07:56:00.123Z"),
            score: 150,
            seed: 250,
            level: 40,
            result: brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY,
            easyMode: false,
            description: "Mastered the Dungeons of Doom!",
            recording: "file3",
            variant: "BROGUE"
        };

        var gameRecord2 = {
            username: "yyy",
            date: new Date("2011-06-28T07:56:00.123Z"),
            score: 150,
            seed: 250,
            level: 40,
            result: brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY,
            easyMode: false,
            description: "Mastered the Dungeons of Doom!",
            recording: "file2",
            variant: "BROGUE"
        };

        var gameRecord9 = {
            username: "yyy",
            date: new Date("2011-06-29T07:56:00.123Z"),
            score: 150,
            seed: 250,
            level: 40,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped the Dungeons of Doom!",
            recording: "file2",
            variant: "BROGUE"
        };


        var gameRecord8 = {
            username: "xxx",
            date: new Date("2010-05-25T07:56:00.123Z"),
            score: 150,
            seed: 250,
            level: 40,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped the Dungeons of Doom!",
            recording: "file8",
            variant: "BROGUE"
        };

        var gameRecord7 = {
            username: "xxx",
            date: new Date("2010-05-26T07:56:00.123Z"),
            score: 150,
            seed: 250,
            level: 40,
            result: brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY,
            easyMode: false,
            description: "Mastered the Dungeons of Doom!",
            recording: "file7",
            variant: "BROGUE"
        };

        var gameRecord6 = {
            username: "xxx",
            date: new Date("2010-05-27T07:56:00.123Z"),
            score: 150,
            seed: 250,
            level: 40,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly",
            recording: "file6",
            variant: "BROGUE"
        };

        var gameRecord1 = {
            username: "xxx",
            date: new Date("2012-06-26T07:56:00.123Z"),
            score: 100,
            seed: 200,
            level: 26,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped the Dungeons of Doom!",
            recording: "file1",
            variant: "BROGUE"
        };


        gameRecord.create([gameRecord1, gameRecord2, gameRecord3, gameRecord4, gameRecord5, gameRecord6, gameRecord7, gameRecord8, gameRecord9]).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    afterEach(function(done) {

        gameRecord.deleteMany({}).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    it("last victory is calculated from victories and supervictories", function(done) {
        request(server.app)
            .get("/api/stats/general")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var bodyObj = JSON.parse(res.text);
                expect(bodyObj).to.have.nested.property('lastVictory.date', "2012-06-26T07:56:00.123Z");
                expect(bodyObj).to.have.nested.property('lastVictory.username', "xxx");
                done();
            });
    });

    it("last streak is the most recent, longest set of consecutive victories and supervictories", function(done) {
        request(server.app)
            .get("/api/stats/general")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var bodyObj = JSON.parse(res.text);
                expect(bodyObj).to.have.nested.property('lastStreak.date', "2011-06-29T07:56:00.123Z");
                expect(bodyObj).to.have.nested.property('lastStreak.length', 3);
                expect(bodyObj).to.have.nested.property('lastStreak.username', "yyy");
                done();
            });
    });

    it("identifies mastery streaks, longest set of consecutive supervictories only", function(done) {
        request(server.app)
            .get("/api/stats/general")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var bodyObj = JSON.parse(res.text);
                expect(bodyObj).to.have.nested.property('lastMasteryStreak.date', "2011-06-28T07:56:00.123Z");
                expect(bodyObj).to.have.nested.property('lastMasteryStreak.length', 2);
                expect(bodyObj).to.have.nested.property('lastMasteryStreak.username', "yyy");
                done();
            });
    });
});

describe("stats/general", function(){

    beforeEach(function(done) {

        var gameRecord1 = {
            username: "xxx",
            date: new Date("2012-06-26T07:56:00.123Z"),
            score: 100,
            seed: 200,
            level: 26,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped the Dungeons of Doom!",
            recording: "file1",
            variant: "BROGUE"
        };

        var gameRecord2 = {
            username: "xxx",
            date: new Date("2012-06-25T07:56:00.123Z"),
            score: 100,
            seed: 200,
            level: 26,
            result: brogueConstants.notifyEvents.GAMEOVER_QUIT,
            easyMode: false,
            description: "Died!",
            recording: "file2",
            variant: "BROGUE"
        };

        gameRecord.create([gameRecord1]).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    afterEach(function(done) {

        gameRecord.deleteMany({}).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    it("last streak is 1 if there is only 1 consecutive victory", function(done) {
        request(server.app)
            .get("/api/stats/general")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var bodyObj = JSON.parse(res.text);
                expect(bodyObj).to.have.nested.property('lastStreak.date', "2012-06-26T07:56:00.123Z");
                expect(bodyObj).to.have.nested.property('lastStreak.length', 1);
                expect(bodyObj).to.have.nested.property('lastStreak.username', "xxx");
                done();
            });
    });
});

describe("stats/general", function(){

    it("last victory is 'Never' if no games recorded", function(done) {
        request(server.app)
            .get("/api/stats/general")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var bodyObj = JSON.parse(res.text);
                expect(bodyObj).to.have.nested.property('lastVictory.date', 'Never');
                expect(bodyObj).to.have.nested.property('lastVictory.username', 'No-one');
                done();
            });
    });

    it("longest streak is 'Never' if no games recorded", function(done) {
        request(server.app)
            .get("/api/stats/general")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var bodyObj = JSON.parse(res.text);
                expect(bodyObj).to.have.nested.property('lastStreak.date', "Never");
                expect(bodyObj).to.have.nested.property('lastStreak.length', 0);
                expect(bodyObj).to.have.nested.property('lastStreak.username', "No-one");
                done();
            });
    });
});

describe("stats/general", function(){

    beforeEach(function(done) {

        var gameRecord1 = {
            username: "yyy",
            date: new Date("2012-06-26T07:56:00.123Z"),
            score: 100,
            seed: 200,
            level: 26,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly!",
            recording: "file1",
            variant: "BROGUE"
        };

        var gameRecord2 = {
            username: "xxx",
            date: new Date("2012-06-25T07:56:00.123Z"),
            score: 100,
            seed: 200,
            level: 26,
            result: brogueConstants.notifyEvents.GAMEOVER_QUIT,
            easyMode: false,
            description: "Quit on depth 26!",
            recording: "file2",
            variant: "BROGUE"
        };

        gameRecord.create([gameRecord1]).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    afterEach(function(done) {

        gameRecord.deleteMany({}).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    it("last victory is 'Never' if no victories recorded", function(done) {
        request(server.app)
            .get("/api/stats/general")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var bodyObj = JSON.parse(res.text);
                expect(bodyObj).to.have.nested.property('lastVictory.date', 'Never');
                expect(bodyObj).to.have.nested.property('lastVictory.username', 'No-one');
                done();
            });
    });

    it("longest streak is 'Never' if there are no victories", function(done) {
        request(server.app)
            .get("/api/stats/general")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var bodyObj = JSON.parse(res.text);
                expect(bodyObj).to.have.nested.property('lastStreak.date', "Never");
                expect(bodyObj).to.have.nested.property('lastStreak.length', 0);
                expect(bodyObj).to.have.nested.property('lastStreak.username', "No-one");
                done();
            });
    });
});


describe("stats/levels/monsters", function() {

    beforeEach(function (done) {

        var gameRecord1 = {
            username: "flend",
            date: new Date("2011-05-26T07:56:00.123Z"),
            score: 100,
            seed: 200,
            level: 3,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly on depth 3.",
            recording: "file1",
            variant: "BROGUE"
        };

        var gameRecord2 = {
            username: "flend",
            date: new Date("2011-06-26T07:56:00.123Z"),
            score: 150,
            seed: 250,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a violent explosion on depth 5.",
            recording: "file2",
            variant: "BROGUE"
        };

        var gameRecord3 = {
            username: "ccc",
            date: new Date("2011-06-27T07:56:00.123Z"),
            score: 151,
            seed: 251,
            level: 1,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a rat on depth 1.",
            recording: "file3",
            variant: "BROGUE"
        };

        var gameRecord4 = {
            username: "ccc2",
            date: new Date("2012-06-27T07:56:00.123Z"),
            score: 152,
            seed: 252,
            level: 1,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a rat on depth 1.",
            recording: "file4",
            variant: "BROGUE"
        };

        var gameRecord5 = {
            username: "ccc3",
            date: new Date("2013-06-27T07:56:00.123Z"),
            score: 153,
            seed: 353,
            level: 1,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a jackal on depth 1.",
            recording: "file5",
            variant: "BROGUE"
        };

        gameRecord.create([gameRecord1, gameRecord2, gameRecord3, gameRecord4, gameRecord5]).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    afterEach(function (done) {

        //delete all the customer records
        gameRecord.deleteMany({}).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    it("returns status 200", function (done) {
        request(server.app)
            .get("/api/stats/levels/monsters")
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200, done)
    });

    it("groups causes by deaths correctly", function (done) {
        request(server.app)
            .get("/api/stats/levels/monsters")
            .set('Accept', 'application/json')
            .end(function (err, res) {
                var bodyObj = JSON.parse(res.text);

                var level1TopDeath = bodyObj[0];
                expect(level1TopDeath).to.have.property('level', 1);
                expect(level1TopDeath).to.have.property('cause', 'rat');
                expect(level1TopDeath).to.have.property('frequency', 2);
                expect(level1TopDeath).to.have.property('rank', 1);

                var level1SecoundDeath = bodyObj[1];
                expect(level1SecoundDeath).to.have.property('level', 1);
                expect(level1SecoundDeath).to.have.property('cause', 'jackal');
                expect(level1SecoundDeath).to.have.property('frequency', 1);
                expect(level1SecoundDeath).to.have.property('rank', 2);
                done();
            });
    });

    it("restricts records per level by maxCauses", function (done) {
        request(server.app)
            .get("/api/stats/levels/monsters?maxCauses=1")
            .set('Accept', 'application/json')
            .end(function (err, res) {
                var bodyObj = JSON.parse(res.text);

                var level1TopDeath = bodyObj[0];
                expect(level1TopDeath).to.have.property('level', 1);
                expect(level1TopDeath).to.have.property('cause', 'rat');
                expect(level1TopDeath).to.have.property('frequency', 2);
                expect(level1TopDeath).to.have.property('rank', 1);

                var level3TopDeath = bodyObj[1];
                expect(level3TopDeath).to.have.property('level', 3);
                expect(level3TopDeath).to.have.property('cause', 'pink jelly');
                expect(level3TopDeath).to.have.property('frequency', 1);
                expect(level3TopDeath).to.have.property('rank', 1);
                done();
            });
    });

    it("calculates percentages of all deaths", function (done) {
        request(server.app)
            .get("/api/stats/levels/monsters?maxCauses=2")
            .set('Accept', 'application/json')
            .end(function (err, res) {
                var bodyObj = JSON.parse(res.text);

                var level1TopDeath = bodyObj[0];
                expect(level1TopDeath).to.have.property('level', 1);
                expect(level1TopDeath).to.have.property('cause', 'rat');
                expect(level1TopDeath).to.have.property('frequency', 2);
                expect(level1TopDeath).to.have.property('percentage').closeTo(66.7, 0.1);
                expect(level1TopDeath).to.have.property('rank', 1);

                var level1SecondDeath = bodyObj[1];
                expect(level1SecondDeath).to.have.property('level', 1);
                expect(level1SecondDeath).to.have.property('cause', 'jackal');
                expect(level1SecondDeath).to.have.property('frequency', 1);
                expect(level1SecondDeath).to.have.property('percentage').closeTo(33.3, 0.1);
                expect(level1SecondDeath).to.have.property('rank', 2);

                var level3TopDeath = bodyObj[2];
                expect(level3TopDeath).to.have.property('level', 3);
                expect(level3TopDeath).to.have.property('cause', 'pink jelly');
                expect(level3TopDeath).to.have.property('frequency', 1);
                expect(level3TopDeath).to.have.property('percentage', 100);
                expect(level3TopDeath).to.have.property('rank', 1);
                done();
            });
    });
});

describe("stats/levels/monsters with no game records", function() {

    it("returns an empty object", function (done) {
        request(server.app)
            .get("/api/stats/levels/monsters")
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200)
            .expect({}, done)
    });
});

describe("stats/levelProbabilities", function() {

    beforeEach(function (done) {

        var gameRecord1 = {
            username: "flend",
            date: new Date("2011-05-26T07:56:00.123Z"),
            score: 100,
            seed: 200,
            level: 3,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly on depth 3.",
            recording: "file1",
            variant: "BROGUE"
        };

        var gameRecord2 = {
            username: "flend",
            date: new Date("2011-06-26T07:56:00.123Z"),
            score: 150,
            seed: 250,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a violent explosion on depth 5.",
            recording: "file2",
            variant: "BROGUE"
        };

        var gameRecord3 = {
            username: "ccc",
            date: new Date("2011-06-27T07:56:00.123Z"),
            score: 151,
            seed: 251,
            level: 1,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a rat on depth 1.",
            recording: "file3",
            variant: "BROGUE"
        };

        var gameRecord4 = {
            username: "ccc2",
            date: new Date("2012-06-27T07:56:00.123Z"),
            score: 152,
            seed: 252,
            level: 1,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a rat on depth 1.",
            recording: "file4",
            variant: "BROGUE"
        };

        var gameRecord5 = {
            username: "ccc3",
            date: new Date("2013-06-27T07:56:00.123Z"),
            score: 154,
            seed: 254,
            level: 2,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a jackal on depth 2.",
            recording: "file5",
            variant: "BROGUE"
        };

        var gameRecord6 = {
            username: "ccc3",
            date: new Date("2013-06-28T07:56:00.123Z"),
            score: 153,
            seed: 253,
            level: 2,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a hamster on depth 2.",
            recording: "file6",
            variant: "BROGUE"
        };

        var gameRecord7 = {
            username: "flend",
            date: new Date("2013-06-28T05:56:00.123Z"),
            score: 153,
            seed: 253,
            level: 2,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a violent explosion on depth 2.",
            recording: "file7",
            variant: "BROGUE"
        };

        var gameRecord8 = {
            username: "flend",
            date: new Date("2013-06-29T05:56:00.123Z"),
            score: 154,
            seed: 254,
            level: 3,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a violent explosion on depth 3.",
            recording: "file8",
            variant: "BROGUE"
        };

        var gameRecord9 = {
            username: "flend",
            date: new Date("2012-06-29T05:56:00.123Z"),
            score: 154,
            seed: 254,
            level: 1,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped the Dungeons of Doom.",
            recording: "file9",
            variant: "BROGUE"
        };

        var gameRecord10 = {
            username: "flend",
            date: new Date("2015-06-29T05:56:00.123Z"),
            score: 154,
            seed: 254,
            level: 40,
            result: brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY,
            easyMode: false,
            description: "Mastered the Dungeons of Doom.",
            recording: "file10",
            variant: "BROGUE"
        };

        var gameRecord11 = {
            username: "flend",
            date: new Date("2015-06-29T05:56:22.123Z"),
            score: 154,
            seed: 254,
            level: 1,
            result: brogueConstants.notifyEvents.GAMEOVER_QUIT,
            easyMode: false,
            description: "Quit on level 1.",
            recording: "file11",
            variant: "BROGUE"
        };

        gameRecord.create([gameRecord1, gameRecord2, gameRecord3, gameRecord4, gameRecord5, gameRecord6, gameRecord7, gameRecord8, gameRecord9, gameRecord10, gameRecord11]).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    afterEach(function (done) {

        //delete all the customer records
        gameRecord.deleteMany({}).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    it("returns status 200", function (done) {
        request(server.app)
            .get("/api/stats/levelProbability")
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200, done)
    });

    it("calculates conditional probabilities", function (done) {
        request(server.app)
            .get("/api/stats/levelProbability")
            .set('Accept', 'application/json')
            .end(function (err, res) {
                var bodyObj = JSON.parse(res.text);

                var level1Deaths = bodyObj[0];
                expect(level1Deaths).to.have.property('level', 1);
                expect(level1Deaths).to.have.property('probability').closeTo(0.2, 0.01);

                var level2Deaths = bodyObj[1];
                expect(level2Deaths).to.have.property('level', 2);
                expect(level2Deaths).to.have.property('probability').closeTo(0.375, 0.01);

                var level3Deaths = bodyObj[2];
                expect(level3Deaths).to.have.property('level', 3);
                expect(level3Deaths).to.have.property('probability').closeTo(0.4, 0.01);

                var level5Deaths = bodyObj[3];
                expect(level5Deaths).to.have.property('level', 5);
                expect(level5Deaths).to.have.property('probability').closeTo(0.33, 0.01);

                done();
            });
    });
});

describe("stats/levelProbabilities with no game records", function() {

    it("returns an empty object", function (done) {
        request(server.app)
            .get("/api/stats/levelProbability")
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200)
            .expect({}, done)
    });
});

describe("stats/levels", function() {

    beforeEach(function (done) {

        var gameRecord1 = {
            username: "flend",
            date: new Date("2011-05-26T07:56:00.123Z"),
            score: 100,
            seed: 200,
            level: 3,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly on depth 3.",
            recording: "file1",
            variant: "BROGUE"
        };

        var gameRecord2 = {
            username: "flend",
            date: new Date("2011-06-26T07:56:00.123Z"),
            score: 150,
            seed: 250,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a violent explosion on depth 5.",
            recording: "file2",
            variant: "BROGUE"
        };

        var gameRecord3 = {
            username: "ccc",
            date: new Date("2011-06-27T07:56:00.123Z"),
            score: 151,
            seed: 251,
            level: 1,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a rat on depth 1.",
            recording: "file3",
            variant: "BROGUE"
        };

        var gameRecord4 = {
            username: "ccc2",
            date: new Date("2012-06-27T07:56:00.123Z"),
            score: 152,
            seed: 252,
            level: 1,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a rat on depth 1.",
            recording: "file4",
            variant: "BROGUE"
        };

        var gameRecord5 = {
            username: "ccc3",
            date: new Date("2013-06-27T07:56:00.123Z"),
            score: 154,
            seed: 254,
            level: 2,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a jackal on depth 2.",
            recording: "file5",
            variant: "BROGUE"
        };

        var gameRecord6 = {
            username: "ccc3",
            date: new Date("2013-06-28T07:56:00.123Z"),
            score: 153,
            seed: 253,
            level: 2,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a hamster on depth 2.",
            recording: "file6",
            variant: "BROGUE"
        };

        var gameRecord7 = {
            username: "flend",
            date: new Date("2013-06-28T05:56:00.123Z"),
            score: 153,
            seed: 253,
            level: 2,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a violent explosion on depth 2.",
            recording: "file7",
            variant: "BROGUE"
        };

        var gameRecord8 = {
            username: "flend",
            date: new Date("2013-05-28T05:56:00.123Z"),
            score: 253,
            seed: 253,
            level: 20,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: true,
            description: "Killed by a violent explosion on depth 20.",
            recording: "file8",
            variant: "BROGUE"
        };

        gameRecord.create([gameRecord1, gameRecord2, gameRecord3, gameRecord4, gameRecord5, gameRecord6, gameRecord7, gameRecord8]).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    afterEach(function (done) {

        //delete all the customer records
        gameRecord.deleteMany({}).then(function () {
            done();
        }).catch(function (err) {
            done(err);
        });
    });

    it("returns status 200", function (done) {
        request(server.app)
            .get("/api/stats/levels")
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200, done)
    });

    it("groups deaths by level", function (done) {
        request(server.app)
            .get("/api/stats/levels")
            .set('Accept', 'application/json')
            .end(function (err, res) {
                var bodyObj = JSON.parse(res.text);

                var level1Deaths = bodyObj[0];
                expect(level1Deaths).to.have.property('level', 1);
                expect(level1Deaths).to.have.property('frequency', 2);

                var level2Deaths = bodyObj[1];
                expect(level2Deaths).to.have.property('level', 2);
                expect(level2Deaths).to.have.property('frequency', 3);

                var level3Deaths = bodyObj[2];
                expect(level3Deaths).to.have.property('level', 3);
                expect(level3Deaths).to.have.property('frequency', 1);

                var level5Deaths = bodyObj[3];
                expect(level5Deaths).to.have.property('level', 5);
                expect(level5Deaths).to.have.property('frequency', 1);

                done();
            });
    });
});

describe("stats/levels with no game records", function() {

    it("returns an empty object", function (done) {
        request(server.app)
            .get("/api/stats/levels")
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200)
            .expect({}, done)
    });
});
