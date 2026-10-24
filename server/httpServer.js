module.exports = async function(config) {
    var express = require("express");
    var morgan = require("morgan");

    var util = require("util");
    var fs = require("fs");
    var highScoreApi = require("./api/high-score-api");
    var recordingsApi = require("./api/recordings-api");
    var newsApi = require("./api/news-api");
    var statsApi = require("./api/stats-api");
    var usersApi = require("./api/users-api");

    var mongoose = require("mongoose");
    await mongoose.connect(config.db.url, { serverSelectionTimeoutMS: 10000 });
    await require('./security/user-index').ensureRegistrationIndex(require('./user/user-model').collection);
    const authLimiter = new (require('./security/auth-limiter'))(config.auth.rateLimit);

    var app = express();

    app.use(function(req, res, next) {
        const page = parseInt(req.query.page, 10);
        const limit = parseInt(req.query.limit, 10);
        req.pagination = {
            page: Math.max(1, page || 1),
            limit: Number.isNaN(limit) ? 10 : Math.min(50, Math.max(0, limit))
        };
        next();
    });

    app.use(express.static(config.path.CLIENT_DIR));

    var accessLogStream = fs.createWriteStream(__dirname + '/access.log', {flags: 'a'});
    app.use(morgan('combined', {stream: accessLogStream}));

    /*
     //CORS middleware for testing
     var allowCrossDomain = function(req, res, next) {
     res.header('Access-Control-Allow-Origin', '*');
     res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
     res.header('Access-Control-Allow-Headers', 'Content-Type');

     next();
     };
     app.use(allowCrossDomain);
     */

    //routes
    app.get("/", function (req, res) {
        res.sendFile(config.path.CLIENT_DIR + "/index.html");
    });

    highScoreApi(app, config);
    recordingsApi(app, config);
    newsApi(app);
    statsApi(app, config);
    usersApi(app, config);

    var server = require('http').Server(app);
    var io = require('socket.io')(server, { maxHttpBufferSize: 65536 });

    io.on('connection', function (socket) {

        //console.log("New connection");

        var controllerFactory = require("./controllers/controller-factory");
        var controllerCleanUp = require("./controllers/cleanup-controllers.js");
        var Router = require("./controllers/router");

        var controllers = controllerFactory(socket, [
            "error",
            "lobby",
            "authentication",
            "brogue",
            "chat"
        ], { config, authLimiter });

        var router = new Router(controllers);

        socket.on("message", function (message) {
            router.route(message);
            //console.log("Message: " + JSON.stringify(message));
        });

        socket.on("disconnect", function (code, message) {
            controllerCleanUp(controllers);
        });

        socket.on("error", function (err) {
            console.log('Error emitted internally from web socket instance: ' + err);
        });
    });

    await new Promise(function(resolve, reject) {
        server.once('error', reject);
        server.listen(config.port.HTTP, resolve);
    });
    app.httpServer = server;
    app.close = async function() {
        await new Promise(resolve => io.close(resolve));
        accessLogStream.end();
        await require('./user/passwords').close();
        await mongoose.disconnect();
    };
    return app;
};
