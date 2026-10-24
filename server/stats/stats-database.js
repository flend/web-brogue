var _ = require("underscore");
var GameRecord = require("../database/game-record-model");
var stats = require('../stats/stats.js');
var brogueConstants = require('../brogue/brogue-constants.js');

module.exports = {

    generateCalculateGeneralStatsQuery: function(variant, username) {
        if (username && variant) {
            return { variant: variant, username: username};
        }
        else if (username) {
            return { username: username };
        }
        else if (variant) {
            return { variant: variant };
        }
        else
            return { };
    },

    calculateGeneralStats: function(res, variant, username) {

        let calculateVictoryStreak = function(normalModeGamesByUser, streakCondition) {
            return _.map(normalModeGamesByUser, function (games, username) {
                var longestStreakLastVictory;
                var streakCounter = 0;
                var longestStreakCounter = 0;

                var usersGames = _.sortBy(games, 'date');
                _.each(usersGames, function(v, index) {
                    if(streakCondition(v.result)) {
                        streakCounter++;
                        if(streakCounter >= longestStreakCounter) {
                            longestStreakCounter = streakCounter;
                            longestStreakLastVictory = v;
                        }
                    }
                    else {
                        streakCounter = 0;
                    }
                });

                return { username: username, longestStreak: longestStreakCounter, lastVictory: longestStreakLastVictory }
            });
        };

        const query = this.generateCalculateGeneralStatsQuery(variant, username);

        GameRecord.find(query).lean().exec().then(function (games) {
            var allEasyModeGames = _.where(games, {easyMode: true});
            var allNormalModeGames = _.filter(games, function(game) { return game.easyMode != true; });
            var allEasyModeVictories = _.where(allEasyModeGames, {result: brogueConstants.notifyEvents.GAMEOVER_VICTORY});
            var allEasyModeQuits = _.where(allEasyModeGames, {result: brogueConstants.notifyEvents.GAMEOVER_QUIT});
            var allEasyModeDeaths = _.where(allEasyModeGames, {result: brogueConstants.notifyEvents.GAMEOVER_DEATH});
            var allEasyModeSuperVictories = _.where(allEasyModeGames, {result: brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY});
            var allNormalModeVictories = _.where(allNormalModeGames, {result: brogueConstants.notifyEvents.GAMEOVER_VICTORY});
            var allNormalModeQuits = _.where(allNormalModeGames, {result: brogueConstants.notifyEvents.GAMEOVER_QUIT});
            var allNormalModeDeaths = _.where(allNormalModeGames, {result: brogueConstants.notifyEvents.GAMEOVER_DEATH});
            var allNormalModeSuperVictories = _.where(allNormalModeGames, {result: brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY});
            var totalLumenstonesPerGame = _.map(allNormalModeGames, function (game) {

                var lumenRe = new RegExp("with\\s+(\\d+)\\s+lumenstones");
                var descriptionMatch = lumenRe.exec(game.description);
                if (descriptionMatch) {
                    return parseInt(descriptionMatch[1]) || 0;
                }
                else {
                    var lumenSingle = new RegExp("with a lumenstone");
                    const singleLumenstone = lumenSingle.test(game.description);
                    return singleLumenstone ? 1 : 0;
                }

                return game;
            });
            var totalLumenstones = _.reduce(totalLumenstonesPerGame, function(memo, num){ return memo + num; }, 0);
            var totalLevelsPerGame = _.map(games, function (game) { return parseInt(game.level) || 0 });
            var totalLevels = _.reduce(totalLevelsPerGame, function(memo, num){ return memo + num; }, 0);
            var allVictories = allNormalModeVictories.concat(allNormalModeSuperVictories);
            var allVictoriesSortedByDate = _.sortBy(allVictories, 'date');
            var lastVictory = _.last(allVictoriesSortedByDate);
            var lastVictoryData;
            if(!lastVictory) {
                lastVictoryData = { date: "Never", username: "No-one" };
            }
            else {
                lastVictoryData = { date: lastVictory.date, username: lastVictory.username };
            }
            var normalModeGamesByUser = _.groupBy(allNormalModeGames, 'username');
            var victoryStreaksByUser = calculateVictoryStreak(normalModeGamesByUser, f => f === brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY || f === brogueConstants.notifyEvents.GAMEOVER_VICTORY);
            var masteryStreaksByUser = calculateVictoryStreak(normalModeGamesByUser, f => f === brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY);
            var lastStreakData, masteryStreakData;
            var streakData = _.filter(victoryStreaksByUser, function(v) { return v.longestStreak > 0 });
            if(streakData.length > 0) {
                var longestStreaks = _.sortBy( _.sortBy(streakData, function (v) { return v.lastVictory.date; } ), 'longestStreak');
                var longestStreak = _.last(longestStreaks);

                lastStreakData = { date: longestStreak.lastVictory.date, username: longestStreak.lastVictory.username, length: longestStreak.longestStreak };
            }
            else {
                lastStreakData = { date: "Never", username: "No-one", length: 0 };
            }
            var masteryStreakData = _.filter(masteryStreaksByUser, function(v) { return v.longestStreak > 0 });
            if(masteryStreakData.length > 0) {
                var longestStreaks = _.sortBy( _.sortBy(masteryStreakData, function (v) { return v.lastVictory.date; } ), 'longestStreak');
                var longestStreak = _.last(longestStreaks);

                lastMasteryStreakData = { date: longestStreak.lastVictory.date, username: longestStreak.lastVictory.username, length: longestStreak.longestStreak };
            }
            else {
                lastMasteryStreakData = { date: "Never", username: "No-one", length: 0 };
            }
            var statsSummary = {};
            statsSummary.totalGames = games.length;
            statsSummary.totalEasyModeGames = allEasyModeGames.length;
            statsSummary.totalNormalModeGames = allNormalModeGames.length;
            statsSummary.totalEasyModeVictories = allEasyModeVictories.length;
            statsSummary.totalEasyModeQuits = allEasyModeQuits.length;
            statsSummary.totalEasyModeDeaths = allEasyModeDeaths.length;
            statsSummary.totalEasyModeSuperVictories = allEasyModeSuperVictories.length;
            statsSummary.totalNormalModeVictories = allNormalModeVictories.length;
            statsSummary.totalNormalModeQuits = allNormalModeQuits.length;
            statsSummary.totalNormalModeDeaths = allNormalModeDeaths.length;
            statsSummary.totalNormalModeSuperVictories = allNormalModeSuperVictories.length;
            statsSummary.totalLumenstones = totalLumenstones;
            statsSummary.totalLevels = totalLevels;
            statsSummary.lastVictory = lastVictoryData;
            statsSummary.lastStreak = lastStreakData;
            statsSummary.lastMasteryStreak = lastMasteryStreakData;
            res.json(statsSummary);
        }).catch(function (err) {
            res.status(500).json({ error: "Database query failed" });
        });
    }
};
