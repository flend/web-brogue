define([
    'jquery',
    'underscore',
    'backbone',
    "dataIO/send-generic"
], function($, _, Backbone, send) {

    var Observing = {
        
        startObserving: function(data) {

            send("brogue", "observe", {username: data.username, variant: data.variant});
        }
            
    };
    return Observing;
});
