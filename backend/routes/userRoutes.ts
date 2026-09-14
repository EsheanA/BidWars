import express, { Request, Response, NextFunction} from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import UserModel from "../models/User";
import { type User as User } from "../types/User";
import Item from "../models/Item";
import { generateAccessToken } from "../tokenHandling/generateToken";
const router = express.Router();

export const validate = (req: Request, res: Response, next: NextFunction): void => {
        console.log("BODY:", req.body);
        const { username, password } = req.body as {
            username: unknown;
            password: unknown;
        };

        if(typeof username !== "string" ||
            typeof password !== "string" || !username.trim() || password.length > 8){
                res.status(400).json({error: "Invalid username or password"});
                return;
            }
        next(); 
  };

router.post("/signup", validate, async (req: Request, res: Response): Promise<void> => {

    try {
        
        const { username, password } = req.body as {
            username: string;
            password: string;
        };

        const existingUser = await UserModel.findOne({
            username
        });

        if (existingUser) {
            res.status(409).json({
                error: "Username or email already taken"
            });
            return;
        }

        const passwordHash: string = await bcrypt.hash(password, 10);

        const newUser = new UserModel({
            username,
            passwordHash,
            balance: 500
        });

        await newUser.save();

        res.status(201).json({
            message: "New User Created"
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: "Signup failed"
        });
    }
});


router.post("/login", validate, async (req: Request, res: Response): Promise<void> => {
    try {
        const { username, password } = req.body as {
            username: string;
            password: string;
        };

        const user : User | null= await UserModel.findOne({ username });

        if (user === null) {
            res.status(401).json({
                error: "Invalid credentials"
            });
            return;
        }

        const isMatch: boolean = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!isMatch) {
            res.status(401).json({
                error: "Invalid credentials"
            });
            return;
        }

        const accessToken: string = generateAccessToken(user);

        res.cookie(`token_${user._id}`, accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000
        }).json({
            userid: user._id.toString(),
            username: user.username,
            balance: user.balance
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: "Login failed"
        });
    }
});

router.post("/logout", async (req: Request, res: Response): Promise<void> => {
    try {
        const { userid } = req.body as {
            userid: string;
        };

        res.clearCookie(`token_${userid}`, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict"
        });

        res.json({
            message: "Logged out successfully"
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Logout error"
        });
    }
});

router.post("/me", async (req: Request, res: Response): Promise<void> => {
    try {
        const { userid } = req.body as {
            userid: string;
        };

        const token: string | undefined = req.cookies[`token_${userid}`];

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

        jwt.verify(token, secret);

        const user = await UserModel.findById(userid);

        if (!user) {
            res.status(404).json({
                error: "User not found"
            });
            return;
        }

        res.status(200).json({
            userid,
            username: user.username,
            balance: user.balance
        });

    } catch (error) {
        res.status(401).json({
            error: "Invalid or expired token"
        });
    }
});

router.post("/items", async (req: Request, res: Response): Promise<void> => {
    try {
        const { userid } = req.body as {
            userid: string;
        };

        const token: string | undefined = req.cookies[`token_${userid}`];

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

        const decoded = jwt.verify(token, secret) as {
            userid: string;
            username: string;
        };

        const { username } = decoded;

        const itemList = await Item.find({
            owner: userid
        });

        res.status(200).json({
            itemList
        });

    } catch (error) {
        res.status(401).json({
            error: "Invalid token"
        });
    }
});


router.post("/item/sell", async (req: Request, res: Response): Promise<void> => {
    try {
        const { userid, itemName, quantitySold } = req.body as {
            userid: string;
            itemName: string;
            quantitySold: number;
        };

        const token: string | undefined = req.cookies[`token_${userid}`];

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

        jwt.verify(token, secret) as {
            userid: string;
            username: string;
        };

        const hash: string = crypto
            .createHash("sha256")
            .update(itemName + userid)
            .digest("hex");

        const foundItem = await Item.findOne({
            hashcode: hash
        });

        if (!foundItem) {
            res.status(400).json({
                error: "Item unavailable"
            });
            return;
        }

        const value: number = foundItem.value * quantitySold;

        if (foundItem.amount - quantitySold >= 1) {
            const result = await Item.findByIdAndUpdate(
                foundItem._id,
                {
                    amount: foundItem.amount - quantitySold
                }
            );

            console.log(result);
        } else {
            const result = await Item.findByIdAndDelete(foundItem._id);
            console.log(result);
        }

        const itemList = await Item.find({
            owner: userid
        });

        await UserModel.findByIdAndUpdate(
            userid,
            {
                $inc: {
                    balance: value
                }
            }
        );

        const user = await UserModel.findById(userid);

        if (!user) {
            throw new Error(`User ${userid} not found`);
        }

        res.status(200).json({
            newBalance: user.balance,
            itemList
        });

    } catch (error) {
        res.status(401).json({
            error: "Invalid token"
        });
    }
});

export default router;