import {AppContext} from '../AppContext/context.js';
import {useContext} from 'react';
import { Link } from "react-router";
import { useNavigate } from 'react-router';
const apiUrl = import.meta.env.VITE_SERVER_BASE_URL;

function Nav() {

    const context = useContext(AppContext);
    if(!context){
        throw new Error('Inventory must be used inside AppProvider');
    }
    const { user, setUser } = context;

    const navigate = useNavigate()
    const handleLogout = async()=>{
        try {
            await fetch(`${apiUrl}/users/logout`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({userid: user?.userid}),
            });
            localStorage.clear();
            setUser(null);
            navigate("/");
        } catch (error) {
            console.error('Error: ', error);
        }
    }
    return (
      <>
       <div className="navbar bg-orange-900 shadow-sm Nav">
                <div className="navbar-start">
                </div>
                <div className="navbar-center">
                    <Link to = {{pathname: "/"}}><img src = "/images/logo4.png" height = "140px" width = "140px"/></Link>
                </div>
                <div className="navbar-end">
                    <div className = "userInfo">
                        
                        {user ? <h3>{user.username}</h3>: <Link to = {{pathname: "/registration"}}><h3>Sign Up</h3></Link>}
                        <h3>{user ? "Balance: $"+ user.balance : "" }</h3>
                        <div style={{display: 'flex'}}>
                            {user ? <button className = "Logout" onClick = {()=>handleLogout()}><h3>Logout</h3></button> : ""}
                            {user ? <button className = "Logout" onClick = {()=>navigate("/Inventory")}><h3>Inventory</h3></button> : ""}
                        </div>
                    </div>
                </div>
        
                </div>
      </>
    )
  }
  
  export default Nav