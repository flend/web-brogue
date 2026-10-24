var mongoose = require('mongoose');
var UsersRecord = require("../user/user-model");
var sanitize = require('mongo-sanitize');
var _ = require("underscore");

module.exports = function(app, config) {

    app.get("/api/users", function (req, res, next) {

        UsersRecord.find({}).sort({ username: "asc" }).lean().exec().then(function (users) {
            res.format({
                json: function () {
                    const allUsers = _.map(users, function(user) {
                        return _.pick(user, 'username');
                    });
                    res.json(allUsers);
                }
            });
        }).catch(function (err) {
            next(err);
        });
    });
};