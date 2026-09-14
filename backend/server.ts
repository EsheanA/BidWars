import express, { Request, Response } from "express";
import http from "http";
import cors, { CorsOptions } from "cors";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import path from "path";
import "dotenv/config";

import userRouter from "./routes/userRoutes";
import auctionRouter from "./routes/auctionRoutes";
import { initSocket } from "./socket/index";

const app = express();
const server = http.createServer(app);

const ONE_DAY = 24 * 60 * 60 * 1000;

app.use(
    "/audioFiles",
    express.static(path.join(__dirname, "audioFiles"), {
        maxAge: ONE_DAY,
        etag: true,
        setHeaders(res) {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Accept-Ranges", "bytes");
            res.setHeader(
                "Cache-Control",
                "public, max-age=86400, immutable"
            );
        },
    })
);

app.use(
    "/BidWarsSVGs",
    express.static(path.join(__dirname, "BidWarsSVGs"))
);

app.use(
    "/GoldSVGs",
    express.static(path.join(__dirname, "GoldSVGs"))
);

function isAllowedOrigin(origin: string | undefined): boolean {
    if (!origin) {
        return true;
    }

    try {
        const u = new URL(origin);

        return (
            u.hostname === "localhost" &&
            (u.protocol === "http:" || u.protocol === "https:")
        );
    } catch (err) {
        return false;
    }
}

const corsOpts: CorsOptions = {
    origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
            return callback(null, true);
        }

        return callback(new Error("Not allowed by CORS"));
    },

    credentials: true,

    methods: [
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "OPTIONS"
    ],

    allowedHeaders: [
        "Content-Type",
        "Authorization"
    ],

    optionsSuccessStatus: 204,
};

app.use(cors(corsOpts));

app.use(express.json());
app.use(cookieParser());

app.use("/users", userRouter);
app.use("/auctions", auctionRouter);

app.post(
    "/",
    (req: Request, res: Response): void => {
        try {
            const { userid } = req.body as {
                userid: string;
            };

            const token: string | undefined =
                req.cookies[`token_${userid}`];

            console.log(token);

            if (!token) {
                res.status(401).json({
                    error: "No token provided"
                });

                return;
            }

            const secret = process.env.ACCESS_TOKEN_SECRET;

            if (!secret) {
                throw new Error(
                    "ACCESS_TOKEN_SECRET is undefined"
                );
            }

            const decoded = jwt.verify(token, secret);

            console.log(decoded);

            res.status(200).send("Server is up");

        } catch (err) {
            res.status(401).json({
                error: "Invalid token"
            });
        }
    }
);

async function startServer(): Promise<void> {
    try {
        const mongoURI = process.env.MONGODB_URI;

        if (!mongoURI) {
            throw new Error("MONGODB_URI is undefined");
        }

        await mongoose.connect(mongoURI);

        console.log("Connected to MongoDB Atlas");

        server.listen(3000, () => {
            console.log(
                "Server is running on port 3000"
            );
        });

        await initSocket(server, corsOpts);

    } catch (err) {
        console.error(
            "Failed to start server:",
            err
        );
    }
}

void startServer();