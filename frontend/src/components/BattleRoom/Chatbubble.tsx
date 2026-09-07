

function Chatbubble({message, heightValue}){
    return(
        <div className = "Chatbubble">
            <img className = "chatbubbleIMG" style = {{height: `${heightValue}vh`, width: `auto`}} src = "/images/chatbubble.png" />
            <div className = "chatbubbleMessage">{message}</div>
        </div>
    )
}
export default Chatbubble