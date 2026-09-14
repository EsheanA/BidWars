import IconCarousel from "./IconCarousel.js"
import {useState} from "react"
import {AppContext} from '../../AppContext/context.js';
import {useContext} from 'react';
import {useNavigate} from 'react-router-dom';
import { type Home } from "../../types/Home.js";
const apiURL = import.meta.env.VITE_SERVER_BASE_URL;


interface AuctionCardProps{
    auction: Home.Auction,
    index: number
}

function AuctionCard({auction, index} : AuctionCardProps){
    const context = useContext(AppContext);
    if(!context){
        throw new Error('AuctionCard must be used inside AppProvider');
    }
    const {user} = context;
    const navigate = useNavigate();
    const handleSubmit = () : void => {
        if (user && user.balance >= auction.end) {
            fetch(`${apiURL}`, {
                method: "POST",
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userid: user?.userid })
            })
                .then(() => {
                    localStorage.setItem("chosenAuction", String(index));
                    navigate("/BattleRoom");
                })
                .catch((err : Error) => {
                    console.warn("Server not reachable, skipping socket connection: ", err);
                });
        }
    }
    return(
        <div className = "AuctionCard">
            <img className = "auction_img" src = {"auctionImages/" + auction.image} />
            <h1>${auction.start}-${auction.end} Auction: <span style = {{color: "white"}}>{auction.name}</span></h1>

            <IconCarousel items = {auction.items} speed = {60} gap = {16}/>
            <input type = "button" onClick = {handleSubmit} value = "Enter"/>
        </div>
    )
}
export default AuctionCard