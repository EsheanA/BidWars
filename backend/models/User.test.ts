import { describe, it, expect } from 'vitest';
import User from './User';
describe("User document validation", () => {
    it("should accept an unsaved user with a username, password hash, and numeric balance", async () => {
        expect(new User({ username: 'Alice', passwordHash: 'hash', balance: 500 }).validateSync()).toBeUndefined();
    });
    it("should reject an unsaved user missing a username or password hash", async () => {
        for (const key of ['username', 'passwordHash']) {
            const data: any = { username: 'Alice', passwordHash: 'hash', balance: 500 };
            delete data[key];
            expect(new User(data).validateSync()?.errors).toHaveProperty(key);
        }
    });
    it("should require a numeric balance while accepting a zero balance", async () => {
        expect(new User({ username: 'A', passwordHash: 'hash', balance: 0 }).validateSync()).toBeUndefined();
        for (const balance of [undefined, 'nonnumeric'])
            expect(new User({ username: 'A', passwordHash: 'hash', balance }).validateSync()?.errors).toHaveProperty('balance');
    });
    describe("Proposed validation requiring approval: D10 in TEST_OUTLINES.md", () => {
        it.todo("should reject a negative or non-finite user balance");
    });
});
