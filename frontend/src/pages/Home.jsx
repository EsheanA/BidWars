import Nav from '../components/Nav.jsx';
import Footer from '../components/Footer.jsx';
import './Pages.css';
import { useState, useEffect } from "react"
import { AppContext } from '../AppContext/context.jsx';
import { useContext } from 'react';
import { useNavigate } from "react-router-dom"


function Home() {
    const navigate = useNavigate();
    const [user, setUser] = useContext(AppContext)

    // const AudioPlayer = ({ filename }) => {
    //     const playAudio = () => {
    //     //   const audio = new Audio(`http://localhost:3000/audio/${filename}`);
    //       audio.play().catch((err) => {
    //         console.error('Error playing audio:', err);
    //       });
    //     };

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
                if(user!=null|| user_id){
                    const endpoint = `http://localhost:3000/users/me`;
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ userid: user ? user.userid : user_id }),
                    });

                    const data = await response.json();
                    // if (data) {
                    const { username, userid, balance } = data;
                    console.log(data)
                    setUser({ username, userid, balance });
                }  
            }catch(error) {
                console.error('Error fetching data:', error);
            }
    }

    const handleSubmit = (e) => {
        e.preventDefault()
        if (user) {
            fetch("http://localhost:3000", {
                method: "POST",
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userid: user?.userid })
            })
                .then(() => {
                    navigate("/BattleRoom");
                    // console.log("success")
                })
                .catch((err) => {
                    console.warn("Server not reachable, skipping socket connection.");
                });
        }
    }
    return (
        <div className="Home">
            <Nav />
            <div className="Body">
                <div className="GamePortal" >
                    {/* <input type = "text" /> */}
                    {/* <input type="text" placeholder='username' className="input input-secondary" value = {username} onChange = {e => setUsername(e.target.value)}/> */}
                    {/* <input className="BattleButton" type="button" value="Enter Battle" /> */}
                    <button onClick={handleSubmit} className="enter-auction-btn">
                        <span>🎯 Enter Auction</span>
                    </button>

                </div>
            </div>
            <Footer />

        </div>

    )
}

export default Home;