define([
    'jquery',
    'underscore',
    'backbone',
    'moment'
], function($, _, Backbone, Moment) {

    var ChatModel = Backbone.Model.extend({

        //defaults needs to be an object to get per-instance properties
        defaults: function() { return {
            chatMessages: [],
            username: null,
            maxMessages: 1000,
            showChat: true
        }},
        addChatMessage: function(message) {
            const messages = this.get("chatMessages");
            messages.push(message);
            if (messages.length > this.get("maxMessages")) messages.splice(0, messages.length - this.get("maxMessages"));
        },

        addStatusMessageWithTime: function(message) {
            this.addChatMessage(this.formatSystemMessage(new Date(), message));
        },

        addChatMessageWithThisUserAndTime: function(message) {
            this.addChatMessageWithUserAndTime(this.get("username"), message.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
        },

        addChatMessageWithUserAndTime: function(username, message) {
            this.addChatMessage(this.formatChatMessage(username, new Date(), message));
        },
        addChatHistory: function(history) {
            _.each(history, function(historyEntry) {
                this.addChatMessage(this.formatChatMessage(historyEntry.username, historyEntry.date, historyEntry.message));
            }, this);
        },
        formatSystemMessage: function(date, message) {
            return "[" + this.formatDate(new Date()) + " " + _.escape(message) + "]";
        },
        formatChatMessage: function(username, date, message) {
            return "(" + this.formatDate(date) + ") " + this.colorize(username) + ": " + message;
        },
        formatDate: function(date) {

            var formattedDate = [];
            var startOfToday = Moment().startOf('day');

            if(Moment(date).isBefore(startOfToday)) {
                formattedDate =  Moment(date).format('D/MMM ')
            }

            formattedDate += Moment(date).format('HH:mm');
            return formattedDate;
        },

        colorize: function(str) {
            // string hash (FNV-1a)
            let hash = 2166136261;
            const s = str + 'abcd';
            for (let i = 0; i < s.length; ++i) {
                hash = ((hash ^ s.charCodeAt(i)) * 16777619) >>> 0;
            }
            // random color in linear RGB (range 0..1)
            let r = 0.001 + (hash % 1000) / 1000;
            let g = 0.001 + ((hash >>> 10) % 1000) / 1000;
            let b = 0.001 + ((hash >>> 20) % 1000) / 1000;
            // enforce a specific brightness
            while (true) {
                const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                if (luma >= 0.55 && luma <= 0.65) break;
                const k = 0.6 / luma;
                r = Math.min(1, r * k);
                g = Math.min(1, g * k);
                b = Math.min(1, b * k);
            }
            // gamma-compressed RGB (range 0..255)
            const R = Math.round(255 * Math.pow(r, 0.4545));
            const G = Math.round(255 * Math.pow(g, 0.4545));
            const B = Math.round(255 * Math.pow(b, 0.4545));
            return '<span style="color:rgb(' + R + ',' + G + ',' + B + ')">' + _.escape(str) + '</span>';
        },

        setUsername: function(username) {
            this.set("username", username);
        },

        canChat: function () {
            return this.get("username") !== null;
        },

        getMessages: function () {
            return this.get("chatMessages").slice(-this.get("maxMessages"));
        },
        setChatShown: function(val) {
            this.set("showChat", val);
        },
        getChatShown: function() {
            return this.get("showChat");
        }
    });

    return ChatModel;

});
