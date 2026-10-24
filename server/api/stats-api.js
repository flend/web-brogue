var mongoose = require('mongoose');
var GameRecord = require("../database/game-record-model");

var brogueConstants = require('../brogue/brogue-constants.js');
var stats = require('../stats/stats.js');
var statsDatabase = require('../stats/stats-database.js')
var sanitize = require('mongo-sanitize');
var _ = require("underscore");

module.exports = function(app, config) {

    app.get("/api/stats/levels/monsters", function (req, res, next) {

        var maxCausesPerLevel = Number.MAX_SAFE_INTEGER;

        if(req.query.maxCauses) {
            maxCausesPerLevel = sanitize(req.query.maxCauses);
        }

        var variant = config.defaultBrogueVariant;
        if(req.query.variant) {
            variant = sanitize(req.query.variant);
        }

        res.format({
            json: function () {
                GameRecord.find({variant: variant}).lean().exec().then(function (games) {
                    var allNormalModeGames = _.filter(games, function(game) { return game.easyMode != true; });
                    var allDeathGamesWithCause = stats.deathGamesWithCauses(allNormalModeGames);
                    if(allDeathGamesWithCause.length == 0) {
                        res.json({});
                        return;
                    }
                    var deathGamesByLevel = _.groupBy(allDeathGamesWithCause, "level");
                    var deathNumbersByLevel = _.mapObject(deathGamesByLevel, function(levelGames, level) {

                        var deathsByCauseOnLevel = _.groupBy(levelGames, "cause");

                        var numberOfDeathsByCauseOnLevel = _.mapObject(deathsByCauseOnLevel, function(causeGames, thisCause) {
                            return causeGames.length;
                        });

                        var numberOfDeathsByCauseOnLevelAsArray = _.map(numberOfDeathsByCauseOnLevel, function(value, key) {
                            return { level: parseInt(level), cause : key, frequency : parseInt(value), percentage: parseInt(value) / levelGames.length * 100 };
                        });

                        var numberOfDeathsByCauseOnLevelAsArraySorted = _.sortBy(numberOfDeathsByCauseOnLevelAsArray, "frequency").reverse();
                        var numberOfDeathsByCauseOnLevelAsArraySortedWithRank = _.map(numberOfDeathsByCauseOnLevelAsArraySorted, function(data, index) {
                            return _.extend(data, { rank: index + 1});
                        });

                        return numberOfDeathsByCauseOnLevelAsArraySortedWithRank;
                    });
                    var deathNumbersCropped = _.mapObject(deathNumbersByLevel, function(levelStats) {
                        return levelStats.slice(0, maxCausesPerLevel);
                    });
                    var deathNumbersFlattened = _.flatten(_.map(deathNumbersCropped, function(val) { return val; }));
                    res.json(deathNumbersFlattened);
                }).catch(function (err) {
                    next(err);
                });
            }
        });
    });

    app.get("/api/stats/levels", function (req, res, next) {

        var variant = config.defaultBrogueVariant;
        if(req.query.variant) {
            variant = sanitize(req.query.variant);
        }

        res.format({
            json: function () {
                GameRecord.find({variant: variant}).lean().exec().then(function (games) {
                    var allNormalModeGames = _.filter(games, function(game) { return game.easyMode != true; });
                    var allDeathGamesWithCause = stats.deathGamesWithCauses(allNormalModeGames);
                    if(allDeathGamesWithCause.length == 0) {
                        res.json({});
                        return;
                    }
                    var deathGamesByLevel = _.groupBy(allDeathGamesWithCause, "level");
                    var deathNumbersByLevel = _.mapObject(deathGamesByLevel, function(levelGames, level) {

                        var numberOfDeathsOnLevelAsArray = { level: parseInt(level), frequency : levelGames.length };

                        return numberOfDeathsOnLevelAsArray;
                    });
                    var deathNumbersFlattened = _.flatten(_.map(deathNumbersByLevel, function(val) { return val; }));
                    res.json(deathNumbersFlattened);
                }).catch(function (err) {
                    next(err);
                });
            }
        });
    });

    app.get("/api/stats/levelProbability", function (req, res, next) {

        var variant = config.defaultBrogueVariant;
        if(req.query.variant) {
            variant = sanitize(req.query.variant);
        }

        res.format({
            json: function () {
                GameRecord.find({variant: variant}).lean().exec().then(function (games) {
                    var allNormalModeGames = _.filter(games, function(game) { return game.easyMode != true; });
                    var allNormalModeGamesExcludingQuits = _.reject(allNormalModeGames, function(game) { return game.result == brogueConstants.notifyEvents.GAMEOVER_QUIT });
                    var allNormalModeGamesExcludingQuitsAndVictories = _.reject(allNormalModeGamesExcludingQuits,
                        function(game) { return game.result == brogueConstants.notifyEvents.GAMEOVER_VICTORY || game.result == brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY });
                    if(allNormalModeGamesExcludingQuitsAndVictories.length == 0) {
                        res.json({});
                        return;
                    }
                    var deathGamesByLevel = _.groupBy(allNormalModeGamesExcludingQuitsAndVictories, "level");
                    var deathNumbersByLevel = _.mapObject(deathGamesByLevel, function(levelGames, level) {

                        var numberOfDeathsOnLevelAsArray = { level: parseInt(level), frequency : levelGames.length };

                        return numberOfDeathsOnLevelAsArray;
                    });
                    var deathNumbersFlattened = _.flatten(_.map(deathNumbersByLevel, function(val) { return val; }));
                    var totalGames = allNormalModeGamesExcludingQuits.length;
                    var deathsSortedByLevel = _.sortBy(deathNumbersFlattened, 'level');
                    var levelsToConsider = _.pluck(deathsSortedByLevel, 'level');
                    var conditionalProbabilities = {};
                    _.each(levelsToConsider, function (l) {
                        var deathsOnThisLevel = deathNumbersByLevel[l.toString()];

                        var baseProbability = deathsOnThisLevel.frequency / totalGames;
                        var scaling = 1.0;

                        var levelsBelowThisOne = _.filter(levelsToConsider, function(nl) { return nl < l });

                        _.each(levelsBelowThisOne, function(lt) {
                            scaling = scaling * (1 -  conditionalProbabilities[lt]);
                        });


                        conditionalProbabilities[l] = baseProbability / scaling;
                    });
                    var probabilitiesForLevels = _.mapObject(conditionalProbabilities, function(prob, level) {
                        var probabilityForLevel = { level: parseInt(level), probability : prob };

                        return probabilityForLevel;
                    });
                    var probabilitiesFlattened = _.flatten(_.map(probabilitiesForLevels, function(val) { return val; }));
                    res.json(probabilitiesFlattened);
                }).catch(function (err) {
                    next(err);
                });
            }
        });
    });

    app.get("/api/stats/general", function (req, res, next) {

        res.format({
            json: function () {
                statsDatabase.calculateGeneralStats(res, sanitize(req.query.variant), sanitize(req.query.username));
            }
        });
    });
};