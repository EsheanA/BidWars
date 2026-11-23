import Avatar from '../components/BattleRoom/Avatar.js';
import Spotlight from '../components/BattleRoom/Spotlight.js';
import { io, type Socket } from "socket.io-client"
import {useState, useEffect, useRef} from 'react'
import {AppContext} from '../AppContext/context.js'
import {useContext} from 'react';
import {useNavigate} from "react-router-dom"
import { BR } from '../types/BattleRoom.js';
const apiURL = import.meta.env.VITE_SERVER_BASE_URL;

function BattleRoom(){
        const navigate = useNavigate();
        const socket = useRef<Socket | null>(null);
        const context = useContext(AppContext);
        if(!context){
            throw new Error('BattleRoom must be used inside AppProvider');
        }
        const {user} = context;
        const [balance, setBalance] = useState(0);
        const [itemForBid, setItemForBid] = useState<BR.BidItem | null>(null);
        const [users, setUsers] = useState<BR.Users>([]);
        const [highestBid, setHighestBid] = useState(0);
        const [highestBidder, setHighestBidder] = useState<BR.HighestBidder | null>(null);
        const [timer, setTimer] = useState<number | null>(null);
        const [announcement, setAnnouncement] = useState("");
        const [bidOptions, setBidOptions] = useState<number[]>([]);
        const activeRound = useRef<{roomId: string; round: number} | null>(null);
        const countdownZero = useRef<{roomId: string; round: number; at: number} | null>(null);
        const clientId = useRef<string | null>(null);
        if (clientId.current === null) clientId.current = crypto.randomUUID();
        const timingLogsEnabled = import.meta.env.VITE_ROUND_TIMING_LOGS === 'true' ||
            (import.meta.env.DEV && import.meta.env.VITE_ROUND_TIMING_LOGS !== 'false');


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
        if(socket.current === null)
            return;
        
        socket.current.connect()

        socket.current.on("connect_error", (err : Error) => {
            console.error("Connection failed:", err.message); 
            navigate("/")
        });

        socket.current.on("disconnect", (reason : string) => {
            console.log("Disconnected:", reason);
            navigate("/");
        });

        socket.current.on("room token", (data : BR.TokenPayload) => localStorage.setItem("roomtoken", data.roomToken))
        
        socket.current.on("user list", (data : BR.UsersPayload) => {
            console.log(data.userlist)
            setUsers(data.userlist)}
        )

        socket.current.on("setItem", (data : string) => {
            const receivedAt = performance.now();
            const parsedData = JSON.parse(data) as BR.SetItemPayload;
            const timing = parsedData.timing;
            if (timing?.transitionId && timingLogsEnabled) {
                const zero = countdownZero.current;
                const observedZero = zero !== null && zero.roomId === timing.roomId && zero.round === timing.completedRound;
                console.info(JSON.stringify({
                    timestamp: new Date().toISOString(), level: 'info', event: 'round.transition.received',
                    clientId: clientId.current, roomId: timing.roomId, transitionId: timing.transitionId,
                    completedRound: timing.completedRound, round: timing.round,
                    countdownZeroToItemReceivedMs: observedZero ? Math.round((receivedAt - zero.at) * 100) / 100 : null,
                    ...(observedZero ? {} : {reason: 'countdownZeroNotObserved'}),
                }));
            }
            activeRound.current = timing ? {roomId: timing.roomId, round: timing.round} : null;
            countdownZero.current = null;
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
            if(user && data.userid === user.userid){
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
            socket.current?.disconnect();
            console.log("Socket disconnected");
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
        if(timer === null)
            return;
        if (timer === 0 && activeRound.current && countdownZero.current === null) {
            countdownZero.current = {...activeRound.current, at: performance.now()};
        }
        if (timer > 0) {
            const timeout = setTimeout(() => {
              setTimer(prev => prev !== null ? prev - 1 : null);
            }, 1000);
            return () => clearTimeout(timeout);
          }
        }, [timer])

    const makeBid = (value : number) : void =>{
        if(itemForBid && socket.current !== null){
            socket.current.emit("bid", {bid: highestBid+value})
        }
    }

    const renderUsers = users?.map((u) => {
        return(
            <Avatar 
                user = {u} 
                highestBidder = {highestBidder} 
                makeBid = {makeBid}
                name = {u.username} 
                self = {u.userid === user?.userid ? true: false} 
                bidOptions = {bidOptions}
            />
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