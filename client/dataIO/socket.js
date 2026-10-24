// Define the web socket object for our application
// All socket messages are immediately passed into the router.

define(['dataIO/router', 'dispatcher', 'io', 'config'], function(router, dispatcher, io, config){

    var socket = io.connect(window.location.hostname + ":" + config.websocketPort);
    var performanceTracking = [];
    var debugPoint = 0;

    socket.on('message', function(event) {
        performanceTracking.push({ timestamp: performance.now(),
            event: event});
        router.route(event);
    });

    socket.on('connect', function() {
    });

    socket.io.on('reconnect', function() {
        dispatcher.trigger("reconnect");
    });

    socket.outputPerformanceTracking = function() {
        for(i=debugPoint;i < performanceTracking.length; i++){
            //console.log(JSON.stringify(performanceTracking[i]));
        }
        debugPoint = performanceTracking.length;
    }
   
   return socket;
});


