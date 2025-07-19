const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true, unique: false },
    balance: {type: Number, required: true},
    ownedItems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Item' }]

}, { timestamps: true });
const User = mongoose.model('User', userSchema);
module.exports = User;