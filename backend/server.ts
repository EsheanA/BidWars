import 'dotenv/config';
import http from 'http';
import mongoose from 'mongoose';
import type { Server as SocketServer } from 'socket.io';

import app, { corsOpts } from './app';
import { initSocket, closeSocket } from './socket/index';
import redisRoomHandler from './RedisRooms/RoomHandler';
import { getAudioStore } from './storage/audioStore';

const server = http.createServer(app);
let io: SocketServer | undefined;
let stopping = false;
let started = false;
let shutdownPromise: Promise<void> | undefined;

function getPort(): number {
    const value = process.env.PORT ?? '3000';
    if (!/^\d+$/.test(value) || !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 65535) {
        throw new Error('PORT must be an integer between 1 and 65535');
    }
    return Number(value);
}

async function startServer(): Promise<void> {
    const port = getPort();
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI?.trim()) throw new Error('MONGODB_URI is undefined');

    await getAudioStore().initialize();
    if (stopping) return;
    await mongoose.connect(mongoURI);
    if (stopping) return;
    console.log('Connected to MongoDB Atlas');

    io = await initSocket(server, corsOpts);
    if (stopping) return;

    await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        server.once('error', onError);
        server.listen(port, '0.0.0.0', () => {
            server.off('error', onError);
            resolve();
        });
    });
    started = true;
    console.log(`Server is running on port ${port}`);
}

function shutdown(): Promise<void> {
    return shutdownPromise ??= (async () => {
        stopping = true;
        console.log('Shutting down server');
        // Leave time for the platform to terminate us after this bounded drain.
        const deadline = setTimeout(() => {
            console.error('Server shutdown timed out');
            process.exit(1);
        }, 8000);
        deadline.unref();
        let failed = false;
        try {
            // A connecting Redis client must be cancelled before awaiting startup.
            if (!started) await redisRoomHandler.closeClient(true);
            await startup.catch(() => undefined);
            if (io) await closeSocket(io); // Stops games, disconnects sockets and closes HTTP.
            else if (server.listening) {
                await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            }
        } catch (error) {
            failed = true;
            process.exitCode = 1;
            console.error('Failed to stop server:', error);
        } finally {
            const results = await Promise.allSettled([
                redisRoomHandler.closeClient(), mongoose.disconnect()
            ]);
            for (const result of results) {
                if (result.status === 'rejected') {
                    failed = true;
                    process.exitCode = 1;
                    console.error('Failed to close database connection:', result.reason);
                }
            }
            clearTimeout(deadline);
            process.off('SIGTERM', onSignal);
            process.off('SIGINT', onSignal);
            // A failed close may leave live handles; do not keep accepting traffic.
            if (failed) process.exit(1);
        }
    })();
}

const onSignal = () => { void shutdown(); };
process.on('SIGTERM', onSignal);
process.on('SIGINT', onSignal);
const startup = startServer();
void startup.catch(error => {
    if (stopping) return;
    console.error('Failed to start server:', error);
    process.exitCode = 1;
    void shutdown();
});
