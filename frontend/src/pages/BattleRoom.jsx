import Avatar from '../components/Avatar.jsx';
import Spotlight from '../components/Spotlight.jsx';
import { useState, useEffect, useRef} from 'react'
import {io} from 'socket.io-client';
import {AppContext} from '../AppContext/context.jsx'
import {useContext} from 'react';
import {useNavigate} from "react-router-dom"
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
        const navigate = useNavigate();
        const socket = useRef(null);
        const [user, setUser] = useContext(AppContext)
        const [itemForBid, setItemForBid] = useState(data[1])
        const [users, setUsers] = useState([])

    useEffect(() => {
        let roomToken = localStorage.getItem("roomtoken");
        let accessToken = localStorage.getItem("accesstoken");
        socket.current = io("http://localhost:3000", { 
            autoConnect: false,
            auth: {
                roomToken,
                accessToken
            }
        })
        socket.current.connect()
        socket.current.on("connect_error", (err) => {
            console.error("Connection failed:", err.message); 
            navigate("/")
        });
        socket.current.on("room token", data => localStorage.setItem("roomtoken", data.roomToken))
        socket.current.on("user data", data => setUser({username: data.username, userid: data.id}))
        // socket.current.on("room token", data => console.log(data.roomToken))
        socket.current.on("user list", (data) => {
            console.log(data.userlist)
            setUsers(data.userlist)}
        )
    }, []);

    const renderUsers = users?.map((u) => {
        return(
            <Avatar name = {u.username} self = {u.username === user.username ? true: false}/>
        )
    })
    return(
        <>
            <Spotlight item = {itemForBid.name} imgWidth = {itemForBid.width} imgHeight = {itemForBid.height}/>
            <div className = "AvatarSpread">
                {renderUsers}
            </div>
        </>
    )
}

export default BattleRoom;