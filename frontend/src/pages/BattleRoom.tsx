import Avatar from '../components/BattleRoom/Avatar.js';
import Spotlight from '../components/BattleRoom/Spotlight.js';
import { io, type Socket } from "socket.io-client"
import {useState, useEffect, useRef} from 'react'
import {AppContext} from '../AppContext/context.js'
import {useContext} from 'react';
import {useNavigate} from "react-router-dom"
import { BR } from '../types/BattleRoom.js';
import { serverBaseUrl as apiURL, serverUrl } from '../config/server.js';

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
        const [roundState, setRoundState] = useState<'waiting' | 'bidding' | 'preparing' | 'complete'>('waiting');
        const activeRound = useRef<BR.SetItemPayload['timing']>(undefined);
        const countdownZero = useRef<{ round: number; at: number } | null>(null);
        const clientId = useRef(crypto.randomUUID());

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
            if (timing && timing.round > 1 && (import.meta.env.VITE_ROUND_TIMING_LOGS === 'true' ||
                (import.meta.env.DEV && import.meta.env.VITE_ROUND_TIMING_LOGS !== 'false'))) {
                const zero = countdownZero.current;
                const observed = zero?.round === timing.round - 1;
                console.info(JSON.stringify({ timestamp: new Date().toISOString(), event: 'round.transition.received',
                    ...timing, clientId: clientId.current,
                    countdownZeroToItemReceivedMs: observed ? receivedAt - zero.at : null,
                    ...(!observed && { reason: 'countdownZeroNotObserved' }) }));
            }
            activeRound.current = timing;
            countdownZero.current = null;
            setRoundState('bidding');
            const {name, value, description, audio_url, img_url, bid, range, rarity} = parsedData.item;
            setItemForBid({name, value, description, audio_url, img_url, range, rarity});
            setHighestBidder(null);
            setHighestBid(bid);

            setTimer(parsedData.timer)
            
            setAnnouncement(name);
            playAudio(audio_url);
            
        })
        socket.current.on('round status', (data: { state: 'preparing' | 'complete' }) => {
            setRoundState(data.state);
            setTimer(0);
        });
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
        const audio = new Audio(serverUrl(filename));
        
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
        if (timer > 0) {
            const timeout = setTimeout(() => {
              if (timer === 1 && activeRound.current) {
                countdownZero.current = { round: activeRound.current.round, at: performance.now() };
              }
              setTimer(prev => prev !== null ? prev - 1 : null);
            }, 1000);
            return () => clearTimeout(timeout);
          }
        }, [timer])

    const makeBid = (value : number) : void =>{
        if(roundState === 'bidding' && timer !== null && timer > 0 && itemForBid && socket.current !== null){
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
                biddingOpen = {roundState === 'bidding' && timer !== null && timer > 0}
            />
        )
    })
    return(
        <div className = "BattleRoom">
            <div className = "Balance">Balance: ${balance}  {timer && timer != 0 ? ` Time Left: ${timer}`: ""}</div>
            {roundState === 'preparing' && <div role="status">Preparing next item…</div>}
            <Spotlight item = {itemForBid} announcement = {announcement} highestBid = {highestBid} timer = {timer} />

            <div className = "AvatarSpread">
                {renderUsers}
            </div>
        </div>
    )
}

export default BattleRoom;
