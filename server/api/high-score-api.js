var mongoose = require('mongoose');
var GameRecord = require("../database/game-record-model");
var paginate = require("express-paginate");
var sanitize = require('mongo-sanitize');
var _ = require("underscore");
var stats = require('../stats/stats.js');
var Integer = require('integer');
const brogueConstants = require('../brogue/brogue-constants');

module.exports = function(app, config) {

    var sortFromQueryParams = function(req, defaultSort) {
        
        if (req.query.sort) {
            if (req.query.order && req.query.order === "desc") {
                return { [sanitize(req.query.sort)] : -1 }
            }
            else {
                return { [sanitize(req.query.sort)] : 1 };
            }
        }
        else {
            return defaultSort;
        }
    };

    var filterGameRecords = function(gameRecords) {

        var filteredGameRecords = [];

        _.each(gameRecords, function(gameRecord) {

            var filteredRecord =
                _.pick(gameRecord,
                    '_id', 'username', 'score', 'level', 'result', 'easyMode', 'description', 'date', 'variant');

            if('recording' in gameRecord && gameRecord.recording != undefined) {
                filteredRecord.recording = 'recording-' + gameRecord._id;
                filteredRecord.link = 'viewRecording/' + gameRecord.variant + "-" + gameRecord._id;
            }

            if('recording' in gameRecord && stats.doesVariantSupportRecordingDownloads(config, gameRecord.variant)) {
                filteredRecord.download = 'recordings/' + gameRecord._id;
            }

            // Compose 64-bit seeds
            if (gameRecord.seedHigh) {
                var seed64 = Integer.fromNumber(gameRecord.seedHigh);
                seed64 = seed64.shiftLeft(32).add(gameRecord.seed);
                filteredRecord.seed = seed64.toString();
            }
            else {
                // No 64-bit seed for old game records, use 32-bit part
                if (gameRecord.seed) {
                    filteredRecord.seed = gameRecord.seed.toString();
                }
            }

            // Seeded may not be set for earlier records in the database
            if('seeded' in gameRecord && gameRecord.seeded != undefined) {
                filteredRecord.seeded = gameRecord.seeded;
            }
            else {
                filteredRecord.seeded = false;
            }

            filteredGameRecords.push(filteredRecord);
        });

        return filteredGameRecords;
    };

    app.use(paginate.middleware(10, 50));

    app.get("/api/games", function (req, res, next) {

        var generateHighScoreStatsQuery = function(variant, username, result) {
            
            var queryObj = {}

            if (username) {
                queryObj["username"] = username;
            }

            if (variant) {
                queryObj["variant"] = variant;
            }

            if (result) {
                queryObj["result"] = result;
            }

            return queryObj;
        }

        var query = generateHighScoreStatsQuery(sanitize(req.query.variant), sanitize(req.query.username), sanitize(req.query.result));

        if(req.query.previousdays) {
            var previousDays = new Date();
            var dateOffset = (24*60*60*1000) * sanitize(req.query.previousdays);
            previousDays.setTime(new Date().getTime() - dateOffset);

            var startTime = previousDays;

            _.extend(query, {date: {
                $gte: startTime,
            }});
        }

        GameRecord.paginate(query, {
            page: sanitize(req.query.page),
            limit: sanitize(req.query.limit),
            sort: sortFromQueryParams(req, { date: -1 })
        }, function (err, gameRecords) {

            if (err) return next(err);
            
            res.format({
                json: function () {

                    var gameRecordsFiltered = filterGameRecords(gameRecords.docs);

                    res.json({
                        object: 'list',
                        data: gameRecordsFiltered,
                        pageCount: gameRecords.totalPages,
                        itemCount: gameRecords.totalDocs
                    });
                }
            });
        });
    });

    app.get("/api/games/lastwins", function (req, res, next) {

        var filterVariants = null;
        if (req.query.variant) {
            const sanitizedQuery = sanitize(req.query.variant);
            const splitVariants = sanitizedQuery.split(',');
            filterVariants = splitVariants.map(item => item.trim());
        }
 
        var aggregateQuery = 
            [ 
              { 
              $match: { easyMode: { $ne: true },
                          variant: [],
                          result: { $in: [brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY, brogueConstants.notifyEvents.GAMEOVER_VICTORY] } } 
              },
              {
                $sort: { date: -1 }
              },
              {
              $group : { _id: '$variant',
                        recordId: { $first: "$_id" },
                        maxDate: { $first : "$date" } }
              },
              {
                $lookup: {
                  from: "gamerecords",
                  localField: "recordId",
                  foreignField: "_id",
                  as: "record"
                },
              },
              {
                $sort: { variant: 1 }
              }
            ];

        if (filterVariants) {
            aggregateQuery[0].$match.variant = { $in: filterVariants };
        }
        else {
            delete aggregateQuery[0].$match.variant;
        }
        
        res.format({
            json: function () {

                GameRecord.aggregate(aggregateQuery).exec(function (err, games) {

                    if (err) return next(err);

                    const gameRecordList = games.reduce((result, { record }) => result.concat(record), []);
                    var gameRecordsFiltered = filterGameRecords(gameRecordList);

                    res.json(gameRecordsFiltered);
                });
            }
        });
    });

    app.get("/api/dailygames", function (req, res, next) {

        var now = new Date();
        var startTime = now.setUTCHours(0,0,0,0);
        var endTime = now.setUTCHours(24,0,0,0);

        var query = {
            date: {
                $gte: startTime,
                $lt: endTime
            },
            easyMode: false,
            score: {
                $gt: 0
            }
        };

        if(req.query.variant) {
            query['variant'] = sanitize(req.query.variant);
        }

        GameRecord.paginate(
            query,
            {   page: sanitize(req.query.page),
                limit: sanitize(req.query.limit),
                sort: sortFromQueryParams(req, { score: -1 })
        }, function (err, gameRecords) {

            if (err) return next(err);

            var gameRecordsFiltered = filterGameRecords(gameRecords.docs);

            res.format({
                json: function () {
                    res.json({
                        object: 'list',
                        data: gameRecordsFiltered,
                        pageCount: gameRecords.totalPages,
                        itemCount: gameRecords.totalDocs
                    });
                }
            });
        });
    });

    app.get("/api/games/:username", function (req, res, next) {

        var query = {
            username: sanitize(req.params.username)
        };

        if(req.query.variant) {
            query['variant'] = sanitize(req.query.variant);
        }

        if(req.query.previousdays) {
            var previousDays = new Date();
            var dateOffset = (24*60*60*1000) * sanitize(req.query.previousdays);
            previousDays.setTime(new Date().getTime() - dateOffset);

            var startTime = previousDays;

            _.extend(query, {date: {
                $gte: startTime,
            }});
        }

        GameRecord.paginate(query, {
            page: sanitize(req.query.page),
            limit: sanitize(req.query.limit),
            sort: sortFromQueryParams(req, { date: -1 })
        }, function (err, gameRecords) {

            if (err) return next(err);

            var gameRecordsFiltered = filterGameRecords(gameRecords.docs);

            res.format({
                json: function () {
                    res.json({
                        object: 'list',
                        data: gameRecordsFiltered,
                        pageCount: gameRecords.totalPages,
                        itemCount: gameRecords.totalDocs
                    });
                }
            });
        });
    });

    app.get("/api/games/id/:id", function (req, res, next) {

        GameRecord.paginate({_id: sanitize(req.params.id)}, {
            page: sanitize(req.query.page),
            limit: sanitize(req.query.limit),
            sort: sortFromQueryParams(req, { date: -1 })
        }, function (err, gameRecords) {

            if (err) return next(err);

            res.format({
                json: function () {
                    res.json({
                        object: 'list',
                        data: filterGameRecords(gameRecords.docs),
                        pageCount: gameRecords.totalPages,
                        itemCount: gameRecords.totalDocs
                    });
                }
            });
        });
    });
};