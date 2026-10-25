// Class tracks communication with all brogue sockets
// Responsible for distributing messages from players and observers

var brogue = require('./brogue-interface');
var brogueMode = require('../enum/brogue-mode');

module.exports = {

    brogueInterface: {},

    getBrogueInterface: function (username, variant, data, mode) {

        //This would allow us to support simultaneously playing 2 variants - but that requires refactoring the user model
        var gameKey = JSON.stringify([variant, username, mode === brogueMode.RECORDING]);

        if (this.brogueInterface[gameKey]) {
            if (this.brogueInterface[gameKey].isTerminating()) throw new Error('The previous game is still closing. Please try again shortly.');
            if(!this.brogueInterface[gameKey].disconnected) {
                return this.brogueInterface[gameKey];
            }
        }

        //If no interface exists, or it is disconnected, start with a new interface

        let instance;
        try {
            instance = new brogue(username, variant);
            this.brogueInterface[gameKey] = instance;
            instance.onDisconnect = () => {
                if (this.brogueInterface[gameKey] === instance) delete this.brogueInterface[gameKey];
            };
            instance.start(data, mode);
        }
        catch(e) {
            // Failed observation/startup can already have allocated sockets or
            // a child. Release I/O, but retain a live child's termination owner.
            if (instance) instance.resetBrogueConnection(instance);
            if (!instance || !instance.hasLiveChild()) delete this.brogueInterface[gameKey];
            throw e;
        }

        return this.brogueInterface[gameKey];
    }
}


