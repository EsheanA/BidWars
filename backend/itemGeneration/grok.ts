import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { unlink } from "node:fs/promises";
import type { ItemDraft } from "../services/itemPreparation";
import auctionData from "../auctions/auctionz.json";
import { getAuction } from "../auctions/auctionIndex";
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

export async function generateDraft(auctionIndex: number, signal?: AbortSignal): Promise<ItemDraft> {
    signal?.throwIfAborted();
    //finds auction
      const auction = getAuction(auctionIndex);
      const auction_name = auction.name;
      const value_range = auction.value_range;

      const rarities : Array<string> = auctionData.auctions.rarities;
      const rarityChoices : number = auction.rarities;

      const rarity : string = chooseRarity(rarities, rarityChoices);
      const category : string = generateItemCategory(auction);
      
      const client = new OpenAI({
          apiKey: process.env.GROK_KEY,
          baseURL: "https://api.x.ai/v1",
          maxRetries: 0,
          timeout: 60000,
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
        }, { signal });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error("No completion choice returned");
      }
      const schema  = choice.message.parsed;
      if (!schema) throw new Error("No parsed item returned");
      signal?.throwIfAborted();
      return { item: schema, category, rarity, img_url: `${category}.svg` };
}

// pipeline handles source errors as well as destination errors; never publish a partial file.
export async function generateAudio(draft: ItemDraft, signal?: AbortSignal): Promise<string> {
      signal?.throwIfAborted();
      const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
      const responseTTS = await fetch("https://api.lemonfox.ai/v1/audio/speech", {
        method: "POST",
        signal: requestSignal,
        headers: {
            "Authorization": `Bearer ${process.env.LEMON_FOX_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "lemon-fox-v1",
            input: draft.item.item_description,
            voice: "adam",
            response_format: "mp3"
        })
      })
      if (!responseTTS.ok || !responseTTS.body) {
        await responseTTS.body?.cancel();
        throw new Error("Speech generation failed");
      }
      requestSignal.throwIfAborted();
      const filename = draft.item.item_name.replace(/[^a-zA-Z0-9_-]/g, "_");
      const path = `audioFiles/${filename}_${uuidv4()}.mp3`;
      const audio = Readable.fromWeb(responseTTS.body as NodeReadableStream<Uint8Array>);
      const fileStream = createWriteStream(path, { flags: "wx" });
      try {
        await pipeline(audio, fileStream, { signal: requestSignal });
        requestSignal.throwIfAborted();
        return path;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') await discardAudio(path);
        throw error;
      }
}

export async function discardAudio(path: string): Promise<void> {
    // Only files allocated by this module can be discarded.
    if (!/^audioFiles\/[a-zA-Z0-9_-]+\.mp3$/.test(path)) throw new Error("Invalid prepared audio path");
    try {
        await unlink(path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
}

async function callGrok(auctionIndex: number, signal?: AbortSignal): Promise<string> {
    const draft = await generateDraft(auctionIndex, signal);
    const audio_url = await generateAudio(draft, signal);
    return JSON.stringify({ ...draft, audio_url });
}

export default callGrok;
