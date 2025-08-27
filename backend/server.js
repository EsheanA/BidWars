const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);

const userRouter = require('./routes/userRoutes.js');
const auctionRouter = require('./routes/auctionRoutes.js');

const cors = require('cors')
const jwt = require('jsonwebtoken')
require('dotenv').config()
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const Item = require('./models/Item');
const User = require('./models/User')
const { initSocket } = require("./socket/index.js")

// app.use(express.static(path.join(__dirname, 'public')));

const path = require('path');
app.use('/audioFiles', express.static(path.join(__dirname, 'audioFiles')));
app.use('/BidWarsSVGs', express.static(path.join(__dirname, 'BidWarsSVGs')));
app.use('/GoldSVGs', express.static(path.join(__dirname, 'GoldSVGs')));

function validateOrigin(origin) {
  if (origin === "https://bid-wars-ten.vercel.app") {
    return true;
  }
  else {
    const originSlice = origin.slice(0, 17)
    if (originSlice === "http://localhost:") {
      return true;
    }
    return false;
  }

}


const corsOpts = {
  origin: function (origin, callback) {
        if (!origin || validateOrigin(origin)) {
          return callback(null, true);
        }
        else
          return callback(new Error('Not allowed by CORS'));
      },
      credentials: true
}

// const corsOpts = {
//   origin: validateOrigin,
//   credentials: true,
//   methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization"],
// }
app.use(cors(corsOpts));

app.use(express.json())
app.use(cookieParser());
app.use('/users', userRouter);
app.use('/auctions', auctionRouter);


app.post('/', (req, res) => {
  try {
    // console.log("wtf")
    const { userid } = req.body
    const token = req.cookies[`token_${userid}`]
    console.log(token)
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    console.log(decoded)
    if (decoded) {
      res.status(200).send('Server is up');
    }
    else {
      console.log("Invalid token")
      res.status(401).json({ error: 'Invalid token' });
    }
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});



async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log("Connected to MongoDB Atlas")

    server.listen(3000, () => {
      console.log(`Server is running on port 3000`);
    });

    await initSocket(server, corsOpts)


  } catch (err) {
    console.error('Failed to start server:', err);
  }
}
startServer();