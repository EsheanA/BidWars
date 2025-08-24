const mongoose = require('mongoose');
const itemSchema = new mongoose.Schema({
    hashcode: {type: String, required: true, unique:true},
    name: { type: String, required: true, unique: false},
    value: { type: Number, required: true, unique: false },
    amount: {type: Number, required:true, unique: false},
    category: {type: String, required: true, unique: false},
    description: {type: String, required: true, unique: false},
    rarity: {type: String, required: true, unique: false},
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    img_url: {type: String, required:true, unique: false},
    audio_url: {type: String, required:true, unique: false},
    bid: {type: Number, required:true, unique: false}
}, { timestamps: true });

const Item = mongoose.model('Item', itemSchema);
module.exports = Item;
