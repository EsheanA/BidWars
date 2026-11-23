import jwt from 'jsonwebtoken';
import type { AccessTokenClaims, RoomTokenClaims } from '../types/Token';

function nonempty(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function verify(token: unknown, purpose: 'access' | 'room', expectedUserId: unknown) {
    const secret = process.env.ACCESS_TOKEN_SECRET;
    if (!secret) throw new Error('ACCESS_TOKEN_SECRET is undefined');
    if (!nonempty(token) || !nonempty(expectedUserId)) throw new Error('Invalid token identity');
    const claims = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof claims === 'string' || claims.purpose !== purpose ||
        !nonempty(claims.userid) || !nonempty(claims.username) ||
        claims.userid !== expectedUserId ||
        !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) ||
        claims.exp! <= claims.iat!) {
        throw new Error('Invalid token claims');
    }
    return claims;
}

export function verifyAccessToken(token: unknown, expectedUserId: unknown): AccessTokenClaims {
    return verify(token, 'access', expectedUserId) as AccessTokenClaims;
}

export function verifyRoomAccessToken(token: unknown, expectedUserId: unknown): RoomTokenClaims {
    const claims = verify(token, 'room', expectedUserId);
    if (!nonempty(claims.roomid)) throw new Error('Invalid room token claims');
    return claims as RoomTokenClaims;
}
