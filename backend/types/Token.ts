export interface AccessTokenUser {
    _id: string;
    username: string;
}

export interface RoomAccessTokenUser {
    _id: string;
    username: string;
}
export interface AccessTokenClaims {
    userid: string;
    username: string;
    purpose: 'access';
    iat: number;
    exp: number;
}

export interface RoomTokenClaims extends Omit<AccessTokenClaims, 'purpose'> {
    purpose: 'room';
    roomid: string;
}
