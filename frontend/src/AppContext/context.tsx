import { createContext, useState} from 'react';
import { type User } from '../types/User.js';
type AppContextType = {
    user: User | null,
    setUser: React.Dispatch<React.SetStateAction<User | null>>
};

export const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children } : {children: React.ReactNode}) => {
    const [user, setUser] = useState<User | null>(null);

    return (
    <AppContext.Provider value={{user, setUser}}>
        {children}
    </AppContext.Provider>
    );
};