import Nav from '../components/HomeComp/Nav.jsx'
import Footer from '../components/Footer.jsx'
import LoginForm from '../components/forms/LoginForm.jsx';
import SignupForm from '../components/forms/SignupForm.jsx';
import { useState, useEffect } from "react"
import {AppContext} from '../AppContext/context.jsx';
import {useContext} from 'react';
import { useNavigate } from 'react-router-dom';

function Registration(){
    const [user, setUser] = useContext(AppContext)
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [toggle, setToggle] = useState(true)
    const navigate = useNavigate()
    const handleSubmit = async(e)=>{
        e.preventDefault()
        const path = toggle ? "signup" : "login";
        if (username != "" && password != "") {
            const endpoint = `http://localhost:3000/users/${path}`;
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password}),
                });
                const data = await response.json();
                if (data != null) {
                    if(toggle)
                        setToggle(!toggle)
                    else{
                        const { username, userid, balance} = data;
                        localStorage.setItem("userid", userid)
                        setUser({ username, userid,balance});
                        
                    }
                }

            } catch (error) {
                console.error('Error fetching data:', error);
            }
        }
    }

    useEffect(()=>{
        if(user)
            navigate("/")
    }, [user])
    return(
        <div className = "registration">
            <Nav />
            <div className= "formChoice">
                <button className = "toggleForm" onClick = {()=> setToggle(!toggle)}>{!toggle ? "Sign Up?" : "Log In?"}</button>
                {toggle 
                ? <SignupForm username = {username} setUsername = {setUsername} password = {password} setPassword = {setPassword} handleSubmit = {handleSubmit}/> 
                : <LoginForm  username = {username} setUsername = {setUsername} password = {password} setPassword = {setPassword} handleSubmit = {handleSubmit}/>}
            </div>
            <Footer />
        </div>
    )
}

export default Registration;

