const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { generateAccessToken, generateRoomAccessToken } = require('../tokenHandling/generateToken');
const {generateItems} = require('../itemGeneration/generateItems')
const router = express.Router();

router.post('/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne(
            {
                username
            });
        if (existingUser)
            return res.status(409).json(
                { error: 'Username or email already taken' });
        const passwordHash = await bcrypt.hash(password, 10);
        const newUser = new User({
            username, passwordHash, balance: 500
        });
        await newUser.save();
        res.status(201).json({ success: true, message: 'New User Created' })
        // res.json({ token });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Signup failed' });
    }
});


router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(401).json({
            error: 'Invalid credentials'
        });
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return res.status(401).json({
            error:
                'Invalid credentials'
        });

        const accessToken = generateAccessToken(user)

        res.cookie(`token_${user._id}`, accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        }).json({ userid: user._id, username: user.username, balance: user.balance});



        // res.status(201).json({ message: "login successful", user })


    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});





router.post('/logout', async (req, res) => {
    try {
        const { userid } = req.body
        res.clearCookie(`token_${userid}`, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict'
        });
        res.json({ message: 'Logged out successfully' });

    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Logout error' })
    }
})

router.post('/me', async (req, res) => {
    const {userid} = req.body
    const token = req.cookies[`token_${userid}`]
    console.log(token)
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    console.log(decoded)
    if(decoded){
        const user = await User.findOne({ _id: userid });
        res.status(200).json({userid: user._id, username: user.username, balance: user.balance});
    }
    else{
        res.status(401).json({ error: 'Invalid token' });
    }
  });

router.get('/items', async(req, res) =>{
    try{
        const items = generateItems("$250_auction")
        res.json({items})
    } catch(error){
        res.status(500).json({ error: 'retrieval failed' });
    }
})





module.exports = router;