import express, { Request, Response } from "express";
import auctionData from "../auctions/auctionz.json";

const router = express.Router();

interface AuctionData {
    name: string;
    image: string;
    start: number;
    end: number;
    color: string;
    items: string[];
}

router.get("/", async (req: Request, res: Response): Promise<void> => {
    try {
        const auctions = auctionData.auctions.mainline_auctions;
        const data: AuctionData[] = [];
        

        auctions.forEach((auction, index) => {
            const start = auction.value_range[0] as number;
            const end = auction.value_range[1] as number;

            data[index] = {
                name: auction.name,
                image: auction.name + ".png",
                start,
                end,
                color: auction.color,
                items: auction.items
            };
        });

        console.log("mainline auctions: ", auctions);

        res.status(201).json({
            success: true,
            auctions: data
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: "Fetching auctions failed"
        });
    }
});

export default router;