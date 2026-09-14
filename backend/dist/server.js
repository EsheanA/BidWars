"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = __importDefault(require("mongoose"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path_1 = __importDefault(require("path"));
require("dotenv/config");
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const auctionRoutes_1 = __importDefault(require("./routes/auctionRoutes"));
const index_1 = require("./socket/index");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const ONE_DAY = 24 * 60 * 60 * 1000;
app.use("/audioFiles", express_1.default.static(path_1.default.join(__dirname, "audioFiles"), {
    maxAge: ONE_DAY,
    etag: true,
    setHeaders(res) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    },
}));
app.use("/BidWarsSVGs", express_1.default.static(path_1.default.join(__dirname, "BidWarsSVGs")));
app.use("/GoldSVGs", express_1.default.static(path_1.default.join(__dirname, "GoldSVGs")));
function isAllowedOrigin(origin) {
    if (!origin) {
        return true;
    }
    try {
        const u = new URL(origin);
        return (u.hostname === "localhost" &&
            (u.protocol === "http:" || u.protocol === "https:"));
    }
    catch (err) {
        return false;
    }
}
const corsOpts = {
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
app.use((0, cors_1.default)(corsOpts));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
app.use("/users", userRoutes_1.default);
app.use("/auctions", auctionRoutes_1.default);
app.post("/", (req, res) => {
    try {
        const { userid } = req.body;
        const token = req.cookies[`token_${userid}`];
        console.log(token);
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
        console.log(decoded);
        res.status(200).send("Server is up");
    }
    catch (err) {
        res.status(401).json({
            error: "Invalid token"
        });
    }
});
async function startServer() {
    try {
        const mongoURI = process.env.MONGODB_URI;
        if (!mongoURI) {
            throw new Error("MONGODB_URI is undefined");
        }
        await mongoose_1.default.connect(mongoURI);
        console.log("Connected to MongoDB Atlas");
        server.listen(3000, () => {
            console.log("Server is running on port 3000");
        });
        await (0, index_1.initSocket)(server, corsOpts);
    }
    catch (err) {
        console.error("Failed to start server:", err);
    }
}
void startServer();
//# sourceMappingURL=server.js.map