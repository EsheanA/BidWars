import {useState} from 'react'
import Chatbubble from './Chatbubble'
function Avatar({name, self, bidOptions, makeBid, highestBidder, user}) {
    const [readyBid, setReadyBid] = useState(false)
    const buttons = bidOptions?.map(butt =>{
      return(
        <button className = "bidButton" onClick = {()=>makeBid(butt, user)}>${JSON.stringify(butt)}</button>
      )
    })
    return (
      <>
        <div className = "Avatar" style={{ border: self ? "4px solid gold" : "2px solid black" , backgroundColor: highestBidder?.user?.userid == user.userid ? "white" : "#272727" }}>
          {/* {highestBidder?.user.userid == user.userid ? <img className = "Chatbubble" src = "/images/chatbubble.png" width="75" height="75"/> : <div/>} */}
          {/* <img className = "Chatbubble" src = "/images/chatbubble.png"/> */}
          {highestBidder?.user?.userid == user.userid ? <Chatbubble message = {highestBidder.message}/> : <div/>}
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