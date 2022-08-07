
// Define our repeatable jquery activation and deactivation functions for our common view actions.

define([
    'jquery',
    'router'
], function($, router) {
    
    var activate = {
        endLoading : function(){
            $('#about').removeClass('inactive');
            $('#loading').addClass('inactive');
        },

        currentGames : function(){
            router.navigate("currentGames");
            $('#all-scores, #users-page, #server-statistics').addClass('inactive');
            $('#current-games, #mini-scores, #last-wins-scores, #chat, #site-news').removeClass('inactive');
        },

        statistics : function(){
            router.navigate("gameStatistics");
            $('#current-games, #mini-scores, #last-wins-scores, #all-scores, #site-news, #users-page').addClass('inactive');
            $('#server-statistics').removeClass('inactive');
        },

        highScores : function() {
            router.navigate("highScores");
            $('#current-games, #mini-scores, #server-statistics, #site-news, #users-page').addClass('inactive');
            $('#all-scores, #chat').removeClass('inactive');
        },

        usersPage : function() {
            router.navigate("userStatistics");
            $('#current-games, #mini-scores, #last-wins-scores, #server-statistics, #site-news, #all-scores').addClass('inactive');
            $('#users-page').removeClass('inactive');
        },
        
        console : function(){
            $('#lobby').addClass("inactive");
            $("#console-holder").removeClass("inactive");
            $("#console").focus();
        },
        
        lobby: function(){
            $('#lobby').removeClass("inactive");
            $("#console-holder").addClass("inactive");

        },
        
        loggedIn: function(){
            $('#auth').addClass("inactive");
        },
        
        resetAll: function(){
            $('#all-scores, #console-holder, #server-statistics, #users-page').addClass("inactive");
            $('#lobby, #auth, #current-games, #mini-scores, #last-wins-scores').removeClass("inactive");
        }
    };
    
    return activate;
    
});