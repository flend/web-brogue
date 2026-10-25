// Class owns communication with a single? brogue socket
// Needs a wrapper class to control its lifecycle then

var events = require('events');
var unixdgram = require('unix-dgram');
var childProcess = require('child_process');
var path = require('path');
var fs = require('fs-extra');
var gameDirectory = require('../security/username').gameDirectory;

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

var DEFAULT_LIFECYCLE = {
    reaperIntervalMs: 60 * 60 * 1000,
    idleTimeoutMs: 14 * 24 * 60 * 60 * 1000,
    killGraceMs: 5000,
    exitDrainMs: 250
};

function BrogueInterface(username, variant, options = {}) {
    this.username = username;
    this.variant = variant;
    this.childDir = null;
    this.dataRemainder = Buffer.alloc(0);
    this.brogueEvents = new events.EventEmitter();

    this.disconnected = false;
    this.now = options.now || Date.now;
    this.spawn = options.spawn || childProcess.spawn;
    this.lifecycle = Object.assign({}, DEFAULT_LIFECYCLE, config.gameLifecycle, options.lifecycle);
    const quota = this.lifecycle.cpuQuotaPercent;
    if (quota !== null && quota !== undefined && (!Number.isInteger(quota) || quota < 1 || quota > 100)) {
        throw new Error('Game CPU quota must be an integer from 1 to 100');
    }
    this.lastActiveTime = this.now();
    this.lastOutputTime = this.lastActiveTime;
    this.brogueChild = null;
    this.intervalKiller = null;
    this.killTimer = null;
    this.exitTimer = null;
    this.childExited = false;
    this.terminating = false;
    this.quitNotified = false;
    this.disconnectNotified = false;
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

    if (!Buffer.isBuffer(message) || message.length !== KEY_INPUT_SIZE) {
        callback(new Error('Invalid mouse or key input.'));
        return;
    }
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

    // Only player input renews the retention deadline. Screen refreshes,
    // spectators and native output are not evidence that a player is active.
    if (controlValue <= 5) this.lastActiveTime = this.now();
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
    let command = brogueClientPath;
    if (this.lifecycle.cpuQuotaPercent != null) {
        command = '/bin/sh';
        args = [path.join(__dirname, '../scripts/limit-game-cpu.sh'), brogueClientPath, ...args];
        options.env = Object.assign({}, process.env, {
            BROGUE_CPU_QUOTA_PERCENT: String(this.lifecycle.cpuQuotaPercent)
        });
    }
    const child = this.spawn(command, args, options);
    this.brogueChild = child;
    this.childExited = false;
    // Install ownership tracking immediately, even if socket setup fails.
    child.once('exit', () => this.childDidExit(child));
    child.once('error', () => {
        if (this.brogueChild !== child) return;
        if (!child.pid) {
            this.childExited = true;
            this.brogueChild = null;
        }
        this.killBrogue(this);
        this.notifyQuit('Unable to start or communicate with the game process.');
    });
};

BrogueInterface.prototype.attachChildProcess = function() {
    this.attachChildEvents();
    if (!this.disconnected) this.attachChildIdleKiller();
};

BrogueInterface.prototype.attachChildIdleKiller = function() {
    clearInterval(this.intervalKiller);
    this.intervalKiller = setInterval(this.checkIdleTimeAndKill.bind(this), this.lifecycle.reaperIntervalMs);
    this.intervalKiller.unref();
};

BrogueInterface.prototype.checkIdleTimeAndKill = function() {
    var idleTime = this.now() - this.lastActiveTime;

    if(idleTime >= this.lifecycle.idleTimeoutMs) {
        clearTimeout(this.intervalKiller);
        console.log('Reaping idle game:', this.variant, 'pid:', this.brogueChild?.pid || 'unmanaged', 'idleMs:', idleTime);
        this.killBrogue(this);

        //Do not send the 'error' event, since it's likely that no controller is listening any more, and the 'error' event will crash the server
        this.notifyQuit('Brogue process timed out due to inactivity');
    }
};

BrogueInterface.prototype.attachChildEvents = function () {

    var self = this;

    try { fs.unlinkSync(this.getChildWorkingDir() + "/" + CLIENT_SOCKET); } catch (e) { /* swallow */ }

    this.brogueClientSocket = unixdgram.createSocket('unix_dgram');
    this.brogueClientSocket.on('message', function(data, rinfo) {

        //Callback when receiving data on the socket from brogue

        self.lastOutputTime = self.now();

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
        self.notifyQuit('Error when reading from client socket');
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
        
        if(err.code !== -11 && err.code !== 'EAGAIN') {
            self.resetBrogueConnection(self);
            console.error('Error when writing to client socket: ' + err);
            self.notifyQuit('Error when writing to client socket - normally brogue has exited');
        }
        else {
            //err.code = -11 EAGAIN
            //This occurs brogue has gone non-responsive and the input buffer is full
            //It should be temporary

            console.error("EAGAIN from socket, continuing.");
        }
    });

};

BrogueInterface.prototype.hasLiveChild = function() {
    const child = this.brogueChild;
    return Boolean(child && child.pid && !this.childExited && child.exitCode === null && child.signalCode === null);
};

BrogueInterface.prototype.isTerminating = function() {
    return this.terminating && this.hasLiveChild();
};

BrogueInterface.prototype.notifyQuit = function(reason) {
    if (this.quitNotified) return;
    this.quitNotified = true;
    this.brogueEvents.emit('quit', reason);
};

BrogueInterface.prototype.notifyDisconnected = function() {
    // Do not evict the only owner of a live child while termination is pending.
    if (this.disconnectNotified || this.hasLiveChild()) return;
    this.disconnectNotified = true;
    if (this.onDisconnect) this.onDisconnect();
};

BrogueInterface.prototype.terminateChild = function() {
    if (!this.hasLiveChild() || this.terminating) return;
    this.terminating = true;
    const child = this.brogueChild;
    const forceKill = () => {
        if (this.brogueChild !== child || !this.hasLiveChild()) return;
        if (!this.killEscalated) {
            this.killEscalated = true;
            console.warn('Game process did not exit after SIGTERM; sending SIGKILL:', child.pid);
        }
        try { child.kill('SIGKILL'); } catch (error) { console.error('Unable to kill game process:', error.code); }
        // Retain ownership until exit is actually observed, including children
        // stuck in kernel I/O. ChildProcess owns the PID; never signal a guessed PID.
        this.killTimer = setTimeout(forceKill, this.lifecycle.killGraceMs);
        this.killTimer.unref();
    };
    this.killTimer = setTimeout(forceKill, this.lifecycle.killGraceMs);
    this.killTimer.unref();
    try { child.kill('SIGTERM'); } catch (error) { console.error('Unable to terminate game process:', error.code); }
};

BrogueInterface.prototype.childDidExit = function(child) {
    if (this.brogueChild !== child) return;
    this.childExited = true;
    clearTimeout(this.killTimer);
    this.killTimer = null;
    clearInterval(this.intervalKiller);
    this.intervalKiller = null;
    // An exit notification can precede delivery of the final score datagram.
    // Drain that short window before closing sockets/removing event listeners.
    clearTimeout(this.exitTimer);
    this.exitTimer = setTimeout(() => {
        this.exitTimer = null;
        if (this.brogueChild !== child) return;
        this.brogueChild = null;
        this.resetBrogueConnection(this);
        this.notifyQuit('Game process exited.');
    }, this.lifecycle.exitDrainMs);
};

BrogueInterface.prototype.killBrogue = function(self) {
    self.resetBrogueConnection(self);
};

BrogueInterface.prototype.resetBrogueConnection = function(self) {
    clearInterval(self.intervalKiller);
    self.intervalKiller = null;
    // Socket failure is terminal for this interface, but not proof that the
    // native process is dead. Keep its handle and SIGKILL fallback until exit.
    self.terminateChild();
    for (const field of ['brogueSocket', 'brogueClientSocket']) {
        const socket = self[field];
        self[field] = null;
        if (socket) {
            try { socket.close(); } catch (error) { console.error('Failed to close game socket:', error.code); }
        }
    }
    self.disconnected = true;
    self.notifyDisconnected();
};

BrogueInterface.prototype.processBrogueEvents = function(self, eventData) {
    if(eventData.eventId === brogueConstants.notifyEvents.GAMEOVER_QUIT ||
        eventData.eventId === brogueConstants.notifyEvents.GAMEOVER_DEATH ||
        eventData.eventId === brogueConstants.notifyEvents.GAMEOVER_VICTORY ||
        eventData.eventId === brogueConstants.notifyEvents.GAMEOVER_SUPERVICTORY ||
        eventData.eventId === brogueConstants.notifyEvents.GAMEOVER_RECORDING) {
        self.killBrogue(self);
        self.notifyQuit();
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
    if (!Object.hasOwn(config.brogueVariants, variant)) throw new Error('Invalid game variant');
    return gameDirectory(config.path.GAME_DATA_DIR, username, variant, mode === brogueMode.RECORDING);
};

module.exports = BrogueInterface;
