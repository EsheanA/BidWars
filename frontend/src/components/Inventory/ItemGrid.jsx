import {useState, useEffect} from 'react'
import ItemCard from './ItemCard.jsx'
function ItemGrid({items, setItems}){
    const itemLineup = items.map((item)=>
            <ItemCard setItems = {setItems} name = {item.name} item_id = {item._id} value = {item.value} url = {item.url} quantity={item.amount}/>
    )

    return(
        <div className = "itemGrid">
            {itemLineup}
        </div>
    )
}
export default ItemGrid