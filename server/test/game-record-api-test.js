var request = require('supertest');
var mongoose = require("mongoose");
var gameRecord = require("../database/game-record-model");
var brogueConstants = require("../brogue/brogue-constants.js");
var expect = require("chai").expect;
var assert = require("chai").assert;
var server = require("./server-test");
var config = require("./config-test");

var db = mongoose.createConnection(config.db.url);

describe("api/games", function(){

    beforeEach(function(done) {

        var gameRecord1 = {
            username: "flend",
            date: new Date("2012-05-26T07:56:00.123Z"),
            score: 100,
            seed: 200,
            level: 3,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly on depth 3.",
            recording: "file1",
            variant: "BROGUE",
            seeded: true
        };

        var gameRecord2 = {
            username: "ccc",
            date: new Date("2011-05-26T07:56:00.123Z"),
            score: 1003,
            seed: 2002,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file2",
            variant: "GBROGUE"
        };

        gameRecord.create([gameRecord1, gameRecord2], function() {
            done();
        });
    });

    afterEach(function(done) {

        gameRecord.remove({}, function() {
            done();
        });
    });

    it("returns status 200", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200, done)
    });

    it("returns ids with games", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                expect(gameData[0]).to.have.property('_id');
                done();
            });
    });

    it("returns recording IDs (not filenames) with games", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                expect(gameData[0]).to.have.property('recording', 'recording-' + gameData[0]._id);
                done();
            });
    });

    it("returns download IDs with games where they can be downloaded", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                expect(gameData[0]).to.have.property('download', 'recordings/' + gameData[0]._id);
                expect(gameData[1]).to.not.have.property('download');
                done();
            });
    });

    it("returns link IDs with games where they can be loaded from a link", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                expect(gameData[0]).to.have.property('link', 'viewRecording/' + "BROGUE-" + gameData[0]._id);
                expect(gameData[1]).to.have.property('link', 'viewRecording/' + "GBROGUE-" + gameData[1]._id);
                done();
            });
    });

    it("returns multiple games", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                assert.lengthOf(gameData, 2);
                expect(gameData[0]).to.have.property('username', 'flend');
                expect(gameData[1]).to.have.property('username', 'ccc');
                done();
            });
    });

    it("return all expected static metadata about a game", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                var gameId = gameData[0]._id;

                request(server)
                    .get("/api/games/id/" + gameId)
                    .set('Accept', 'application/json')
                    .end(function(err, res) {

                        var resText = JSON.parse(res.text);
                        var gameData = resText.data;
                        expect(gameData[0]).to.have.property('date', "2012-05-26T07:56:00.123Z");
                        expect(gameData[0]).to.have.property('username', 'flend');
                        expect(gameData[0]).to.have.property('score', 100);
                        expect(gameData[0]).to.have.property('seed', '200');
                        expect(gameData[0]).to.have.property('level', 3);
                        expect(gameData[0]).to.have.property('result', brogueConstants.notifyEvents.GAMEOVER_DEATH);
                        expect(gameData[0]).to.have.property('easyMode', false);
                        expect(gameData[0]).to.have.property('description', "Killed by a pink jelly on depth 3.");
                        expect(gameData[0]).to.have.property('variant', "BROGUE");
                        expect(gameData[0]).to.have.property('seeded', true);
                        done();
                    });
            });
    });

    it("returns false for missing seeded value in database", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                var gameId = gameData[1]._id;

                request(server)
                    .get("/api/games/id/" + gameId)
                    .set('Accept', 'application/json')
                    .end(function(err, res) {

                        var resText = JSON.parse(res.text);
                        var gameData = resText.data;
                        expect(gameData[0]).to.have.property('seeded', false);
                        done();
                    });
            });
    });

    it("allows games to be retrieved by ID", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                var gameId = gameData[0]._id;

                request(server)
                    .get("/api/games/id/" + gameId)
                    .set('Accept', 'application/json')
                    .end(function(err, res) {

                        var resText = JSON.parse(res.text);
                        var gameData = resText.data;
                        expect(gameData[0]).to.have.property('date', "2012-05-26T07:56:00.123Z");
                        done();
                    });
            });
    });
});

describe("api/games/lastwins", function(){

    beforeEach(function(done) {

        var gameRecord1 = {
            username: "aaa",
            date: new Date("2013-05-29T07:56:00.123Z"),
            score: 100,
            seed: 201,
            level: 3,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly on depth 3.",
            recording: "file1",
            variant: "BROGUE",
            seeded: true
        };

        var gameRecord2 = {
            username: "bbb",
            date: new Date("2011-05-26T09:56:00.123Z"),
            score: 1003,
            seed: 202,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file2",
            variant: "GBROGUE"
        };

        var gameRecord3 = {
            username: "ddd",
            date: new Date("2011-05-26T08:56:00.123Z"),
            score: 1003,
            seed: 203,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file2",
            variant: "GBROGUE"
        };

        var gameRecord4 = {
            username: "eee",
            date: new Date("2013-05-27T08:56:00.123Z"),
            score: 1003,
            seed: 204,
            level: 20,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file2",
            variant: "BROGUE"
        };

        var gameRecord5 = {
            username: "fff",
            date: new Date("2012-05-27T08:56:00.123Z"),
            score: 1003,
            seed: 205,
            level: 20,
            result: brogueConstants.notifyEvents.GAMEOVER_QUIT,
            easyMode: false,
            description: "Quit.",
            recording: "file2",
            variant: "BROGUEPLUS"
        };

        var gameRecord6 = {
            username: "ggg",
            date: new Date("2013-05-28T08:56:00.123Z"),
            score: 1003,
            seed: 206,
            level: 20,
            result: brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY,
            easyMode: false,
            description: "Win.",
            recording: "file2",
            variant: "BROGUE"
        };

        var gameRecord7 = {
            username: "hhh",
            date: new Date("2011-05-26T10:56:00.123Z"),
            score: 1003,
            seed: 207,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_QUIT,
            easyMode: false,
            description: "Escaped.",
            recording: "file2",
            variant: "GBROGUE"
        };

        var gameRecord8 = {
            username: "hhh",
            date: new Date("2011-05-26T11:56:00.123Z"),
            score: 1003,
            seed: 207,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: true,
            description: "Escaped.",
            recording: "file2",
            variant: "GBROGUE"
        };

        var gameRecord9 = {
            username: "hhh",
            date: new Date("2014-05-26T11:56:00.123Z"),
            score: 1003,
            seed: 208,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file2",
            variant: "RAPIDBROGUE"
        };

        gameRecord.create([gameRecord1, gameRecord2, gameRecord3, gameRecord4, gameRecord5, gameRecord6, gameRecord7, gameRecord8, gameRecord9], function() {
            done();
        });
    });

    afterEach(function(done) {

        gameRecord.remove({}, function() {
            done();
        });
    });

    it("returns status 200", function(done) {
        request(server)
            .get("/api/games/lastwins")
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200, done)
    });

    it("returns most recent wins for each variant, sorted by variant", function(done) {
        request(server)
            .get("/api/games/lastwins")
            .set('Accept', 'application/json')
            .end(function(err, res) {
                var gameData = JSON.parse(res.text);

                assert.lengthOf(gameData, 3);
                //Most recent BROGUE is a SUPERVICTORY (but DEATH not included)
                const brogueRecord = gameData.find(record => record.variant === 'BROGUE');
                expect(brogueRecord).to.have.property('seed', '206');
                //Most recent GBROGUE is a VICTORY (but QUIT and EASYMODE not included)
                const gbrogueRecord = gameData.find(record => record.variant === 'GBROGUE');
                expect(gbrogueRecord).to.have.property('seed', '202');
                //Most recent RAPIDBROGUE is a VICTORY
                const rapidbrogueRecord = gameData.find(record => record.variant === 'RAPIDBROGUE');
                expect(rapidbrogueRecord).to.have.property('seed', '208');
                done();
        });
    });

    it("returns most recent wins for each variant, filtered and sorted by variant", function(done) {
        request(server)
            .get("/api/games/lastwins")
            .set('Accept', 'application/json')
            .query({ variant: "GBROGUE,RAPIDBROGUE" })
            .end(function(err, res) {
                var gameData = JSON.parse(res.text);

                assert.lengthOf(gameData, 2);
                const gbrogueRecord = gameData.find(record => record.variant === 'GBROGUE');
                expect(gbrogueRecord).to.have.property('seed', '202');
                const rapidbrogueRecord = gameData.find(record => record.variant === 'RAPIDBROGUE');
                expect(rapidbrogueRecord).to.have.property('seed', '208');
                done();
        });
    });
});

describe("api/games filtering by variant", function(){

    beforeEach(function(done) {

        var gameRecord1 = {
            username: "flend",
            date: new Date("2012-05-26T07:56:00.123Z"),
            score: 100,
            seed: 200,
            level: 3,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly on depth 3.",
            recording: "file1",
            variant: "GBROGUE",
            seeded: true
        };

        var gameRecord2 = {
            username: "ccc",
            date: new Date("2011-05-26T07:56:00.123Z"),
            score: 1003,
            seed: 2002,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file2",
            variant: "BROGUE",
            seeded: false
        };

        gameRecord.create([gameRecord1, gameRecord2], function() {
            done();
        });
    });

    afterEach(function(done) {

        gameRecord.remove({}, function() {
            done();
        });
    });

    it("filters games based on non-default variant", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .query({ variant: 'GBROGUE' })
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                expect(gameData).to.have.length.of(1);
                expect(gameData[0]).to.have.deep.property('variant', "GBROGUE");
                done();
            });
    });
});

describe("api/games supporting 64-bit seeds", function(){

    beforeEach(function(done) {

        var gameRecord1 = {
            username: "flend",
            date: new Date("2012-05-26T07:56:00.123Z"),
            score: 100,
            seed: 100,
            seedHigh: 200,
            level: 3,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly on depth 3.",
            recording: "file1",
            variant: "GBROGUE",
            seeded: true
        };

        var gameRecord2 = {
            username: "flend",
            date: new Date("2012-05-26T07:56:00.124Z"),
            score: 100,
            seed: 0xFFFFFFFF,
            seedHigh: 0x7FFFFFFF,
            level: 4,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly on depth 3.",
            recording: "file2",
            variant: "GBROGUE",
            seeded: true
        };

        gameRecord.create([gameRecord1, gameRecord2], function() {
            done();
        });
    });

    afterEach(function(done) {

        gameRecord.remove({}, function() {
            done();
        });
    });

    it("correctly composes 64-bit seeds", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .query({ variant: 'GBROGUE' })
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                expect(gameData).to.have.length.of(2);
                expect(gameData[1]).to.have.deep.property('seed', '858993459300');
                done();
            });
    });

    it("supports 64-bit seeds up to 9223372036854775807", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .query({ variant: 'GBROGUE' })
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                expect(gameData).to.have.length.of(2);
                expect(gameData[0]).to.have.deep.property('seed', '9223372036854775807');
                done();
            });
    });
});

describe("api/games sorting", function(){

    beforeEach(function(done) {

        var gameRecord1 = {
            username: "flend",
            date: new Date("2012-05-26T07:56:00.123Z"),
            score: 1004,
            seed: 200,
            level: 3,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly on depth 3.",
            recording: "file1",
            variant: "GBROGUE",
            seeded: true
        };

        var gameRecord2 = {
            username: "ccc",
            date: new Date("2011-05-26T07:56:00.123Z"),
            score: 1003,
            seed: 2002,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file2",
            variant: "BROGUE",
            seeded: false
        };

        var gameRecord3 = {
            username: "dave",
            date: new Date("2013-07-26T07:56:00.123Z"),
            score: 12,
            seed: 2004,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file2",
            variant: "BROGUE",
            seeded: true
        };

        gameRecord.create([gameRecord1, gameRecord2, gameRecord3], function() {
            done();
        });
    });

    afterEach(function(done) {

        gameRecord.remove({}, function() {
            done();
        });
    });

    it("sorts games by date ascending when no order given", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .query({ sort: 'date' })
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                expect(gameData).to.have.length.of(3);
                expect(gameData[0]).to.have.deep.property('score', 1003);
                expect(gameData[1]).to.have.deep.property('score', 1004);
                expect(gameData[2]).to.have.deep.property('score', 12);

                done();
            });
    });

    it("sorts games by date descending when desc order given", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .query({ sort: 'date', order: 'desc' })
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                expect(gameData).to.have.length.of(3);
                expect(gameData[0]).to.have.deep.property('score', 12);
                expect(gameData[1]).to.have.deep.property('score', 1004);
                expect(gameData[2]).to.have.deep.property('score', 1003);

                done();
            });
    });

    it("sorts games by score descending when desc order given", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .query({ sort: 'score', order: 'desc' })
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                expect(gameData).to.have.length.of(3);
                expect(gameData[0]).to.have.deep.property('score', 1004);
                expect(gameData[1]).to.have.deep.property('score', 1003);
                expect(gameData[2]).to.have.deep.property('score', 12);

                done();
            });
    });
});

describe("api/games paging", function(){

    beforeEach(function(done) {

        var gameRecord1 = {
            username: "flend",
            date: new Date("2012-05-26T07:56:00.123Z"),
            score: 1004,
            seed: 200,
            level: 3,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly on depth 3.",
            recording: "file1",
            variant: "GBROGUE",
            seeded: true
        };

        var gameRecord2 = {
            username: "ccc",
            date: new Date("2013-05-26T07:56:00.123Z"),
            score: 1003,
            seed: 2002,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file2",
            variant: "BROGUE",
            seeded: false
        };

        var gameRecord3 = {
            username: "dave",
            date: new Date("2014-07-26T07:56:00.123Z"),
            score: 12,
            seed: 2004,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file3",
            variant: "BROGUE",
            seeded: true
        };

        var gameRecord4 = {
            username: "dave",
            date: new Date("2015-07-26T07:56:00.123Z"),
            score: 13,
            seed: 2007,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file4",
            variant: "GBROGUE",
            seeded: false
        };

        var gameRecord5 = {
            username: "dave",
            date: new Date("2016-07-26T07:56:00.123Z"),
            score: 17,
            seed: 3007,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file4",
            variant: "GBROGUE",
            seeded: true
        };

        gameRecord.create([gameRecord1, gameRecord2, gameRecord3, gameRecord4, gameRecord5], function() {
            done();
        });
    });

    afterEach(function(done) {

        gameRecord.remove({}, function() {
            done();
        });
    });

    it("returns correct pageCount and itemCount", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .query({ sort: 'date', page: 2, limit: 2 })
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var pageCount = resText.pageCount
                var itemCount = resText.itemCount
                expect(pageCount).to.equal(3);
                expect(itemCount).to.equal(5);

                done();
            });
        });

    it("returns correct games in pages", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .query({ sort: 'date', page: 2, limit: 2 })
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                expect(gameData).to.have.length.of(2);
                expect(gameData[0]).to.have.deep.property('score', 12);
                expect(gameData[1]).to.have.deep.property('score', 13);
                done();
            });
    });
});

describe("api/games filtering by variant and username", function(){

    beforeEach(function(done) {

        var gameRecord1 = {
            username: "flend",
            date: new Date("2012-05-26T07:56:00.123Z"),
            score: 100,
            seed: 200,
            level: 3,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly on depth 3.",
            recording: "file1",
            variant: "GBROGUE",
            seeded: true
        };

        var gameRecord2 = {
            username: "ccc",
            date: new Date("2011-05-27T07:56:00.123Z"),
            score: 1003,
            seed: 2002,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file2",
            variant: "BROGUE",
            seeded: false
        };

        var gameRecord3 = {
            username: "flend",
            date: new Date("2011-05-28T07:56:00.123Z"),
            score: 1004,
            seed: 2004,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_QUIT,
            easyMode: false,
            description: "Escaped.",
            recording: "file3",
            variant: "BROGUE",
            seeded: false
        };

        gameRecord.create([gameRecord1, gameRecord2, gameRecord3], function() {
            done();
        });
    });

    afterEach(function(done) {

        gameRecord.remove({}, function() {
            done();
        });
    });

    it("filters games based on username only", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .query({ username: 'flend' })
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                expect(gameData).to.have.length.of(2);
                expect(gameData[0]).to.have.deep.property('seed', '200');
                expect(gameData[1]).to.have.deep.property('seed', '2004');
                done();
            });
    });

    it("filters games based on username and variant", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .query({ username: 'flend', variant: 'BROGUE' })
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                expect(gameData).to.have.length.of(1);
                expect(gameData[0]).to.have.deep.property('seed', '2004');
                done();
            });
    });
});

describe("api/games filtering by previousdays", function(){

    beforeEach(function(done) {

        var now = new Date();
        var dateOffsetMSecs = (24*60*60*1000);
        var testTimeOffset = 60*60*1000;

        var oneDayAgo = new Date();
        oneDayAgo.setTime(now - dateOffsetMSecs * 1 + testTimeOffset);
        var gameRecord1 = {
            username: "flend",
            date: oneDayAgo,
            score: 1,
            seed: 200,
            level: 3,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly on depth 3.",
            recording: "file1",
            variant: "GBROGUE",
            seeded: true
        };

        var twoDaysAgo = new Date();
        twoDaysAgo.setTime(now - dateOffsetMSecs * 2 + testTimeOffset);
        var gameRecord2 = {
            username: "ccc",
            date: twoDaysAgo,
            score: 2,
            seed: 2002,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file2",
            variant: "BROGUE",
            seeded: false
        };

        var threeDaysAgo = new Date();
        threeDaysAgo.setTime(now - dateOffsetMSecs * 3 + testTimeOffset);
        var gameRecord3 = {
            username: "ddd",
            date: threeDaysAgo,
            score: 3,
            seed: 2002,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file3",
            variant: "BROGUE",
            seeded: false
        };

        gameRecord.create([gameRecord1, gameRecord2, gameRecord3], function() {
            done();
        });
    });

    afterEach(function(done) {

        gameRecord.remove({}, function() {
            done();
        });
    });

    it("returns correct number of games by previousdays setting", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .query({ previousdays: 2 })
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                expect(gameData).to.have.length.of(2);
                expect(gameData[0]).to.have.deep.property('score', 1);
                expect(gameData[1]).to.have.deep.property('score', 2);
                done();
            });
    });
});

describe("api/games filtering by result", function(){

    beforeEach(function(done) {

        var gameRecord1 = {
            username: "flend",
            date: new Date("2012-05-26T07:56:00.123Z"),
            score: 100,
            seed: 1,
            level: 3,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly on depth 3.",
            recording: "file1",
            variant: "GBROGUE"
        };

        var gameRecord2 = {
            username: "ccc",
            date: new Date("2011-05-27T07:56:00.123Z"),
            score: 1003,
            seed: 2,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file2",
            variant: "BROGUE"
        };

        var gameRecord3 = {
            username: "flend",
            date: new Date("2011-05-28T07:56:00.123Z"),
            score: 1004,
            seed: 3,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_QUIT,
            easyMode: false,
            description: "Escaped.",
            recording: "file3",
            variant: "BROGUE"
        };

        var gameRecord4 = {
            username: "flend",
            date: new Date("2011-06-28T07:56:00.123Z"),
            score: 1004,
            seed: 4,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file3",
            variant: "BROGUE"
        };

        var gameRecord5 = {
            username: "flend",
            date: new Date("2011-07-28T07:56:00.123Z"),
            score: 1004,
            seed: 5,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_VICTORY,
            easyMode: false,
            description: "Escaped.",
            recording: "file3",
            variant: "BROGUE"
        };

        gameRecord.create([gameRecord1, gameRecord2, gameRecord3, gameRecord4, gameRecord5], function() {
            done();
        });
    });

    afterEach(function(done) {

        gameRecord.remove({}, function() {
            done();
        });
    });

    it("filters games based on result", function(done) {
        request(server)
            .get("/api/games")
            .set('Accept', 'application/json')
            .query({ result: 2, sort: 'date', order: 'desc'})
            .end(function(err, res) {
                var resText = JSON.parse(res.text);
                var gameData = resText.data;
                expect(gameData).to.have.length.of(2);
                expect(gameData[0]).to.have.deep.property('seed', '5');
                expect(gameData[1]).to.have.deep.property('seed', '2');
                done();
            });
    });
});