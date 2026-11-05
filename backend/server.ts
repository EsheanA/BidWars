import "dotenv/config";
import http from "http";
import mongoose from "mongoose";

import app, { corsOpts } from "./app";
import { initSocket } from "./socket/index";

const server = http.createServer(app);

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
