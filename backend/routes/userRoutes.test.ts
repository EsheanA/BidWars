import request from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import User from "../models/User";
import app from "../app";

vi.mock("../models/User", () => ({
    default: {
        findOne: vi.fn(),
        create: vi.fn()
    }
}));

describe("POST /users/signup", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });


    it("should sucessfully signup a new user", async () => {
        const newUser = {
            username: "testuser",
            password: "SecurePassword123!"
        };

        vi.spyOn(User, "findOne")
        .mockResolvedValue(null);

        const saveMock = vi.spyOn(User.prototype, "save")
            .mockImplementation(async function () {
                return this;
        });

        const response = await request(app)
        .post("/api/signup")
        .send(newUser);

        expect(response.status).toBe(201);
        expect(User.findOne).toHaveBeenCalled();
        expect(saveMock).toHaveBeenCalledOnce();
    });

    it("should reject an existing email", async () => {
        vi.mocked(User.findOne).mockResolvedValue({
            _id: "123",
            email: "test@example.com"
        } as any);

        const response = await request(app)
            .post("/api/signup")
            .send({
                username: "testuser",
                password: "SecurePassword123!"
            });

        expect(response.status).toBe(409);
        expect(User.create).not.toHaveBeenCalled();
    });
});

describe("POST /users/login", () => {
    beforeEach(async () => {
        await User.deleteMany({
            email: /@example\.test$/
        });
    });
    it("it should sucessfully login an existing user", async () => {
      
    });
});