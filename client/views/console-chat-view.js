define([
    "jquery",
    "underscore",
    "backbone",
    "dispatcher",
    "util",
    "models/chat",
    "dataIO/send-generic"
], function ($, _, Backbone, dispatcher, util, ChatModel, send) {

    var ConsoleChatView = Backbone.View.extend({
        listElement: "#console-chat-messages",
        inputElement: "#console-chat-input",
        truncateStringLength: 1024,

        events: {
            "click #console-chat-send-button": "chatSend",
            "click #console-chat-show-button": "chatShow",
            "click #console-chat-hide-button": "chatHide"
        },
        template: _.template($('#console-chat-template').html()),

        initialize: function () {
            this.render();
        },
        render: function () {

            var messagesList = '';

            _.each(this.model.getMessages(), function (elem) {
                messagesList = messagesList.concat('<li>' + elem + '</li>');
            });

            var inputHadFocus = $(this.inputElement).is(':focus');
            var currentInput = $(this.inputElement).val();

            if(this.model.getChatShown()) {
                chatHiddenStatus = "inactive";
                chatShownStatus = "";
            }
            else {
                chatHiddenStatus = "";
                chatShownStatus = "inactive";
            }

            this.$el.html(this.template({
                "prefix": 'console',
                "messageListItems": messagesList,
                "chatHiddenStatus": chatHiddenStatus,
                "chatShownStatus": chatShownStatus
            }));

            $(this.inputElement).val(currentInput);
            $(this.listElement).scrollTop(1E10);
            if(inputHadFocus) {
                $(this.inputElement).trigger('focus');
            }
        },

        chatMessage: function (message) {

            if(message.type) {

                if(message.channel && message.channel === 'lobby') {
                    return;
                }

                if(message.type === "message") {
                    this.model.addChatMessageWithUserAndTime(message.username, message.data);
                }
                if(message.type === "status") {
                    this.model.addStatusMessageWithTime(message.data);
                }
            }

            this.render(); //should be unnecessary - need to set up watch
        },
        chatSend: function (event) {

            event.preventDefault();

            var inputText = $('#console-chat-input').val();
            var messageToSend = this.truncateString(inputText, this.truncateStringLength);

            send("chat", "message", { channel: "console", data: messageToSend });

            this.model.addChatMessageWithThisUserAndTime(messageToSend);

            this.render();
            $(this.inputElement).val('');
            $(this.inputElement).trigger('focus');
        },
        chatHide: function() {
            this.model.setChatShown(false);
            this.render();            
            dispatcher.trigger("hideChat");
        },
        chatShow: function() {
            this.model.setChatShown(true);
            this.render();
            dispatcher.trigger("showChat");
        },
        login : function(username) {
            this.model.setUsername(username);

            this.render();
        },
        logout: function() {
            this.model.setUsername(null);
        },
        truncateString: function (str, length) {
            return str.length > length ? str.substring(0, length - 3) + '...' : str
        }
    });

    return ConsoleChatView;

});
