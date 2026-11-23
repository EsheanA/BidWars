import type { Socket } from 'socket.io';
import type { AccessTokenClaims, RoomTokenClaims } from '../types/Token';

export interface AuthSocket extends Socket {
    user?: AccessTokenClaims;
    session?: RoomTokenClaims;
    auctionIndex?: number;
    // Set by the server only after joining an authorized room.
    data: { userid?: string; roomid?: string };
}
