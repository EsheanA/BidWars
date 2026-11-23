import auctionData from '../auctions/auctionz.json';

export const auctionCount = auctionData.auctions.mainline_auctions.length;
export const boundaryIndexes = [0, auctionCount - 1];

// Each row is one explainable validation rule; inputs in a row share that rule.
export const invalidInternalCases: [string, unknown[]][] = [
    ['missing values', [undefined, null]],
    ['text instead of a numeric index', ['', ' ', '0', 'not-a-number']],
    ['fractional or out-of-range numbers', [0.5, -1, auctionCount]],
    ['structured or boolean values', [[], [0], {}, true]],
    ['non-finite numbers', [NaN, Infinity, -Infinity]],
];
export const invalidQueryCases: [string, unknown[]][] = [
    ['missing or blank input', [undefined, null, '', ' ', '\t']],
    ['invalid numeric strings', ['nope', '0.5', '-1', 'NaN', 'Infinity', String(auctionCount)]],
    ['non-string input', [['0'], [], {}, true, 0]],
    ['surrounding whitespace', [' 0', '0 ', '0\n', '0\r\n']],
    ['alternative numeric notation', ['1e0', '0x0', '+0']],
];

// Boundary tests prove that callers actually invoke validation. The exhaustive
// input rules live in auctionIndex.test.ts rather than being repeated per caller.
export const invalidInternalIndexes: unknown[] = [undefined, '0', -1, auctionCount];
export const invalidQueryIndexes: unknown[] = [undefined, '', ['0'], String(auctionCount)];
