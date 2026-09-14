import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css';
import Avatar from './components/BattleRoom/Avatar.js';
import BattleRoom from './pages/BattleRoom.js'
import Home from './pages/Home.js'
import Registration from './pages/Registration.js';
import Inventory from './pages/Inventory.js';
import { Routes, Route } from 'react-router-dom';
function App() {
  return (
    <>
      <div className = "App">
        <Routes>
          <Route path = "/" element = {<Home />} default/>
          <Route path = "/registration" element = {<Registration />}/>
          <Route path = "/BattleRoom" element = {<BattleRoom />} />
          <Route path = "/Inventory" element = {<Inventory />}/>
        </Routes>
        
      </div>
    </>
  )
}

export default App
