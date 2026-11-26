import express, { Request, Response } from "express";
import cors from "cors";
import { createCorsOptions } from "./config/cors";
import { verifyAccessToken } from "./tokenHandling/verifyToken";
import cookieParser from "cookie-parser";
import path from "path";
import { assetPaths } from "./config/assets";
import { getAudioStore } from "./storage/audioStore";

import userRouter from "./routes/userRoutes";
import auctionRouter from "./routes/auctionRoutes";

const app = express();

export const corsOpts = createCorsOptions();
app.use(cors(corsOpts));

app.use('/audioFiles', express.static(getAudioStore().directory, {
    maxAge: 24 * 60 * 60 * 1000,
    etag: true,
    setHeaders(res) { res.setHeader('Cache-Control', 'public, max-age=86400, immutable'); }
}));

app.use(
    "/BidWarsSVGs",
    express.static(path.join(assetPaths().staticRoot, "BidWarsSVGs"))
);

app.use(
    "/GoldSVGs",
    express.static(path.join(assetPaths().staticRoot, "GoldSVGs"))
);

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

            if (!token) {
                res.status(401).json({
                    error: "No token provided"
                });

                return;
            }

            verifyAccessToken(token, userid);

            res.status(200).send("Server is up");

        } catch (err) {
            res.status(401).json({
                error: "Invalid token"
            });
        }
    }
);

export default app;
