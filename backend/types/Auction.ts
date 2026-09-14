export interface Auction{
    name: string,
    rarities: number,
    color: string,
    bid_options: number[],
    value_range: number[],
    items: Array<string>
}  


export interface Item{
    name: string, 
    value: number, 
    bid: number, 
    range: string, 
    description: string, 
    bidder_id: string,
    img_url: string,
    audio_url: string,
    rarity: string
}


export interface GrokItemResponse {
    item: {
        item_name: string;
        item_value: number;
        starting_bid: number;
        item_guessing_range: string;
        item_description: string;
    };
    category: string;
    audio_url: string;
    rarity: string;
    img_url: string;
}