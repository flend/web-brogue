define([
    "jquery",
    "underscore",
    "backbone",
    "chart",
    "variantLookup"
], function ($, _, Backbone, Chart, variantLookup) {

    var LevelStatisticsView = Backbone.View.extend({

        el: '#level-statistics',
        headingTemplate: _.template($('#level-statistics-template').html()),

        events: {
            "click #deaths-by-level-list" : "selectAllLevelsOptions"
        },

        initialize: function() {
            this.listenTo(this.model, "add", this.render);
            this.listenTo(this.model, "change", this.render);

            this.grid = new Backgrid.Grid({
                columns: [
                    {
                        name: "level",
                        label: "Level",
                        cell: "integer",
                        sortable: false,
                        editable: false
                    }, {
                        name: "frequency",
                        label: "Frequency",
                        cell: "integer",
                        sortable: false,
                        editable: false
                    }],

                collection: this.model
            });

            this.renderOptions();
            this.setDefaultDeathsByLevel();
        },

        renderOptions: function() {

            var variantData = _.values(variantLookup.variants);

            this.$el.html(this.headingTemplate(
                {   username: this.model.username,
                    variants: variantData}));
        },

        render: function() {

            document.getElementById("deaths-by-level-name").textContent = this.variantName;
            $("#level-stats-grid").append(this.grid.render().$el);

            //Level statistics chart

            if (this.chart) this.chart.destroy();
            var ctx = document.getElementById("level-statistics-chart");
            ctx.innerHTML = '<canvas></canvas>';
            ctx = ctx.childNodes[0];
            var levelData = this.model.pluck("level");
            var frequencyData = this.model.pluck("frequency");
            if (!levelData || levelData.length < 2) {
                ctx.style.display = "none";
                return this;
            }

            Chart.defaults.color = '#dddddd';
            Chart.defaults.font.family = 'Rubik, "Source Sans Pro", Arial, Helvetica, sans-serif';

            this.chart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: levelData,
                    datasets: [{
                        label: '# of deaths',
                        data: frequencyData,
                        backgroundColor: 'rgba(255,85,85,0.4)',
                        borderColor: '#ff3264',
                        borderWidth: 1
                    }]
                },
                options: {
                    aspectRatio: 4,
                    plugins: {
                        legend: { display: false },
                        title: { display: false }
                    },
                    scales: {
                        x: { title: { display: true, text: 'Level' } },
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(128,128,128,0.2)' },
                            title: { display: true, text: 'Number of deaths' }
                        }
                    }
                }
            });

            return this;
        },

        refresh: function() {
            this.model.fetch();
            this.render();
        },

        setDefaultDeathsByLevel: function() {
            var code = _.findWhere(_.values(variantLookup.variants), {default: true}).code;
            this.variantName = variantLookup.variants[code].display;
            this.model.setVariantForLevelStats(code);
            this.model.fetch();
            this.render();
        },

        selectAllLevelsOptions: function(event) {
            
            event.preventDefault();

            if(!event.target.id) {
                return;
            }

            var codeAfterHyphenIndex = event.target.id.lastIndexOf("-")
            
            if(codeAfterHyphenIndex == -1) {
                return;
            }

            var code = event.target.id.substring(codeAfterHyphenIndex + 1);

            if(code in variantLookup.variants) {
                this.variantName = variantLookup.variants[code].display;
                this.model.setVariantForLevelStats(code);
                this.model.fetch();
                this.render();
            }
        }
    });

    return LevelStatisticsView;
});

