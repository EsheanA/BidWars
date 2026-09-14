function Auctioneer({announcement} : {announcement : string}){
    return(
        <div 
            className = "Auctioneer" 
            style= {{
                    backgroundColor: announcement == "" ? "#272727" : "white", 
                    top: announcement == "" ? '35%' : '45%', 
                    left: announcement == "" ? '8%' : '40%'
                }}>
            <img src = "/images/auctioneer.png" width="150" height="150"/>
        </div>
      
    )
}
export default Auctioneer