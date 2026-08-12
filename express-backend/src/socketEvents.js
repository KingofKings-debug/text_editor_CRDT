const store = require('./store');
const { generateToken, verifyToken } = require('./auth');

const USER_COLORS = [
  '#FF5722', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5',
  '#2196F3', '#03A9F4', '#00BCD4', '#009688', '#4CAF50',
  '#8BC34A', '#CDDC39', '#FFC107', '#FF9800', '#FF5722'
];

module.exports = (io) => {
  io.on('connection', (socket) => {
    let token = socket.handshake.auth?.token || socket.handshake.query?.token;
    const userPayload = verifyToken(token);
    
    // console.log(`Client connected: ${socket.id} (JWT Authenticated: ${!!userPayload})`);

    socket.on('join_room', (data) => {
      const roomId = data.roomId;
      let siteId = data.siteId;
      let userName = data.userName || `User-${siteId.substring(0, 4)}`;
      const lastOpIndex = data.lastOpIndex || 0;
      
      if (!roomId || !siteId) {
        socket.emit('room_error', { message: 'Invalid Room ID or Site ID' });
        return;
      }

      const doc = store.getDocument(roomId);
      if (!doc) {
        socket.emit('room_error', { message: `No room found with ID: ${roomId}. Please check the Room ID or create a new room.` });
        return;
      }

      const providedToken = data.token;
      const payload = verifyToken(providedToken);
      if (payload) {
        siteId = payload.site_id || siteId;
        userName = payload.user_name || userName;
      }

      socket.join(roomId);
      
      // Calculate color index based on siteId characters
      let colorIdx = 0;
      for (let i = 0; i < siteId.length; i++) {
        colorIdx += siteId.charCodeAt(i);
      }
      colorIdx = colorIdx % USER_COLORS.length;

      const peerInfo = {
        sid: socket.id,
        site_id: siteId,
        user_name: userName,
        color: USER_COLORS[colorIdx],
        cursor: 0
      };

      store.setSession(roomId, socket.id, peerInfo);
      
      const ops = store.getOperations(roomId, lastOpIndex);
      const activePeers = store.getActivePeers(roomId);
      const jwtToken = generateToken(siteId, userName, roomId);

      socket.emit('room_joined', {
        document: doc,
        operations: ops,
        peers: activePeers,
        self: peerInfo,
        token: jwtToken,
        startIndex: lastOpIndex
      });

      socket.to(roomId).emit('room_presence', {
        peers: activePeers,
        joined_user: peerInfo
      });
    });

    socket.on('disconnect', () => {
      const docs = store.listDocuments();
      for (const doc of docs) {
        const roomId = doc.id;
        const removed = store.removeSession(roomId, socket.id);
        if (removed) {
          const activePeers = store.getActivePeers(roomId);
          socket.to(roomId).emit('room_presence', {
            peers: activePeers,
            left_user: removed
          });
        }
      }
    });

    socket.on('heartbeat', (data) => {
      const roomId = data.roomId;
      if (roomId) {
        store.updateHeartbeat(roomId, socket.id);
      }
    });

    socket.on('lseq_op', (data) => {
      const roomId = data.roomId;
      const opType = data.type;
      const lseqId = data.lseqId;
      const char = data.char;
      const siteId = data.siteId;
      const textSnapshot = data.textSnapshot;

      if (!roomId || !lseqId) return;

      const opIdx = store.addOperation(roomId, opType, siteId, char, lseqId);
      
      if (textSnapshot !== undefined) {
        store.updateDocumentText(roomId, textSnapshot);
      }

      data.opIndex = opIdx;
      // Send back to others in room
      socket.to(roomId).emit('lseq_op', data);
    });

    socket.on('cursor_move', (data) => {
      const roomId = data.roomId;
      socket.to(roomId).emit('peer_cursor', {
        siteId: data.siteId,
        cursor: data.cursor || 0
      });
    });

    socket.on('update_title', (data) => {
      const roomId = data.roomId;
      const title = data.title;
      if (roomId && title) {
        store.updateDocumentTitle(roomId, title);
        socket.to(roomId).emit('title_changed', { title });
      }
    });
    
    socket.on('leave_room', (data) => {
      if (data && data.roomId) {
        socket.leave(data.roomId);
        const removed = store.removeSession(data.roomId, socket.id);
        if (removed) {
          const activePeers = store.getActivePeers(data.roomId);
          socket.to(data.roomId).emit('room_presence', {
            peers: activePeers,
            left_user: removed
          });
        }
      }
    });
  });
};
