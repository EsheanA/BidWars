import Nav from '../components/HomeComp/Nav.jsx'
import './Pages.css';
import {useState} from "react"
import {AppContext} from '../AppContext/context.jsx';
import {useContext} from 'react';
import {useNavigate} from "react-router-dom"


function Home() {
    const navigate = useNavigate();
    const [username, setUsername] = useContext(AppContext)
    const handleSubmit = (e)=>{
        e.preventDefault()
        if(username != ""){
            fetch("http://localhost:3000", { method: "GET" })
                .then(() => {
                    navigate("/BattleRoom");
                })
                .catch((err) => {
                    console.warn("Server not reachable, skipping socket connection.");
                });
        }
    }
    return (
            <div className = "Home bg-sky-900">
                <Nav />
                <div className = "Body">
                    <div className = "GamePortal" >
                        {/* <input type = "text" /> */}
                        <input type="text" placeholder='username' className="input input-secondary" value = {username} onChange = {e => setUsername(e.target.value)}/>
                        <input className = "BattleButton" onClick = {handleSubmit} type = "button" value = "Enter Battle"/>
                    </div>
                </div>
            </div>
            
    )
}

export default Home;