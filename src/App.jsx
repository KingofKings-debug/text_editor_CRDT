// src/App.jsx
import React, { useState, useEffect } from 'react';
import RoomManager from './RoomManager';
import CollaborativeEditor from './CollaborativeEditor';

export default function App() {
    const [roomData, setRoomData] = useState(null);
    const [theme, setTheme] = useState('dark');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    if (!roomData) {
        return (
            <RoomManager
                onJoinRoom={setRoomData}
                theme={theme}
                onToggleTheme={toggleTheme}
            />
        );
    }

    return (
        <CollaborativeEditor
            roomData={roomData}
            onLeaveRoom={() => setRoomData(null)}
            theme={theme}
            onToggleTheme={toggleTheme}
        />
    );
}