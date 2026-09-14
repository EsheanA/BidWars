"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const openai_1 = __importDefault(require("openai"));
const zod_1 = require("openai/helpers/zod");
const zod_2 = require("zod");
const fs_1 = require("fs");
const promises_1 = require("stream/promises");
const auctionz_json_1 = __importDefault(require("../auctions/auctionz.json"));
const uuid_1 = require("uuid");
const dotenv_1 = __importDefault(require("dotenv"));
const node_stream_1 = require("node:stream");
dotenv_1.default.config();
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function generateItemCategory(auction) {
    return auction.items[getRandomInt(0, auction.items.length - 1)];
}
function chooseRarity(rarities, len) {
    const percentage = getRandomInt(1, 100);
    var decr = 50;
    let i = 0;
    for (i; i < len && percentage < decr; i++) {
        decr /= 2;
    }
    return rarities[i];
}
async function callGrok(auctionIndex) {
    try {
        //finds auction
        const auction = auctionz_json_1.default.auctions.mainline_auctions[auctionIndex];
        const auction_name = auction.name;
        const value_range = auction.value_range;
        const rarities = auctionz_json_1.default.auctions.rarities;
        const rarityChoices = auction.rarities;
        const rarity = chooseRarity(rarities, rarityChoices);
        const category = generateItemCategory(auction);
        const client = new openai_1.default({
            apiKey: process.env.GROK_KEY,
            baseURL: "https://api.x.ai/v1",
        });
        const itemSchema = zod_2.z.object({
            item_name: zod_2.z
                .string()
                .max(30, "keep 30 chars max")
                .describe("Item name, maximum 30 characters"),
            item_value: zod_2.z.number(),
            item_guessing_range: zod_2.z.string(),
            item_description: zod_2.z.string(),
            starting_bid: zod_2.z.number()
        });
        const response = await client.chat.completions.parse({
            model: "grok-3-mini",
            messages: [
                {
                    role: "system",
                    content: "You are to talk like an auctioneer. Return ONLY JSON per schema. " +
                        "Constraints: value within value_range; guessing_range within value_range; " +
                        `On the rarity scale: ${rarities}, this item is: ${rarity};` +
                        "starting_bid consistent with guessing_range; Introduce item with a crazy funny description (similar to cards against humanity) using popculture references,controversies,and rarity; description ends with the starting bid in dollars and is max 25 words;Item should be realistic to chosen auction,rarity, and value."
                },
                {
                    role: "user",
                    content: JSON.stringify({
                        category,
                        value_range,
                        auction_name,
                        rarity,
                        rarity_scale: rarities
                    })
                }
            ],
            response_format: (0, zod_1.zodResponseFormat)(itemSchema, "schema"),
            temperature: 1.2
        });
        const choice = response.choices[0];
        if (!choice) {
            throw new Error("No completion choice returned");
        }
        const schema = choice.message.parsed;
        console.log(schema);
        const responseTTS = await fetch("https://api.lemonfox.ai/v1/audio/speech", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.LEMON_FOX_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "lemon-fox-v1",
                input: schema?.item_description,
                voice: "adam",
                response_format: "mp3"
            })
        });
        // console.log("STATUS:", responseTTS.status);
        // console.log("CONTENT-TYPE:", responseTTS.headers.get("content-type"));
        const filename = schema?.item_name.replaceAll(" ", "_");
        const unique = (0, uuid_1.v4)();
        const fileStream = (0, fs_1.createWriteStream)(`audioFiles/${filename}_${unique}.mp3`, { flags: "wx" });
        const body = responseTTS.body;
        await (0, promises_1.finished)(node_stream_1.Readable.fromWeb(body).pipe(fileStream));
        return (Promise.resolve(JSON.stringify({ item: schema, category, rarity, audio_url: `audioFiles/${filename}_${unique}.mp3`, img_url: `${category}.svg` })));
    }
    catch (error) {
        console.error("Grok call failed: ", error);
        return (Promise.reject(error));
    }
}
exports.default = callGrok;
//# sourceMappingURL=grok.js.map