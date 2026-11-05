import { describe, it, expect } from 'vitest';
import auctionData from './auctionz.json';
import { getAuction, parseAuctionIndex, InvalidAuctionIndexError } from './auctionIndex';
import { boundaryIndexes, invalidInternalCases, invalidQueryCases } from '../test-support/auctionIndexes';

describe('auction-index validation', () => {
    it.each(boundaryIndexes)('accepts boundary index %s and normalizes its query string', index => {
        expect(getAuction(index)).toBe(auctionData.auctions.mainline_auctions[index]);
        expect(parseAuctionIndex(String(index))).toBe(index);
    });
    it.each(invalidInternalCases)('rejects internal indexes with %s', (_rule, values) => {
        for (const value of values) expect(() => getAuction(value)).toThrow(InvalidAuctionIndexError);
    });
    it.each(invalidQueryCases)('rejects query indexes with %s', (_rule, values) => {
        for (const value of values) expect(() => parseAuctionIndex(value)).toThrow(InvalidAuctionIndexError);
    });
});
