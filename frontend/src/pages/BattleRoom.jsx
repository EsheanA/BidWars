import Avatar from '../components/BattleRoom/Avatar.jsx';
import Spotlight from '../components/BattleRoom/Spotlight.jsx';

import {useState, useEffect, useRef} from 'react'
import {io} from 'socket.io-client';
import {AppContext} from '../AppContext/context.jsx'
import {useContext} from 'react';
import {useNavigate} from "react-router-dom"

const apiURL = import.meta.env.VITE_SERVER_BASE_URL;



function BattleRoom(){
        const navigate = useNavigate();
        const socket = useRef(null);
        const [user, setUser] = useContext(AppContext)
        const [balance, setBalance] = useState(0)
        const [itemForBid, setItemForBid] = useState(null)
        const [users, setUsers] = useState([])
        const [highestBid, setHighestBid] = useState(0)
        const [highestBidder, setHighestBidder] = useState(null)
        const [gamestate, setGamestate] = useState(false)
        const [timer, setTimer] = useState(null)
        const [announcement, setAnnouncement] = useState("")
        const [bidOptions, setBidOptions] = useState([])

    useEffect(() => {
        let roomToken = localStorage.getItem("roomtoken");
        // let accessToken = localStorage.getItem("accesstoken");
        socket.current = io(apiURL, { 
            autoConnect: false,
            withCredentials: true,
            auth: {
                roomToken,
                userid: user?.userid
            }
        })

        socket.current.connect()
        if(localStorage.getItem("game") != null){
            const game = JSON.parse(localStorage.getItem("game"));
            
            setGamestate(true)
            setBalance(game.balance)
            setBidOptions(game.bidOptions)
        }
        socket.current.on("connect_error", (err) => {
            console.error("Connection failed:", err.message); 
            navigate("/")
        });
        socket.current.on("disconnect", (reason) => {
            console.log("Disconnected:", reason);
            navigate("/")
        });
        socket.current.on("room token", data => localStorage.setItem("roomtoken", data.roomToken))
        socket.current.on("user data", data => {
            setUser({username: data.username, userid: data.id})
        })
        socket.current.on("user list", (data) => {
            console.log(data.userlist)
            setUsers(data.userlist)}
        )

        socket.current.on("setItem", data => {
            const parsedData = JSON.parse(data);
            console.log(parsedData)
            const {name, value, description, bid, audio_url, img_url} = parsedData.item

            setItemForBid({name, value, description, img_url, audio_url})
            setHighestBid(bid)
            setHighestBidder(null)

            setTimer(parsedData.timer)
            
            setAnnouncement(name)
            playAudio(audio_url)
            
        })
        socket.current.on("current bid", data => {
            if(data){
                console.log(data)
                setHighestBidder({userid: data.bidder_id, message: data.bidmessage})
                setHighestBid(data.bid)
            }
        })
        socket.current.on("begin_game", (data)=> {
            setGamestate(true)
            if(data){
                setBalance(data.balance)
                setBidOptions(data.bidOptions)
                localStorage.setItem("game", JSON.stringify({
                    balance: data.balance,
                    bidOptions: data.bidOptions
                }))
                
            }
        })
        
        return() =>{
            socket.current.disconnect()
            console.log("Socket disconnected")
        }

    }, []);

    const playAudio = (filename) => {
        const audio = new Audio(`http://localhost:3000/${filename}`);
        audio.play().catch((err) => {
            console.error('Error playing audio:', err);
        });
        audio.onended = () => {
            console.log("✅ Audio finished playing.");
            setAnnouncement("")
        };
    }

    useEffect(()=>{
        if(user){
            socket.current.on("updated_balance", data =>{
                if(data){
                    if(user && data.userid == user.userid){
                        setBalance(data.balance)
                        console.log(data.balance)
                        localStorage.setItem("game", JSON.stringify({
                            balance: data.balance,
                            bidOptions: data.bidOptions
                        }))
                    }
                }
            })
        }

    }, [user])

       useEffect(()=>{
        if (timer > 1) {
            const timeout = setTimeout(() => {
              setTimer(prev => prev - 1);
            }, 1000);
            return () => clearTimeout(timeout);
          }
        }, [timer])

    const makeBid = (val, player) =>{
        console.log("pop")
        // if(itemForBid){
        //     socket.current.emit("bid", {user: player, balance, bid: highestBid+val})
        // }
    }

    const renderUsers = users?.map((u) => {
        return(
            <Avatar user = {u} active = {u.active} highestBidder = {highestBidder} makeBid = {(val, user) => makeBid(val, user)} name = {u.username} self = {u.userid === user.userid ? true: false} bidOptions = {bidOptions}/>
        )
    })
    return(
        <div className = "BattleRoom">
            <div className = "Balance">Balance: ${balance}  {timer? ` Time Left: ${timer}`: ""}</div>
            <Spotlight item = {itemForBid} announcement = {announcement} highestBid = {highestBid}/>

            <div className = "AvatarSpread">
                {renderUsers}
            </div>
        </div>
    )
}

export default BattleRoom;