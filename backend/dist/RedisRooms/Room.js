"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const uuidv4_1 = require("uuidv4");
const auctionz_json_1 = __importDefault(require("../auctions/auctionz.json"));
class Room {
    id;
    users;
    auctionIndex;
    auction;
    limit;
    items;
    bid_options;
    rounds;
    in_progress;
    max;
    itemData;
    constructor(auctionName, auctionIndex) {
        this.id = (0, uuidv4_1.uuid)();
        this.users = [];
        this.auctionIndex = auctionIndex;
        this.auction = auctionName;
        this.limit = 2;
        this.items = [];
        this.bid_options = this.setBidOptions(auctionIndex);
        this.rounds = 3;
        this.in_progress = false;
        this.max = false;
        this.itemData = null;
    }
    setBidOptions(auctionIndex) {
        const mainline_auctions = auctionz_json_1.default.auctions.mainline_auctions;
        return mainline_auctions[auctionIndex]?.bid_options;
    }
}
exports.default = Room;
//# sourceMappingURL=Room.js.map