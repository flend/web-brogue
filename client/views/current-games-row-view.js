// View for current games rollup in the lobby

define([
    "jquery",
    "underscore",
    "backbone",
    "config",
    "dispatcher",
    "dataIO/send-generic",
    "views/view-activation-helpers"
], function ($, _, Backbone, config, dispatcher, send) {

    var CurrentGamesRowView = Backbone.View.extend({
        tagName: "tr",
        className: "games-row",
        events : {
            "click #observe-game" : "observeGame",
            "click #link-game" : "linkGame"
        },
        
        template : _.template($('#current-games-row').html()),

        observeGame: function(event){
            event.preventDefault();

            dispatcher.trigger("observeGame", {username: this.model.get("userName"), variant: this.model.get("variant")});
            this.goToConsole();
        },

        linkGame: function(event){
            event.preventDefault();

            var pathDir = window.location.pathname.substring(0, window.location.pathname.lastIndexOf("/") + 1)
            var gameLink = window.location.host + pathDir + "#observeGame/" + this.model.get("userName") + "-" + this.model.get("variant");
            var $temp = $("<input>");
            $("body").append($temp);
            $temp.val(gameLink).select();
            document.execCommand("copy");
            $temp.remove();
        },

        render: function() {
            this.model.calculateFormattedIdleTime();
            this.model.setPrettyVariant();
            this.model.setPrettyScore();

            this.$el.html(this.template(this.model.toJSON()));
            return this;
        },

        goToConsole : function() {
            dispatcher.trigger("showConsole");
        }

    });

    return CurrentGamesRowView;

});



