"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const User_1 = __importDefault(require("../models/User"));
const Item_1 = __importDefault(require("../models/Item"));
const generateToken_1 = require("../tokenHandling/generateToken");
const router = express_1.default.Router();
router.post("/signup", async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User_1.default.findOne({
            username
        });
        if (existingUser) {
            res.status(409).json({
                error: "Username or email already taken"
            });
            return;
        }
        const passwordHash = await bcrypt_1.default.hash(password, 10);
        const newUser = new User_1.default({
            username,
            passwordHash,
            balance: 500
        });
        await newUser.save();
        res.status(201).json({
            success: true,
            message: "New User Created"
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({
            error: "Signup failed"
        });
    }
});
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User_1.default.findOne({ username });
        if (!user) {
            res.status(401).json({
                error: "Invalid credentials"
            });
            return;
        }
        const isMatch = await bcrypt_1.default.compare(password, user.passwordHash);
        if (!isMatch) {
            res.status(401).json({
                error: "Invalid credentials"
            });
            return;
        }
        const accessToken = (0, generateToken_1.generateAccessToken)(user);
        res.cookie(`token_${user.userid}`, accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000
        }).json({
            success: true,
            userid: user.userid,
            username: user.username,
            balance: user.balance
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({
            error: "Login failed"
        });
    }
});
router.post("/logout", async (req, res) => {
    try {
        const { userid } = req.body;
        res.clearCookie(`token_${userid}`, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict"
        });
        res.json({
            message: "Logged out successfully"
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Logout error"
        });
    }
});
router.post("/me", async (req, res) => {
    try {
        const { userid } = req.body;
        const token = req.cookies[`token_${userid}`];
        if (!token) {
            res.status(401).json({
                error: "No token provided"
            });
            return;
        }
        const secret = process.env.ACCESS_TOKEN_SECRET;
        if (!secret) {
            throw new Error("ACCESS_TOKEN_SECRET is undefined");
        }
        jsonwebtoken_1.default.verify(token, secret);
        const user = await User_1.default.findById(userid);
        if (!user) {
            res.status(404).json({
                error: "User not found"
            });
            return;
        }
        res.status(200).json({
            userid: user._id,
            username: user.username,
            balance: user.balance
        });
    }
    catch (error) {
        res.status(401).json({
            error: "Invalid or expired token"
        });
    }
});
router.post("/items", async (req, res) => {
    try {
        const { userid } = req.body;
        const token = req.cookies[`token_${userid}`];
        if (!token) {
            res.status(401).json({
                error: "No token provided"
            });
            return;
        }
        const secret = process.env.ACCESS_TOKEN_SECRET;
        if (!secret) {
            throw new Error("ACCESS_TOKEN_SECRET is undefined");
        }
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        const { username } = decoded;
        const itemList = await Item_1.default.find({
            owner: userid
        });
        res.status(200).json({
            itemList
        });
    }
    catch (error) {
        res.status(401).json({
            error: "Invalid token"
        });
    }
});
router.post("/item/sell", async (req, res) => {
    try {
        const { userid, itemName, quantitySold } = req.body;
        const token = req.cookies[`token_${userid}`];
        if (!token) {
            res.status(401).json({
                error: "No token provided"
            });
            return;
        }
        const secret = process.env.ACCESS_TOKEN_SECRET;
        if (!secret) {
            throw new Error("ACCESS_TOKEN_SECRET is undefined");
        }
        jsonwebtoken_1.default.verify(token, secret);
        const hash = crypto_1.default
            .createHash("sha256")
            .update(itemName + userid)
            .digest("hex");
        const foundItem = await Item_1.default.findOne({
            hashcode: hash
        });
        if (!foundItem) {
            res.status(400).json({
                error: "Item unavailable"
            });
            return;
        }
        const value = foundItem.value * quantitySold;
        if (foundItem.amount - quantitySold >= 1) {
            const result = await Item_1.default.findByIdAndUpdate(foundItem._id, {
                amount: foundItem.amount - quantitySold
            });
            console.log(result);
        }
        else {
            const result = await Item_1.default.findByIdAndDelete(foundItem._id);
            console.log(result);
        }
        const itemList = await Item_1.default.find({
            owner: userid
        });
        await User_1.default.findByIdAndUpdate(userid, {
            $inc: {
                balance: value
            }
        });
        const user = await User_1.default.findById(userid);
        if (!user) {
            throw new Error(`User ${userid} not found`);
        }
        res.status(200).json({
            newBalance: user.balance,
            itemList
        });
    }
    catch (error) {
        res.status(401).json({
            error: "Invalid token"
        });
    }
});
exports.default = router;
//# sourceMappingURL=userRoutes.js.map