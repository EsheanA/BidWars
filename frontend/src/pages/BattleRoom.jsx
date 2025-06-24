import Avatar from '../components/Avatar.jsx';
import Spotlight from '../components/Spotlight.jsx';
import { useState, useEffect, useRef} from 'react'
import {io} from 'socket.io-client';
import {AppContext} from '../AppContext/context.jsx'
import {useContext} from 'react';
import { v4 as uuidv4 } from 'uuid';
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
        const socket = useRef(null);
        const [user, setUser] = useContext(AppContext)

        // const [numUsers, setNumUsers] = useState(0);
        const [itemForBid, setItemForBid] = useState(data[1])
        const [users, setUsers] = useState([])

    useEffect(() => {
        console.log(users)
        socket.current = io("http://localhost:3000", { 
            autoConnect: false,
            auth: {
                accessToken: localStorage.getItem("accesstoken")
            }
        })
        socket.current.connect()
        socket.current.on("connect_error", (err) => {
            console.error("Connection failed:", err.message); 
        });
        socket.current.on("user list", (data) => setUsers(data.userlist))
    }, []);

    const renderUsers = users?.map((u) => {
        return(
            <Avatar name = {u.username} self = {u.username === user.username ? true: false}/>
        )
    })
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