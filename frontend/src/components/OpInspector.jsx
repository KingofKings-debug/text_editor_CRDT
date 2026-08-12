// src/components/OpInspector.jsx
import React, { useState } from 'react';

export default function OpInspector({ operations = [], siteId, isOpen, onClose }) {
    const [filter, setFilter] = useState('all'); // 'all', 'local', 'remote'
    const [searchTerm, setSearchTerm] = useState('');

    if (!isOpen) return null;

    const filteredOps = operations.filter(op => {
        const isLocal = op.siteId === siteId;
        if (filter === 'local' && !isLocal) return false;
        if (filter === 'remote' && isLocal) return false;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const charStr = op.char || '';
            const typeStr = op.type || op.op_type || '';
            const siteStr = op.siteId || '';
            const lseqStr = JSON.stringify(op.lseqId || '');
            return (
                charStr.toLowerCase().includes(term) ||
                typeStr.toLowerCase().includes(term) ||
                siteStr.toLowerCase().includes(term) ||
                lseqStr.toLowerCase().includes(term)
            );
        }
        return true;
    });

    const formatLseqId = (lseqId) => {
        if (!lseqId) return 'N/A';
        if (typeof lseqId === 'string') return lseqId;
        if (Array.isArray(lseqId)) {
            return lseqId.map(pos => `(${pos.digit || pos[0]}, ${pos.site || pos[1]})`).join('.');
        }
        return JSON.stringify(lseqId);
    };

    return (
        <aside style={{
            width: '380px',
            borderLeft: 'var(--glass-border)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
            boxShadow: '-4px 0 15px rgba(0,0,0,0.15)'
        }} className="animate-fade-in">
            {/* Drawer Header */}
            <div style={{
                padding: '16px',
                borderBottom: 'var(--glass-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>⚡</span>
                    <h3 style={{ fontSize: '16px', fontWeight: 600 }}>LSEQ CRDT Inspector</h3>
                </div>
                <button onClick={onClose} className="btn-icon" style={{ fontSize: '16px' }}>✕</button>
            </div>

            {/* Educational Info Box */}
            <div style={{
                padding: '12px 16px',
                background: 'rgba(139, 92, 246, 0.1)',
                borderBottom: 'var(--glass-border)',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                lineHeight: '1.4'
            }}>
                💡 <strong>LSEQ Sequence Allocation</strong> assigns each character a unique tree path index, ensuring lock-free conflict resolution across peers.
            </div>

            {/* Controls Header */}
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px', borderBottom: 'var(--glass-border)' }}>
                {/* Search Input */}
                <input
                    type="text"
                    placeholder="Search operations or LSEQ path..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input-field"
                    style={{ padding: '8px 12px', fontSize: '13px' }}
                />

                {/* Filter Pills */}
                <div style={{ display: 'flex', gap: '6px' }}>
                    {['all', 'local', 'remote'].map(mode => (
                        <button
                            key={mode}
                            onClick={() => setFilter(mode)}
                            className="btn-secondary"
                            style={{
                                flex: 1,
                                padding: '4px 8px',
                                fontSize: '12px',
                                textTransform: 'capitalize',
                                backgroundColor: filter === mode ? 'var(--accent-purple)' : 'transparent',
                                color: filter === mode ? '#ffffff' : 'var(--text-secondary)',
                                borderColor: filter === mode ? 'var(--accent-purple)' : 'var(--border-color)'
                            }}
                        >
                            {mode} ({mode === 'all' ? operations.length : operations.filter(o => mode === 'local' ? o.siteId === siteId : o.siteId !== siteId).length})
                        </button>
                    ))}
                </div>
            </div>

            {/* Operations Stream List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredOps.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: '13px' }}>
                        No LSEQ operations logged yet. Start typing in the editor!
                    </div>
                ) : (
                    filteredOps.map((op, idx) => {
                        const isLocal = op.siteId === siteId;
                        const isInsert = (op.type || op.op_type) === 'remote_insert' || op.type === 'local_insert' || op.op_type === 'insert';
                        
                        return (
                            <div
                                key={idx}
                                style={{
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    background: 'var(--bg-primary)',
                                    borderLeft: `4px solid ${isInsert ? 'var(--accent-green)' : 'var(--accent-red)'}`,
                                    fontSize: '12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{
                                        fontWeight: 'bold',
                                        color: isInsert ? 'var(--accent-green)' : 'var(--accent-red)',
                                        textTransform: 'uppercase',
                                        fontSize: '11px'
                                    }}>
                                        {isInsert ? '➕ INSERT' : '➖ DELETE'} {op.char ? `'${op.char === '\n' ? '↵' : op.char}'` : ''}
                                    </span>
                                    <span style={{
                                        fontSize: '10px',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        background: isLocal ? 'rgba(59, 130, 246, 0.2)' : 'rgba(139, 92, 246, 0.2)',
                                        color: isLocal ? 'var(--accent-blue)' : 'var(--accent-purple)'
                                    }}>
                                        {isLocal ? 'LOCAL (You)' : `SITE ${op.siteId ? op.siteId.substring(0, 6) : 'PEER'}`}
                                    </span>
                                </div>

                                <div style={{
                                    fontFamily: 'monospace',
                                    fontSize: '11px',
                                    color: 'var(--text-secondary)',
                                    wordBreak: 'break-all',
                                    background: 'var(--bg-secondary)',
                                    padding: '4px 6px',
                                    borderRadius: '4px'
                                }}>
                                    LSEQ: {formatLseqId(op.lseqId)}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </aside>
    );
}
