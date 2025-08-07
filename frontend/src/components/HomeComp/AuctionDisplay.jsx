import AuctionCard from "./AuctionCard"
import SimpleSlider from "./SimpleSlider"
import {useState} from "react"
function AuctionDisplay(){
    const [backgroundColor, setBackgroundColor] = useState("black")
    return(
        <div className="AuctionDisplay" 
            style={{
                background: `linear-gradient(to right, black 70%, ${backgroundColor} 100%)`
            }}
        >
            <SimpleSlider setBackgroundColor = {setBackgroundColor}/>

        </div>

    )
}

export default AuctionDisplay