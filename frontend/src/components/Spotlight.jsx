


function Spotlight(props) {
    return (
      <>
        <div className = "Spotlight">
            <img src = "/images/spotlight.jpg" height = "400" width = "800"/>
            {props.item !== "" ? <img className = "itemForBid" src = {"/items/" + props.item} height = {props.imgHeight} width = {props.imgWidth}/> : <span/>}
        </div>
      </>
    )
  }
  
  export default Spotlight