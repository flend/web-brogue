var request = require('supertest');
var mongoose = require("mongoose");
var gameRecord = require("../database/game-record-model");
var brogueConstants = require("../brogue/brogue-constants.js");
var expect = require("chai").expect;
var assert = require("chai").assert;
var server = require("./server-test");
var config = require("./config-test");



describe("api/recordings", function(){

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
            recording: "test/testfile.broguerec",
            variant: "BROGUE"
        };

        var gameRecord2 = {
            username: "flend",
            date: new Date("2012-05-27T07:56:00.123Z"),
            score: 100,
            seed: 200,
            level: 4,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a pink jelly on depth 3.",
            recording: "test/testfile.broguerec",
            variant: "GBROGUE"
        };

        var gameRecord3 = {
            username: "flend",
            date: new Date("2013-05-27T07:56:00.123Z"),
            score: 100,
            seed: 200,
            level: 5,
            result: brogueConstants.notifyEvents.GAMEOVER_DEATH,
            easyMode: false,
            description: "Killed by a goblin on depth 5.",
            recording: "test/testfile2.broguerec",
            variant: "BROGUE"
        };

        var self = this;

        gameRecord.create([gameRecord1, gameRecord2, gameRecord3]).then(function (doc) {
            self.currentTest.gameId1 = doc[0]._id;
            self.currentTest.gameId2 = doc[1]._id;
            self.currentTest.gameId3 = doc[2]._id;
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

    it("returns status 404 for non-existent recordings", function(done) {
        request(server.app)
            .get("/api/recordings/doesnotexist")
            .expect(404, done)
    });

    it("downloads a file with the right headers for existing recordings", function(done) {

        var self = this;

        request(server.app)
            .get("/api/recordings/" + this.test.gameId1)
            .end(function(err, res) {
                expect(res.status).to.equal(200);
                expect(res.header['content-disposition']).to.equal('attachment; filename=webbrogue-recording-' + self.test.gameId1 + '.broguerec');
                done();
            });
    });

    it("returns for 404 for valid recordings of old versions", function(done) {

        request(server.app)
            .get("/api/recordings/" + this.test.gameId2)
            .expect(404, done);
    });

    it("returns for 404 for missing recording files", function(done) {

        request(server.app)
            .get("/api/recordings/" + this.test.gameId3)
            .expect(404, done);
    });

});