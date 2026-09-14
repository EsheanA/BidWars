import Nav from '../components/Nav.js';
import Footer from '../components/Footer.js';
import AuctionDisplay from '../components/HomeComp/AuctionDisplay.js';
import './Pages.css';
import { useEffect } from "react"
import { AppContext } from '../AppContext/context.js';
import { useContext } from 'react';
import {type User} from "../types/User.js";
import '@fortawesome/fontawesome-free/css/all.min.css';

const apiURL = import.meta.env.VITE_SERVER_BASE_URL;

function Home() {
    const context = useContext(AppContext);
    if(!context){
        throw new Error('Home must be used inside AppProvider');
    }
    const {user, setUser} = context;

    useEffect(() => {
        if (localStorage.getItem("roomtoken")) {
            localStorage.removeItem("roomtoken")
        }
        updateMe()
    }, []);

    const updateMe = async()=>{
            try {
                const user_id = localStorage.getItem("userid");
                const endpoint = `${apiURL}/users/me`;
                const response = await fetch(endpoint, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ userid: user ? user.userid : user_id}),
                });

                if(!response.ok){
                    setUser(null);
                    return;
                }
                
                const data = await response.json() as User;
                const { username, userid, balance } = data;
                setUser({ username, userid, balance });

            }catch(error) {
                console.error('Error fetching data:', error);
            }
    }

    return (
        <div className="Home">
            <Nav />
                <div className="Body">
                    <AuctionDisplay />
                </div>
            <Footer />
        </div>

    )
}

export default Home;