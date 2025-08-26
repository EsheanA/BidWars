import {useState, useContext} from 'react'
import { AppContext } from '../../AppContext/context'
const apiURL = import.meta.env.VITE_SERVER_BASE_URL;


function ItemCard({setItems, name, description, value, img_url, item_id, quantity, rarity}){
    const [quantityToSell, setQuantitytoSell] = useState(1)
    const [sell, setSell] = useState(false)
    const [user, setUser] = useContext(AppContext)
    const sellItem = async()=>{
        try{    
            if(user){
                const response = await fetch(`${apiURL}/users/item/sell`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({userid: user.userid, itemName: name, quantitySold: quantityToSell}),
                });
                const data = await response.json()
                if(data){
                    console.log(data.newBalance)
                    setUser({username: user.username, userid: user.userid, balance: data.newBalance})
                    setItems(data.itemList)
                }
            }
        }catch(error){

        }
    }
    return(
        <div className = "itemCard">
            <div className = "ImageContainer">
                <img src = {`${apiURL}/GoldSVGs/` + img_url} />
                <div className = "attribute">{name}</div> 
            </div>
            
                {
                    !sell ?
                    <div className = "details">
                        <div className = "attribute description">{description}</div>
                        <div className = "attribute">Value: ${value}</div>
                        <div className = "attribute">Quantity: {quantity}</div>
                        <div className = "attribute">Rarity: {rarity}</div>
                    </div>
                    :
                    <div style = {{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                        <div className = "attribute">Quantity to sell: {quantityToSell}X</div> |
                        <div className = "attribute">Profit: ${quantityToSell*value}</div>|
                        <div className = "toggleSellAmount"> 
                            <input type = "button" value = "+" onClick = {()=> {if(quantityToSell+1 <= quantity)setQuantitytoSell(quantityToSell+1)}} />
                            <input type = "button" value = "-" onClick = {()=> {if(quantityToSell-1 >=1)setQuantitytoSell(quantityToSell-1)}} /> 
                            <input type = "button" value = "sell" onClick = {()=> sellItem()} /> 
                        </div>
                    </div>
                }
            {/* <input className= "sell" type = "button" value = "sell?" onClick = {()=>setSell(!sell)} /> */}
        </div>
    )
}
export default ItemCard;