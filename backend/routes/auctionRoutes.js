const express = require('express');
const jwt = require('jsonwebtoken');
const auctionData = require('../auctions/auctionz.json')
const { generateAccessToken} = require('../tokenHandling/generateToken');
const router = express.Router();


router.get('/', async (req, res) => {
    try {

        const auctions = auctionData.auctions.mainline_auctions;
        const data = []
        auctions.forEach(async(auction, index, arr) => {
            data[index] = {
                name: auction.name,
                image: auction.name+".png",
                start: auction.value_range[0],
                end: auction.value_range[1],
                color: auction.color,
                items: auction.items
            }
        });

        console.log("mainline auctions: ", auctions)
        res.status(201).json({ success: true, auctions: data })


    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Fetching auctions failed' });
    }
});

module.exports = router;