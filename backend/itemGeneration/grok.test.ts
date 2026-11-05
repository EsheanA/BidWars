import { boundaryIndexes, invalidInternalIndexes } from '../test-support/auctionIndexes';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generated } from '../test-support/fixtures';
const deps = vi.hoisted(() => ({
    parse: vi.fn(), write: vi.fn(), finished: vi.fn(), fromWeb: vi.fn(), pipe: vi.fn()
}));
vi.mock('openai', () => ({ default: vi.fn(function () {
        return { chat: { completions: { parse: deps.parse } } };
    }) }));
vi.mock('fs', () => ({ createWriteStream: deps.write }));
vi.mock('stream/promises', () => ({ finished: deps.finished }));
vi.mock('node:stream', () => ({ Readable: { fromWeb: deps.fromWeb } }));
vi.mock('uuid', () => ({ v4: vi.fn() }));
import { v4 } from 'uuid';
import callGrok from './grok';
let fetchMock: any;
beforeEach(() => {
    vi.clearAllMocks();
    deps.parse.mockResolvedValue({ choices: [{ message: { parsed: generated.item } }] });
    deps.write.mockReturnValue({ output: true });
    deps.fromWeb.mockReturnValue({ pipe: deps.pipe });
    deps.pipe.mockReturnValue({ done: true });
    deps.finished.mockResolvedValue(undefined);
    vi.mocked(v4).mockReturnValueOnce('id-one' as any).mockReturnValueOnce('id-two' as any);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    fetchMock = vi.fn(async () => ({ body: { audio: true }, ok: true }));
    vi.stubGlobal('fetch', fetchMock);
});
describe("callGrok item and speech generation", () => {
    describe("item selection and generation", () => {
        it("should select an item category from the chosen auction's configured categories", async () => {
            const data = JSON.parse(await callGrok(0));
            expect([
                'animal', 'jewelry', 'gem', 'vintage_beverage', 'collector_coin', 'trading_cards', 'shoe', 'trophy', 'condom'
            ]).toContain(data.category);
        });
        it("should include the selected auction, category, rarity, and value range in the generation request", async () => {
            await callGrok(0);
            const req = deps.parse.mock.calls[0]![0];
            expect(JSON.parse(req.messages[1].content)).toMatchObject({ auction_name: 'Garage', value_range: [0, 250], rarity: 'Pawnshop' });
        });
        it("should request structured item data with the application's item schema", async () => {
            await callGrok(0);
            const format = deps.parse.mock.calls[0]![0].response_format;
            expect(format.type).toBe('json_schema');
            expect(format.json_schema.schema.required).toEqual(expect.arrayContaining(['item_name', 'item_value', 'starting_bid']));
        });
        it("should reject when item generation fails or returns no completion choices", async () => {
            deps.parse.mockRejectedValueOnce(new Error('provider offline'));
            await expect(callGrok(0)).rejects.toThrow('provider offline');
            expect(fetchMock).not.toHaveBeenCalled();
            deps.parse.mockResolvedValueOnce({ choices: [] });
            await expect(callGrok(0)).rejects.toThrow('No completion');
        });
    });
    describe("speech and returned media", () => {
        it("should generate MP3 speech from the generated item description", async () => {
            await callGrok(0);
            const req = fetchMock.mock.calls[0];
            expect(req[0]).toContain('/audio/speech');
            expect(JSON.parse(req[1].body)).toMatchObject({ input: 'Vintage watch', response_format: 'mp3' });
        });
        it("should produce a distinct audio filename for separate generated items with the same name", async () => {
            const a = JSON.parse(await callGrok(0)), b = JSON.parse(await callGrok(0));
            expect(a.audio_url).not.toBe(b.audio_url);
            expect(deps.write).toHaveBeenCalledWith(a.audio_url, { flags: 'wx' });
        });
        it("should return JSON containing the item, category, rarity, audio URL, and category SVG filename", async () => {
            const result = JSON.parse(await callGrok(0));
            expect(result).toMatchObject({
                item: generated.item, category: 'condom', rarity: 'Pawnshop', img_url: 'condom.svg'
            });
            expect(result.audio_url).toBe('audioFiles/Watch_id-one.mp3');
        });
        it("should return the audio URL only after the mocked output stream finishes successfully", async () => {
            let finish!: () => void;
            deps.finished.mockReturnValueOnce(new Promise<void>(r => {
                finish = r;
            }));
            let done = false;
            const task = callGrok(0).then(v => {
                done = true;
                return v;
            });
            await vi.waitFor(() => expect(deps.finished).toHaveBeenCalled());
            expect(done).toBe(false);
            finish();
            expect(JSON.parse(await task).audio_url).toContain('.mp3');
        });
        it("should reject a failed speech request or failed audio-file write", async () => {
            fetchMock.mockRejectedValueOnce(new Error('speech offline'));
            await expect(callGrok(0)).rejects.toThrow('speech offline');
            expect(deps.write).not.toHaveBeenCalled();
            deps.write.mockImplementationOnce(() => {
                throw new Error('disk full');
            });
            await expect(callGrok(0)).rejects.toThrow('disk full');
        });
    });
    describe("Auction-index regressions", () => {
        it("should reject an invalid auction selection before calling either external provider", async () => {
            for (const value of invalidInternalIndexes) {
                await expect(callGrok(value as number)).rejects.toThrow('Invalid auction index');
            }
            expect(deps.parse).not.toHaveBeenCalled();
            expect(fetchMock).not.toHaveBeenCalled();
            expect(deps.write).not.toHaveBeenCalled();
            expect(Math.random).not.toHaveBeenCalled();
        });
    });
});
it.each(boundaryIndexes)('generates an item for boundary auction %s', async (index) => {
    const result = JSON.parse(await callGrok(index));
    expect(result.item).toEqual(generated.item);
    expect(deps.parse).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
});
