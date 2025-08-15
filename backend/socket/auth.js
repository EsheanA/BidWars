const cookie = require("cookie");
const jwt = require('jsonwebtoken');
require('dotenv').config();

socketAuth = async (socket, next) => {
    const { roomToken } = socket.handshake.auth;
    const { auction } = socket.handshake.query
    if (roomToken) {
        return jwt.verify(roomToken, process.env.ACCESS_TOKEN_SECRET, (err, session) => {
        if (err || !rooms.roomExist(session.roomid)) {
            return next(new Error("Authentication error"))
        }
        else{
            socket.session = session;
            return next();
        }
        });
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
            // console.log(user)
                socket.auctionName = auction;
                socket.user = user;
                console.log(user)
                return next();
            }
        });
    }
};

module.exports = {socketAuth}