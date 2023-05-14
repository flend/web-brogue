// Main entry point in the client side application.  Initializes all main views.

require.config({
    paths: {
        jquery : "libs/jquery",
        underscore : "libs/underscore",
        backbone : "libs/backbone",
        moment: "libs/moment",
        backbonePaginator: "libs/backbone.paginator",
        backboneAutocomplete: "libs/autocomplete-view",
        backgrid: "libs/backgrid",
        backgridPaginator: "libs/backgrid-paginator",
        io: "socket.io/socket.io.js",
        chart: "libs/chart"
    },
    shim: {
        'backbone': {
            deps: ['underscore', 'jquery'],
            exports: "Backbone"
        },

        'backgrid': {
            deps: ['backbone'],
            exports: "Backgrid"
        },

        'backgridPaginator': {
            deps: ['backbone', 'backgrid'],
            exports: 'Backgrid.Paginator'
        }
    }
});
require([
    "jquery",
    "underscore",
    "backbone",
    "backbonePaginator",
    "backgrid",
    "backgridPaginator",
    "dispatcher",
    "tests/debug-mode",
    "dataIO/socket",
    "dataIO/router",
    "router",
    "models/high-scores",
    "models/chat",
    "models/site-news",
    "models/cause-stats-model",
    "models/level-stats-model",
    "models/general-stats-model",
    "models/level-probability-model",
    "models/dpad-button",
    "models/auth",
    "models/user-details",
    "models/last-wins-scores",
    "services/recordings",
    "services/observing",
    "views/view-activation-helpers",
    "views/auth-view",
    "views/chat-view",
    "views/console-chat-view",
    "views/play-view",
    "views/header-view",
    "views/current-games-view",
    "views/mini-scores-view",
    "views/all-scores-view",
    "views/last-wins-scores-view",
    "views/site-news-view",
    "views/console-view",
    "views/popups/seed-popup-view",
    "views/statistics-view",
    "views/level-stats-view",
    "views/general-stats-view",
    "views/cause-stats-view",
    "views/level-probability-view",
    "views/dpad-button-view",
    "views/dpad-visibility-button-view",
    "views/users-page-view",
    "views/users-page-select-view",
    "views/users-page-selected-user-view",
    "views/users-page-scores-view"
], function( $, _, Backbone, BackbonePaginator, Backgrid, BackgridPaginator, dispatcher, debugMode, socket, router, pageRouter,
     HighScoresModel, ChatModel, SiteNewsModel, CauseStatsModel, LevelStatsModel, GeneralStatsModel, LevelProbabilityModel, DPadButtonModel, AuthenticationModel, UserDetailsCollection, LastWinsScoresModel, recordings, observing,
     activate, AuthView, ChatView, ConsoleChatView, PlayView, HeaderView, CurrentGamesView, HighScoresView, AllScoresView, LastWinsScoresView, SiteNewsView,
     ConsoleView, SeedPopupView, StatisticsView, LevelStatsView, GeneralStatsView, CauseStatsView, LevelProbabilityView,
     DPadButtonView, DPadButtonVisibilityView, UsersPageView, UsersPageSelectView, UserPageSelectedUserView, UsersPageScoresView){
    
    // initialize each model and view;
    var authView = new AuthView({model: new AuthenticationModel()});
    var playView = new PlayView();
    var headerView = new HeaderView();
    var currentGamesView = new CurrentGamesView();
    var chatView = new ChatView({model: new ChatModel()});
    var statisticsView = new StatisticsView();
    var levelStatsView = new LevelStatsView({model: new LevelStatsModel()});
    var causeStatsView = new CauseStatsView({model: new CauseStatsModel()});
    var generalStatsView = new GeneralStatsView({el: '#general-statistics', model: new GeneralStatsModel()});
    var levelProbabilityView = new LevelProbabilityView({model: new LevelProbabilityModel()});
    var siteNewsView = new SiteNewsView({model: new SiteNewsModel() });
    var popups = {
        seedView : new SeedPopupView(),
    };

    //Users page

    var usersPageView = new UsersPageView();
    var usersPageSelectView = new UsersPageSelectView({
        searchField: 'username',
        collection: new UserDetailsCollection(),
        minimumInputLength: 1,
        maxOptions: 5
    });

    usersPageSelectView.render();
    document.getElementById('users-page-select').appendChild(usersPageSelectView.el);

    var userPageSelectedUserView = new UserPageSelectedUserView();
    var generalStatsUserView = new GeneralStatsView({el: '#general-statistics-user', model: new GeneralStatsModel()});
    var userPageScoresModel = new HighScoresModel();
    userPageScoresModel.fetch();
    setInterval(function() { userPageScoresModel.fetch(); }, 5 * 60 * 1000);
    var usersPageScoresView = new UsersPageScoresView({model: userPageScoresModel});

    //High scores

    var highScoresModel = new HighScoresModel();
    highScoresModel.fetch();
    setInterval(function() { highScoresModel.fetch(); }, 5 * 60 * 1000);
    var highScoresView = new HighScoresView({model: highScoresModel});

    var allScoresModel = new HighScoresModel();
    allScoresModel.fetch();
    setInterval(function() { allScoresModel.fetch(); }, 5 * 60 * 1000);
    var allScoresView = new AllScoresView({model: allScoresModel});

    var lastWinsScoresModel = new LastWinsScoresModel();
    lastWinsScoresModel.fetch();
    setInterval(function() { lastWinsScoresModel.fetch(); }, 5 * 60 * 1000);
    var lastWinsScoresView = new LastWinsScoresView({model: lastWinsScoresModel});

    //Console
    var consoleView = new ConsoleView();
    var consoleChatView = new ConsoleChatView({el: "#console-chat", model: new ChatModel()});

    //DPad - console
    var dPadVisibilityButton = new DPadButtonVisibilityView({el: "#console-dpad"});
    dPadVisibilityButton.setDPadPrefix('console-');
    var upArrowView = new DPadButtonView({el: "#console-up", model: new DPadButtonModel({ keyToSend: 63232 })});
    var upRightArrowView = new DPadButtonView({el: "#console-up-right", model: new DPadButtonModel({ keyToSend: 117 })});
    var rightArrowView = new DPadButtonView({el: "#console-right", model: new DPadButtonModel({ keyToSend: 63235 })});
    var downRightArrowView = new DPadButtonView({el: "#console-down-right", model: new DPadButtonModel({ keyToSend: 110 })});
    var downArrowView = new DPadButtonView({el: "#console-down", model: new DPadButtonModel({ keyToSend: 63233 })});
    var downLeftArrowView = new DPadButtonView({el: "#console-down-left", model: new DPadButtonModel({ keyToSend: 98 })});
    var leftArrowView = new DPadButtonView({el: "#console-left", model: new DPadButtonModel({ keyToSend: 63234 })});
    var upLeftArrowView = new DPadButtonView({el: "#console-up-left", model: new DPadButtonModel({ keyToSend: 121 })});
    var centreArrowView = new DPadButtonView({el: "#console-centre", model: new DPadButtonModel({ keyToSend: 53 })});
    var downRightRightZView = new DPadButtonView({el: "#console-down-right-right", model: new DPadButtonModel({ keyToSend: "Z".charCodeAt(0) })});
    var rightRightXView = new DPadButtonView({el: "#console-right-right", model: new DPadButtonModel({ keyToSend: "x".charCodeAt(0) })});
    var upRightRightIView = new DPadButtonView({el: "#console-up-right-right", model: new DPadButtonModel({ keyToSend: "s".charCodeAt(0) })});
    var upupRightRightView = new DPadButtonView({el: "#console-up-up-right-right", model: new DPadButtonModel({ keyToSend: 13 })});
    var upupRightView = new DPadButtonView({el: "#console-up-up-right", model: new DPadButtonModel({ keyToSend: "i".charCodeAt(0) })});
    var upupLeftESCView = new DPadButtonView({el: "#console-up-up-left", model: new DPadButtonModel({ keyToSend: "a".charCodeAt(0) })});
    var upupView = new DPadButtonView({el: "#console-up-up", model: new DPadButtonModel({ keyToSend: "t".charCodeAt(0) })});
    var upupupLeftESCView = new DPadButtonView({el: "#console-up-up-up-left", model: new DPadButtonModel({ keyToSend: 27 })});

    // use dispatcher to co-ordinate multi-view/service actions on routed commands
    // direct calls to activate should be replaced by this mechanism

    dispatcher.on("quit", highScoresView.quit, highScoresView);
    dispatcher.on("quit", consoleView.exitToLobby, consoleView);

    dispatcher.on("fail", highScoresView.quit, highScoresView);
    dispatcher.on("fail", consoleView.exitToLobby, consoleView);

    dispatcher.on("login", headerView.login, headerView);
    dispatcher.on("login", highScoresView.login, highScoresView);
    dispatcher.on("login", lastWinsScoresView.login, lastWinsScoresView);
    dispatcher.on("login", chatView.login, chatView);
    dispatcher.on("login", consoleChatView.login, consoleChatView);
    dispatcher.on("login", playView.login, playView);
    dispatcher.on("login", currentGamesView.login, currentGamesView);
    dispatcher.on("login", pageRouter.login, router);
    dispatcher.on("login", usersPageView.login, usersPageView);

    dispatcher.on("anon-login", headerView.anonymousLogin, headerView);
    dispatcher.on("anon-login", chatView.login, chatView);
    dispatcher.on("anon-login", consoleChatView.login, consoleChatView);
    dispatcher.on("anon-login", pageRouter.login, router);

    dispatcher.on("logout", highScoresView.logout, highScoresView);
    dispatcher.on("logout", allScoresView.logout, allScoresView);
    dispatcher.on("logout", consoleChatView.logout, consoleChatView);
    dispatcher.on("logout", chatView.logout, chatView);
    dispatcher.on("logout", currentGamesView.logout, currentGamesView);
    dispatcher.on("logout", authView.logout, authView);
    dispatcher.on("logout", playView.logout, playView);


    dispatcher.on("all-scores", activate.highScores, activate);
    dispatcher.on("all-scores", allScoresView.activate, allScoresView);

    dispatcher.on("users-page", activate.usersPage, activate);
    dispatcher.on("users-page", usersPageSelectView.initialise, usersPageSelectView);
    dispatcher.on("userSelected", generalStatsUserView.setUserStats, generalStatsUserView);
    dispatcher.on("userSelected", userPageSelectedUserView.userSelected, userPageSelectedUserView);
    dispatcher.on("userSelected", usersPageScoresView.userSelected, usersPageScoresView);

    dispatcher.on("currentGames", activate.currentGames, activate);

    dispatcher.on("gameStatistics", activate.statistics, activate)

    dispatcher.on("chat", chatView.chatMessage, chatView);
    dispatcher.on("chat", consoleChatView.chatMessage, consoleChatView);

    dispatcher.on("showConsole", activate.console, activate);
    dispatcher.on("showConsole", consoleView.resize, consoleView);
    dispatcher.on("showConsole", dPadVisibilityButton.positionDPad, dPadVisibilityButton);

    dispatcher.on("showChat", consoleView.resize, consoleView);

    dispatcher.on("hideChat", consoleView.resize, consoleView);

    dispatcher.on("startGame", headerView.startGame, headerView);
    dispatcher.on("startGame", consoleView.initialiseForNewGame, consoleView);

    dispatcher.on("observeGame", observing.startObserving, observing);
    dispatcher.on("observeGame", headerView.observeGame, headerView);
    dispatcher.on("observeGame", consoleView.initialiseForNewGame, consoleView);

    dispatcher.on("recordingGame", recordings.startRecording, recordings);
    dispatcher.on("recordingGame", headerView.recordingGame, headerView);
    dispatcher.on("recordingGame", consoleView.initialiseForNewGame, consoleView);

    dispatcher.on("leaveGame", headerView.leaveGame, headerView);

    dispatcher.on("reconnect", authView.requestLogin, authView);
    dispatcher.on("reconnect", consoleView.exitToLobby, consoleView);

    dispatcher.on("focusConsole", consoleView.giveKeyboardFocus, consoleView);

    dispatcher.on("showSeedPopup", popups.seedView.showSeedPopup, popups.seedView);

    dispatcher.on("brogue", consoleView.queueUpdateCellModelData, consoleView);

    dispatcher.on("meta", consoleView.processServerMetadataUpdate, consoleView);

    // set up routes for the messages from the websocket connection (only)
    router.registerHandlers({
        //Must bind 'this' to the scope of the view so we can use the internal view functions
        "error" : console.error.bind(console),
        "brogue" : function(data) { dispatcher.trigger("brogue", data) },
        "meta" : function(data) { dispatcher.trigger("meta", data) },
        "quit" : function(data) { dispatcher.trigger("quit", data) },
        "lobby" : currentGamesView.updateRowModelData.bind(currentGamesView),
        "chat": function(data) { dispatcher.trigger("chat", data) },
        "auth" : authView.handleMessage.bind(authView),
        "seed" : popups.seedView.handleMessage.bind(popups.seedView),
        "fail" : function(data) { dispatcher.trigger("fail", data) },
    });
            
    //debugging
    var debug = false;
    if(debug) {
        debugMode();
        setInterval(socket.outputPerformanceTracking, 5000);
    }

    // clean up application
    $(window).on("unload", function(){
        socket.close();
    });
    
    // responsive resizing
    var throttledResize = _.debounce(function(){
            consoleView.resize();
        }, 100);
    $(window).resize(throttledResize);

    // dpad translation and scaling
    if(window.visualViewport) {
        window.visualViewport.addEventListener('scroll', dPadVisibilityButton.positionDPad.bind(dPadVisibilityButton));
        window.visualViewport.addEventListener('resize', dPadVisibilityButton.positionDPad.bind(dPadVisibilityButton));
        window.addEventListener('scroll', dPadVisibilityButton.positionDPad.bind(dPadVisibilityButton));
    } 

    activate.endLoading();
});
