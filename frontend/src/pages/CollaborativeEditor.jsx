import React, { useState, useEffect, useRef, useContext } from 'react';
import { io } from 'socket.io-client';
import apiClient from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { CRDTEngine } from '../crdt/crdt_engine';

export default function CollaborativeEditor() {
  const { user, token } = useContext(AuthContext);
  const [documents, setDocuments] = useState([]);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [role, setRole] = useState(null);
  const [presence, setPresence] = useState([]);
  const [text, setText] = useState('');
  const [grantEmail, setGrantEmail] = useState('');
  const [grantRole, setGrantRole] = useState('EDITOR');
  const [statusMsg, setStatusMsg] = useState('');

  const socketRef = useRef(null);
  const crdtRef = useRef(new CRDTEngine());
  const textAreaRef = useRef(null);
  const lastSeqNumRef = useRef(0);

  // Fetch list of documents
  const fetchDocuments = async () => {
    try {
      const res = await apiClient.get('/documents');
      setDocuments(res.data);
    } catch (err) {
      console.error("Failed to load documents", err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchDocuments();
    }
  }, [token]);

  // Clean up socket when switching documents or unmounting
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const handleCreateDocument = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const res = await apiClient.post('/documents', { title: newTitle });
      setNewTitle('');
      await fetchDocuments();
      openDocument(res.data.id);
    } catch (err) {
      setStatusMsg(err.response?.data?.msg || 'Failed to create document');
    }
  };

  const openDocument = async (docId) => {
    try {
      const res = await apiClient.get(`/documents/${docId}`);
      setCurrentDoc(res.data);
      setRole(res.data.role);

      // Re-initialize C++ WebAssembly CRDT engine
      crdtRef.current = new CRDTEngine(user ? `user_${user.id}` : undefined);
      await crdtRef.current.init();
      lastSeqNumRef.current = 0;

      // Fetch snapshot or existing ops catch-up
      try {
        const snapRes = await apiClient.get(`/documents/${docId}/snapshot`);
        if (snapRes.data.snapshot) {
          crdtRef.current.loadSnapshot(snapRes.data.snapshot);
          setText(crdtRef.current.getText());
        }
      } catch (e) {
        console.log("No snapshot found");
      }

      // Fetch ops catch up
      const opsRes = await apiClient.get(`/documents/${docId}/ops?after=0`);
      if (opsRes.data.operations && opsRes.data.operations.length > 0) {
        opsRes.data.operations.forEach(op => {
          crdtRef.current.applyRemoteOp(op);
          if (op.seqNum && op.seqNum > lastSeqNumRef.current) {
            lastSeqNumRef.current = op.seqNum;
          }
        });
        setText(crdtRef.current.getText());
      }

      // Connect SocketIO
      if (socketRef.current) {
        socketRef.current.disconnect();
      }

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = import.meta.env.VITE_API_BASE_URL
        ? import.meta.env.VITE_API_BASE_URL.replace(/^http/, 'ws').replace(/\/api$/, '')
        : `${window.location.protocol}//${window.location.host}`;

      const socket = io(wsHost, {
        auth: { token },
        transports: ['websocket', 'polling']
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setStatusMsg('Connected to document room (using C++ WebAssembly CRDT engine)');
        socket.emit('join_document', { doc_id: docId });
      });

      socket.on('room_joined', (data) => {
        setRole(data.role);
        setPresence(data.presence || []);
      });

      socket.on('presence_update', (data) => {
        setPresence(data.presence || []);
      });

      socket.on('remote_operation', (op) => {
        const result = crdtRef.current.applyRemoteOp(op);
        if (result) {
          setText(crdtRef.current.getText());
          if (op.seqNum && op.seqNum > lastSeqNumRef.current) {
            lastSeqNumRef.current = op.seqNum;
          }
        }
      });

      socket.on('op_ack', (data) => {
        if (data.seqNum && data.seqNum > lastSeqNumRef.current) {
          lastSeqNumRef.current = data.seqNum;
        }
      });

      socket.on('error', (err) => {
        setStatusMsg(`Socket Error: ${err.msg}`);
      });

    } catch (err) {
      setStatusMsg(err.response?.data?.msg || 'Error opening document');
    }
  };

  const handleTextChange = (e) => {
    if (role === 'VIEWER') {
      setStatusMsg('Read-only mode: VIEWER cannot edit document.');
      return;
    }

    const newText = e.target.value;
    const oldText = text;

    // Determine insert vs delete delta
    if (newText.length > oldText.length) {
      // Insert
      let diffIdx = 0;
      while (diffIdx < oldText.length && oldText[diffIdx] === newText[diffIdx]) {
        diffIdx++;
      }
      const insertedChar = newText[diffIdx];
      const op = crdtRef.current.insert(insertedChar, diffIdx);
      setText(crdtRef.current.getText());

      if (socketRef.current && op) {
        op.docId = currentDoc.id;
        socketRef.current.emit('submit_operation', op);
      }
    } else if (newText.length < oldText.length) {
      // Delete
      let diffIdx = 0;
      while (diffIdx < newText.length && oldText[diffIdx] === newText[diffIdx]) {
        diffIdx++;
      }
      const op = crdtRef.current.delete(diffIdx);
      setText(crdtRef.current.getText());

      if (socketRef.current && op) {
        op.docId = currentDoc.id;
        socketRef.current.emit('submit_operation', op);
      }
    }
  };

  const handleGrantPermission = async (e) => {
    e.preventDefault();
    if (!currentDoc || !grantEmail.trim()) return;
    try {
      await apiClient.post(`/documents/${currentDoc.id}/permissions`, {
        email: grantEmail,
        role: grantRole
      });
      setStatusMsg(`Permission updated for ${grantEmail}`);
      setGrantEmail('');
      openDocument(currentDoc.id);
    } catch (err) {
      setStatusMsg(err.response?.data?.msg || 'Failed to grant permission');
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
      <h1>CRDT Collaborative Text Editor (C++ WebAssembly)</h1>
      <p style={{ color: 'var(--text-secondary)' }}>
        Real-time collaborative editing using your C++ LSeq B-Tree WebAssembly engine on the client.
      </p>

      {statusMsg && (
        <div style={{ background: '#333', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem', color: '#ffca28' }}>
          {statusMsg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem' }}>
        {/* Left Sidebar: Document List & Actions */}
        <div className="card" style={{ height: 'fit-content' }}>
          <h3>My Documents</h3>
          <form onSubmit={handleCreateDocument} style={{ marginTop: '0.75rem', marginBottom: '1rem' }}>
            <input
              type="text"
              placeholder="New Document Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              style={{ width: '100%', marginBottom: '0.5rem' }}
            />
            <button type="submit" style={{ width: '100%' }}>Create Document</button>
          </form>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {documents.map((doc) => (
              <li
                key={doc.id}
                onClick={() => openDocument(doc.id)}
                style={{
                  padding: '0.6rem 0.8rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  marginBottom: '0.5rem',
                  background: currentDoc?.id === doc.id ? 'var(--primary, #4f46e5)' : '#222',
                  color: '#fff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>{doc.title}</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>({doc.role})</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right Section: Editor Panel & Presence */}
        <div>
          {currentDoc ? (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h2 style={{ margin: 0 }}>{currentDoc.title}</h2>
                  <span style={{ fontSize: '0.85rem', color: '#aaa' }}>Your Role: <strong>{role}</strong></span>
                </div>
                {/* Active Presence Badges */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: '#aaa' }}>Active Users:</span>
                  {presence.map((p, idx) => (
                    <span
                      key={idx}
                      style={{
                        background: '#10b981',
                        color: '#000',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '12px'
                      }}
                    >
                      ● {p.username}
                    </span>
                  ))}
                </div>
              </div>

              {/* CRDT Textarea */}
              <textarea
                ref={textAreaRef}
                value={text}
                onChange={handleTextChange}
                disabled={role === 'VIEWER'}
                placeholder={role === 'VIEWER' ? "Read-only access (VIEWER role)..." : "Type your document content here..."}
                style={{
                  width: '100%',
                  height: '350px',
                  padding: '1rem',
                  fontSize: '1.05rem',
                  fontFamily: 'monospace',
                  background: '#1e1e1e',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  resize: 'vertical'
                }}
              />

              {/* Share & Permissions Section (Owner Only) */}
              {role === 'OWNER' && (
                <div style={{ marginTop: '1.5rem', borderTop: '1px solid #333', paddingTop: '1rem' }}>
                  <h4>Share & Manage Permissions</h4>
                  <form onSubmit={handleGrantPermission} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <input
                      type="email"
                      placeholder="Collaborator Email"
                      value={grantEmail}
                      onChange={(e) => setGrantEmail(e.target.value)}
                      required
                      style={{ flex: 1 }}
                    />
                    <select value={grantRole} onChange={(e) => setGrantRole(e.target.value)}>
                      <option value="EDITOR">EDITOR</option>
                      <option value="VIEWER">VIEWER</option>
                    </select>
                    <button type="submit">Grant Access</button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <h3>No Document Selected</h3>
              <p style={{ color: '#aaa' }}>Select an existing document from the left sidebar or create a new one to start real-time C++ WebAssembly CRDT editing.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
