import React from "react";
import {useState, useEffect} from "react";
import Slider from "react-slick";
import AuctionCard from "./AuctionCard.js";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
const apiURL = import.meta.env.VITE_SERVER_BASE_URL;
import { type Home } from "../../types/Home.js";


function SimpleSlider(
  {
    setBackgroundColor} : {setBackgroundColor : React.Dispatch<React.SetStateAction<string>>
  }) {

  const [currentAuction, setCurrentAuction] = useState(0)
  const [mainlineAuctions, setMainlineAuctions] = useState<Array<Home.Auction>>([])

  useEffect(()=>{
    try{
      fetchAuctions()
    }catch(error){
      console.error("Error: ", error)
    }
  }, []);

  useEffect(()=>{
    if(mainlineAuctions && mainlineAuctions.length >= currentAuction){
      const auction = mainlineAuctions[currentAuction] as Home.Auction;
      setBackgroundColor(auction?.color);
    }
  }, [mainlineAuctions]);

  const fetchAuctions = async()=>{
      await fetch(`${apiURL}/auctions/`, {
        method: 'GET'
      }).then((response) => {
        if(!response.ok){
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      }).then((data : Home.AuctionListPayload) =>{
        setMainlineAuctions(data.auctions);
      }).catch(error =>{
        console.error("Error fetching auction data: ", error)
      })
  }

  var settings = {
    dots: true,
    infinite: false,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    variableWidth: false,
    beforeChange: (current : number, next : number) => {
      const next_auction = mainlineAuctions[next] as Home.Auction;
      console.log("Current slide:", current);
      setBackgroundColor(next_auction.color);
    },
    afterChange: (index : number) => {
      setCurrentAuction(index);
    }
  };

  const auctions = mainlineAuctions?.map((auction, index)=>{
    return(
      <AuctionCard auction = {auction} index = {index}/>
    )
  })

  return (
    <Slider {...settings}>
      {auctions}
    </Slider>
  );
}

export default SimpleSlider;