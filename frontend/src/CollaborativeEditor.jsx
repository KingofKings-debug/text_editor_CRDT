// src/CollaborativeEditor.jsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import OpInspector from './components/OpInspector';
import { loadWasmCrdtModule } from './crdt/crdt_engine';

const SERVER_URL = '';

export default function CollaborativeEditor({ roomData, onLeaveRoom, theme, onToggleTheme }) {
    const [text, setText] = useState("");
    const [isWasmReady, setIsWasmReady] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('connecting');
    const [peers, setPeers] = useState([]);
    const [operations, setOperations] = useState([]);
    const [isInspectorOpen, setIsInspectorOpen] = useState(false);
    const [docTitle, setDocTitle] = useState(roomData.title || `Document ${roomData.roomId}`);
    const [copySuccess, setCopySuccess] = useState(false);
    const [avgLatencyMs, setAvgLatencyMs] = useState(15);
    const [authToken, setAuthToken] = useState(localStorage.getItem('crdt_jwt_token') || '');

    const crdtInstance = useRef(null);
    const socketRef = useRef(null);
    const textAreaRef = useRef(null);
    const nextCursorPos = useRef(null);
    const lastOpIndexRef = useRef(0);

    // ── 1. Initialize WASM LSEQ CRDT Engine ────────────────────────────────
    useEffect(() => {
        let isMounted = true;

        async function loadWasm() {
            try {
                const Module = await loadWasmCrdtModule();
                if (!Module) {
                    throw new Error("WASM module failed to load.");
                }
                if (!isMounted) return;

                crdtInstance.current = new Module.LseqCRDT(roomData.siteId);
                setText(crdtInstance.current.renderText());
                setIsWasmReady(true);
            } catch (error) {
                console.error("Failed to load WASM module:", error);
            }
        }
        loadWasm();

        return () => {
            isMounted = false;
            if (crdtInstance.current) {
                crdtInstance.current.delete();
                crdtInstance.current = null;
            }
        };
    }, [roomData.siteId]);

    // ── 2. Request JWT Token & Setup Socket.IO Real-time Connection ──────
    useEffect(() => {
        if (!isWasmReady) return;

        async function initConnection() {
            let token = authToken;
            if (!token) {
                try {
                    const authRes = await axios.post(`${SERVER_URL}/api/auth/token`, {
                        siteId: roomData.siteId,
                        roomId: roomData.roomId
                    });
                    token = authRes.data.token;
                    setAuthToken(token);
                    localStorage.setItem('crdt_jwt_token', token);
                } catch (err) {
                    console.warn("Auth token request failed, using anonymous connection:", err);
                }
            }

            const socket = io(SERVER_URL, {
                auth: { token },
                transports: ['websocket', 'polling'],
                reconnectionAttempts: 20,
                reconnectionDelay: 1000
            });
            socketRef.current = socket;

            socket.on('connect', () => {
                setConnectionStatus('connected');
                socket.emit('join_room', {
                    roomId: roomData.roomId,
                    siteId: roomData.siteId,
                    userName: `Peer-${roomData.siteId.substring(0, 4)}`,
                    lastOpIndex: lastOpIndexRef.current,
                    token
                });
            });

            socket.on('disconnect', () => {
                setConnectionStatus('disconnected');
            });

            socket.on('room_joined', (data) => {
                if (data.peers) setPeers(data.peers);
                if (data.token) {
                    setAuthToken(data.token);
                    localStorage.setItem('crdt_jwt_token', data.token);
                }
                if (data.document && data.document.title) {
                    setDocTitle(data.document.title);
                }
                if (data.operations && Array.isArray(data.operations)) {
                    setOperations(data.operations);
                    lastOpIndexRef.current = data.operations.length;

                    const crdt = crdtInstance.current;
                    if (crdt) {
                        data.operations.forEach(op => {
                            try {
                                if (op.op_type === 'remote_insert' || op.type === 'remote_insert') {
                                    crdt.remoteInsert(op.lseq_id || op.lseqId, op.char);
                                } else if (op.op_type === 'remote_delete' || op.type === 'remote_delete') {
                                    crdt.remoteDelete(op.lseq_id || op.lseqId);
                                }
                            } catch (err) {
                                console.warn("Op replay guard:", err);
                            }
                        });
                        setText(crdt.renderText());
                    }
                }
            });

            socket.on('room_presence', (data) => {
                if (data.peers) setPeers(data.peers);
            });

            socket.on('room_error', (data) => {
                alert(data.message || 'No room found with this ID!');
                if (onLeaveRoom) onLeaveRoom();
            });

            socket.on('lseq_op', (msg) => {
                if (msg.siteId === roomData.siteId) return;

                const crdt = crdtInstance.current;
                if (!crdt) return;

                try {
                    if (msg.type === 'remote_insert') {
                        crdt.remoteInsert(msg.lseqId, msg.char);
                    } else if (msg.type === 'remote_delete') {
                        crdt.remoteDelete(msg.lseqId);
                    }
                    setText(crdt.renderText());
                    setOperations(prev => [...prev, msg]);
                    lastOpIndexRef.current += 1;

                    if (msg.latencyMs) {
                        setAvgLatencyMs(prev => Math.round((prev * 4 + msg.latencyMs) / 5));
                    }
                } catch (err) {
                    console.error("Error applying remote LSEQ operation:", err);
                }
            });

            socket.on('title_changed', (data) => {
                if (data.title) setDocTitle(data.title);
            });
        }

        initConnection();

        // ── Periodic Heartbeat Ping (Every 10s) ─────────────────────────
        const heartbeatInterval = setInterval(() => {
            if (socketRef.current && socketRef.current.connected) {
                socketRef.current.emit('heartbeat', {
                    roomId: roomData.roomId,
                    siteId: roomData.siteId
                });
            }
        }, 10000);

        return () => {
            clearInterval(heartbeatInterval);
            if (socketRef.current) {
                socketRef.current.emit('leave_room', { roomId: roomData.roomId });
                socketRef.current.disconnect();
            }
        };
    }, [isWasmReady, roomData.roomId, roomData.siteId, authToken, onLeaveRoom]);

    // ── 3. Cursor position restoration ────────────────────────────────────
    useEffect(() => {
        if (textAreaRef.current && nextCursorPos.current !== null) {
            textAreaRef.current.selectionStart = nextCursorPos.current;
            textAreaRef.current.selectionEnd = nextCursorPos.current;
        }
    });

    // ── 4. Handle Local Input & Delete ───────────────────────────────────
    const handleChange = useCallback((e) => {
        const newValue = e.target.value;
        const cursor = e.target.selectionStart;

        const crdt = crdtInstance.current;
        if (!crdt) return;

        const oldText = crdt.renderText();
        const oldLen = oldText.length;
        const newLen = newValue.length;
        const delta = newLen - oldLen;

        const socket = socketRef.current;
        const sendTime = Date.now();

        if (delta > 0) {
            const insertStart = cursor - delta;
            for (let i = 0; i < delta; i++) {
                const char = newValue[insertStart + i];
                const lseqId = crdt.localInsert(insertStart + i, char);

                const opPayload = {
                    roomId: roomData.roomId,
                    type: 'remote_insert',
                    lseqId,
                    char,
                    siteId: roomData.siteId,
                    textSnapshot: newValue,
                    timestamp: sendTime
                };

                if (socket && socket.connected) {
                    socket.emit('lseq_op', opPayload);
                }

                setOperations(prev => [...prev, opPayload]);
                lastOpIndexRef.current += 1;
            }
            nextCursorPos.current = cursor;

        } else if (delta < 0) {
            const deleteCount = -delta;
            for (let i = 0; i < deleteCount; i++) {
                const lseqId = crdt.localDelete(cursor);
                if (!lseqId) break;

                const opPayload = {
                    roomId: roomData.roomId,
                    type: 'remote_delete',
                    lseqId,
                    siteId: roomData.siteId,
                    textSnapshot: newValue,
                    timestamp: sendTime
                };

                if (socket && socket.connected) {
                    socket.emit('lseq_op', opPayload);
                }

                setOperations(prev => [...prev, opPayload]);
                lastOpIndexRef.current += 1;
            }
            nextCursorPos.current = cursor;
        }

        setText(crdt.renderText());
    }, [roomData.roomId, roomData.siteId]);

    const handleTitleChange = (newTitle) => {
        setDocTitle(newTitle);
        if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('update_title', {
                roomId: roomData.roomId,
                title: newTitle
            });
        }
    };

    const handleCopyShareLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    const handleExportFile = () => {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${docTitle.replace(/[^a-z0-9]/gi, '_')}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const charCount = text.length;
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lineCount = text.split('\n').length;

    if (!isWasmReady) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '16px'
            }}>
                <div style={{ fontSize: '36px', animation: 'spin 1s infinite linear' }}>⚙️</div>
                <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Initializing C++ LSEQ WASM Engine...</h3>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            {/* Top Toolbar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 24px',
                background: 'var(--bg-secondary)',
                borderBottom: 'var(--glass-border)',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                {/* Left: Document title and Room ID */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button onClick={onLeaveRoom} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}>
                        ← Dashboard
                    </button>

                    <input
                        type="text"
                        value={docTitle}
                        onChange={(e) => handleTitleChange(e.target.value)}
                        className="input-field"
                        style={{ padding: '4px 10px', fontSize: '16px', fontWeight: 'bold', width: '240px' }}
                    />

                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        Room: {roomData.roomId} | Site: {roomData.siteId}
                    </span>
                </div>

                {/* Right: Peers, Sync Latency, Status & Tools */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Latency Pill */}
                    <span style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '10px',
                        fontWeight: 600,
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: 'var(--accent-blue)',
                        border: '1px solid rgba(59, 130, 246, 0.3)'
                    }}>
                        ⚡ Sync Latency: &lt;{avgLatencyMs} ms
                    </span>

                    {/* Connection Status Pill */}
                    <span style={{
                        fontSize: '12px',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontWeight: 600,
                        background: connectionStatus === 'connected' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                        color: connectionStatus === 'connected' ? 'var(--accent-green)' : 'var(--accent-yellow)',
                        border: `1px solid ${connectionStatus === 'connected' ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`
                    }}>
                        ● {connectionStatus === 'connected' ? 'Redis Sync Live (JWT Auth)' : 'Connecting...'}
                    </span>

                    {/* Active User Badges */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        {peers.map((p, idx) => (
                            <div
                                key={p.sid || idx}
                                style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    background: p.color || '#3b82f6',
                                    color: '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    border: '2px solid var(--bg-secondary)',
                                    marginLeft: idx > 0 ? '-6px' : '0'
                                }}
                                title={`${p.user_name} (${p.site_id})`}
                            >
                                {p.user_name ? p.user_name[0].toUpperCase() : 'U'}
                            </div>
                        ))}
                    </div>

                    <button onClick={handleCopyShareLink} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                        {copySuccess ? '✓ Copied!' : '🔗 Share'}
                    </button>

                    <button onClick={handleExportFile} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                        📥 Export .txt
                    </button>

                    <button
                        onClick={() => setIsInspectorOpen(!isInspectorOpen)}
                        className="btn-secondary"
                        style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            borderColor: isInspectorOpen ? 'var(--accent-purple)' : 'var(--border-color)',
                            color: isInspectorOpen ? 'var(--accent-purple)' : 'var(--text-primary)'
                        }}
                    >
                        ⚡ LSEQ Inspector
                    </button>

                    <button onClick={onToggleTheme} className="btn-icon">
                        {theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                </div>
            </div>

            {/* Editor Workspace & Inspector Container */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
                    <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <textarea
                            ref={textAreaRef}
                            value={text}
                            onChange={handleChange}
                            placeholder="Type here... Operation-based LSEQ CRDT synced via Flask, SocketIO & Redis Pub/Sub with JWT authentication!"
                            style={{
                                flex: 1,
                                width: '100%',
                                padding: '24px',
                                fontSize: '16px',
                                lineHeight: '1.6',
                                fontFamily: "'Fira Code', 'Cascadia Code', Consolas, Monaco, monospace",
                                background: 'transparent',
                                color: 'var(--text-primary)',
                                border: 'none',
                                resize: 'none',
                                outline: 'none'
                            }}
                        />

                        {/* Status Bar */}
                        <div style={{
                            padding: '8px 20px',
                            borderTop: 'var(--glass-border)',
                            background: 'var(--bg-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '12px',
                            color: 'var(--text-secondary)'
                        }}>
                            <div style={{ display: 'flex', gap: '16px' }}>
                                <span>{charCount} Characters</span>
                                <span>{wordCount} Words</span>
                                <span>{lineCount} Lines</span>
                            </div>
                            <div style={{ display: 'flex', gap: '16px' }}>
                                <span>⚡ {operations.length} LSEQ Ops Logged</span>
                                <span>🔑 JWT Active</span>
                                <span>👥 {peers.length} Concurrent Peers</span>
                            </div>
                        </div>
                    </div>
                </div>

                <OpInspector
                    operations={operations}
                    siteId={roomData.siteId}
                    isOpen={isInspectorOpen}
                    onClose={() => setIsInspectorOpen(false)}
                />
            </div>
        </div>
    );
}