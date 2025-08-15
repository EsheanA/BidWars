import IconCarousel from "./IconCarousel"
import {useState} from "react"
import {AppContext} from '../../AppContext/context.jsx';
import {useContext} from 'react';
import {useNavigate} from 'react-router-dom'
const apiURL = import.meta.env.VITE_SERVER_BASE_URL;


function AuctionCard({name, image, start, end}){
    const [locked, setLocked] = useState(false)
    const [user, setUser] = useContext(AppContext)
    const navigate = useNavigate();
    const handleSubmit = (e) => {
        e.preventDefault()
        if (user) {
            fetch(`${apiURL}`, {
                method: "POST",
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userid: user?.userid })
            })
                .then(() => {
                    navigate("/BattleRoom");
                    console.log("success")
                })
                .catch((err) => {
                    console.warn("Server not reachable, skipping socket connection.");
                });
        }
    }
    return(
        <div className = "AuctionCard">
            {/* <img className = "Padlock" src = "images/padlock.svg" style = {{display: locked ? "block" : "none", position: "absolute", top: "25%", left: "7%", opacity: 1, border: "none"}}/> */}
            {/* <img src = "https://placehold.co/300x150"/> */}
            {/* <img src = "auctionImages/garage.jpg" /> */}
            <img src = {"auctionImages/" + image} />
            <h1>${start}-${end} Auction: <span style = {{color: "white"}}>{name}</span></h1>

            <IconCarousel />
            <input type = "button" onClick = {handleSubmit} value = "Enter"/>
        </div>
    )
}
export default AuctionCard