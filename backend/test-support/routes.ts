import { vi } from 'vitest';
import type { Router } from 'express';
// Execute the actual registered middleware/handlers without opening an HTTP listener.
export async function invoke(router: Router, path: string, method: string, body: unknown = {}, cookies: Record<string, string> = {}) {
    const route = router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method])?.route;
    if (!route)
        throw new Error(`Missing route ${method} ${path}`);
    const req: any = { body, cookies };
    const res: any = {
        statusCode: 200, body: undefined, status: vi.fn(function (this: any, n: number) {
            this.statusCode = n;
            return this;
        }), json: vi.fn(function (this: any, v: unknown) {
            this.body = v;
            return this;
        }), cookie: vi.fn(function (this: any) {
            return this;
        }), clearCookie: vi.fn(function (this: any) {
            return this;
        })
    };
    for (const layer of route.stack) {
        let next = false;
        await layer.handle(req, res, () => {
            next = true;
        });
        if (!next)
            break;
    }
    return res;
}
