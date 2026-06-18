// src/App.jsx
import React, { useState } from 'react';
import RoomManager from './RoomManager';
import CollaborativeEditor from './CollaborativeEditor';

export default function App() {
    const [roomData, setRoomData] = useState(null);

    // If the user hasn't joined a room, show the Lobby
    if (!roomData) {
        return <RoomManager onJoinRoom={setRoomData} />;
    }

    // Otherwise, render the Editor
    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ margin: 0 }}>Room ID: {roomData.roomId}</h2>
                    <small style={{ color: '#666' }}>Your Site ID: {roomData.siteId}</small>
                </div>
                <button
                    onClick={() => setRoomData(null)}
                    style={{ padding: '8px 16px', cursor: 'pointer' }}
                >
                    Leave Room
                </button>
            </header>

            <CollaborativeEditor roomData={roomData} />
        </div>
    );
}