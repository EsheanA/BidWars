import auctionData from "./auctionz.json";

export class InvalidAuctionIndexError extends Error {
    constructor() {
        super(`Invalid auction index: expected an integer from 0 to ${auctionData.auctions.mainline_auctions.length - 1}`);
        this.name = "InvalidAuctionIndexError";
    }
}

/** Internal callers must supply a numeric index, not a coercible value. */
export function assertAuctionIndex(index: unknown): asserts index is number {
    if (typeof index !== "number" || !Number.isInteger(index) ||
        index < 0 || index >= auctionData.auctions.mainline_auctions.length) {
        throw new InvalidAuctionIndexError();
    }
}

export function getAuction(index: unknown) {
    assertAuctionIndex(index);
    return auctionData.auctions.mainline_auctions[index]!;
}

/** Socket query values are strings; normalize once at the transport boundary. */
export function parseAuctionIndex(value: unknown): number {
    if (typeof value !== "string" || value.trim() !== value || !/^\d+$/.test(value)) {
        throw new InvalidAuctionIndexError();
    }
    const index = Number(value);
    getAuction(index);
    return index;
}
