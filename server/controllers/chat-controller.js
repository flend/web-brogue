var Controller = require('./controller-base');
var _ = require('underscore');
var escape = require('escape-html');

var chatRecord = require('../database/chat-record-model');
var mongoose = require('mongoose');

var LOBBY_NAME = "lobby";
var CHAT_HISTORY_LENGTH = 100;

function ChatController(socket) {
    this.controllerName = "chat";
    this.socket = socket;
    this.controllers = null;
    this.roomName = null;

    //The player enters the lobby and always remains in this room (the chat box may be hidden on front-end)
    this.socket.join(LOBBY_NAME);
}

ChatController.prototype = new Controller();
_.extend(ChatController.prototype, {
    controllerName: "chat",
    handlerCollection: {
        message: function (data) {

            //Incoming message from client

            if (!data || typeof data.data !== 'string' || typeof data.channel !== 'string') {
                this.controllers.error.send('Invalid chat message.');
                return;
            }
            var incomingMessage = data.data.slice(0, 1024);

            if(incomingMessage.trim().length == 0) {
                return
            }

            var messageTruncated = this.truncateString(incomingMessage, 1024);
            var messageSanitised = escape(incomingMessage);

            //Send to all other listeners in the same room
            var broadcastMessage = { type: "chat", data: {
                type: "message",
                channel: data.channel,
                username: this.controllers.auth.getUserOrAnonName(),
                data: messageSanitised
            }};

            if(data.channel === LOBBY_NAME) {
                this.socket.to(LOBBY_NAME).emit('message', broadcastMessage);
                this.persistLobbyMessage({ username: broadcastMessage.data.username,
                    message: messageTruncated });
            }
            else {
                if(this.roomName) {
                    this.socket.to(this.roomName).emit('message', broadcastMessage);
                }
            }
        },
        lobbyHistory: function(data) {

            var self = this;

            //Delete very old chats if above threshold
            chatRecord.countDocuments({}).then(function (count) {
                if (count > CHAT_HISTORY_LENGTH * 2) {
                    chatRecord.find({}).sort('-date').skip(CHAT_HISTORY_LENGTH).exec().then(function (chatRecords) {
                        if (chatRecords) {
                            return chatRecord.deleteMany({
                                _id: { $in: chatRecords.map(record => record._id) }
                            });
                        }
                    }).catch(function (err) {
                        return;
                    });
                }
            }).catch(function (err) {
                console.error(err);
            });

            //Send chat history
            chatRecord.find({}).sort('-date').limit(CHAT_HISTORY_LENGTH).exec().then(function (chatRecords) {
                if (chatRecords) {
                    var chatsToSend = _.map(chatRecords, function(chatRecord) { return _.pick(chatRecord, "date", "username", "message"); });
                    var chatsToSendSanitised = _.map(chatsToSend,
                        function(chatRecord) {
                            return {
                                "date": chatRecord.date,
                                "username": chatRecord.username,
                                "message": escape(chatRecord.message)
                            }
                        });
                    var chatsToSendOrdered = _.sortBy(chatsToSendSanitised, "date");

                    self.sendMessage("chat", {
                        type: "history",
                        history: chatsToSendOrdered
                    });
                }
            }).catch(function (err) {
                self.controllers.error.send(JSON.stringify(err));
                return;
            });
        }
    },
    persistLobbyMessage: function(chatMessage) {
        var thisChatRecord = {
            username: chatMessage.username,
            message: chatMessage.message
        };

        chatRecord.create(thisChatRecord).catch(function (err) {
            console.error("Chat save failure:" + err);
        });
    },
    enterRoom: function(roomName) {
        if (this.roomName && this.roomName !== roomName) this.socket.leave(this.roomName);
        this.roomName = roomName;
        this.socket.join(roomName);
    },
    leaveRoom: function(roomName) {
        if (roomName) this.socket.leave(roomName);
        if (this.roomName === roomName) this.roomName = null;
    },
    broadcastLoginMessage: function() {
        this.broadcastUserStatusMessage("logged in.")
    },
    broadcastLogoutMessage: function() {
        this.broadcastUserStatusMessage("logged out.")
    },
    broadcastStartGame: function() {
        this.broadcastUserStatusMessage("started a game.")
    },
    broadcastLeaveGame: function() {
        this.broadcastUserStatusMessage("left their game.")
    },
    broadcastStopObserve: function (gameName) {
        this.broadcastUserStatusMessage("stopped observing " + gameName + ".")
    },
    broadcastObserve: function (gameName) {
        this.broadcastUserStatusMessage("is observing " + gameName + ".")
    },
    broadcastUserStatusMessage: function(message) {
        var broadcastMessage = {
            type: "chat", data: {
                type: "status",
                username: this.controllers.auth.getUserOrAnonName(),
                data: this.controllers.auth.getUserOrAnonName() + " " + message
            }
        };

        this.socket.broadcast.emit('message', broadcastMessage);
    },
    truncateString: function (str, length) {
        return str.length > length ? str.substring(0, length - 3) + '...' : str
    }
});

module.exports = ChatController;
