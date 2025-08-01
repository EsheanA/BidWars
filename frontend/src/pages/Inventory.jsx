import ItemGrid from '../components/Inventory/itemGrid.jsx';
import Nav from '../components/Nav.jsx'
import Footer from '../components/Footer.jsx'
import { AppContext } from '../AppContext/context.jsx';
import { useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom';
const apiURL = import.meta.env.VITE_SERVER_BASE_URL;

function Inventory() {
    const [user, setUser] = useContext(AppContext)
    const [items, setItems] = useState([])
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
            
                const data = await response.json();
                console.log(data)
                const {itemList} = data;
                setItems(itemList)
            }else{
                navigate("/")
            }
        }catch(error){
            console.error(error)
        }
        
    }
    return (
        <div className="Inventory">
            <Nav />
            <ItemGrid items = {items} setItems = {(x)=>setItems(x)}/>
            
            <Footer />
        </div>
    )
}
export default Inventory