import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.js'
import { AppProvider } from './AppContext/context.js';
import { BrowserRouter } from 'react-router-dom';


createRoot(document.getElementById('root')).render(
    <BrowserRouter>
        <AppProvider>
            <App />
        </AppProvider>
    </BrowserRouter>
)
