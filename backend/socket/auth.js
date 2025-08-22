const cookie = require("cookie");
const jwt = require('jsonwebtoken');
const redisRoomHandler = require('../RedisRooms/RoomHandler')
const { promisify } = require('util')
require('dotenv').config();


const verifyJwt = promisify(jwt.verify)
socketAuth = async (socket, next) => {
    const { roomToken } = socket.handshake.auth;
    const { auction } = socket.handshake.query

    if (roomToken) {
        const session = await verifyJwt(roomToken, process.env.ACCESS_TOKEN_SECRET, {
            algorithms: ["HS256"]
        })
        if(session){
            if ( !(await redisRoomHandler.checkGameStarted(session.roomid)) || !(await redisRoomHandler.userExist(session.userid))) {
                return next(new Error("Authentication error"))
            }
            else{
                socket.session = session;
                return next();
            }
        }else{
            return next(new Error("Authentication error"))
        }
        // return jwt.verify(roomToken, process.env.ACCESS_TOKEN_SECRET, (err, session) => {
        // if (err || !(redisRoomHandler.userExist(session.userid))) {
        //     return next(new Error("Authentication error"))
        // }
        // else{
        //     socket.session = session;
        //     return next();
        // }
        // });
    } 
    else {
        const rawCookie = socket.handshake.headers.cookie || "";
        const parsedCookies = cookie.parse(rawCookie)
        const userid  = socket.handshake.auth.userid;
        const accessToken = parsedCookies[`token_${userid}`]
        
        jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
            if (err) {
                return next(new Error("Authentication error"))
            }
            else{
                socket.auctionName = auction;
                socket.user = user;
                return next();
            }
        });
    }
};

module.exports = {socketAuth}