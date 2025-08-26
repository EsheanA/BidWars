import {useState, useEffect} from 'react'
import ItemCard from './ItemCard.jsx'
function ItemGrid({items, setItems}){
    const itemLineup = items.map((item)=>
            <ItemCard setItems = {setItems} name = {item.name} item_id = {item._id} value = {item.value} img_url = {item.img_url} quantity={item.amount} description = {item.description} rarity = {item.rarity} />
    )

    return(
        <div className = "itemGrid">
            {itemLineup}
        </div>
    )
}
export default ItemGrid