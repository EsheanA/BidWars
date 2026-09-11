
import {useState, useEffect,useRef} from 'react'
const apiURL = import.meta.env.VITE_SERVER_BASE_URL;
import Auctioneer from "./Auctioneer.js"
import Item from "./Item.js"
import { BR } from '../../types/BattleRoom.js';

interface SpotlightProps{
  item: BR.BidItem | null,
  announcement: string,
  highestBid: number,
  timer: number | null
}
function Spotlight({item, announcement, highestBid, timer} : SpotlightProps) {

    const [visible, setVisible] = useState(true);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const [isImage, setIsImage] = useState(false);
    
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
      console.log(timer)
      if(timer != null && timer <= 0){
        setVisible((true))
        setTimeout(() => {
          for(let i = 0; i<= 10; i++){
            setTimeout(() => {
              setVisible((i%2==0 ? true : false))
            }, i*100);
          }
          setTimeout(() => {
            setVisible(false);
          }, 11 * 100);
        }, 500);

        }
    }, [timer])

    useEffect(()=>{
      const img = imgRef.current;
      if(img === null)
        return;
      if(imgRef.current && item){
        const handleLoad = () => {
          console.log(img?.naturalWidth)
          console.log(img?.naturalHeight)
          setIsImage(img.naturalWidth > img.naturalHeight);
        };
        img.addEventListener('load', handleLoad);
        return () => img.removeEventListener('load', handleLoad);
      }

    }, [item])


    return (
      <>
        <div className = "Spotlight" style={{ display: visible ? "flex" : "none" }}>
            <img ref={imgRef} src = {`/${apiURL}/` + item?.img_url} style = {{display: "none"}}/>
            <img className = "Spotlight-img" src = "/images/spotlight.jpg"/>
            <Item item = {item} highestBid={highestBid} isImage = {isImage} />
        </div>
        <Auctioneer announcement = {announcement}/>

      </>
    )
  }
  
  export default Spotlight