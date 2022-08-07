// Model for a list of high scores

define([
    'jquery',
    'underscore',
    'backbone',
    'services/scores-api-parser',
], function($, _, Backbone, ScoresParser) {

    var LastWinsScores = Backbone.PageableCollection.extend({
        url: '/api/games?result=2&limit=1&sort=date&order=desc',

        parseState: function (resp, queryParams, state, options) {
            return ScoresParser.stateFromResp(resp);
        },

         // get the actual records
        parseRecords: function (resp, options) {
            return ScoresParser.recordsFromResp(resp);
        },

    });

    return LastWinsScores;

});