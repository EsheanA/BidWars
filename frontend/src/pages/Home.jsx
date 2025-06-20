import Nav from '../components/HomeComp/Nav.jsx'
import './Pages.css';
import {useState} from "react"
function Home() {

    const [username, setUsername] = useState("")
    return (
        
            <div className = "Home bg-sky-900">
                <Nav />
                <div className = "Body">
                    <div className = "GamePortal" >
                        {/* <input type = "text" /> */}
                        <input type="text" placeholder='username' className="input input-secondary" value = {username} onChange = {e => setUsername(e.target.value)}/>
                        <input className = "BattleButton" type = "button" value = "Enter Battle"/>
                    </div>
                </div>
            </div>
            
    )
}

export default Home;