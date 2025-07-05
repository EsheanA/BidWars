

function Chatbubble({message}){
    return(
        <div className = "Chatbubble">
            <img className = "chatbubbleIMG" src = "/images/chatbubble.png"/>
            <div className = "chatbubbleMessage">{message}</div>
        </div>
    )
}
export default Chatbubble