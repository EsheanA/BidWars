const mongoose = require('mongoose');
const itemSchema = new mongoose.Schema({
    hashcode: {type: String, required: true, unique:true},
    name: { type: String, required: true, unique: false},
    value: { type: Number, required: true, unique: false },
    amount: {type: Number, required:true, unique: false},
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    url: {type: String, required:true, unique: false}
}, { timestamps: true });

const Item = mongoose.model('Item', itemSchema);
module.exports = Item;
