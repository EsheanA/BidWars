import Avatar from '../components/Avatar.jsx';
import Spotlight from '../components/Spotlight.jsx';
import { useState, useEffect, useRef} from 'react'
import {io} from 'socket.io-client';
import {AppContext} from '../AppContext/context.jsx'
import {useContext} from 'react';
import {useNavigate} from "react-router-dom"
// const data = [
//     {
//         name: "car.png",
//         height: "200",
//         width: "300"
//     },
//     {
//         name: "goldtoilet.png",
//         height: "200",
//         width: "160"
//     },

// ]
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

        // hardcoded
        const [bidOptions, setBidOptions] = useState([])

    useEffect(() => {
        let roomToken = localStorage.getItem("roomtoken");
        // let accessToken = localStorage.getItem("accesstoken");
        socket.current = io("http://localhost:3000", { 
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
            // localStorage.setItem("user", JSON.stringify({
            //     userid: data.id,
            //     username: data.username
            // }))
            setUser({username: data.username, userid: data.id})
        })
        socket.current.on("user list", (data) => {
            console.log(data.userlist)
            setUsers(data.userlist)}
        )

        socket.current.on("setItem", data => {
            setItemForBid(data.item)
            setHighestBid(data.item.starting_bid)
            setHighestBidder(null)
            setTimer(data.timer)
        })
        socket.current.on("current bid", data => {
            if(data){
                console.log(data.highestBidder)
                setHighestBidder({user: data.highestBidder.user, message: data.bidmessage})
                setHighestBid(data.highestBidder.bid)
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

        // socket.current.on("updated_balance", data =>{
        //     if(data){
                
               
        //         const userbackup = JSON.parse(localStorage.getItem("user"))
        //         if( (user && data.userid == user.userid) || (userbackup && userbackup.userid == data.userid)){
        //             setBalance(data.balance)
        //             console.log(data.balance)
        //             localStorage.setItem("game", JSON.stringify({
        //                 balance: data.balance,
        //                 bidOptions: data.bidOptions
        //             }))
        //         }
        //     }
        // })
        
        return() =>{
            socket.current.disconnect()
            console.log("Socket disconnected")
            
        }

    }, []);
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
        if(itemForBid){
            // console.log("user: ")
            // console.log(player)
            // console.log(highestBid+val)

            socket.current.emit("bid", {user: player, balance, bid: highestBid+val})
            // setHighestBid(val)
            // setHighestBidder(player)
        }
    }

    const renderUsers = users?.map((u) => {
        return(
            <Avatar user = {u} active = {u.active} highestBidder = {highestBidder} makeBid = {(val, user) => makeBid(val, user)} name = {u.username} self = {u.userid === user.userid ? true: false} bidOptions = {bidOptions}/>
        )
    })
    return(
        <>
            <div className = "Balance">Balance: ${balance}  {timer? ` Time Left: ${timer}`: ""}</div>
            <Spotlight item = {itemForBid} highestBid = {highestBid}/>
            <div className = "AvatarSpread">
                {renderUsers}
            </div>
        </>
    )
}

export default BattleRoom;