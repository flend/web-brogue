/* 
 module for collecting information to share about each user
 -- Schema --
 
 username : {
    sessionID : String,
    brogueProcess : Node Child Process
    lobby : Object // information to display in the lobby
 }
 */
var _ = require('underscore');

var bCrypt = require('bcrypt-nodejs');
var brogueState = require('../enum/brogue-state');
var brogueStatus = require('../enum/brogue-status-types');

var brogueStatusMap = {};
brogueStatusMap[brogueStatus.DEEPEST_LEVEL] = "deepestLevel";
brogueStatusMap[brogueStatus.GOLD] = "gold";
brogueStatusMap[brogueStatus.SEED] = "seed";
brogueStatusMap[brogueStatus.EASY_MODE] = "easyMode";

var userCount = 0;

module.exports = {
    users : {},
    addUser : function(userName){
        userCount++;
        var hiddenSalt = bCrypt.genSaltSync(8);
        this.users[userName] = {
            sessionID : userCount + bCrypt.hashSync(userName + hiddenSalt, bCrypt.genSaltSync(8)),
            brogueState : brogueState.INACTIVE,
            brogueProcess : null,
            lastUpdateTime : process.hrtime(),
            lobbyData : {
                idle : 0,
                deepestLevel : 0,
                seed : 0,
                gold : 0,
                easyMode : false,
            }
        };
    },
    removeUser : function(userName){
        this.users[userName] = null;
        userCount--;
    },
    getUser : function(userName){
        return this.users[userName];
    },
    updateUser : function(userName, data){
        var oldUserObject = this.getUser(userName);
        this.users[userName] = _.extend(oldUserObject, data);
    },
    
    updateLobbyStatus : function(userName, updateFlag, updateValue) {
        if (updateFlag === brogueStatus.SEED){
            // just need to report update once per push
            this.users[userName].lastUpdateTime = process.hrtime();
        }
        
        var lobbyItem = brogueStatusMap[updateFlag];
        this.users[userName].lobbyData[lobbyItem] = updateValue;
    }
};
