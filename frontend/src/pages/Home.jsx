import Nav from '../components/Nav.jsx';
import Footer from '../components/Footer.jsx';
import AuctionDisplay from '../components/HomeComp/AuctionDisplay.jsx';
import './Pages.css';
import { useState, useEffect } from "react"
import { AppContext } from '../AppContext/context.jsx';
import { useContext } from 'react';
import { useNavigate } from "react-router-dom"
import '@fortawesome/fontawesome-free/css/all.min.css';

const apiURL = import.meta.env.VITE_SERVER_BASE_URL;

function Home() {
    const navigate = useNavigate();
    const [user, setUser] = useContext(AppContext)

    useEffect(() => {
        
        if (localStorage.getItem("roomtoken")) {
            localStorage.removeItem("roomtoken")
        }
        // localStorage.clear();
        updateMe()

    }, [])

    const updateMe = async()=>{
            try {
                const user_id = localStorage.getItem("userid")
                if(user != null || user_id ){
                    const endpoint = `${apiURL}/users/me`;
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ userid: user ? user.userid : user_id}),
                    });

                    const data = await response.json();
                    const { username, userid, balance } = data;
                    setUser({ username, userid, balance });
     
            }
            }catch(error) {
                // console.error('Error fetching data:', error);
            }
    }

    // const handleSubmit = (e) => {
    //     e.preventDefault()
    //     if (user) {
    //         fetch(`${apiURL}`, {
    //             method: "POST",
    //             credentials: 'include',
    //             headers: { 'Content-Type': 'application/json' },
    //             body: JSON.stringify({ userid: user?.userid })
    //         })
    //             .then(() => {
    //                 navigate("/BattleRoom");
    //                 // console.log("success")
    //             })
    //             .catch((err) => {
    //                 console.warn("Server not reachable, skipping socket connection.");
    //             });
    //     }
    // }
    return (
        <div className="Home">
            <Nav />
            <div className="Body">
                <AuctionDisplay />
                <div className = "HelloRight">Heloo I am on the right side</div>
            </div>
            <Footer />

        </div>

    )
}

export default Home;