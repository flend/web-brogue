// Model for a list of high scores

define([
    'jquery',
    'underscore',
    'backbone',
    'services/scores-api-parser',
], function($, _, Backbone, ScoresParser) {

    var LastWinsScores = Backbone.Collection.extend({
        url: '/api/games/lastwins',

        parse: function (resp) {
            _.each(resp, function(element, index, list) {
                element.prettyDate = ScoresParser.formatDate(element.date);
                element.prettyVariant = ScoresParser.lookupVariant(element.variant);
                element.prettySeeded = ScoresParser.formatSeeded(element.seeded);
            });

            return resp;
        }

    });

    return LastWinsScores;

});