// View for a single row in current games rollup in the lobby

define([
    "jquery",
    "underscore",
    "backbone",
    "dataIO/send-generic",
    "views/lobby-data-table-base",
    "views/current-games-row-view",
    'models/lobby-data-table-state',
    "models/current-games-row",
    "models/user-logged-in"
], function ($, _, Backbone, send, lobbyTableBase, CurrentGamesRowView, LobbyTableState, CurrentGamesRowModel, UserLoggedInModel) {

    var rowViewCollection = {};

    var CurrentGamesView = Backbone.View.extend({
        el: "#current-games",
        tableSelector : "#current-games-table",
        $tableElement: null,
        userModel: new UserLoggedInModel(),
        tableState : new LobbyTableState(),
        
        initialize : function(){
            this.renderHeading();
            send("lobby", "requestAllUserData");
        },
        
        headingTemplate : _.template($('#current-games-heading').html()),    

        render: function() {
            this.updateRowModelData();
        },

        updateRowModelData: function(data){                    
            // handle incoming user data
            if (!_.isEmpty(data)) {
                this.tableState.set("isEmpty", false);
            }
            else {
                this.tableState.set("isEmpty", true);
            }
            
            this.renderHeadingOnEmptyChange();
            
            if (data) {

                // delete old rows (ordering may have changed)
                for (var existingUserName in rowViewCollection) {
                    rowViewCollection[existingUserName].remove();
                    delete rowViewCollection[existingUserName];
                }

                // add new rows
                var dataLength = data.length;
                for (var i = 0; i < dataLength; i++) {

                    var update = data[i];
                    var incomingGameName = update["gameName"];

                    var action = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="1.5em" height="1em" style="vertical-align:text-bottom">' +
                    '<path fill="#6cf" fill-rule="evenodd" d="M1.679 7.932c.412-.621 1.242-1.75 2.366-2.717C5.175 4.242 6.527 3.5 8 3.5c1.473 0 2.824.742 3.955 1.715 ' +
                    '1.124.967 1.954 2.096 2.366 2.717a.119.119 0 010 .136c-.412.621-1.242 1.75-2.366 2.717C10.825 11.758 9.473 12.5 8 12.5c-1.473 ' +
                    '0-2.824-.742-3.955-1.715C2.92 9.818 2.09 8.69 1.679 8.068a.119.119 0 010-.136zM8 2c-1.981 0-3.67.992-4.933 2.078C1.797 5.169.88 ' +
                    '6.423.43 7.1a1.619 1.619 0 000 1.798c.45.678 1.367 1.932 2.637 3.024C4.329 13.008 6.019 14 8 14c1.981 0 3.67-.992 4.933-2.078 ' +
                    '1.27-1.091 2.187-2.345 2.637-3.023a1.619 1.619 0 000-1.798c-.45-.678-1.367-1.932-2.637-3.023C11.671 2.992 9.981 2 8 2zm0 8a2 2 0 100-4 2 2 0 000 4z">' +
                    '</path></svg>Watch';

                    if(update.userName === this.userModel.get("username")) {
                        action = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="1.5em" height="1em" style="vertical-align:text-bottom">' +
                            '<path fill="#7d7" fill-rule="evenodd" d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zM6.379 ' +
                            '5.227A.25.25 0 006 5.442v5.117a.25.25 0 00.379.214l4.264-2.559a.25.25 0 000-.428L6.379 5.227z">' +
                            '</path></svg>Resume';
                    }

                    const linkAction = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style="vertical-align:text-bottom;width:2em;height:1em">' +
                    '<path fill="#fd7" fill-rule="evenodd" d="M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 ' +
                    '0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 ' +
                    '001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z"></path></svg>Link';

                    var rowData = _.extend(update, {
                        action: action,
                        linkAction: linkAction
                    });
                    
                    var rowModel = new CurrentGamesRowModel(rowData);
                    var newRowView = rowViewCollection[incomingGameName] = new CurrentGamesRowView({
                        model : rowModel,
                        id : "game-row-" + incomingGameName
                    });
                    this.$tableElement.append(newRowView.render().el);
                }
            }
        },
        login : function(username){
            this.userModel.set({
                username : username
            });

            this.render();
        },

        logout: function() {

            this.userModel.set({
                username : ""
            });

            this.render();
        }
    });
    
    _.extend(CurrentGamesView.prototype, lobbyTableBase);
    
    return CurrentGamesView;

});
