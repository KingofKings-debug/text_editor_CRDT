// src/RoomManager.jsx
import React, { useState } from 'react';
import axios from 'axios';

export default function RoomManager({ onJoinRoom }) {
    const [joinId, setJoinId] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Generates a random alphanumeric string for the Site ID
    const generateSiteId = () => Math.random().toString(36).substring(2, 9);

    const handleCreateRoom = async () => {
        setIsLoading(true);
        const newRoomId = Math.random().toString(36).substring(2, 9);

        // [FUTURE BACKEND INTEGRATION]
        // await axios.post('http://localhost:3000/api/rooms', { roomId: newRoomId });

        onJoinRoom({ roomId: newRoomId, siteId: generateSiteId() });
        setIsLoading(false);
    };

    const handleJoinRoom = async (e) => {
        e.preventDefault();
        if (!joinId.trim()) return;

        setIsLoading(true);

        // [FUTURE BACKEND INTEGRATION]
        // try {
        //   const response = await axios.get(`http://localhost:3000/api/rooms/${joinId}`);
        //   // Note: You would pass the initial document state from 'response' into the Editor here
        // } catch (err) {
        //   alert("Room not found!");
        //   setIsLoading(false);
        //   return;
        // }

        onJoinRoom({ roomId: joinId, siteId: generateSiteId() });
        setIsLoading(false);
    };

    return (
        <div style={{ maxWidth: '400px', margin: '100px auto', fontFamily: 'sans-serif' }}>
            <h1 style={{ textAlign: 'center' }}>CRDT Editor</h1>

            <div style={{ padding: '30px', border: '1px solid #e0e0e0', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                <h3 style={{ marginTop: 0 }}>Create a New Room</h3>
                <button
                    onClick={handleCreateRoom}
                    disabled={isLoading}
                    style={{ padding: '12px', width: '100%', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                    {isLoading ? 'Creating...' : 'Create Room'}
                </button>

                <div style={{ margin: '24px 0', textAlign: 'center', color: '#888' }}>— OR —</div>

                <h3 style={{ marginTop: 0 }}>Join Existing Room</h3>
                <form onSubmit={handleJoinRoom} style={{ display: 'flex', gap: '10px' }}>
                    <input
                        type="text"
                        placeholder="Enter Room ID"
                        value={joinId}
                        onChange={(e) => setJoinId(e.target.value)}
                        style={{ flex: 1, padding: '12px', border: '1px solid #ccc', borderRadius: '6px' }}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !joinId}
                        style={{ padding: '12px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                    >
                        Join
                    </button>
                </form>
            </div>
        </div>
    );
}