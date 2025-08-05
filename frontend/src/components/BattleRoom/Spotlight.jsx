
import {useState, useEffect,useRef} from 'react'
const apiURL = import.meta.env.VITE_SERVER_BASE_URL;
import Auctioneer from "./Auctioneer"

function Spotlight({item, announcement, highestBid}) {

    const [visible, setVisible] = useState(true)
    const imgRef = useRef(null)
    const [isImage, setIsImage] = useState(false)
    
    useEffect(()=>{
      if(item){
        setVisible((false))
        setTimeout(() => {
          for(let i = 0; i<= 10; i++){
            setTimeout(() => {
              setVisible((i%2==0 ? true : false))
            }, i*100);
          }
          setTimeout(() => {
            setVisible(true);
          }, 11 * 100);
        }, 500);

        }
    }, [item])

    useEffect(()=>{
      const img = imgRef.current;
      if(imgRef.current && item){
        const handleLoad = () => {
          console.log(img.naturalWidth)
          console.log(img.naturalHeight)
          setIsImage(img.naturalWidth > img.naturalHeight);
          // if(announcement == "")
          //   setAnnouncement("diddy")
          // else
          //   setAnnouncement("")

        };
        img.addEventListener('load', handleLoad);
        return () => img.removeEventListener('load', handleLoad);
      }

    }, [item])


    return (
      <>
        <div className = "Spotlight" style={{ display: visible ? "flex" : "none" }}>
            <img ref={imgRef} src = {"/items/" + item?.url} style = {{display: "none"}}/>
            <img className = "Spotlight-img" src = "/images/spotlight.jpg"/>
            {item ? <img className = "itemForBid"  src = {`${apiURL}/items/` + item?.url} style = {isImage ? {height: `auto`, width: '30vh' } : {height: '17vh', width : 'auto'}}/> : <span/>}
            {item ? <div className = "highestBid"> ${highestBid} </div> : <div/>}
        </div>
        <Auctioneer announcement = {announcement}/>
      </>
    )
  }
  
  export default Spotlight