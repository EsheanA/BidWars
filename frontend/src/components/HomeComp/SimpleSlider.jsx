import React from "react";
import {useState, useEffect} from "react";
import Slider from "react-slick";
import AuctionCard from "./AuctionCard";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
const apiURL = import.meta.env.VITE_SERVER_BASE_URL;

export default function SimpleSlider({setBackgroundColor}) {

  const [currentAuction, setCurrentAuction] = useState(0)
  const [mainlineAuctions, setMainlineAuctions] = useState([])
  const arr = [
    {
        name: "Garage",
        image: "garage.png",
        start: "0",
        end: "250",
        color: "grey"
    },
    {
        name: "Suburbs",
        image: "house.png",
        start: "500",
        end: "1000",
        color: "white"
    }
  ]
  useEffect(()=>{
    try{
      fetchAuctions()
    }catch(error){
      console.error("Error: ", error)
    }
  }, []);

  useEffect(()=>{
    if(mainlineAuctions && mainlineAuctions.length > 0)
      setBackgroundColor(mainlineAuctions[currentAuction].color)
  }, [mainlineAuctions]);

  const fetchAuctions = async()=>{
      await fetch(`${apiURL}/auctions/`, {
        method: 'GET'
      }).then(response => {
        if(!response.ok){
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      }).then(data =>{
        console.log(data)
        setMainlineAuctions(data.auctions)
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
    beforeChange: (current, next) => {
      console.log("Current slide:", current);
      setBackgroundColor(mainlineAuctions[next].color);
    },
    afterChange: (index) => {
      setCurrentAuction(index);
    },
    // nextArrow: <SampleNextArrow />,
    // prevArrow: <SamplePrevArrow />
  };

  const auctions = mainlineAuctions?.map((auction, index)=>{
    return(
      <AuctionCard name = {auction.name} image = {auction.image} start = {auction.start} end = {auction.end} items = {auction.items} index = {index}/>
    )
  })

  return (
    <Slider {...settings}>
      {auctions}
    </Slider>
  );
}