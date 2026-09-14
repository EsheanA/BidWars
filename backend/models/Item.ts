import { Schema, model, Types } from "mongoose";

interface IItem{
    hashcode: string;
    name: string;
    value: number;
    amount: number;
    description: string;
    rarity: string;
    owner: Types.ObjectId;
    img_url: string;
    audio_url: string;
    bid: number;
}

const itemSchema = new Schema<IItem>({
    hashcode: {type: String, required: true, unique:true},
    name: { type: String, required: true, unique: false},
    value: { type: Number, required: true, unique: false },
    amount: {type: Number, required:true, unique: false},
    description: {type: String, required: true, unique: false},
    rarity: {type: String, required: true, unique: false},
    owner: { type: Schema.Types.ObjectId, ref: 'User' },
    img_url: {type: String, required:true, unique: false},
    audio_url: {type: String, required:false, unique: false},
    bid: {type: Number, required:false, unique: false}
}, { timestamps: true });

const Item = model<IItem>('Item', itemSchema);
export default Item;
