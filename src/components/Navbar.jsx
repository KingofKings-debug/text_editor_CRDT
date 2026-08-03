// src/components/Navbar.jsx
import React, { useState } from 'react';

export default function Navbar({
    docTitle,
    onTitleChange,
    peers = [],
    connectionStatus = 'connected',
    siteId,
    isInspectorOpen,
    onToggleInspector,
    theme,
    onToggleTheme,
    onLeaveRoom,
    onCopyShareLink
}) {
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [tempTitle, setTempTitle] = useState(docTitle || '');
    const [copied, setCopied] = useState(false);

    const handleTitleSubmit = (e) => {
        e.preventDefault();
        if (tempTitle.trim()) {
            onTitleChange(tempTitle.trim());
        }
        setIsEditingTitle(false);
    };

    const handleShare = () => {
        if (onCopyShareLink) onCopyShareLink();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <header style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 24px',
            borderBottom: 'var(--glass-border)',
            background: 'var(--bg-secondary)',
            gap: '16px',
            flexWrap: 'wrap'
        }}>
            {/* Left: Brand & Doc Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button
                    onClick={onLeaveRoom}
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    title="Back to Dashboard"
                >
                    <span style={{ fontSize: '16px' }}>←</span> Dashboard
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isEditingTitle ? (
                        <form onSubmit={handleTitleSubmit} style={{ display: 'flex', gap: '6px' }}>
                            <input
                                type="text"
                                value={tempTitle}
                                onChange={(e) => setTempTitle(e.target.value)}
                                autoFocus
                                className="input-field"
                                style={{ padding: '4px 8px', fontSize: '16px', width: '220px', fontWeight: 'bold' }}
                                onBlur={handleTitleSubmit}
                            />
                        </form>
                    ) : (
                        <div
                            onClick={() => { setTempTitle(docTitle); setIsEditingTitle(true); }}
                            style={{
                                fontSize: '18px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                            title="Click to rename document"
                        >
                            <span>{docTitle || 'Untitled Document'}</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>✏️</span>
                        </div>
                    )}
                </div>

                {/* Connection Status Pill */}
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: connectionStatus === 'connected' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: connectionStatus === 'connected' ? 'var(--accent-green)' : 'var(--accent-yellow)',
                    border: `1px solid ${connectionStatus === 'connected' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                }}>
                    <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: connectionStatus === 'connected' ? 'var(--accent-green)' : 'var(--accent-yellow)',
                        display: 'inline-block'
                    }} />
                    {connectionStatus === 'connected' ? 'Flask Sync Live' : 'Connecting...'}
                </div>
            </div>

            {/* Right: Peers, Tools & Theme */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {/* Active Collaborator Badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '-6px' }}>
                    {peers.map((peer) => (
                        <div
                            key={peer.sid || peer.site_id}
                            style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                backgroundColor: peer.color || '#3b82f6',
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold',
                                fontSize: '12px',
                                border: '2px solid var(--bg-secondary)',
                                title: `${peer.user_name} (${peer.site_id})`,
                                marginLeft: '-8px'
                            }}
                            title={`${peer.user_name} (Site: ${peer.site_id}) ${peer.site_id === siteId ? '[YOU]' : ''}`}
                        >
                            {peer.user_name ? peer.user_name[0].toUpperCase() : 'U'}
                        </div>
                    ))}
                    <span style={{ marginLeft: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {peers.length} online
                    </span>
                </div>

                {/* Share Link Button */}
                <button
                    onClick={handleShare}
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '13px' }}
                >
                    {copied ? '✓ Copied!' : '🔗 Share'}
                </button>

                {/* Op Inspector Drawer Toggle */}
                <button
                    onClick={onToggleInspector}
                    className="btn-secondary"
                    style={{
                        padding: '6px 12px',
                        fontSize: '13px',
                        borderColor: isInspectorOpen ? 'var(--accent-purple)' : 'var(--border-color)',
                        color: isInspectorOpen ? 'var(--accent-purple)' : 'var(--text-primary)'
                    }}
                >
                    ⚡ LSEQ Ops ({isInspectorOpen ? 'Hide' : 'Show'})
                </button>

                {/* Theme Switcher */}
                <button
                    onClick={onToggleTheme}
                    className="btn-icon"
                    title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
                    style={{ fontSize: '18px' }}
                >
                    {theme === 'dark' ? '☀️' : '🌙'}
                </button>
            </div>
        </header>
    );
}
