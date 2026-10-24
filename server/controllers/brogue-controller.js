var path = require('path');
var fs = require('fs');
var _ = require('underscore');

var config = require('../config');

var Controller = require('./controller-base');
var brogueState = require('../enum/brogue-state');
var brogueMode = require('../enum/brogue-mode');
var currentGames = require('../user/all-users');
var brogueComms = require('../brogue/brogue-comms');
var gameRecord = require('../database/game-record-model');
var brogueConstants = require('../brogue/brogue-constants.js');
var brogueStatus = require('../enum/brogue-status-types');

var KEYPRESS_EVENT_CHAR = 0;

// Controller for handling I/O with brogue process and client.  Note that unlike other controllers this one deals in binary data. Any incoming or outgoing binary data from this server should only come from this controller.

//TODO: Cleanup brogueInterface on controller exit

function BrogueController(socket) {
    this.controllerName = "brogue";
    this.socket = socket;
    this.controllers = null;
    this.brogueInterface = null;
    this.brogueGameChatId = null;
    this.brogueCurrentGamesId = null;
    this.variant = null;
}

BrogueController.prototype = new Controller();
_.extend(BrogueController.prototype, {
    controllerName: "brogue",
    handleIncomingMessage: function (message) {
        if (this.handlerCollection[message.type]) {
            this.handlerCollection[message.type].call(this, message.data);
        }
        else {
            this.controllers.error.send("Message type incorrectly set: " + JSON.stringify(message));
        }
    },

    endBrogueSessionAndKillInterface: function() {

        if(this.brogueInterface) {
            this.brogueInterface.killBrogue(this.brogueInterface);
        }

        this.returnToLobby();
    },

    endBrogueSession: function() {
        this.sendMessage("quit", true);
        currentGames.removeUser(this.brogueCurrentGamesId);
        this.returnToLobby();
    },

    returnToLobby: function() {

        this.stopInteractingWithCurrentGame();

        this.setState(brogueState.INACTIVE);
        this.controllers.lobby.sendAllUserData();
        this.controllers.lobby.userDataListen();

        this.controllers.chat.leaveRoom(this.brogueGameChatId);
    },

    stopInteractingWithCurrentGame: function() {
        this.removeBrogueListeners();
    },

    removeBrogueListeners: function() {

        //Is called on cleanup when WS connection dies, but may have already dropped listeners
        if(this.brogueInterface) {
            //console.log("Removing data listener. Before " + this.brogueInterface.brogueEvents.listeners('data').length);

            this.brogueInterface.removeDataListener(this.dataListener);
            //console.log("Removing data listener. After " + this.brogueInterface.brogueEvents.listeners('data').length);

            this.brogueInterface.removeStatusListener(this.statusListener);
            this.brogueInterface.removeQuitListener(this.quitListener);
            this.brogueInterface.removeErrorListener(this.errorListener);
            this.brogueInterface.removeEventListener(this.eventListener);
        }
    },

    brogueQuitListener: function () {
        //console.log("Quit listener " + this.username);
        this.endBrogueSession();
    },

    brogueErrorListener: function () {
        //console.log("Error listener" + this.username);
        //TODO: Maybe some UI for the user? This normally occurs on an orphaned process connecting, which is expected behaviour
        this.endBrogueSession();
    },

    brogueEventListener: function (event) {
        //console.log("Event listener " + " data: " + JSON.stringify(event));

        //Add record to the database (only if owner of game)
        if(this.mode == brogueMode.GAME && (
            event.eventId === brogueConstants.notifyEvents.GAMEOVER_QUIT ||
            event.eventId === brogueConstants.notifyEvents.GAMEOVER_DEATH ||
            event.eventId === brogueConstants.notifyEvents.GAMEOVER_VICTORY ||
            event.eventId === brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY)) {

            var self = this;
            var thisGameRecord = {
                username: this.controllers.auth.authenticatedUserName,
                date: event.date,
                score: event.data1,
                seed: event.seed,
                seedHigh: event.seedHigh,
                level: event.level,
                result: event.eventId,
                easyMode: Boolean(event.easyMode),
                description: event.message,
                recording: event.recording,
                variant: this.variant,
                seeded: Boolean(event.seeded)
            };

            //Create save game record
            gameRecord.create(thisGameRecord).catch(function (err) {
                if(!(err.code && err.code == 11000)) {
                    self.controllers.error.send(JSON.stringify(err));
                    console.log(JSON.stringify(err));
                    //Ignore duplicate record fail (occurs when 2 windows logged into the same game)
                }
                console.log(JSON.stringify(err));
                return;
            });

        }
        else if(event.eventId === brogueConstants.notifyEvents.SWITCH_TO_GRAPHICS) {
            var data = { "graphics": event.data1 };
            this.sendMessage('meta', data);
        }
    },

    brogueStatusListener: function (status) {
        if(this.mode == brogueMode.GAME) {
            if(!currentGames.isUserValid(this.brogueCurrentGamesId)) {
                //This is a funny exception to deal with the case when the user has logged out from one window
                //but is still playing
                this.brogueCurrentGamesId = currentGames.addUser(this.controllers.auth.authenticatedUserName, this.variant);
            }

            //We may have a different state due to logging in again in a different window, but ACTIVE should take priority
            this.setState(brogueState.ACTIVE);

            currentGames.updateLobbyStatus(
                this.brogueCurrentGamesId,
                status.flag,
                status.value);
        }
    },

    brogueDataListener: function (data) {
        this.sendMessage('b', data);
    },


    createInitialiseCommandForStartAtTurn: function(turnNumber) {

        //Must be a number string
        if(!/^-{0,1}\d+$/.test(turnNumber)) {
            return [];
        };

        var cmds = [];

        for(var i = 0; i < turnNumber.length; i++) {
            var messageArray = Buffer.alloc(5);
            var thisChar = turnNumber.charCodeAt(i);
            var keyCodePart1 = (thisChar & '0xffff') >> 8;
            var keyCodePart2 = (thisChar & '0xff');

            messageArray[0] = KEYPRESS_EVENT_CHAR;
            messageArray[1] = keyCodePart1;
            messageArray[2] = keyCodePart2;
            cmds.push(messageArray);
        }

        //ENTER
        messageArray = Buffer.alloc(5);
        messageArray[0] = KEYPRESS_EVENT_CHAR;
        messageArray[1] = 0;
        messageArray[2] = 13;
        cmds.push(messageArray);

        return cmds;
    },

    watchRecording: function (data) {
        if (!data || !data.recording) {
            this.sendFailedToStartGameMessage("No game record given to watch.");
            console.error("No game record given to watch.");
            return;
        }

        //Lookup recording id in database
        var splitRecordingId = data.recording.split('-');
        if (splitRecordingId.length < 2) {
            this.sendFailedToStartGameMessage("Recording id in incorrect format " + data.recording);
            console.error("Recording id in incorrect format " + data.recording);
            return;
        }

        var id = splitRecordingId[1];

        var initialiseCommands = [];

        //Request to send characters to game once started
        if (splitRecordingId.length == 3) {
            initialiseCommands = initialiseCommands.concat(this.createInitialiseCommandForStartAtTurn(splitRecordingId[2]));
        }

        var self = this;

        gameRecord.findOne({'_id': id}).then(function (gameRecord) {
            if (gameRecord) {

                try {
                    data.recordingPath = gameRecord.recording;
                    data.variant = gameRecord.variant;
                    //Handle recordings before variants were introduced
                    if (!data.variant) {
                        data.variant = config.defaultBrogueVariant;
                    }
                    self.variant = data.variant; //Not strictly needed in this case

                    var username = self.controllers.auth.getUserOrAnonName();
                    self.brogueGameChatId = self.getCurrentGameChatId(username, data.variant, "RECORDING");

                    self.startBrogueSession(username, data.variant, data, brogueMode.RECORDING, initialiseCommands);

                    //Stop lobby updates for this user
                    self.controllers.lobby.stopUserDataListen();
                }
                catch (e) {
                    //Failed to start game to watch recording
                    self.sendFailedToStartGameMessage("Failed to start recording: " + e.message);
                    console.error("Failed to start game;");
                    console.error(e.stack || e);
                    self.endBrogueSession();
                }
            }
            else {
                self.sendFailedToStartGameMessage("Can't process recording id " + data.recording);
                console.error("Can't process recording id " + data.recording);
                return;
            }
        }).catch(function (err) {
            self.controllers.error.send(JSON.stringify(err));
            console.error("Error on retrieving game record " + JSON.stringify(err));
            return;
        });
    },

    getCurrentGameChatId: function(username, variant, modeString) {
        if(!modeString) {
            return username + "-" + variant;
        }
        else {
            return username + "-" + variant + "-" + modeString;
        }
    },

    isValidVariant: function(variant) {
        return _.contains(_.keys(config.brogueVariants), variant);
    },

    maxSeedForVariantFailureMessage: function(variant) {
        return "Please enter a numerical seed between 1 and " + this.maxSeedForVariant(variant).toString();
    },

    maxSeedForVariant: function(variant) {
        return config.brogueVariants[variant].maxSeed;
    },

    startGameOrObserve: function (data, observing) {

        var mode = brogueMode.OBSERVE;

        try {

            if(!data) {
                this.sendFailedToStartGameMessage("Data parameter is required");
                return;
            }

            //Check variant and abort on error
            if (!data.variant || !this.isValidVariant(data.variant)) {
                this.sendFailedToStartGameMessage("No valid variant selected");
                return;
            }

            if (!observing) {
                if (!this.controllers.auth.authenticatedUserName) {
                    this.sendFailedToStartGameMessage("Can't start a game if not logged in.");
                    return;
                }

                var username = this.controllers.auth.authenticatedUserName;
                this.brogueGameChatId = this.getCurrentGameChatId(username, data.variant);
                mode = brogueMode.GAME;

                //Check seed and abort on error
                if (data && data.seed) {
                    if (typeof data.seed !== 'string' || !/^\d+$/.test(data.seed)) {
                        throw new RangeError('Seed must be a positive decimal integer');
                    }
                    var seed = BigInt(data.seed);

                    if (seed < 1n || seed > this.maxSeedForVariant(data.variant)) {
                        this.sendMessage("seed", {
                            result: "fail",
                            data: this.maxSeedForVariantFailureMessage(data.variant)
                        });
                        return;
                    }
                }

                this.brogueCurrentGamesId = currentGames.addUser(username, data.variant);
                this.startBrogueSession(username, data.variant, data, mode);
                this.variant = data.variant;
                currentGames.initialiseLobbyStatus(this.brogueCurrentGamesId, data.variant);
            }
            else {
                //Observing

                if (!data || !data.username) {
                    this.sendFailedToStartGameMessage("No username given to observe.");
                    return;
                }

                //Work out if this is the user playing their own game or just observing
                var usernameForGame = this.controllers.auth.authenticatedUserName;

                if (data.username === this.controllers.auth.authenticatedUserName) {
                    this.brogueGameChatId = this.getCurrentGameChatId(usernameForGame, data.variant);
                    mode = brogueMode.GAME;
                    this.brogueCurrentGamesId = currentGames.getGameName(username, data.variant);
                }
                else {
                    usernameForGame = data.username;
                    this.brogueGameChatId = this.getCurrentGameChatId(usernameForGame, data.variant);
                    this.brogueCurrentGamesId = null;
                }

                this.startBrogueSession(usernameForGame, data.variant, data, mode);
                this.variant = data.variant;
            }

            //If we got here via the seed route, pass messages back to the UI
            if (data && data.seed) {
                this.sendMessage("seed", {
                    result: "success"
                });
            }

            //Enter this chat room
            this.controllers.chat.enterRoom(this.brogueGameChatId);

            //Send a global chat update
            if (mode == brogueMode.OBSERVE) {
                this.controllers.chat.broadcastObserve(this.brogueGameChatId);
            }
            else {
                this.controllers.chat.broadcastStartGame();
            }

            //Stop lobby updates for this user
            this.controllers.lobby.stopUserDataListen();

            if (mode != brogueMode.OBSERVE) {
                this.setState(brogueState.ACTIVE);
            }
        }
        catch (e) {
            if (e instanceof RangeError) {
                //RangeError occurs before game is setup
                console.log("catching range error: " + e)
                this.sendMessage("seed", {
                    result: "fail",
                    data: this.maxSeedForVariantFailureMessage(data.variant)
                });
            }
            else {
                //Failed to start game
                this.sendFailedToStartGameMessage("Failed to start game: " + e.message);
                console.error("Failed to start game;");
                console.error(e.stack || e);
                this.endBrogueSession();
            }
        }
    },

    startBrogueSession: function (username, variant, data, mode, initialisationCmds) {

        //Connect to brogue interface

        this.mode = mode;

        //Only spawn new games if the logged in user is requested a game (i.e. not observing)
        this.brogueInterface = brogueComms.getBrogueInterface(username, variant, data, mode);

        //console.log("Adding listeners. Count " + this.brogueInterface.brogueEvents.listeners('data').length);

        this.dataListener = this.brogueDataListener.bind(this);
        this.brogueInterface.addDataListener(this.dataListener);

        this.quitListener = this.brogueQuitListener.bind(this);
        this.brogueInterface.addQuitListener(this.quitListener);

        this.errorListener = this.brogueErrorListener.bind(this);
        this.brogueInterface.addErrorListener(this.errorListener);

        this.eventListener = this.brogueEventListener.bind(this);
        this.brogueInterface.addEventListener(this.eventListener);

        this.statusListener = this.brogueStatusListener.bind(this);
        this.brogueInterface.addStatusListener(this.statusListener);

        //console.log("Added listeners. Count " + this.brogueInterface.brogueEvents.listeners('data').length);

        //Refresh once the game has had a chance to start (if required)
        var refreshMethod = this.brogueInterface.sendRefreshScreenAndInitialiseCommands.bind(this.brogueInterface);
        setTimeout(refreshMethod, 250, initialisationCmds);
    },

    sendFailedToStartGameMessage: function(message) {
        this.sendMessage("fail", {
            result : "fail",
            data : message
        });
    },

    handlerCollection: {
        c: function(data) {
            //Send a control message to brogue
            if(!this.brogueInterface) {
                this.controllers.error.send("Not connected to brogue session");
                return;
            }

            if(this.mode == brogueMode.OBSERVE) {
                return;
            }

            var self = this;

            this.brogueInterface.handleIncomingBinaryMessage(data, function(err) {

                if(err) {
                    self.controllers.error.send(err.message);
                }
            });
        },
        start: function(data) {
            this.stopInteractingWithCurrentGame();
            this.startGameOrObserve(data, false)
        },
        observe: function(data) {
            this.stopInteractingWithCurrentGame();
            this.startGameOrObserve(data, true)
        },
        recording: function(data) {
            this.stopInteractingWithCurrentGame();
            this.watchRecording(data);
        },
        leave: function (data) {

            if(this.mode == brogueMode.OBSERVE) {
                this.controllers.chat.broadcastStopObserve(this.brogueGameChatId);
            }
            else if(this.mode == brogueMode.GAME) {
                this.controllers.chat.broadcastLeaveGame();
            }

            if(this.mode == brogueMode.RECORDING) {
                this.endBrogueSessionAndKillInterface();
            }

            this.returnToLobby();
        },

        clean: function (data) {

            // Called on logout or websocket close

            if(this.mode == brogueMode.GAME) {
                currentGames.setState(this.brogueCurrentGamesId, brogueState.INACTIVE);
            }

            else if(this.mode == brogueMode.RECORDING) {
                this.endBrogueSessionAndKillInterface();
            }

            //Just kill off the controller gracefully, leave the process (both observing and playing)
            this.stopInteractingWithCurrentGame();
        }
    },

    setState : function(state) {

        currentGames.setState(this.brogueCurrentGamesId, state);
    }

});

module.exports = BrogueController;
