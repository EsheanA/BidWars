import { Schema, model} from "mongoose";

interface IUser{
    username: string,
    passwordHash: string,
    balance: number
}

const userSchema = new Schema<IUser>({
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true, unique: false },
    balance: {type: Number, required: true}
}, { timestamps: true });


const User = model<IUser>('User', userSchema);
export default User;