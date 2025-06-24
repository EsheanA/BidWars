import React, { createContext, useState, useEffect} from 'react';

export const AppContext = createContext();
export const AppProvider = ({ children }) => {
    // const [username, setUsername] = useState("")
    const [user, setUser] = useState(null)
    return (
    <AppContext.Provider value={[user, setUser]}>
        {children}
    </AppContext.Provider>
    );
};