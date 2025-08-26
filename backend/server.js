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
const {createVoicelines} = require('./ollama/child.js')
app.use('/audioFiles', express.static(path.join(__dirname, 'audioFiles')));
app.use('/BidWarsSVGs', express.static(path.join(__dirname, 'BidWarsSVGs')));
app.use('/GoldSVGs', express.static(path.join(__dirname, 'GoldSVGs')));

function validateOrigin(origin) {
  const originSlice = origin.slice(0, 17)
  if (originSlice === "http://localhost:") {
    return true;
  }
  return false;
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
app.use(cors(corsOpts));  

app.use(express.json())
app.use(cookieParser());
app.use('/users', userRouter);
app.use('/auctions', auctionRouter);


app.post('/', (req, res) => {
  try {
    // console.log("wtf")
    const {userid} = req.body
    const token = req.cookies[`token_${userid}`]
    console.log(token)
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    console.log(decoded)
    if(decoded){
      res.status(200).send('Server is up');
    }
    else{
      console.log("Invalid token")
      res.status(401).json({ error: 'Invalid token' });
    }
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

async function distributeItems(postgamedata){
  const usermap = new Map()
  for(let round of postgamedata){
    const currUser = round.user;
    const currItem = round.item;
    const bid = round.bid;
    const {userid, username} = currUser;
    const balance = usermap.get(userid)
    const {name, value, url} =  currItem;

    if(balance){
      usermap.set(userid, balance+bid)
    }
    else{
      usermap.set(userid, bid)
    }
    const hashcode = crypto.createHash('sha256').update(name + userid).digest('hex'); //item hash composed of item name & userid
    const existingItem = await Item.findOne(
      {hashcode: hashcode}
    )
    if(existingItem){
      const result = await Item.findOneAndUpdate(
        { hashcode: hashcode},
        { $inc: { amount: 1 } }
      );
    }
    else{
      const newItem = new Item({
        hashcode: hashcode,
        name,
        value,
        url,
        amount: 1,
        owner: userid
      })
      await newItem.save()
    }
  }

  for(let key of usermap.keys()){
    const decrement = usermap.get(key)
    const result = await User.updateOne(
      { _id: key },
      { $inc: { balance: -decrement } }
    );
  }
}
 
  







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