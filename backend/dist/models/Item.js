"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const itemSchema = new mongoose_1.Schema({
    hashcode: { type: String, required: true, unique: true },
    name: { type: String, required: true, unique: false },
    value: { type: Number, required: true, unique: false },
    amount: { type: Number, required: true, unique: false },
    category: { type: String, required: true, unique: false },
    description: { type: String, required: true, unique: false },
    rarity: { type: String, required: true, unique: false },
    owner: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    img_url: { type: String, required: true, unique: false },
    audio_url: { type: String, required: false, unique: false },
    bid: { type: Number, required: false, unique: false }
}, { timestamps: true });
const Item = (0, mongoose_1.model)('Item', itemSchema);
exports.default = Item;
//# sourceMappingURL=Item.js.map