// Embedded last wins

define([
    "jquery",
    "underscore",
    "backbone",
    "dispatcher",
    "views/score-table-cells"
], function ($, _, Backbone, dispatcher, TableCells) {

    var LastWinsScoresView = Backbone.View.extend({

        el: '#last-wins-scores',
        headingTemplate: _.template($('#last-wins-scores-heading').html()),

        initialize: function() {
            this.listenTo(this.model, "add", this.render);
            this.listenTo(this.model, "change", this.render);

            this.grid = new Backgrid.Grid({
                columns: [
                    {
                        name: "username",
                        label: "Player",
                        cell: "string",
                        sortable: true,
                        editable: false
                    }, {
                        name: "prettyDate",
                        label: "Date",
                        cell: "string",
                        sortable: true,
                        editable: false
                    }, {
                        name: "prettySeeded",
                        label: "Seeded",
                        cell: "string",
                        sortable: false,
                        editable: false
                    }, {
                        name: "seed",
                        label: "Seed",
                        cell: "string",
                        sortable: true,
                        editable: false
                    }, {
                        name: "prettyVariant",
                        label: "Version",
                        cell: "string",
                        sortable: true,
                        editable: false
                    }, {
                        name: "score",
                        label: "Score",
                        cell: "integer",
                        sortable: true,
                        editable: false
                    }, {
                        name: "level",
                        label: "Level",
                        cell: TableCells.levelCell,
                        sortable: true,
                        editable: false
                    }, {
                        name: "description",
                        label: "Result",
                        cell: "string",
                        sortable: true,
                        editable: false
                    }, {
                        name: "recording",
                        label: "Recording",
                        cell: TableCells.watchGameUriCell,
                        sortable: false,
                        editable: false
                    }],

                collection: this.model
            });

            this.refresh();
        },

        render: function() {

            this.$el.html(this.headingTemplate());

            $("#last-wins-scores-grid").append(this.grid.render().$el);

            return this;
        },

        refresh: function() {
            this.model.fetch();
        },

    });

    return LastWinsScoresView;

});

