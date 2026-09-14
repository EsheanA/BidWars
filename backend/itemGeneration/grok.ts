import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { createWriteStream } from "fs";
import { finished } from "stream/promises";
import auctionData from "../auctions/auctionz.json";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { type Auction } from "../types/Auction";
dotenv.config();

function getRandomInt(min : number, max : number) : number{
  return Math.floor(Math.random() * (max - min+ 1)) + min;
}


function generateItemCategory(auction : Auction) : string{
    return(auction.items[getRandomInt(0, auction.items.length-1)] as string)
}

function chooseRarity(rarities : Array<string>, len : number) : string{
    const percentage = getRandomInt(1, 100);
    var decr = 50;
    let i = 0;
    for(i; i<len && percentage < decr ;i++){
        decr/=2;
    }
    return(rarities[i] as string);
}

async function callGrok(auctionIndex : number){
  try{
    //finds auction
      const auction = auctionData.auctions.mainline_auctions[auctionIndex] as Auction;
      const auction_name = auction.name;
      const value_range = auction.value_range;

      const rarities : Array<string> = auctionData.auctions.rarities;
      const rarityChoices : number = auction.rarities;

      const rarity : string = chooseRarity(rarities, rarityChoices);
      const category : string = generateItemCategory(auction);
      
      const client = new OpenAI({
          apiKey: process.env.GROK_KEY,
          baseURL: "https://api.x.ai/v1",
        });



      const itemSchema = z.object({
          item_name: z
            .string()
            .max(30, "keep 30 chars max") 
            .describe("Item name, maximum 30 characters"),
          item_value: z.number(),        
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
                "starting_bid consistent with guessing_range; Introduce item with a crazy funny description (similar to cards against humanity) using popculture references,controversies,and rarity; description ends with the starting bid in dollars and is max 25 words;Item should be realistic to chosen auction,rarity, and value."
                
            },
            {
              role: "user",
              content: JSON.stringify({
                category,                            
                value_range,      
                auction_name,            
                rarity,                  
                rarity_scale: rarities    
              })
            }
          ],
          response_format: zodResponseFormat(itemSchema, "schema"),
          temperature: 1.2
        });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error("No completion choice returned");
      }
      const schema  = choice.message.parsed;
      console.log(schema);
      

      const responseTTS = await fetch("https://api.lemonfox.ai/v1/audio/speech", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.LEMON_FOX_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "lemon-fox-v1",
            input: schema?.item_description,
            voice: "adam",
            response_format: "mp3"
        })
      })
      // console.log("STATUS:", responseTTS.status);
      // console.log("CONTENT-TYPE:", responseTTS.headers.get("content-type"));
      const filename = schema?.item_name.replaceAll(" ", "_");
      const unique = uuidv4();
      const fileStream = createWriteStream(`audioFiles/${filename}_${unique}.mp3`, { flags: "wx" });
      const body = responseTTS.body as NodeReadableStream<Uint8Array>;
      await finished(Readable.fromWeb(body).pipe(fileStream));
      return(Promise.resolve(JSON.stringify({item: schema, category, rarity, audio_url: `audioFiles/${filename}_${unique}.mp3`, img_url: `${category}.svg`})))
    }catch(error){
      console.error("Grok call failed: ", error)
      return(Promise.reject(error))
    }
    
}


export default callGrok;


