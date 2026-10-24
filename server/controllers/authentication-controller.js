var config = require('../config');
var _ = require('underscore');
var Controller = require('./controller-base');
var User = require('../user/user-model');
var sessions = require('client-sessions');
var isRegistrationName = require('../security/username').isRegistrationName;
var AuthLimiter = require('../security/auth-limiter');
var clientAddress = require('../security/client-address');

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const isPassword = value => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 4096;

// Controller for handling user authentication over the web socket

function AuthController(socket, options = {}) {
    this.config = options.config || config;
    this.authLimiter = options.authLimiter || new AuthLimiter();
    this.clientAddress = clientAddress(socket, this.config.auth.trustedProxyAddresses);
    this.authPending = false;
    this.closed = false;
    this.authGeneration = 0;
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

        login: async function(data) {
            if (!isObject(data) || (data.token == null &&
                (typeof data.username !== 'string' || !data.username.length || data.username.length > 128 || !isPassword(data.password))) ||
                (data.token != null && (typeof data.token !== 'string' || data.token.length > 8192))) {
                return this.authFailure('Invalid authentication data.');
            }
            if (!this.beginAuthentication(data.username)) return;
            const generation = this.authGeneration;
            try {
                let username = data.username;
                if (data.token != null) {
                    let decoded;
                    try { decoded = this.decodeSessionToken(data.token); } catch { decoded = null; }
                    if (!decoded || typeof decoded.content !== 'string' || !decoded.content.length ||
                        !Number.isFinite(Number(decoded.createdAt) + Number(decoded.duration)) ||
                        Number(decoded.createdAt) + Number(decoded.duration) < Date.now()) {
                        return this.authFailure('Saved login is invalid or expired. Please log in again.');
                    }
                    username = decoded.content;
                }
                const user = await User.findOne({ username });
                if (!user || (data.token == null && !await user.isValidPassword(data.password))) {
                    return this.authFailure('Invalid username or password!');
                }
                if (!this.closed && generation === this.authGeneration) this.processSuccessfulLogin(user.username);
            } catch {
                this.authFailure('Authentication is busy or unavailable. Please try again shortly.');
            } finally {
                this.authPending = false;
            }
        },

        register: async function(data) {
            if (!isObject(data) || !isRegistrationName(data.username) || !isPassword(data.password) ||
                !data.password.trim() || Buffer.byteLength(data.password) > 72 || data.password !== data.repeat) {
                return this.authFailure('Use a username of up to 30 characters without slashes or control characters, and matching passwords of up to 72 UTF-8 bytes.');
            }
            if (!this.beginAuthentication(data.username)) return;
            const generation = this.authGeneration;
            try {
                // This check preserves legacy names. The partial unique index
                // below is what arbitrates simultaneous new registrations.
                if (await User.exists({ username: data.username })) return this.authFailure('That username is already taken!');
                const user = new User({ username: data.username, registrationVersion: 1 });
                user.password = await user.createHash(data.password);
                if (this.closed || generation !== this.authGeneration) return;
                await user.save();
                if (!this.closed && generation === this.authGeneration) this.sendMessage('auth', {
                    result: 'success', data: { message: 'registered', token: this.createSessionToken(user.username) }
                });
            } catch (error) {
                this.authFailure(error.code === 11000 ? 'That username is already taken!' :
                    'Registration is busy or unavailable. Please try again shortly.');
            } finally {
                this.authPending = false;
            }
        },
        logout: function (data) {

            this.authGeneration++;
            this.controllers.chat.broadcastLogoutMessage();

            this.authenticatedUserName = null;
            this.controllers.brogue.handlerCollection.clean.call(this.controllers.brogue, null);
            this.controllers.lobby.userDataListen();
            this.sendMessage("auth", {
                result: "logout",
                data: ""
            });
        }
    },

    authFailure: function(message) {
        if (!this.closed) this.sendMessage('auth', { result: 'fail', data: message });
    },
    beginAuthentication: function(username) {
        if (this.closed) return false;
        if (this.authPending || this.authenticatedUserName) {
            this.authFailure('An authentication request is already active.');
            return false;
        }
        if (!this.authLimiter.take(this.clientAddress, typeof username === 'string' ? username : null)) {
            this.authFailure('Too many authentication attempts. Please try again in a minute.');
            return false;
        }
        this.authPending = true;
        return true;
    },
    close: function() {
        this.closed = true;
        this.authGeneration++;
    },
    createSessionToken: function (username) {
        var sessionOpts = {
            cookieName: 'mySession', // cookie name dictates the key name added to the request object
            secret: this.config.auth.secret, // should be a large unguessable string
            duration: this.config.auth.tokenExpiryTime
        };

        var encodedToken = sessions.util.encode(sessionOpts, username, sessionOpts.duration);

        return encodedToken;
    },

    decodeSessionToken: function (token) {
        var sessionOpts = {
            cookieName: 'mySession', // cookie name dictates the key name added to the request object
            secret: this.config.auth.secret // should be a large unguessable string
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
