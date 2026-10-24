var mongoose = require('mongoose');
var GameRecord = require("../database/game-record-model");
var _ = require("underscore");
var sanitize = require('mongo-sanitize');
const fs = require('fs');
var stats = require('../stats/stats.js');

module.exports = function(app, config) {

    app.get("/api/recordings/:id", function (req, res, next) {

        var recordingId = sanitize(req.params.id);

        if (!mongoose.isObjectIdOrHexString(recordingId)) {
            return res.status(404).send('Not found');
        }

        GameRecord.findById(recordingId).then(function (gameRecord) {
            if(!gameRecord || !gameRecord.recording) {
                res.status(404).send('Not found');
                return;
            }
            if(!stats.doesVariantSupportRecordingDownloads(config, gameRecord.variant)) {
                res.status(404).send('Not found');
                return;
            }
            var file = gameRecord.recording;
            var filename = "webbrogue-recording-" + recordingId + ".broguerec";
            var mimetype = "application/octet-stream";
            res.setHeader('Content-disposition', 'attachment; filename=' + filename);
            res.setHeader('Content-type', mimetype);
            var filestream = fs.createReadStream(file);
            filestream.on('open', function () {
                filestream.pipe(res);
            });
            filestream.on('error', function(err) {
                console.error("Can't find recording: " + file, err);
                res.status(404).send('Not found');
            });
        }).catch(function (err) {
            return next(err);
        });
    });
};
