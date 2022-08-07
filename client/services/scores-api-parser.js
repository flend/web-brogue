define([
    'jquery',
    'underscore',
    'moment',
    'variantLookup'
], function($, _, Moment, VariantLookup) {

    var ScoresFormatter = {
        
        formatSeeded: function(seeded) {
            return seeded ? "Seeded" : "Random"
        },

        formatDate: function(date) {
            var d0 = Moment();
            var d1 = Moment(date);
            // same day: only show the time
            if (d1.format('YYYY-MM-DD') == d0.format('YYYY-MM-DD'))
                return d1.format('LT');
            // same year, or less than 6 months ago: show month and day
            if (d1.format('YYYY') == d0.format('YYYY') || d0.diff(d1, 'days') < 180)
                return d1.format('MMM DD');
            // show month, day, year
            return d1.format('ll');
        },

        lookupVariant: function(variant) {
            if(variant in VariantLookup.variants) {
                return VariantLookup.variants[variant].display;
            }
            else {
                return "Not found";
            }
        },

        stateFromResp: function (resp) {
           return {totalRecords: resp.itemCount };
        },

        // get the actual records
        recordsFromResp: function (resp) {

            var records = resp.data;

            _.each(records, function(element, index, list) {
                element.prettyDate = this.formatDate(element.date);
                element.prettyVariant = this.lookupVariant(element.variant);
                element.prettySeeded = this.formatSeeded(element.seeded);
            }, this);

            return resp.data;
        }
    };
    return ScoresFormatter;
});
