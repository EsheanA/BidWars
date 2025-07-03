
import {useState, useEffect,useRef} from 'react'

function Spotlight({item}) {
    const [visible, setVisible] = useState(false)
    const imgRef = useRef(null)
    const [isImage, setIsImage] = useState(false)
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

    useEffect(()=>{
      const img = imgRef.current;
      if(imgRef.current && item){
        const handleLoad = () => {
          console.log(img.naturalWidth)
          console.log(img.naturalHeight)
          setIsImage(img.naturalWidth > img.naturalHeight);

        };
        img.addEventListener('load', handleLoad);
        return () => img.removeEventListener('load', handleLoad);
      }

    }, [item])


    return (
      <>
        <div className = "Spotlight" style={{ display: visible ? "flex" : "none" }}>
            <img ref={imgRef} src = {"/items/" + item} style = {{display: "none"}}/>
            <img className = "Spotlight-img" src = "/images/spotlight.jpg"/>
            {item ? <img className = "itemForBid"  src = {"/items/" + item} style = {isImage ? {height: `auto`, width: '30vh' } : {height: '17vh', width : 'auto'}}/> : <span/>}

        </div>
      </>
    )
  }
  
  export default Spotlight