
// When the websocket closes we want to make sure that we clean up each controller so they doesn't continue to run processes after the client closes

module.exports = function(controllers) {

    controllers.auth.close();

    // again we need 'this' to be in the context of the controller not this function so bind it
    controllers.brogue.handlerCollection.clean.call(controllers.brogue);
    controllers.lobby.stopUserDataListen();
};