import { describe, it, expect } from 'vitest';
import router from './auctionRoutes';
import { invoke } from '../test-support/routes';
describe('GET /auctions', () => {
    it('should return auction data as JSON with a successful retrieval status', async () => {
        const result = await invoke(router, '/', 'get');
        expect(result.json).toHaveBeenCalledOnce();
        expect(result.body).toMatchObject({ success: true, auctions: expect.any(Array) });
        expect(result.body.auctions).toHaveLength(3);
        expect(result.body.auctions[0]).toMatchObject({ name: 'Garage', start: 0, end: 250 });
        expect(result.statusCode).toBe(200);
    });
});
