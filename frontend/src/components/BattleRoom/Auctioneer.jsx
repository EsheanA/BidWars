import Chatbubble from "./Chatbubble"
import {useState} from 'react'

function Auctioneer({announcement}){
    // const [announcement, setAnnouncement] = useState("")

    return(
        <div className = "Auctioneer" style={{backgroundColor: announcement == "" ? "#272727" : "white", top: announcement == "" ? '35%' : '45%', left: announcement == "" ? '8%' : '40%'}}>
        {/* <div className = "Auctioneer" style={{backgroundColor: "white", top: '45%', left: '40%'}}> */}

        {/* <div className = "Auctioneer"> */}
           {/* {announcement == "" ?  <div/> : <Chatbubble message = {announcement} heightValue={20}/>} */}
            <img src = "/images/auctioneer.png" width="150" height="150"/>
        </div>
      
    )
}
export default Auctioneer