// Class owns communication with a single? brogue socket
// Needs a wrapper class to control its lifecycle then

var events = require('events');
var unixdgram = require('unix-dgram');
var childProcess = require('child_process');
var path = require('path');
var fs = require('fs-extra');

var brogueMode = require('../enum/brogue-mode');
var config = require('../config');
var brogueConstants = require('./brogue-constants.js');

var SERVER_SOCKET = 'server-socket';
var CLIENT_SOCKET = 'client-socket';

var CELL_MESSAGE_SIZE = 10;

var EVENT_BYTE_FLAG = 254;
var EVENT_DATA_OFFSET = 2;

var STATUS_BYTE_FLAG = 255;
var STATUS_DATA_OFFSET = 2;

var MOUSE_INPUT_SIZE = 5;
var KEY_INPUT_SIZE = 5;
var REFRESH_INPUT_SIZE = 5;
var QUERY_GRAPHICS_INPUT_SIZE = 5;

var SCREEN_REFRESH = 50;
var QUERY_GRAPHICS = 51;

var IDLE_KILLER_INTERVAL = 1 * 24 * 60 * 60 * 1000;
var IDLE_KILLER_TIMEOUT = 14 * 24 * 60 * 60 * 1000;

function BrogueInterface(username, variant) {
    this.username = username;
    this.variant = variant;
    this.childDir = null;
    this.dataRemainder = Buffer.alloc(0);
    this.brogueEvents = new events.EventEmitter();

    this.disconnected = false;
}

BrogueInterface.prototype.addDataListener = function(listener) {
    this.brogueEvents.on('data', listener);
};

BrogueInterface.prototype.addQuitListener = function(listener) {
    this.brogueEvents.on('quit', listener);
};

BrogueInterface.prototype.addErrorListener = function(listener) {
    this.brogueEvents.on('error', listener);
};

BrogueInterface.prototype.addStatusListener = function(listener) {
    this.brogueEvents.on('status', listener);
};

BrogueInterface.prototype.addEventListener = function(listener) {
    this.brogueEvents.on('event', listener);
};

BrogueInterface.prototype.removeDataListener = function(listener) {
    this.brogueEvents.removeListener('data', listener);
};

BrogueInterface.prototype.removeStatusListener = function(listener) {
    this.brogueEvents.removeListener('status', listener);
};

BrogueInterface.prototype.removeQuitListener = function(listener) {
    this.brogueEvents.removeListener('quit', listener);
};

BrogueInterface.prototype.removeErrorListener = function(listener) {
    this.brogueEvents.removeListener('error', listener);
};

BrogueInterface.prototype.removeEventListener = function(listener) {
    this.brogueEvents.removeListener('event', listener);
};

BrogueInterface.prototype.sendRefreshScreenAndInitialiseCommands = function(initialiseCommands, callback) {

    var messageArray = Buffer.alloc(5);
    messageArray[0] = SCREEN_REFRESH;
    this.sendToBrogue(messageArray, callback);

    if(initialiseCommands) {
        for(var i = 0; i < initialiseCommands.length; i++) {
            this.sendToBrogue(initialiseCommands[i], callback);
        }
    }
};

BrogueInterface.prototype.sendToBrogue = function(message, callback) {

    //Send message to socket, if connected
    var messageLength = message.length;

    if (this.brogueSocket) {
        this.brogueSocket.send(message, 0, messageLength, this.getChildWorkingDir() + "/" + SERVER_SOCKET);
        if(callback) {
            callback(null);
        }
    }
    else {
        if(callback) {
            callback(new Error("Socket not connected"));
        }
    }
};

BrogueInterface.prototype.handleIncomingBinaryMessage = function(message, callback) {

    //Command from browser

    var controlValue = message.readUInt8(0);
    var messageLength = message.length;
    var ctrlCheck;
    var shiftCheck;
    var isValid;

    if (controlValue === 0) { // key input
        ctrlCheck = message.readUInt8(3);
        shiftCheck = message.readUInt8(4);
        isValid = (messageLength === KEY_INPUT_SIZE) &&
            (ctrlCheck === 0 || ctrlCheck === 1) &&
            (shiftCheck === 0 || shiftCheck === 1);
    }
    else if (controlValue >= 1 && controlValue <= 5) { // mouse input
        ctrlCheck = message.readUInt8(3);
        shiftCheck = message.readUInt8(4);
        isValid = (messageLength === MOUSE_INPUT_SIZE) &&
            (ctrlCheck === 0 || ctrlCheck === 1) &&
            (shiftCheck === 0 || shiftCheck === 1);
    }
    else if (controlValue === SCREEN_REFRESH) {
        isValid = (messageLength === REFRESH_INPUT_SIZE);
    }
    else if (controlValue === QUERY_GRAPHICS) {
        isValid = (messageLength === QUERY_GRAPHICS_INPUT_SIZE);
    }

    if (!isValid) {
        callback(new Error("Invalid mouse or key input: " + JSON.stringify(message)));
        return;
    }

    this.sendToBrogue(message, callback);
};

BrogueInterface.prototype.start = function (data, mode) {

    //Support reconnect

    //Test if we can send to server socket, if so, no need to spawn a new process, just attach
    //This may happen on first connect after server restart, for example

    this.childDir = this.createBrogueDirectoryIfRequired(mode);

    var sendBuf = Buffer.alloc(5);
    sendBuf[0] = SCREEN_REFRESH;

    this.brogueSocket = unixdgram.createSocket('unix_dgram');

    var self = this;
    //Note: relies on synchronous callback
    this.brogueSocket.send(sendBuf, 0, 5, this.getChildWorkingDir() + "/" + SERVER_SOCKET, function (err) {

        if (err) {
            //If the game doesn't exist, and we are trying to play or watch a recording (not observe),
            //Create a new game
            if (mode != brogueMode.OBSERVE) {
                self.newBrogueProcess(data, mode);
            }
            else {
                throw new Error("Trying to observe game that does not exist.");
            }
        }
        //Okay to connect through socket to running process
        self.attachChildProcess();
    });
};

BrogueInterface.prototype.addStandardCmdLineArgs = function(args) {
    
    if(config.brogueVariants[this.variant].customCmdLine) {
        args = args.concat(config.brogueVariants[this.variant].customCmdLine);
    }

    return args;
}

BrogueInterface.prototype.newBrogueProcess = function(data, mode) {

    var childWorkingDir = this.getChildWorkingDir();

    var args = "";

    if(mode == brogueMode.RECORDING) {
        
        if(config.brogueVariants[this.variant].modernCmdLine) {
            args = ["--server-mode"];
        }
        else {
            args = ["--no-menu", "--no-saves"];
        }

        args = this.addStandardCmdLineArgs(args);
        
        args.push("-v");
        args.push(data.recordingPath);
    }
    else {
        if(config.brogueVariants[this.variant].modernCmdLine) {
            args = ["--server-mode"];
        }
        else {
            args = ["--no-menu", "--no-recording", "--no-scores", "--no-saves"];
        }

        args = this.addStandardCmdLineArgs(args);
        args.push("--hide-seed");

        //Input has been sanity checked in the controller. Any errors from brogue should be caught by the usual handlers

        if (data) {
            if (data.seed || data.seed === "") {

                args.push("-s");
                args.push(data.seed);
            }

            if (data.tournament) {
                args.push("--hide-seed");
            }
        }
    }

    this.spawnChildProcess(args, childWorkingDir);
};

BrogueInterface.prototype.spawnChildProcess = function (args, childWorkingDir) {
    var options = {
        cwd: childWorkingDir,
        detached: true,
        stdio: 'ignore'
    };
    var brogueClientPath = path.normalize(__dirname + "/../../" + config.brogueVariants[this.variant].binaryPath);
    if(!brogueClientPath) {
        throw new Error("Unable to find path for variant: " + this.variant)
    }
    this.brogueChild = childProcess.spawn(brogueClientPath, args, options);
};

BrogueInterface.prototype.attachChildProcess = function() {
    this.attachChildEvents();
    this.attachChildIdleKiller();
};

BrogueInterface.prototype.attachChildIdleKiller = function() {
    this.intervalKiller = setInterval(this.checkIdleTimeAndKill.bind(this), IDLE_KILLER_INTERVAL);
};

BrogueInterface.prototype.checkIdleTimeAndKill = function() {
    var idleTime = new Date().getTime() - this.lastActiveTime;

    if(idleTime > IDLE_KILLER_TIMEOUT) {
        clearTimeout(this.intervalKiller);

        this.killBrogue(this);

        //Do not send the 'error' event, since it's likely that no controller is listening any more, and the 'error' event will crash the server
        this.brogueEvents.emit('quit', 'Brogue process timed out due to inactivity');
    }
};

BrogueInterface.prototype.attachChildEvents = function () {

    var self = this;

    try { fs.unlinkSync(this.getChildWorkingDir() + "/" + CLIENT_SOCKET); } catch (e) { /* swallow */ }

    this.brogueClientSocket = unixdgram.createSocket('unix_dgram');
    this.brogueClientSocket.on('message', function(data, rinfo) {

        //Callback when receiving data on the socket from brogue

        self.lastActiveTime = new Date().getTime();

        var remainderLength = self.dataRemainder.length;

        //console.log("d: " + data.length);

        //fill the data buffer with the remainder from last time and the new data
        self.dataAccumulator = Buffer.alloc(data.length + remainderLength);
        self.dataToSend = Buffer.alloc(data.length + remainderLength);
        self.dataRemainder.copy(self.dataAccumulator);
        data.copy(self.dataAccumulator, remainderLength, 0);
        var fullDataLength = self.dataAccumulator.length;


        //check for status updates in data and update user object.
        var i = 0;
        var dataToSendPos = 0;

        while(i < fullDataLength) {

            if(i + CELL_MESSAGE_SIZE > fullDataLength) {
                //Partial message, wait for next data
                break;
            }

            if (self.dataAccumulator[i] === STATUS_BYTE_FLAG) {

                //(Partial messages are dealt with by the general case)

                //console.log("status");
                var updateFlag = self.dataAccumulator[i + STATUS_DATA_OFFSET];

                // We need to send 4 bytes over as unsigned long.  JS bitwise operations force a signed long, so we are forced to use a float here.
                var updateValue =
                    self.dataAccumulator[i + STATUS_DATA_OFFSET + 1] * 16777216 +
                    self.dataAccumulator[i + STATUS_DATA_OFFSET + 2] * 65536 +
                    self.dataAccumulator[i + STATUS_DATA_OFFSET + 3] * 256 +
                    self.dataAccumulator[i + STATUS_DATA_OFFSET + 4];

                self.brogueEvents.emit('status', {flag: updateFlag, value: updateValue});

                i += CELL_MESSAGE_SIZE;
            }
            else if(self.dataAccumulator[i] === EVENT_BYTE_FLAG) {

                if (i + 1 == fullDataLength) {
                    //Partial message, wait for next data
                    break;
                }

                const protocolVersionId = 254 - self.dataAccumulator[i + 1];

                const protocolVersion0EventDataLength = 100;
                const protocolVersion1EventDataLength = 105;

                if (protocolVersionId == 0) {
                    if (i + protocolVersion0EventDataLength > fullDataLength) {
                        //Partial message, wait for next data
                        break;
                    }
                }

                if (protocolVersionId == 1) {
                    if (i + protocolVersion1EventDataLength > fullDataLength) {
                        //Partial message, wait for next data
                        break;
                    }
                }
                
                var eventId = self.dataAccumulator[i + EVENT_DATA_OFFSET];

                const parseProtocolVersion0 = function (eventData) {

                    const protocolVersion0EventDataLength = 100;

                    var parsedData = {};
                    // Parse standard event data

                    // We need to send bytes over as unsigned long.  JS bitwise operations force a signed long, so we are forced to use a float here.
                    parsedData.eventData1 =
                        eventData[i + EVENT_DATA_OFFSET + 1] * 16777216 +
                        eventData[i + EVENT_DATA_OFFSET + 2] * 65536 +
                        eventData[i + EVENT_DATA_OFFSET + 3] * 256 +
                        eventData[i + EVENT_DATA_OFFSET + 4];

                    parsedData.level =
                        eventData[i + EVENT_DATA_OFFSET + 5] * 256 +
                        eventData[i + EVENT_DATA_OFFSET + 6];

                    parsedData.easyMode =
                        eventData[i + EVENT_DATA_OFFSET + 7] * 256 +
                        eventData[i + EVENT_DATA_OFFSET + 8];

                    parsedData.gold =
                        eventData[i + EVENT_DATA_OFFSET + 9] * 16777216 +
                        eventData[i + EVENT_DATA_OFFSET + 10] * 65536 +
                        eventData[i + EVENT_DATA_OFFSET + 11] * 256 +
                        eventData[i + EVENT_DATA_OFFSET + 12];

                    //High bytes for 64-bit seeds
                    parsedData.seedHigh = 0;

                    parsedData.seed =
                        eventData[i + EVENT_DATA_OFFSET + 13] * 16777216 +
                        eventData[i + EVENT_DATA_OFFSET + 14] * 65536 +
                        eventData[i + EVENT_DATA_OFFSET + 15] * 256 +
                        eventData[i + EVENT_DATA_OFFSET + 16];

                    parsedData.seeded = 0; //Unknown since not in protocol

                    var message1Start = i + EVENT_DATA_OFFSET + 17;
                    var eventEnd = i + protocolVersion0EventDataLength;

                    for(var j = message1Start; j < eventEnd; j++) {
                        if(eventData[j] == 0) {
                            break;
                        }
                    }

                    var message1End = j;

                    var message2Start = i + EVENT_DATA_OFFSET + 68;
                    for(var k = message2Start; k < eventEnd; k++) {
                        if(eventData[k] == 0) {
                            break;
                        }
                    }

                    var message2End = k;

                    parsedData.eventStr1 = eventData.slice(message1Start, message1End).toString('utf8');
                    parsedData.eventStr2 = eventData.slice(message2Start, message2End).toString('utf8');

                    return parsedData;
                };

                const parseProtocolVersion1 = function (eventData) {

                    const protocolVersion1EventDataLength = 105;
                    var parsedData = {};
                    // Parse standard event data

                    // We need to send bytes over as unsigned long.  JS bitwise operations force a signed long, so we are forced to use a float here.
                    parsedData.eventData1 =
                        eventData[i + EVENT_DATA_OFFSET + 1] * 16777216 +
                        eventData[i + EVENT_DATA_OFFSET + 2] * 65536 +
                        eventData[i + EVENT_DATA_OFFSET + 3] * 256 +
                        eventData[i + EVENT_DATA_OFFSET + 4];

                    parsedData.level =
                        eventData[i + EVENT_DATA_OFFSET + 5] * 256 +
                        eventData[i + EVENT_DATA_OFFSET + 6];

                    parsedData.easyMode =
                        eventData[i + EVENT_DATA_OFFSET + 7] * 256 +
                        eventData[i + EVENT_DATA_OFFSET + 8];

                    parsedData.gold =
                        eventData[i + EVENT_DATA_OFFSET + 9] * 16777216 +
                        eventData[i + EVENT_DATA_OFFSET + 10] * 65536 +
                        eventData[i + EVENT_DATA_OFFSET + 11] * 256 +
                        eventData[i + EVENT_DATA_OFFSET + 12];

                    //High bytes for 64-bit seeds
                    parsedData.seedHigh =
                        eventData[i + EVENT_DATA_OFFSET + 13] * 16777216 +
                        eventData[i + EVENT_DATA_OFFSET + 14] * 65536 +
                        eventData[i + EVENT_DATA_OFFSET + 15] * 256 +
                        eventData[i + EVENT_DATA_OFFSET + 16];
                    
                    parsedData.seed =
                        eventData[i + EVENT_DATA_OFFSET + 17] * 16777216 +
                        eventData[i + EVENT_DATA_OFFSET + 18] * 65536 +
                        eventData[i + EVENT_DATA_OFFSET + 19] * 256 +
                        eventData[i + EVENT_DATA_OFFSET + 20];

                    parsedData.seeded = eventData[i + EVENT_DATA_OFFSET + 21];

                    var message1Start = i + EVENT_DATA_OFFSET + 22;
                    var eventEnd = i + protocolVersion1EventDataLength;

                    for(var j = message1Start; j < eventEnd; j++) {
                        if(eventData[j] == 0) {
                            break;
                        }
                    }

                    var message1End = j;

                    var message2Start = i + EVENT_DATA_OFFSET + 73;
                    for(var k = message2Start; k < eventEnd; k++) {
                        if(eventData[k] == 0) {
                            break;
                        }
                    }

                    var message2End = k;

                    parsedData.eventStr1 = eventData.slice(message1Start, message1End).toString('utf8');
                    parsedData.eventStr2 = eventData.slice(message2Start, message2End).toString('utf8');

                    return parsedData;
                };

                var parsedEventData;

                //Protocol v0
                if (protocolVersionId == 0) {
                    parsedEventData = parseProtocolVersion0(self.dataAccumulator);
                    i += protocolVersion0EventDataLength;
                }
                //Protocol v1
                else {
                    parsedEventData = parseProtocolVersion1(self.dataAccumulator);
                    i += protocolVersion1EventDataLength;
                }
                
                //Process and emit specific events

                if(eventId === brogueConstants.notifyEvents.GAMEOVER_QUIT ||
                    eventId === brogueConstants.notifyEvents.GAMEOVER_DEATH ||
                    eventId === brogueConstants.notifyEvents.GAMEOVER_VICTORY ||
                    eventId === brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY ||
                    eventId === brogueConstants.notifyEvents.GAMEOVER_RECORDING) {

                    var makePathForRecording = function(recordingFilename) {
                        return self.getChildWorkingDir() + "/" + recordingFilename;
                    };
                    
                    var eventData = {
                        date: Date.now(),
                        eventId: eventId,
                        data1: parsedEventData.eventData1,
                        data2: 0,
                        gold: parsedEventData.gold,
                        level: parsedEventData.level,
                        seed: parsedEventData.seed,
                        seedHigh: parsedEventData.seedHigh,
                        seeded: parsedEventData.seeded,
                        easyMode: parsedEventData.easyMode,
                        message: parsedEventData.eventStr1,
                        recording: makePathForRecording(parsedEventData.eventStr2)
                    };

                    //console.log("event type: " + eventId);

                    self.brogueEvents.emit('event', eventData);
                    self.processBrogueEvents(self, eventData);
                }

                else if(eventId === brogueConstants.notifyEvents.SWITCH_TO_GRAPHICS) {
                   
                    var eventData = {
                        date: Date.now(),
                        eventId: eventId,
                        data1: parsedEventData.eventData1
                    };

                    self.brogueEvents.emit('event', eventData);
                    self.processBrogueEvents(self, eventData);
                }
            }
            else {
                self.dataAccumulator.copy(self.dataToSend, dataToSendPos, i, i + CELL_MESSAGE_SIZE);
                //No status message
                i += CELL_MESSAGE_SIZE;
                dataToSendPos += CELL_MESSAGE_SIZE;
            }
        }

        //Save the remaining data for next time
        //console.log("i: " + i);
        //console.log("f: " + fullDataLength);
        self.dataRemainder = Buffer.alloc(fullDataLength - i);
        self.dataAccumulator.copy(self.dataRemainder, 0, i, fullDataLength);
        var dataToSendCropped = self.dataToSend.slice(0, dataToSendPos);
        //console.log("r: " + self.dataRemainder.length);

        //Send any  data onwards to the console
        self.brogueEvents.emit('data', dataToSendCropped);
    });

    this.brogueClientSocket.on('error', function(err) {
        self.resetBrogueConnection(self);
        //Not identified any cases where this can happen yet but assume it's terminal
        self.brogueEvents.emit('quit', 'Error when reading from client socket');
    });

    this.brogueClientSocket.bind(this.getChildWorkingDir() + "/" + CLIENT_SOCKET);

    //Server write socket
    //May have already been connected in the test above
    if(!this.brogueSocket) {
        this.brogueSocket = unixdgram.createSocket('unix_dgram');
    }

    this.brogueSocket.on('error', function(err) {

        //err.code = -111 ECONNREFUSED
        //This occurs when we connected to an orphaned brogue process and it exits
        //Therefore we set ourselves into an ended state so a new game can be started
        
        if(err.code != -11) {
            self.resetBrogueConnection(self);
            console.error('Error when writing to client socket: ' + err);
            self.brogueEvents.emit('quit', 'Error when writing to client socket - normally brogue has exited');
        }
        else {
            //err.code = -11 EAGAIN
            //This occurs brogue has gone non-responsive and the input buffer is full
            //It should be temporary

            console.error("EAGAIN from socket, continuing.");
        }
    });

    //Not applicable when connecting to an orphaned process
    if(self.brogueChild) {

        self.brogueChild.on('exit', function () {
            // we no longer respond to this event. It sometimes triggers (and causes listeners to be removed)
            // before all events are processed from brogue so reacting here can miss events
        });

        self.brogueChild.on('error', function (err) {
            self.killBrogue(self);

            self.brogueEvents.emit('quit', 'Message could not be sent to brogue process - Error: ' + err);
        });
    }
};

BrogueInterface.prototype.killBrogue = function(self) {
    if(self.brogueChild) {
        self.brogueChild.kill();
    }

    self.resetBrogueConnection(self);
};

BrogueInterface.prototype.resetBrogueConnection = function(self) {

    if(self.brogueSocket != null) {
        try {
            self.brogueSocket.close();
        }
        catch (err) {
            console.error("Failed to close server socket " + JSON.stringify(err));
        }
    }
    if(self.brogueClientSocket != null) {
        try {
            self.brogueClientSocket.close();
        }
        catch(err) {
            console.error("Failed to close client socket " + JSON.stringify(err));
        }
    }

    self.brogueChild = null;
    self.brogueSocket = null;
    self.brogueClientSocket = null;
    self.disconnected = true;
};

BrogueInterface.prototype.processBrogueEvents = function(self, eventData) {
    //Analyse brogue messages and do suitable processing, before passing back to the controller

    //Kill the brogue process on quit (save a keypress and make sure it dies)
    if(eventData.eventId === brogueConstants.notifyEvents.GAMEOVER_QUIT ||
        eventData.eventId === brogueConstants.notifyEvents.GAMEOVER_DEATH ||
        eventData.eventId === brogueConstants.notifyEvents.GAMEOVER_VICTORY ||
        eventData.eventId === brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY ||
        eventData.eventId === brogueConstants.notifyEvents.GAMEOVER_RECORDING) {

        self.killBrogue(self);
        self.brogueEvents.emit('quit');
    }
};

BrogueInterface.prototype.createBrogueDirectoryIfRequired = function(mode) {

    var path = this.brogueGameDirectoryPath(this.username, this.variant, mode);

    try {
        fs.accessSync(path, fs.constants.F_OK);
        return path;
    }
    catch(err) {
        try {
            fs.ensureDirSync(path);
            return path;
        }
        catch (err) {
            if (err && err.code != "EEXIST") {
                console.error("Failed to create " + path + " : " + JSON.stringify(err));
            }
            return null;
        }
    }
};

BrogueInterface.prototype.getChildWorkingDir = function() {
    if(!this.childDir) {
        console.error("Brogue child dir not set.");
    }
    return this.childDir;
};

BrogueInterface.prototype.brogueGameDirectoryPath = function(username, variant, mode) {
    var dirName = username;
    if(mode == brogueMode.RECORDING) {
        dirName += "-recording";
    }
    return config.path.GAME_DATA_DIR + variant + "/" + dirName;
};

module.exports = BrogueInterface;
