const OpenAI = require("openai");
const { zodResponseFormat } = require("openai/helpers/zod");
const { z } = require("zod");
const {createWriteStream} = require("fs")
const {Readable} = require("stream");
const {finished} = require("stream/promises")
const {exec} = require("child_process")
const auctionData = require('./auctionz.json')



function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min+ 1)) + min;
}

function generateKeywords(auction){
    const keywords = auction.keywords;
    const map = new Map()
    var keywordsReturn = "["
    for(let i = 0; i<3; i++){
        const keyword = getRandomInt(0, keywords.length-1)
        if(map.get(keyword))
            i--;
        else{
            map.set(keyword, keywords[keyword])
            keywordsReturn += map.get(keyword)
            if(i != 2)
                keywordsReturn+=", "
        }
    }
    keywordsReturn += "]"
    return(keywordsReturn)
}   

function generateItemCategory(auction){
    return(auction.items[getRandomInt(0, auction.items.length-1)])
}

function chooseRarity(rarities, len){
    const percentage = getRandomInt(1, 100);
    var decr = 50;
    let i = 0;
    for(i; i<len && percentage < decr ;i++){
        decr/=2;
    }
    return(rarities[i])
}

async function callGrok(auctionIndex){

    //finds auction
    const auction = auctionData.auctions.mainline_auctions[auctionIndex]
    const auction_name = auction.name
    const value_range = auction.value_range

    const rarities = auctionData.auctions.rarities
    const rarityChoices = auction.rarities

    const rarity = chooseRarity(rarities, rarityChoices)
    const category = generateItemCategory(auction)
    // const keywords = generateKeywords(auction)
    console.log(category)
    // console.log(keywords)
    console.log(rarity)
    
    // const itemSchema = z.object({
    //     item_name: z.string().describe("Item name"),
    //     item_value: z.string().describe("Value of item"),
    //     item_guessing_range:  z.string().describe("Guessing range for items value"),
    //     item_description: z.string().describe("Crazy, funny item description"),
    //     starting_bid: z.number().describe("A starting bid for the item")
    // })
    const client = new OpenAI({
        apiKey: "REDACTED_XAI_KEY",
        baseURL: "https://api.x.ai/v1",
      });



    const itemSchema = z.object({
        item_name: z.string("keep 30 chars max"),
        item_value: z.string(),        
        item_guessing_range: z.string(),
        item_description: z.string(), 
        starting_bid: z.number()
      });
      
      const response = await client.chat.completions.parse({
        model: "grok-3-mini",
        messages: [
          {
            role: "system",
            content:
              "You are to talk like an auctioneer. Return ONLY JSON per schema. " +
              "Constraints: value within value_range; guessing_range within value_range; " +
              `On the rarity scale: ${rarities}, this item is: ${rarity};` +
              "starting_bid consistent with guessing_range; Introduce item with a crazy funny description (similar to cards against humanity) using popculture references,controversies,and rarity;description ends with the starting bid in dollars;Item should be realistic to chosen auction,rarity, and value"
              
          },
          {
            role: "user",
            content: JSON.stringify({
              category,                 // string
            //   keywords,                 // array of strings: ["kw1","kw2","kw3"]
              value_range,              // [min,max] numbers or strings with $
              auction_name,             // string (optional if not needed)
              rarity,                   // one label, e.g. "Epic"
              rarity_scale: rarities    // optional; remove if not needed
            })
          }
        ],
        response_format: zodResponseFormat(itemSchema, "schema"),
        // max_tokens: 280,
        temperature: 0.8
      });

    const schema = response.choices[0].message.parsed;
    console.log(schema);
    

    const responseTTS = await fetch("https://api.lemonfox.ai/v1/audio/speech", {
    method: "POST",
    headers: {
        "Authorization": "Bearer aMXWdjQGzB8T55aqw7d8f8rMGSi9f3C0",
    },
    body: JSON.stringify({
        input: schema.item_description,
        voice: "adam",
        response_format: "mp3"
    })
    })
    const filename = schema.item_name.replaceAll(" ", "_")
    const fileStream = createWriteStream(`audioFiles/${filename}.mp3`, { flags: "wx" });
    await finished(Readable.fromWeb(responseTTS.body).pipe(fileStream));
    // exec(`afplay ./audioFiles/${filename}.mp3`, (err) => {
    //     if (err) {
    //       console.error("Error playing audio:", err);
    //     } else {
    //       console.log("Finished playing");
    //     }
    //   });
    
}
callGrok(0)


