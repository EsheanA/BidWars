const auctionData = require('../auctions/auctions.json')

function generateItems(auction){
    const auction_items = auctionData.auctions[auction].items
    const items = [];
    for(let i = 0; i<3; i++){
        let number = generateNumber(100);
        number = (number <= 50 ? 50 : (number <= 85 ? 35 : (number <= 99 ? 14 : 1)))
        const key = `${number}%`;
        const value = auction_items[key]
        number = generateNumber(value.length)
        items.push(value[number]);
    }
    return(items)
} 

function generateNumber(max){
    const rand = Math.floor(Math.random() * max);
    return(max == 100 ? rand+1 : rand);
}



module.exports = {generateItems};