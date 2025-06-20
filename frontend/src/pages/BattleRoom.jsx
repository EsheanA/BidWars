import Avatar from '../components/Avatar.jsx';
import Spotlight from '../components/Spotlight.jsx';
import { useState, useEffect } from 'react'

const data = [
    {
        name: "car.png",
        height: "200",
        width: "300"
    },
    {
        name: "goldtoilet.png",
        height: "200",
        width: "160"
    }
]
function BattleRoom(){
    
    useEffect(()=>{
        
    }, [])

    const [numUsers, setNumUsers] = useState(3);
    const [itemForBid, setItemForBid] = useState(data[1])
    const [users, setUsers] = useState(
        [
            {name: "Eshean"},
            {name: "Josh"},
            {name: "James"},
            {name: "Jill"}
        ]
    )
    const renderUsers = users.map((user) => (
        <Avatar name = {user.name}/>
    ))
    return(
        <>
            {/* <div><img src = "/images/spotlight.jpg" height = "600" width = "1000"/></div> */}
            <Spotlight item = {itemForBid.name} imgWidth = {itemForBid.width} imgHeight = {itemForBid.height}/>
            <div className = "AvatarSpread">
                {renderUsers}
            </div>
        </>
    )
}

export default BattleRoom;