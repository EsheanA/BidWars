import Avatar from '../components/BattleRoom/Avatar.js';
import Spotlight from '../components/BattleRoom/Spotlight.js';

import {useState, useEffect, useRef} from 'react'
import {io} from 'socket.io-client';
import {AppContext} from '../AppContext/context.js'
import {useContext} from 'react';
import {useNavigate} from "react-router-dom"
import { BR } from '../types/BattleRoom.js';
const apiURL = import.meta.env.VITE_SERVER_BASE_URL;



function BattleRoom(){
        const navigate = useNavigate();
        const socket = useRef(null);
        const context = useContext(AppContext);
        if(!context){
            throw new Error('BattleRoom must be used inside AppProvider');
        }
        const {user, setUser} = context;
        const [balance, setBalance] = useState(0)
        const [itemForBid, setItemForBid] = useState<BR.BidItem | null>(null)
        const [users, setUsers] = useState<BR.Users>([])
        const [highestBid, setHighestBid] = useState(0)
        const [highestBidder, setHighestBidder] = useState<BR.HighestBidder | null>(null)
        const [timer, setTimer] = useState<number | null>(null)
        const [announcement, setAnnouncement] = useState("")
        const [bidOptions, setBidOptions] = useState<number[]>([])

    useEffect(() => {
        let roomToken : string | null = localStorage.getItem("roomtoken");
        let chosenAuction = localStorage.getItem("chosenAuction");
        
        socket.current = io(apiURL, { 
            autoConnect: false,
            withCredentials: true,
            auth: {
                roomToken,
                userid: user?.userid
            },
            query: {
                auctionIndex: chosenAuction 
            }   
        })

        socket.current.connect()

        socket.current.on("connect_error", (err) => {
            console.error("Connection failed:", err.message); 
            navigate("/")
        });

        socket.current.on("disconnect", (reason) => {
            console.log("Disconnected:", reason);
            navigate("/")
        });

        socket.current.on("room token", data => localStorage.setItem("roomtoken", data.roomToken))
        
        // socket.current.on("user data", (data : BR.UserDataPayload) => {
        //     setUser({username: data.username, userid: data.id})
        // })
        
        socket.current.on("user list", (data : BR.Users) => {
            console.log(data.userlist)
            setUsers(data.userlist)}
        )

        socket.current.on("setItem", (data : string) => {
            const parsedData = JSON.parse(data) as BR.SetItemPayload;
            const {name, value, description, audio_url, img_url, bid, range, rarity} = parsedData.item;
            setItemForBid({name, value, description, audio_url, img_url, range, rarity});
            setHighestBidder(null);
            setHighestBid(bid);

            setTimer(parsedData.timer)
            
            setAnnouncement(name);
            playAudio(audio_url);
            
        })
        socket.current.on("current bid", (data : BR.CurrentBidPayload) => {
            if(data){
                console.log(data)
                setHighestBidder({userid: data.bidder_id, message: data.bid_message})
                setHighestBid(data.bid)
            }
        })
        socket.current.on("updated_balance", (data : BR.UpdatedBalancePayload) =>{
            console.log(user)
            if(user && data.userid == user.userid){
                setBalance(data.balance)
                console.log("balance: " + data.balance)
            }
        })

        socket.current.on("begin_game", (data : BR.BeginGamePayload)=> {
            if(data){
                setBalance(data.balance)
                setBidOptions(data.bidOptions)
            }
        })
        
        return() =>{
            socket.current.disconnect()
            console.log("Socket disconnected")
        }

    }, []);

    const playAudio = (filename : string) => {
        const audio = new Audio(`http://localhost:3000/${filename}`);
        
        audio.play().catch((err) => {
            console.error('Error playing audio:', err);
        });
        audio.onended = () => {
            console.log("Audio finished playing.");
            setAnnouncement("")
        };
    }

       useEffect(()=>{
        if (timer > 0) {
            const timeout = setTimeout(() => {
              setTimer(prev => prev - 1);
            }, 1000);
            return () => clearTimeout(timeout);
          }
        }, [timer])

    const makeBid = (value, player_id) =>{
        if(itemForBid){
            socket.current.emit("bid", {userid: player_id, bid: highestBid+value})
        }
    }

    const renderUsers = users?.map((u) => {
        return(
            <Avatar user = {u} active = {u.active} highestBidder = {highestBidder} makeBid = {(val, user) => makeBid(val, user)} name = {u.username} self = {u.userid === user.userid ? true: false} bidOptions = {bidOptions}/>
        )
    })
    return(
        <div className = "BattleRoom">
            <div className = "Balance">Balance: ${balance}  {timer && timer != 0 ? ` Time Left: ${timer}`: ""}</div>
            <Spotlight item = {itemForBid} announcement = {announcement} highestBid = {highestBid} timer = {timer} />

            <div className = "AvatarSpread">
                {renderUsers}
            </div>
        </div>
    )
}

export default BattleRoom;