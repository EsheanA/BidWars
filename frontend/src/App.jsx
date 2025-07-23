import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css';
import Avatar from './components/Avatar.jsx';
import BattleRoom from './pages/BattleRoom.jsx'
import Home from './pages/Home.jsx'
import Registration from './pages/Registration.jsx';
import { Routes, Route } from 'react-router-dom';
function App() {
  return (
    <>
      <div className = "App">
        <Routes>
          <Route path = "/" element = {<Home />} default/>
          <Route path = "/registration" element = {<Registration />}/>
          <Route path = "/BattleRoom" element = {<BattleRoom />} />
          
        </Routes>

      </div>
    </>
  )
}

export default App
