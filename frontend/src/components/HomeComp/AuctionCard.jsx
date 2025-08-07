import IconCarousel from "./IconCarousel"
import {useState} from "react"
function AuctionCard({name, image, start, end}){
    const [locked, setLocked] = useState(false)
    return(
        <div className = "AuctionCard">
            {/* <img className = "Padlock" src = "images/padlock.svg" style = {{display: locked ? "block" : "none", position: "absolute", top: "25%", left: "7%", opacity: 1, border: "none"}}/> */}
            {/* <img src = "https://placehold.co/300x150"/> */}
            {/* <img src = "auctionImages/garage.jpg" /> */}
            <img src = {"auctionImages/" + image} />
            <h1>${start}-${end} Auction: <span style = {{color: "white"}}>{name}</span></h1>

            <IconCarousel />
            <input type = "button" value = "Enter"/>
        </div>
    )
}
export default AuctionCard