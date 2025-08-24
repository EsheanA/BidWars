import {useState} from 'react'
import Chatbubble from './Chatbubble.jsx'

function Avatar({name, self, bidOptions, makeBid, highestBidder, user, active}) {
    const [readyBid, setReadyBid] = useState(false)
    //butt is the item of bidOptions, an integer bid option
    const buttons = bidOptions?.map(butt =>{
      return(
        <button className = "bidButton" onClick = {()=>makeBid(butt, user.userid)}>${JSON.stringify(butt)}</button>
      )
    })
    return (
      <>
        {/* <div className = "Avatar" style={{ border: self ? "4px solid gold" : "2px solid black" , backgroundColor: active ? (highestBidder?.userid == user.userid ? "white" : "#272727") : "red"}}> */}
        <div className = "Avatar" style={{ border: self ? "4px solid" : "2px solid black" , borderImage: self ? "linear-gradient(135deg, #fff9d1 0%, #ffd86a 25%, #e0b23e 50%, #c89b2b 75%, #8d6e1e 100%) 1" : "none", borderRadius: "12px", backgroundColor: active ? (highestBidder?.userid == user.userid ? "white" : "#272727") : "red"}}>
          {highestBidder?.userid == user.userid ? <Chatbubble message = {highestBidder.message} heightValue = {25}/> : <div/>}
          <img src = "/images/user2.png" width="150" height="150"/>
          <div className = "centered">{name}</div>
          <div className = "bidButtons">
            {readyBid ? buttons : <span/>}
            {self ? <button className = "bidButton main" onClick ={()=>setReadyBid(!readyBid)}>BID</button> : <span/>}
          </div>
        </div>
        
      </>
    )
  }
  
  export default Avatar