// src/RoomManager.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';

export default function RoomManager({ onJoinRoom, theme, onToggleTheme }) {
    const [documents, setDocuments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [joinId, setJoinId] = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [joinErrorMsg, setJoinErrorMsg] = useState('');

    const generateSiteId = () => Math.random().toString(36).substring(2, 9);

    const fetchDocuments = async () => {
        setIsLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/documents`);
            setDocuments(res.data || []);
            setErrorMsg('');
        } catch (err) {
            console.error("Failed to fetch documents from backend:", err);
            setErrorMsg('Unable to connect to Flask server on http://localhost:5000. Ensure python server/app.py is running!');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, []);

    const handleCreateRoom = async (e) => {
        e.preventDefault();
        const titleToUse = newTitle.trim() || `Room ${Math.random().toString(36).substring(2, 6)}`;
        try {
            const res = await axios.post(`${API_BASE}/documents`, { title: titleToUse });
            const doc = res.data;
            setShowCreateModal(false);
            setNewTitle('');
            onJoinRoom({
                roomId: doc.id,
                title: doc.title,
                siteId: generateSiteId()
            });
        } catch (err) {
            console.error("Failed to create room:", err);
            setErrorMsg('Failed to create room on server.');
        }
    };

    const handleJoinById = async (roomIdToJoin) => {
        const targetId = (roomIdToJoin || joinId).trim();
        if (!targetId) return;

        setJoinErrorMsg('');
        try {
            const res = await axios.get(`${API_BASE}/documents/${targetId}`);
            const doc = res.data.document || res.data;
            onJoinRoom({
                roomId: targetId,
                title: doc.title || `Room ${targetId}`,
                siteId: generateSiteId()
            });
        } catch (err) {
            if (err.response && err.response.status === 404) {
                setJoinErrorMsg(`⚠️ No room found with ID: "${targetId}". Please check the Room ID or create a new room.`);
            } else {
                setJoinErrorMsg(`⚠️ Could not connect to room "${targetId}". Ensure backend server is online.`);
            }
        }
    };

    const handleDeleteDoc = async (docId, e) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this room?")) return;
        try {
            await axios.delete(`${API_BASE}/documents/${docId}`);
            setDocuments(prev => prev.filter(d => d.id !== docId));
        } catch (err) {
            console.error("Failed to delete document:", err);
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header Banner */}
            <header style={{
                padding: '20px 32px',
                borderBottom: 'var(--glass-border)',
                background: 'var(--bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '28px' }}>🚀</span>
                    <div>
                        <h1 style={{ fontSize: '20px', fontWeight: 800 }}>LSEQ CRDT Collaborative Suite</h1>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            Single Unique Room Identifier • Real-time Eventual Consistency
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        onClick={onToggleTheme}
                        className="btn-icon"
                        title="Toggle theme"
                        style={{ fontSize: '20px' }}
                    >
                        {theme === 'dark' ? '☀️' : '🌙'}
                    </button>

                    <button
                        onClick={() => { setJoinErrorMsg(''); setShowCreateModal(true); }}
                        className="btn btn-primary"
                    >
                        + Create Room
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main style={{ flex: 1, padding: '32px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
                {errorMsg && (
                    <div style={{
                        padding: '14px 18px',
                        borderRadius: '8px',
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: 'var(--accent-red)',
                        marginBottom: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '14px'
                    }}>
                        <span>⚠️ {errorMsg}</span>
                        <button onClick={fetchDocuments} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }}>
                            Retry Connection
                        </button>
                    </div>
                )}

                {/* Direct Room Join Form */}
                <div className="glass-panel" style={{ padding: '24px', marginBottom: '32px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>
                        🔑 Join Existing Room
                    </h3>
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleJoinById(); }}
                        style={{ display: 'flex', gap: '12px' }}
                    >
                        <input
                            type="text"
                            placeholder="Enter Unique Room ID (e.g. room-8f2a1b)"
                            value={joinId}
                            onChange={(e) => { setJoinId(e.target.value); setJoinErrorMsg(''); }}
                            className="input-field"
                            style={{ flex: 1 }}
                        />
                        <button
                            type="submit"
                            disabled={!joinId.trim()}
                            className="btn btn-primary"
                            style={{ opacity: joinId.trim() ? 1 : 0.6 }}
                        >
                            Join Room
                        </button>
                    </form>

                    {/* Room Not Found Alert */}
                    {joinErrorMsg && (
                        <div style={{
                            marginTop: '12px',
                            padding: '10px 14px',
                            borderRadius: '6px',
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: 'var(--accent-red)',
                            fontSize: '13px',
                            fontWeight: 600
                        }}>
                            {joinErrorMsg}
                        </div>
                    )}
                </div>

                {/* Rooms Grid Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Available Active Rooms</h2>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {documents.length} active room{documents.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {/* Rooms Grid */}
                {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
                        Searching active room registry...
                    </div>
                ) : documents.length === 0 ? (
                    <div className="glass-panel" style={{ textAlign: 'center', padding: '48px 24px' }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🚪</div>
                        <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>No active rooms exist</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
                            Click below to create a new room with a unique Room ID.
                        </p>
                        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
                            + Create Room
                        </button>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: '20px'
                    }}>
                        {documents.map((doc) => (
                            <div
                                key={doc.id}
                                className="glass-panel"
                                onClick={() => handleJoinById(doc.id)}
                                style={{
                                    padding: '20px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    position: 'relative'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                                            {doc.title}
                                        </h3>
                                        <button
                                            onClick={(e) => handleDeleteDoc(doc.id, e)}
                                            className="btn-icon"
                                            title="Delete Room"
                                            style={{ color: 'var(--accent-red)', opacity: 0.7 }}
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                    <p style={{
                                        fontSize: '12px',
                                        color: 'var(--text-muted)',
                                        fontFamily: 'monospace',
                                        marginBottom: '16px'
                                    }}>
                                        Room ID: {doc.id}
                                    </p>
                                </div>

                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    borderTop: 'var(--glass-border)',
                                    paddingTop: '12px',
                                    fontSize: '12px',
                                    color: 'var(--text-secondary)'
                                }}>
                                    <span>📊 {doc.char_count || 0} chars</span>
                                    <span>⚡ {doc.op_count || 0} ops</span>
                                    <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>Enter Room →</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Create Room Modal */}
            {showCreateModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 100
                }}>
                    <div className="glass-panel animate-fade-in" style={{ width: '420px', padding: '28px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
                            Create New Collaborative Room
                        </h3>
                        <form onSubmit={handleCreateRoom} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                    Room Title / Name
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Distributed Systems Discussion"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    autoFocus
                                    className="input-field"
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                >
                                    Create Room
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}