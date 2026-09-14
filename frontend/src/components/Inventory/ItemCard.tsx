import {useState, useContext} from 'react'
import { AppContext } from '../../AppContext/context.js'
import { type Inventory } from '../../types/Inventory.js';
const apiURL = import.meta.env.VITE_SERVER_BASE_URL;

interface ItemCardProps{
    setItems: React.Dispatch<React.SetStateAction<Array<Inventory.Item>>>
    item: Inventory.Item
}
function ItemCard({setItems, item} : ItemCardProps){
    const context = useContext(AppContext);
    if(!context){
        throw new Error('BattleRoom must be used inside AppProvider');
    }
    const { user, setUser } = context;
    const [quantityToSell, setQuantitytoSell] = useState(1)
    const [sell, setSell] = useState(false);
    const sellItem = async()=>{
        try{    
            if(user){
                const response = await fetch(`${apiURL}/users/item/sell`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({userid: user.userid, itemName: item.name, quantitySold: quantityToSell}),
                });
                const data = await response.json() as Inventory.UpdatedUserInfo;
                console.log(data.newBalance)
                setUser({...user, balance: data.newBalance})
                setItems(data.itemList)
            }
        }catch(error : unknown){
            if(error instanceof Error)
                console.error("Error selling item: ", error.message);
        }
    }
    return(
        <div className = "itemCard">
            <div className = "ImageContainer">
                <img src = {`${apiURL}/GoldSVGs/` + item.img_url} />
                <div className = "attribute">{item.name}</div> 
            </div>
            
                {
                    !sell ?
                    <div className = "details">
                        <div className = "attribute description">{item.description}</div>
                        <div className = "attribute">Value: ${item.value}</div>
                        <div className = "attribute">Quantity: {item.amount}</div>
                        <div className = "attribute">Rarity: {item.rarity}</div>
                    </div>
                    :
                    <div style = {{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                        <div className = "attribute">Quantity to sell: {quantityToSell}</div> |
                        <div className = "attribute">Profit: ${quantityToSell*item.value}</div>|
                        <div className = "toggleSellAmount"> 
                            <input type = "button" value = "+" onClick = {()=> {if(quantityToSell+1 <= item.amount) setQuantitytoSell(quantityToSell+1)}} />
                            <input type = "button" value = "-" onClick = {()=> {if(quantityToSell-1 >=1)setQuantitytoSell(quantityToSell-1)}} /> 
                            <input type = "button" value = "sell" onClick = {()=> sellItem()} /> 
                        </div>
                    </div>
                }
                <input className= "sell" type = "button" value = "sell?" onClick = {()=>setSell(!sell)} />
        </div>
    )
}
export default ItemCard;