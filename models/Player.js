const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
    _id:String,
    name: String,
    socketId:String,
    startTime: Date,
    exitTime: Date,
    elapsedTime: String
});

const Player = mongoose.model('Player', playerSchema);

module.exports = Player;