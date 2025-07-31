import {AppContext} from '../AppContext/context.jsx';
import {useContext} from 'react';
import { Link } from "react-router";
import { useNavigate } from 'react-router';
function Nav() {

    const [user, setUser] = useContext(AppContext)
    const navigate = useNavigate()
    const handleLogout = async()=>{
        try {
            const response = await fetch("http://localhost:3000/users/logout", {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({userid: user.userid}),
            });
            localStorage.clear()
            setUser(null)
            navigate("/")
        } catch (error) {
            console.error('Error: ', error);
        }
    }
    return (
      <>
       <div className="navbar bg-orange-900 shadow-sm Nav">
                <div className="navbar-start">
                    <div className="dropdown">
                        <div tabIndex={0} role="button" className="btn btn-ghost btn-circle">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" /> </svg>
                        </div>
                        <ul
                            tabIndex={0}
                            className="menu menu-sm dropdown-content bg-base-100 rounded-box z-1 mt-3 w-52 p-2 shadow">
                            <li><Link to = {{pathname: "/"}}>Home</Link></li>
                            <li><Link to = {{pathname: "/registration"}}>Signup</Link></li>
                            {/* <li><a>Homepage</a></li>
                            <li><a>Portfolio</a></li>
                            <li><a>About</a></li> */}
                        </ul>
                    </div>
                </div>
                <div className="navbar-center">
                    {/* <a className="btn btn-ghost text-xl">BidWars</a> */}
                    <Link to = {{pathname: "/"}}><img src = "/images/logo.png" height = "200px" width = "200px"/></Link>
                    
                    
                </div>
                <div className="navbar-end">
                    {/* <button className="btn btn-ghost btn-circle">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /> </svg>
                    </button> */}
                    {/* <button className="btn btn-ghost btn-circle">
                        <div className="indicator">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /> </svg>
                            <span className="badge badge-xs badge-primary indicator-item"></span>
                        </div>
                    </button> */}
       
                    {/* <div className="avatar">
                        <div className="w-14 rounded">
                            <img src="https://img.daisyui.com/images/profile/demo/batperson@192.webp" />
                        </div>
                    </div> */}
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