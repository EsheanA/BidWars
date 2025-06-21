
import {useState, useEffect} from 'react'

function Spotlight(props) {
    const [visible, setVisible] = useState(false)

    useEffect(()=>{
      for(let i = 0; i<= 10; i++){
        setTimeout(() => {
          setVisible((i%2==0 ? true : false))
        }, i*100);
      }
      setTimeout(() => {
        setVisible(true);
      }, 11 * 100);
      // setVisible(true)
    }, [])
    return (
      <>
        <div className = "Spotlight" style={{ display: visible ? "flex" : "none" }}>
            <img src = "/images/spotlight.jpg" height = "400" width = "800"/>
            {props.item !== "" ? <img className = "itemForBid" src = {"/items/" + props.item} height = {props.imgHeight} width = {props.imgWidth}/> : <span/>}
        </div>
      </>
    )
  }
  
  export default Spotlight