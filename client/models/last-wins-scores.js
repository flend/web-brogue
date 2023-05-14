// Model for a list of high scores

define([
    'jquery',
    'underscore',
    'backbone',
    'services/scores-api-parser',
    'variantLookup'
], function($, _, Backbone, ScoresParser, VariantLookup) {

    var LastWinsScores = Backbone.Collection.extend({
        url: '/api/games/lastwins',

        parse: function (resp) {
            _.each(resp, function(element, index, list) {
                element.prettyDate = ScoresParser.formatDate(element.date);
                element.prettyVariant = ScoresParser.lookupVariant(element.variant);
                element.prettySeeded = ScoresParser.formatSeeded(element.seeded);
            });

            return resp;
        },

        initialize: function() {
            this.setUrlFromConfig();
        },

        setUrlFromConfig: function () {
            const variantsToRetrieve = Object.values(VariantLookup.variants).filter(variant => !variant.disabled)
                                                                            .map(variant => variant.code);
            const variantApiString = variantsToRetrieve.join(',');
            this.url = `/api/games/lastwins?variant=${variantApiString}`;
        }

    });

    return LastWinsScores;

});