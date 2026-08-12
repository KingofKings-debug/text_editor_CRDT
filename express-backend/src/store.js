class InMemoryStore {
  constructor() {
    this.documents = new Map(); // roomId -> { id, title, textSnapshot, createdAt, updatedAt }
    this.operations = new Map(); // roomId -> []
    this.sessions = new Map(); // roomId -> Map(sid -> peerInfo)
    this.heartbeats = new Map(); // roomId -> Map(sid -> timestamp)
  }

  listDocuments() {
    return Array.from(this.documents.values())
      .map(doc => ({
        ...doc,
        op_count: this.operations.get(doc.id)?.length || 0,
        char_count: doc.textSnapshot?.length || 0
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  createDocument(id, title, initialText = '') {
    const now = Date.now();
    const doc = {
      id,
      title: title || `Room ${id}`,
      textSnapshot: initialText,
      createdAt: now,
      updatedAt: now,
    };
    this.documents.set(id, doc);
    if (!this.operations.has(id)) {
      this.operations.set(id, []);
    }
    return doc;
  }

  getDocument(id) {
    return this.documents.get(id) || null;
  }

  updateDocumentTitle(id, title) {
    const doc = this.documents.get(id);
    if (doc) {
      doc.title = title;
      doc.updatedAt = Date.now();
    }
    return doc;
  }

  updateDocumentText(id, text) {
    const doc = this.documents.get(id);
    if (doc) {
      doc.textSnapshot = text;
      doc.updatedAt = Date.now();
    }
    return doc;
  }

  deleteDocument(id) {
    this.documents.delete(id);
    this.operations.delete(id);
    this.sessions.delete(id);
    this.heartbeats.delete(id);
  }

  addOperation(roomId, opType, siteId, char, lseqId) {
    if (!this.operations.has(roomId)) {
      this.operations.set(roomId, []);
    }
    const ops = this.operations.get(roomId);
    const op = {
      op_type: opType,
      site_id: siteId,
      char,
      lseq_id: lseqId,
      created_at: Date.now()
    };
    ops.push(op);
    
    const doc = this.documents.get(roomId);
    if (doc) {
      doc.updatedAt = Date.now();
    }
    
    return ops.length - 1;
  }

  getOperations(roomId, startIdx = 0) {
    const ops = this.operations.get(roomId) || [];
    return ops.slice(startIdx);
  }

  setSession(roomId, sid, peerInfo) {
    if (!this.sessions.has(roomId)) {
      this.sessions.set(roomId, new Map());
      this.heartbeats.set(roomId, new Map());
    }
    this.sessions.get(roomId).set(sid, peerInfo);
    this.heartbeats.get(roomId).set(sid, Date.now());
  }

  updateHeartbeat(roomId, sid) {
    const roomHeartbeats = this.heartbeats.get(roomId);
    if (roomHeartbeats && roomHeartbeats.has(sid)) {
      roomHeartbeats.set(sid, Date.now());
    }
  }

  getActivePeers(roomId) {
    const roomSessions = this.sessions.get(roomId);
    return roomSessions ? Array.from(roomSessions.values()) : [];
  }

  removeSession(roomId, sid) {
    const roomSessions = this.sessions.get(roomId);
    const roomHeartbeats = this.heartbeats.get(roomId);
    
    let removed = null;
    if (roomSessions && roomSessions.has(sid)) {
      removed = roomSessions.get(sid);
      roomSessions.delete(sid);
      if (roomHeartbeats) roomHeartbeats.delete(sid);
    }
    return removed;
  }

  cleanupStaleSessions(timeoutMs = 30000) {
    const now = Date.now();
    const staleEvents = [];
    
    for (const [roomId, hMap] of this.heartbeats.entries()) {
      for (const [sid, lastSeen] of hMap.entries()) {
        if (now - lastSeen > timeoutMs) {
          const removed = this.removeSession(roomId, sid);
          if (removed) {
            staleEvents.push([roomId, removed, this.getActivePeers(roomId)]);
          }
        }
      }
    }
    return staleEvents;
  }
}

// Singleton instance
const store = new InMemoryStore();
module.exports = store;
