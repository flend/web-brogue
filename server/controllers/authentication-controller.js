var config = require('../config');
var _ = require('underscore');
var fs = require('fs');
var Controller = require('./controller-base');
var User = require('../user/user-model');
var cleanUp = require("./cleanup-controllers.js");
var sessions = require('client-sessions');
var brogueConstants = require('../brogue/brogue-constants');

// Controller for handling user authentication over the web socket

function AuthController(socket) {
    this.controllerName = "auth";
    this.socket = socket;
    this.controllers = null;

    this.authenticatedUserName = null;
    this.anonUserName = this.createAnonUserName();
}

AuthController.prototype = new Controller();
_.extend(AuthController.prototype, {
    controllerName: "auth",
    handlerCollection: {
        "anon-login": function(data) {
            this.processSuccessfulAnonLogin(this.anonUserName);
        },

        login: function (data) {
            var self = this;

            if ((data.username == null || data.password == null) && data.token == null) {
                self.controllers.error.send("Invalid authentication data sent: " + data);
                return;
            }

            if(data.token == null) {

                //Username / password authentication

                User.findOne({'username': data.username}).then(function (user) {
                    if (!user) {
                        self.sendMessage("auth", {
                            result: "fail",
                            data: "Invalid username or password!"
                        });
                        return;
                    }
                    if (user.isValidPassword(data.password)) {

                        self.processSuccessfulLogin(data.username);
                    }
                    else {
                        self.sendMessage("auth", {
                            result: "fail",
                            data: "Invalid username or password!"
                        });
                    }
                }).catch(function (err) {
                    self.controllers.error.send(JSON.stringify(err));
                    return;
                });
            }
            else {

                //Token-based login

                var decodedToken = this.decodeSessionToken(data.token);

                if(!decodedToken) {
                    self.sendMessage("auth", {
                        result: "fail",
                        data: "Token not recognised - use username / password login."
                    });
                    return;
                }

                User.findOne({'username': decodedToken.content}).then(function (user) {
                    if (!user) {
                        self.sendMessage("auth", {
                            result: "fail",
                            data: "Saved username not found in database!"
                        });
                        return;
                    }
                    var expiryTime = Number(decodedToken.createdAt) + Number(decodedToken.duration);
                    if (expiryTime < new Date().getTime()) {
                        self.sendMessage("auth", {
                            result: "fail",
                            data: "Token has expired!"
                        });
                        return;
                    }
                    self.processSuccessfulLogin(decodedToken.content);
                }).catch(function (err) {
                    self.controllers.error.send(JSON.stringify(err));
                    return;
                });
                }
            },

        register: function (data) {
            var self = this;

            if(data.username.trim() === "" || data.password.trim() === "") {
                self.sendMessage("auth", {
                    result: "fail",
                    data: "Username and password are required."
                });
                return;
            }

            if(data.username.indexOf("<") > -1 || data.username.indexOf(">") > -1) {
                self.sendMessage("auth", {
                    result: "fail",
                    data: "'<' and '>' are not allowed in the username."
                });
                return;
            }

            if(data.username.length > 30) {
                self.sendMessage("auth", {
                    result: "fail",
                    data: "Usernames are limited to 30 characters."
                });
                return;
            }

            if (data.password !== data.repeat) {
                self.sendMessage("auth", {
                    result: "fail",
                    data: "Password fields do not match!"
                });
                return;
            }

            User.findOne({'username': data.username}).then(function (user) {
                if (user) {
                    self.sendMessage("auth", {
                        result: "fail",
                        data: "That username is already taken!"
                    });
                    return;
                }
                else {
                    var newUser = new User();
                    newUser.username = data.username;
                    newUser.password = newUser.createHash(data.password);
                    newUser.sessionId = self.createSessionToken(newUser.username);

                    newUser.save().then(function () {
                        self.sendMessage("auth", {
                            result: "success",
                            data: {
                                message: "registered",
                                token: newUser.sessionId
                            }
                        });
                    }).catch(function (err) {
                        self.controllers.error.send(JSON.stringify(err));
                    });
                }
            }).catch(function (err) {
                self.controllers.error.send(JSON.stringify(err));
                return;
            });
        },
        logout: function (data) {

            this.controllers.chat.broadcastLogoutMessage();

            this.authenticatedUserName = null;
            this.controllers.brogue.handlerCollection.clean.call(this.controllers.brogue, null);
            this.sendMessage("auth", {
                result: "logout",
                data: ""
            });
        }
    },

    createSessionToken: function (username) {
        var sessionOpts = {
            cookieName: 'mySession', // cookie name dictates the key name added to the request object
            secret: config.auth.secret, // should be a large unguessable string
            duration: config.auth.tokenExpiryTime
        };

        var encodedToken = sessions.util.encode(sessionOpts, username, sessionOpts.duration);

        return encodedToken;
    },

    decodeSessionToken: function (token) {
        var sessionOpts = {
            cookieName: 'mySession', // cookie name dictates the key name added to the request object
            secret: config.auth.secret // should be a large unguessable string
        };

        var decodedToken = sessions.util.decode(sessionOpts, token);

        return decodedToken;
    },
    processSuccessfulAnonLogin: function(username) {
        if (this.authenticatedUserName) {
            this.sendMessage("auth", {
                result: "fail",
                data: "You are already logged in"
            });
            return;
        }

        this.sendMessage("auth", {
            result: "success",
            data: {
                message: "anon-logged-in",
                username: username
            }
        });

        this.controllers.chat.broadcastLoginMessage();
    },
    processSuccessfulLogin: function(username) {
        if (this.authenticatedUserName) {
            this.sendMessage("auth", {
                result: "fail",
                data: "You are already logged in"
            });
            return;
        }

        this.authenticatedUserName = username;

        this.sendMessage("auth", {
            result: "success",
            data: {
                message: "logged-in",
                username: username,
                token: this.createSessionToken(username)
            }
        });

        this.controllers.chat.broadcastLoginMessage();
    },
    getUserOrAnonName: function() {

        if(this.authenticatedUserName != null) {
            return this.authenticatedUserName;
        }
        else {
            return this.anonUserName;
        }
    },
    createAnonUserName: function() {

        var brogueMonsterNames = [
            "rat",
            "kobold",
            "jackal",
            "eel",
            "monkey",
            "bloat",
            "pit bloat",
            "goblin",
            "goblin conjurer",
            "goblin mystic",
            "goblin totem",
            "pink jelly",
            "toad",
            "vampire bat",
            "arrow turret",
            "acid mound",
            "centipede",
            "ogre",
            "bog monster",
            "ogre totem",
            "spider",
            "spark turret",
            "will-o-the-wisp",
            "wraith",
            "zombie",
            "troll",
            "ogre shaman",
            "naga",
            "salamander",
            "explosive bloat",
            "dar blademaster",
            "dar priestess",
            "dar battlemage",
            "acidic jelly",
            "centaur",
            "underworm",
            "sentinel",
            "acid turret",
            "dart turret",
            "kraken",
            "lich",
            "phylactery",
            "pixie",
            "phantom",
            "flame turret",
            "imp",
            "fury",
            "revenant",
            "tentacle horror",
            "golem",
            "dragon",
            "goblin warlord",
            "black jelly",
            "vampire",
            "flamedancer",
            "spectral blade",
            "spectral sword",
            "stone guardian",
            "winged guardian",
            "guardian spirit",
            "Warden of Yendor",
            "eldritch totem",
            "mirrored totem",
            "unicorn",
            "ifrit",
            "phoenix",
            "phoenix egg",
            "mangrove dryad"
        ];

        var randomName = brogueMonsterNames[Math.floor(Math.random()*brogueMonsterNames.length)];
        var randomNameHyphened = randomName.replace(' ', '-');
        var randomSuffix = function () { return Math.floor(Math.random() * 10) };

        var randomNameFull = randomNameHyphened + randomSuffix() + randomSuffix() + randomSuffix();
        return randomNameFull;
    }
});

module.exports = AuthController;
