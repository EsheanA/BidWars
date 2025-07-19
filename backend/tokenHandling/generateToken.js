const jwt = require('jsonwebtoken');

const generateAccessToken = (user) => {
    return jwt.sign({ userid: user._id, username: user.username }, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "5m",
    });
  };
  
  const generateRoomAccessToken = (user, roomid) => {
    return jwt.sign({ userid: user.userid, username: user.username, roomid }, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "5m",
    });
  }

module.exports = { generateAccessToken, generateRoomAccessToken};