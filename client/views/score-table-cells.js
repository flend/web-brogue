define([
    "jquery",
    "underscore",
    "backbone",
    "config",
    "dispatcher",
    "dataIO/send-generic",
    "backgrid",
    "moment",
    "views/view-activation-helpers"
], function ($, _, Backbone, config, dispatcher, send, Backgrid, Moment) {

    const watchSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style="vertical-align:text-bottom;width:2em;height:1em">' +
        '<path fill="#6cf" fill-rule="evenodd" d="M1.679 7.932c.412-.621 1.242-1.75 2.366-2.717C5.175 4.242 6.527 3.5 8 3.5c1.473 0 2.824.742 3.955 1.715 ' +
        '1.124.967 1.954 2.096 2.366 2.717a.119.119 0 010 .136c-.412.621-1.242 1.75-2.366 2.717C10.825 11.758 9.473 12.5 8 12.5c-1.473 ' +
        '0-2.824-.742-3.955-1.715C2.92 9.818 2.09 8.69 1.679 8.068a.119.119 0 010-.136zM8 2c-1.981 0-3.67.992-4.933 2.078C1.797 5.169.88 6.423.43 ' +
        '7.1a1.619 1.619 0 000 1.798c.45.678 1.367 1.932 2.637 3.024C4.329 13.008 6.019 14 8 14c1.981 0 3.67-.992 4.933-2.078 1.27-1.091 2.187-2.345 ' +
        '2.637-3.023a1.619 1.619 0 000-1.798c-.45-.678-1.367-1.932-2.637-3.023C11.671 2.992 9.981 2 8 2zm0 8a2 2 0 100-4 2 2 0 000 4z"></path></svg>';

    const downloadSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style="vertical-align:text-bottom;width:2em;height:1em">' +
        '<path fill="#bbf" fill-rule="evenodd" d="M7.47 10.78a.75.75 0 001.06 0l3.75-3.75a.75.75 0 00-1.06-1.06L8.75 8.44V1.75a.75.75 0 00-1.5 ' +
        '0v6.69L4.78 5.97a.75.75 0 00-1.06 1.06l3.75 3.75zM3.75 13a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5z"></path></svg>';

        const linkSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style="vertical-align:text-bottom;width:2em;height:1em">' +
        '<path fill="#fd7" fill-rule="evenodd" d="M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 ' +
        '0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 ' +
        '001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z"></path></svg>';

    var LevelFormatter = _.extend({}, Backgrid.CellFormatter.prototype, {
        fromRaw: function (rawValue, model) {
            var result = rawValue === 0 ? "Win!" : rawValue > 0 ? rawValue.toString() : "";
            var easyModeQualifier = model.get("easyMode") ? " (easy)" : "";
            return result + easyModeQualifier;
        }
    });

    var LevelCell = Backgrid.StringCell.extend({
        formatter: LevelFormatter
    });

    var WatchGameUriCell = Backgrid.UriCell.extend({

        events : {
            "click #watch-game" : "watchGame",
            "click #link-game": "copyLink"
        },

        watchGame: function(event) {
            event.preventDefault();
            while (event.target && !$(event.target).data("gameid")) event.target = event.target.parentElement;

            var gameId = $(event.target).data("gameid");
            var gameDescription = $(event.target).data("gamedescription");
            var gameVariant = $(event.target).data("variant");

            dispatcher.trigger("recordingGame", {id: gameId, recording: gameDescription, variant: gameVariant});
            dispatcher.trigger("showConsole");
        },

        copyLink: function(event) {
            event.preventDefault();
            while (event.target && !$(event.target).attr("href")) event.target = event.target.parentElement;
            var pathDir = window.location.pathname.substring(0, window.location.pathname.lastIndexOf("/") + 1)
            var gameLink = window.location.host + pathDir + $(event.target).attr("href");
            var $temp = $("<input>");
            $("body").append($temp);
            $temp.val(gameLink).select();
            document.execCommand("copy");
            $temp.remove();
        },

        render: function () {

            var formatDate = function(date) {
                return Moment(date).format('MMMM Do YYYY, h:mm:ss a');
            };

            this.$el.empty();
            var rawNameValue = this.model.get(this.column.get("name"));
            var formattedNameValue = this.formatter.fromRaw(rawNameValue, this.model);
            if(formattedNameValue) {
                this.$el.append($("<a>", {
                    class: 'with-tooltip',
                    tooltip: 'Watch this recording',
                    href: '#brogue',
                    title: this.model.title,
                    id: 'watch-game',
                    "data-gameid": formattedNameValue,
                    "data-variant": this.model.get("variant"),
                    "data-gamedescription": this.model.get("username") + "-" + this.model.get("seed") + "-" + formatDate(this.model.get("date"))
                }).html(watchSvg));
            }

            var downloadValue = this.model.get("download");
            if(downloadValue) {
                this.$el.append($("<a>", {
                    class: 'with-tooltip',
                    tooltip: 'Download the recording',
                    href: 'api/' + downloadValue,
                    title: this.model.title,
                    id: 'download-game',
                }).html(downloadSvg));
            } else {
                this.$el.append('<div style="width:2em;display:inline-block"></div>');
            }

            var downloadValue = this.model.get("link");
            if(downloadValue) {
                this.$el.append($("<a>", {
                    class: 'with-tooltip',
                    tooltip: 'Copy link to clipboard',
                    href: '#' + downloadValue,
                    title: this.model.title,
                    id: 'link-game',
                }).html(linkSvg));
            }

            this.delegateEvents();
            return this;
        },

    });

    var tableCells = {
        levelCell: LevelCell,
        watchGameUriCell: WatchGameUriCell
    };

    return tableCells;
});
