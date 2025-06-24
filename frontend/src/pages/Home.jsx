import Nav from '../components/HomeComp/Nav.jsx'
import './Pages.css';
import {useState} from "react"
import {AppContext} from '../AppContext/context.jsx';
import {useContext} from 'react';
import {useNavigate} from "react-router-dom"


function Home() {
    const navigate = useNavigate();
    const [user, setUser] = useContext(AppContext)
    const [username, setUsername] = useState("")
    const handleSubmit = (e)=>{
        e.preventDefault()
        if(user){
            fetch("http://localhost:3000", { method: "GET" })
                .then(() => {
                    navigate("/BattleRoom");
                })
                .catch((err) => {
                    console.warn("Server not reachable, skipping socket connection.");
                });
        }
    }

    const createAccount = async(e)=>{
        e.preventDefault()
        if(username != ""){
            const endpoint = "http://localhost:3000/createAccount";
            try{
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body:  JSON.stringify({username}),
                });
                const data = await response.json();
                if(data!=null){
                    const {username, userid, accessToken} = data;
                    setUser({username, userid});
                    localStorage.setItem("accesstoken", accessToken);
                }

            }catch(error){
                console.error('Error fetching data:', error);
            }
        }
    }
    return (
            <div className = "Home bg-sky-900">
                <Nav />
                <div className = "Body">
                    <div className = "GamePortal" >
                        {/* <input type = "text" /> */}
                        {/* <input type="text" placeholder='username' className="input input-secondary" value = {username} onChange = {e => setUsername(e.target.value)}/> */}
                        <input className = "BattleButton" onClick = {handleSubmit} type = "button" value = "Enter Battle"/>
                    </div>
                    <div className = "AccountCreation">
                        <input type="text" placeholder='username' className="input input-secondary" value = {username} onChange = {e => setUsername(e.target.value)}/>
                        <input type = "button" className = "createAccount" value = "Create Account" onClick = {createAccount}/>

                        {/* <input type ="password" className = "input input-secondary" value = {username} onChange = {e =>}/> */}
                    </div>
                </div>
            </div>
            
    )
}

export default Home;