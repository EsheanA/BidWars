const apiURL = import.meta.env.VITE_SERVER_BASE_URL;
function Item({item, highestBid, isImage}){
    return(
        <div className = "Item">
            {item ? <img className = "itemForBid"  src = {`${apiURL}/GoldSVGs/` + item?.img_url} style = {isImage ? {height: `auto`, width: '30vh' } : {height: '17vh', width : 'auto'}}/>: <span/>}
            {item ? 
            <div className = "details"> 
                <h2>{item?.name}</h2>
                <h2>Current Bid: ${highestBid}</h2>
                {/* <h2>Estimated Value: ${item?.range[0]} - ${item?.range[1]}</h2> */}
            </div> 
            : <div/>}

        </div>
    )
}
export default Item;