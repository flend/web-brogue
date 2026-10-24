var config = require("../../server/config");

var GameRecord = require("../../server/database/game-record-model");
var _ = require("../../server/node_modules/underscore/underscore");

var mongoose = require("../../server/node_modules/mongoose");


var calculateLevelStats = function () {

    console.log("Calculating level stats");

    return GameRecord.find({}).lean().exec().then(function (games) {

        var monsterDeathGames = _.filter(games, function (game) {
            return game.description && game.description.search("Killed") != -1;
        });

        var noMonsterDeathGames = _.filter(games, function (game) {
            return game.description  && game.description.search("Starved") == -1 && game.description.search("poison") == -1 && game.description.search("Escaped") == -1 && game.description.search("Quit") == -1 && game.description.search("Burned") == -1 && game.description.search("Killed") == -1;
        });

        var burnedDeathGames = _.filter(games, function (game) {
            return game.description && game.description.search("Burned") != -1;
        });

        var poisonedDeathGames = _.filter(games, function (game) {
            return game.description && game.description.search("poison") != -1;
        });

        var starvedDeathGames = _.filter(games, function (game) {
            return game.description && game.description.search("Starved") != -1;
        });

        var lavaDeathGames = _.filter(games, function (game) {
            return game.description && game.description.search("by lava") != -1;
        });

        console.log("Records with killed: " + monsterDeathGames.length);

        var monsterDeathGamesWithCause = _.map(monsterDeathGames, function (game) {

           //var monsterRe = new RegExp("by\s+an?\s+(.*?)\s+on");
            var monsterRe = new RegExp("by\\s+[an]*\\s+(.*?)\\s+on");
           var descriptionMatch = monsterRe.exec(game.description);
            if (descriptionMatch) {
                console.log("match");

                if(!descriptionMatch[1]) {
                    console.log("undefined" + descriptionMatch);
                }
                game["cause"] = descriptionMatch[1];

            }
            else {
                console.log("no match: + " + descriptionMatch);
                game["cause"] = "unknown";
            }

            return game;
        });

        var burnedDeathGamesWithCause = _.map(burnedDeathGames, function(game) {
            game["cause"] = "burned to death";
            return game;
        });

        var poisonedDeathGamesWithCause = _.map(poisonedDeathGames, function(game) {
            game["cause"] = "poison";
            return game;
        });

        var starvedDeathGamesWithCause = _.map(starvedDeathGames, function(game) {
            game["cause"] = "starved";
            return game;
        });

        var lavaDeathGamesWithCause = _.map(lavaDeathGames, function(game) {
            game["cause"] = "lava";
            return game;
        });

        var allDeathGamesWithCause = monsterDeathGamesWithCause
            .concat(burnedDeathGamesWithCause)
            .concat(poisonedDeathGamesWithCause)
            .concat(starvedDeathGamesWithCause)
            .concat(lavaDeathGamesWithCause);

        var deathGamesByLevel = _.groupBy(allDeathGamesWithCause, "level");

        console.log(JSON.stringify(deathGamesByLevel, null, 2));

        var deathNumbersByLevel = _.mapObject(deathGamesByLevel, function(levelGames, level) {

            var deathsByCauseOnLevel = _.groupBy(levelGames, "cause");
            var numberOfDeathsByCauseOnLevel = _.mapObject(deathsByCauseOnLevel, function(causeGames, thisCause) {
              return causeGames.length;
            });

            var numberOfDeathsByCauseOnLevelAsArray = _.map(numberOfDeathsByCauseOnLevel, function(value, key){
                return { level: level, cause : key, frequency : value };
            });
            var numberOfDeathsByCauseOnLevelAsArraySorted = _.sortBy(numberOfDeathsByCauseOnLevelAsArray, "frequency").reverse();

            return numberOfDeathsByCauseOnLevelAsArraySorted;
        });

        var maxEntriesPerLevel = 1;

        var deathNumbersCropped = _.mapObject(deathNumbersByLevel, function(levelStats) {
            return levelStats.slice(0, maxEntriesPerLevel);
        });

        var deathNumbersFlattened = _.flatten(_.map(deathNumbersCropped, function(val) { return val; }));

        console.log(JSON.stringify(deathNumbersFlattened, null, 2));


        //console.log("Killed Games");
       // console.log(JSON.stringify(monsterDeathGamesWithCause, null, 2));
/*
        console.log("Burned Games");
        console.log(JSON.stringify(burnedDeathGamesWithCause, null, 2));
*/

    //    console.log("No monster Games");
     //   console.log(JSON.stringify(noMonsterDeathGames, null, 2));

    });
};

mongoose.connect(config.db.url, { serverSelectionTimeoutMS: 10000 })
    .then(calculateLevelStats)
    .catch(function(err) {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(function() { return mongoose.disconnect(); });
