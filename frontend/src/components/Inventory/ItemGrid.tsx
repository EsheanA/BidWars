import ItemCard from './ItemCard.js'
import { type Inventory } from '../../types/Inventory.js';


interface ItemGridProps{
    items: Array<Inventory.Item>,
    setItems: React.Dispatch<React.SetStateAction<Array<Inventory.Item>>>
}
function ItemGrid({items, setItems} : ItemGridProps){
    const itemLineup = items.map((item)=>
        <ItemCard 
            setItems = {setItems} 
            item = {item}
        />
    )
    return(
        <div className = "itemGrid">
            {itemLineup}
        </div>
    )
}
export default ItemGrid