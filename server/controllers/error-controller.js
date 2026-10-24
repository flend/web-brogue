var _ = require('underscore');
var util = require('util');
var Controller = require('./controller-base');

// Controller for propigating errors back to the client console for debugging purposes

function ErrorController(socket) {
    this.controllerName = "error";
    this.socket = socket;
    this.controllers = null;
}

ErrorController.prototype = new Controller();
_.extend(ErrorController.prototype, {
    controllerName : "error",
    
    handleIncomingMessage : function(message){
        this.send("Message is not valid JSON: " + message);
    },
    
    log : function(message){
        console.log(message);
    },
    
    send : function(message){
        var errorMessage = "Server Error: " + message;
        this.log(errorMessage);
        this.sendMessage("error", errorMessage);
    }
});

module.exports = ErrorController;