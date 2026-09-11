import ItemGrid from '../components/Inventory/ItemGrid.js';
import Nav from '../components/Nav.js'
import Footer from '../components/Footer.js'
import { AppContext } from '../AppContext/context.js';
import { useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom';
import { type Inventory } from '../types/Inventory.js';
const apiURL = import.meta.env.VITE_SERVER_BASE_URL;

function Inventory() {
    const context = useContext(AppContext);
    if(!context){
        throw new Error('Inventory must be used inside AppProvider');
    }
    const { user } = context;

    const [items, setItems] = useState<Array<Inventory.Item>>([]);
    const navigate = useNavigate()
    useEffect(() => {
        fetchItems()
    }, [])

    const fetchItems = async () => {
        try{
            if(user){
                const endpoint = `${apiURL}/users/items`;
                const response = await fetch(endpoint, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ userid: user.userid }),
                });
                if(!response.ok){
                    console.error("Unexpected error:", response.status);
                    navigate("/")
                }
                const data = await response.json() as Inventory.ItemListPayload;
                const { itemList } = data;
                setItems(itemList);
            }else{
                navigate("/")
            }
        }catch(error){
            console.error(error)
            navigate("/")
        }
        
    }
    return (
        <div className="Inventory">
            <Nav />
            <ItemGrid items = {items} setItems = {setItems}/>
            <Footer />
        </div>
    )
}
export default Inventory