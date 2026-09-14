export namespace Inventory{
    export interface Item{
        _id: number,
        name: string,
        value: number,
        amount: number,
        description: string,
        rarity: string,
        img_url: string
    }

    export interface ItemListPayload{
        itemList: Array<Item>
    }

    export interface UpdatedUserInfo{
        newBalance: number,
        itemList: Array<Item>
    }
};