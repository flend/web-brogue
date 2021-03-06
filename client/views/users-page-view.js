define([
    "jquery",
    "underscore",
    "backbone",
    "dispatcher"
], function ($, _, Backbone, dispatcher) {

    var UsersPageView = Backbone.View.extend({

        el: '#users-page',
        headingTemplate: _.template($('#users-page-template').html()),
        userName: '',

        initialize: function() {
            this.refresh();
        },

        render: function() {

            this.$el.html(this.headingTemplate({ userName: this.userName }));
            return this;
        },

        refresh: function() {
            this.render();
        },

        setSelectedUser: function(userName) {
            this.userName = userName;
            this.refresh();
        },

        //Event handler
        login: function(userName) {
            dispatcher.trigger("userSelected", userName);
        }
    });

    return UsersPageView;

});

