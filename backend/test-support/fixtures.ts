import { vi } from 'vitest';
import type Room from '../RedisRooms/Room';
import type { RoomRepository } from '../repositories/roomRepository';
export const item = {
    name: 'Watch', value: 150, bid: 25, range: '100-200', description: 'Vintage watch', audio_url: 'audioFiles/watch.mp3', img_url: 'watch.svg', bidder_id: 'alice', rarity: 'Pawnshop'
};
export const generated = {
    item: {
        item_name: 'Watch', item_value: 150, starting_bid: 25, item_guessing_range: '100-200', item_description: 'Vintage watch'
    }, category: 'watch', rarity: 'Pawnshop', audio_url: 'audioFiles/watch.mp3', img_url: 'watch.svg'
};
export function room(): Room {
    return {
        id: 'r1', users: [{ userid: 'alice', username: 'Alice', active: true }], auctionIndex: 0, auction: 'Garage', limit: 2, items: [], bid_options: [5, 10, 20], rounds: 3, in_progress: false, max: false, itemData: structuredClone(item)
    } as unknown as Room;
}
export function user() {
    return {
        roomid: 'r1', username: 'Alice', active: true, balance: 250, items: []
    };
}
export function storage() {
    const records = new Map<string, string>();
    const queues = new Map<string, string[]>();
    const client = {
        get: vi.fn(async (k: string) => records.get(k) ?? null), set: vi.fn(async (k: string, v: string) => {
            records.set(k, v);
        }), del: vi.fn(async (k: string) => {
            records.delete(k);
        }), lPop: vi.fn(async (k: string) => queues.get(k)?.shift() ?? null), lPush: vi.fn(async (k: string, v: string) => {
            const q = queues.get(k) ?? [];
            q.unshift(v);
            queues.set(k, q);
        })
    };
    return { records, queues, client };
}
export function repository() {
    const rooms = new Map([['r1', room()]]);
    const users = new Map([['alice', user()]]);
    const copy = <T>(v: T): T => structuredClone(v);
    const api = {
        getRoom: vi.fn(async (id: string) => {
            if (!rooms.has(id))
                throw new Error('Room missing');
            return copy(rooms.get(id)!);
        }),
        findRoom: vi.fn(async (id: string | null) => rooms.has(id!) ? copy(rooms.get(id!)!) : null),
        findRoomByKey: vi.fn(async () => null),
        saveRoom: vi.fn(async (id: string, v: Room) => {
            rooms.set(id, copy(v));
        }), deleteRoom: vi.fn(async (id: string) => {
            rooms.delete(id);
        }),
        getUser: vi.fn(async (id: string) => {
            if (!users.has(id))
                throw new Error('User missing');
            return copy(users.get(id)!);
        }),
        findUser: vi.fn(async (id: string) => users.has(id) ? copy(users.get(id)!) : null), userExists: vi.fn(async (id: string) => users.has(id)),
        saveUser: vi.fn(async (id: string, v: ReturnType<typeof user>) => {
            users.set(id, copy(v));
        }), deleteUser: vi.fn(async (id: string) => {
            users.delete(id);
        }),
        popRoomQueue: vi.fn(async (): Promise<string | null> => 'r1'), pushRoomQueue: vi.fn(async () => {
        })
    };
    return {
        rooms, users, api, dependency: api as unknown as RoomRepository
    };
}
export function socket(id = 's1', roomId = 'r1') {
    const handlers = new Map<string, Function>();
    const listeners = new Map<string, Function[]>();
    return {
        id, rooms: new Set([roomId]), handlers,
        user: { userid: 'alice', username: 'Alice' }, auctionIndex: 1,
        session: undefined as any, emit: vi.fn(), join: vi.fn(),
        on: vi.fn((event: string, fn: Function) => {
            listeners.set(event, [...(listeners.get(event) ?? []), fn]);
            handlers.set(event, (...args: unknown[]) => Promise.all((listeners.get(event) ?? []).map(listener => listener(...args))).then(() => undefined));
        }),
        off: vi.fn((event: string, fn: Function) => {
            listeners.set(event, (listeners.get(event) ?? []).filter(listener => listener !== fn));
            if (!listeners.get(event)?.length)
                handlers.delete(event);
        })
    };
}
export function socketServer() {
    const s = socket();
    const other = socket('s2', 'other');
    const events: Array<{
        room: string;
        event: string;
        data: any;
    }> = [];
    const io = {
        sockets: { sockets: new Map([[s.id, s], [other.id, other]]) }, use: vi.fn(), on: vi.fn(), to: vi.fn((r: string) => ({ emit: vi.fn((event: string, data: any) => {
                events.push({ room: r, event, data });
            }) })), in: vi.fn(() => ({ disconnectSockets: disconnect })), events
    };
    function disconnect() {
        disconnected();
    }
    const disconnected = vi.fn();
    return {
        io, s, other, disconnected
    };
}
