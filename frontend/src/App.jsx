import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css';
import Avatar from './components/Avatar.jsx';
import BattleRoom from './pages/BattleRoom.jsx'
import Home from './pages/Home.jsx'
function App() {
  return (
    <>
      <div className = "App">
        {/* <BattleRoom /> */}
        <Home/>
      </div>
    </>
  )
}

export default App
