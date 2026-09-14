"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auctionz_json_1 = __importDefault(require("../auctions/auctionz.json"));
const router = express_1.default.Router();
router.get("/", async (req, res) => {
    try {
        const auctions = auctionz_json_1.default.auctions.mainline_auctions;
        const data = [];
        auctions.forEach((auction, index) => {
            const start = auction.value_range[0];
            const end = auction.value_range[1];
            data[index] = {
                name: auction.name,
                image: auction.name + ".png",
                start,
                end,
                color: auction.color,
                items: auction.items
            };
        });
        console.log("mainline auctions: ", auctions);
        res.status(201).json({
            success: true,
            auctions: data
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({
            error: "Fetching auctions failed"
        });
    }
});
exports.default = router;
//# sourceMappingURL=auctionRoutes.js.map