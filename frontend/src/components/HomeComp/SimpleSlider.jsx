import React from "react";
import {useState, useEffect} from "react";
import Slider from "react-slick";
import AuctionCard from "./AuctionCard";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

export default function SimpleSlider({setBackgroundColor}) {

  const [currentAuction, setCurrentAuction] = useState(0)
  const arr = [
    {
        name: "Garage",
        image: "garage.jpg",
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
    setBackgroundColor(arr[0].color)
  }, [])


  var settings = {
    dots: true,
    infinite: false,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    variableWidth: false,
    beforeChange: (current, next) => {
      console.log("Current slide:", current);
      setBackgroundColor(arr[next].color);
    },
    afterChange: (index) => {
      setCurrentAuction(index);
    },
    // nextArrow: <SampleNextArrow />,
    // prevArrow: <SamplePrevArrow />
  };

  const auctions = arr.map((auction)=>{
    return(
      <AuctionCard name = {auction.name} image = {auction.image} start = {auction.start} end = {auction.end}/>
    )
  })

  return (
    <Slider {...settings}>
      {auctions}
    </Slider>
  );
}