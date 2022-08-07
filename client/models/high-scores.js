// Model for a list of high scores

define([
    'jquery',
    'underscore',
    'backbone',
    'services/scores-api-parser'
], function($, _, Backbone, ScoresParser) {

    var HighScores = Backbone.PageableCollection.extend({
        url: '/api/games',

        // Initial pagination states
        state: {
            pageSize: 10,
            sortKey: "date",
            order: 1
        },

        // You can remap the query parameters from `state` keys from
        // the default to those your server supports
        queryParams: {
            sortKey: "sort",
            order: "order",
            pageSize: "limit"
        },

        parseState: function (resp, queryParams, state, options) {
            return ScoresParser.stateFromResp(resp);
        },

         // get the actual records
        parseRecords: function (resp, options) {
            return ScoresParser.recordsFromResp(resp);
        },

        setAllScores: function() {
            this.url = 'api/games';
            this.state.sortKey = "date";
            this.scoresTypeSelected = "All scores";
        },
        setAllScoresForPreviousDays: function(days) {
            this.url = 'api/games?previousdays=' + days;
            this.state.sortKey = "date";
            this.scoresTypeSelected = "Scores for " + days + "previous days.";
        },
        setUserScoresForPreviousDays: function(days) {
            this.url = 'api/games/' + this.username + '?previousdays=' + days;
            this.state.sortKey = "date";
            this.scoresTypeSelected = "Player " + this.username + "'s scores for " + days + "previous days.";
        },
        setAllTopScores: function(filterByUser) {
            if(filterByUser) {
                this.url = 'api/games?username=' + this.username;
                this.scoresTypeSelected = "Player " + this.username + "'s top scores";
            }
            else {
                this.url = 'api/games';
                this.scoresTypeSelected = "All scores";
            }
            this.state.sortKey = "score";
        },
        setUserTopScores: function() {
            this.url = 'api/games/' + this.username;
            this.state.sortKey = "score";
            this.scoresTypeSelected = "Player " + this.username + "'s top scores";
        },
        setDailyTopScores: function() {
            this.url = 'api/dailygames';
            this.state.sortKey = "score";
            this.scoresTypeSelected = "Daily scores";
        },
        setMonthlyTopScores: function() {
            this.url = 'api/monthlygames';
            this.state.sortKey = "score";
            this.scoresTypeSelected = "Monthly scores";
        },
        setVariantTopScores: function(variantCode, filterByUser) {
            if(filterByUser) {
                this.url = 'api/games?variant=' + variantCode + '&username=' + this.username;
                this.scoresTypeSelected = "Player " + this.username + "'s scores for " + ScoresParser.lookupVariant(variantCode);
            }
            else {
                this.url = 'api/games?variant=' + variantCode;
                this.scoresTypeSelected = "Scores for " + ScoresParser.lookupVariant(variantCode);
            }
            this.state.sortKey = "score";
        },
        setUserName: function(username) {
            this.username = username;
        },
        clearUserName: function() {
            delete this.username;
        },
        getScoresTypeSelected: function() {
            return this.scoresTypeSelected;
        }
    });

    return HighScores;

});