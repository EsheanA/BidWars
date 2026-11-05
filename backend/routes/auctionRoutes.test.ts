import request from "supertest";
import { describe, it, expect } from "vitest";
import app from "../app";

describe("GET /auctions", () => {
    it("should return auction data as JSON", async () => {
        const response = await request(app)
            .get("/auctions");

        expect(response.status).toBe(200);
        expect(response.headers["content-type"])
            .toMatch(/json/);

        expect(response.body).toHaveProperty("auctions");
        expect(response.body.auctions).toHaveLength(3);
    });
});