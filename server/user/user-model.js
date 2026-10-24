var mongoose = require('mongoose');
var passwords = require('./passwords');
var registrationIndex = require('../security/user-index').registrationIndex;

var userSchema = mongoose.Schema({
    username: String,
    password: String,
    registrationVersion: Number
});

userSchema.methods.isValidPassword = function (password) {
    return passwords.compare(password, this.password);
};

userSchema.methods.createHash = function (password) {
    return passwords.hash(password);
};

userSchema.index({ username: 1 });
userSchema.index({ username: 1 }, registrationIndex);

module.exports = mongoose.model('User', userSchema);
