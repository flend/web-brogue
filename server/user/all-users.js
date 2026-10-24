var _ = require('underscore');

var config = require('../config');
var brogueState = require('../enum/brogue-state');
var brogueStatus = require('../enum/brogue-status-types');

var brogueStatusMap = {};
brogueStatusMap[brogueStatus.DEEPEST_LEVEL] = "deepestLevel";
brogueStatusMap[brogueStatus.GOLD] = "gold";
brogueStatusMap[brogueStatus.SEED] = "seed";
brogueStatusMap[brogueStatus.EASY_MODE] = "easyMode";

var IDLE_TICKER_INTERVAL_MS = 1 * 1000;
var IDLE_TIME_MAXIMUM_SECONDS = 24 * 60 * 60;

module.exports = {
    users : {},

    addUser : function(userName, variant) {

        var gameName = this.getGameName(userName, variant);

        this.users[gameName] = {
            brogueState : brogueState.INACTIVE,
            lastUpdateTime : process.hrtime(),
            lobbyData : {
                idle : 0,
                deepestLevel : 0,
                seed : false,
                gold : 0,
                easyMode : false,
                userName: userName,
                variant : variant
            }
        };

        return gameName;
    },

    getGameName: function(userName, variant) {
        return userName + '-' + variant;
    },

    removeUser : function (gameName) {
        if(this.isUserValid(gameName)) {
            delete this.users[gameName];
        }
    },
    getUser : function (gameName){
        if(this.isUserValid(gameName)) {
            return this.users[gameName];
        }
    },
    setState: function(gameName, state) {
        if(this.isUserValid(gameName)) {
            this.users[gameName].brogueState = state;
        }
    },
    tickIdleUsers: function() {

        var usersToRemoveDueToLongIdle = [];

        for (var gameName in this.users) {
            var timeDiff = process.hrtime(this.users[gameName].lastUpdateTime)[0];
            this.users[gameName].lobbyData.idle = timeDiff;

            if(timeDiff > IDLE_TIME_MAXIMUM_SECONDS) {
                usersToRemoveDueToLongIdle.push(gameName);
            }
        }

        for (var i = 0; i < usersToRemoveDueToLongIdle.length; i++) {
            this.removeUser(usersToRemoveDueToLongIdle[i]);
        }
    },

    isUserValid : function(gameName) {
        return gameName in this.users;
    },

    initialiseLobbyStatus : function(gameName, variant) {
        if(this.isUserValid(gameName)) {
            this.users[gameName].lobbyData['variant'] = variant;
        }
    },

    updateLobbyStatus : function(gameName, updateFlag, updateValue) {

        if(!this.isUserValid(gameName)) {
            return;
        }

        if (updateFlag === brogueStatus.SEED) {
            // just need to report update once per push (SEED picked arbitrarily as one thing we update on a status update)
            this.users[gameName].lastUpdateTime = process.hrtime();
        }
        
        var lobbyItem = brogueStatusMap[updateFlag];
        this.users[gameName].lobbyData[lobbyItem] = updateValue;
    },

    startIdleTicker: function () {
        setInterval(this.tickIdleUsers.bind(this), IDLE_TICKER_INTERVAL_MS).unref();
    }
};

module.exports.startIdleTicker();