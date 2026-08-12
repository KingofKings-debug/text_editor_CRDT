const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const config = require('./config');
const store = require('./store');
const setupSocketEvents = require('./socketEvents');

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Setup Socket.IO event handlers
setupSocketEvents(io);

// Periodically clean up stale sessions and empty rooms (every 30 seconds)
setInterval(() => {
  // console.log('[Background Task] Checking for stale sessions...');
  const removedEvents = store.cleanupStaleSessions(30000);
  
  // Notify rooms about users who timed out
  for (const [roomId, removedPeer, activePeers] of removedEvents) {
    // console.log(`[Background Task] Peer ${removedPeer.site_id} timed out in room ${roomId}`);
    io.to(roomId).emit('room_presence', {
      peers: activePeers,
      left_user: removedPeer
    });
  }

  // Cleanup empty rooms that have been empty for too long (1 minute)
  // This is a simplified logic that deletes the room if there are no active peers
  // In a real scenario, we might want to track exactly when it became empty.
  const docs = store.listDocuments();
  for (const doc of docs) {
    const peers = store.getActivePeers(doc.id);
    if (peers.length === 0) {
      // Room is empty, delete it
      // console.log(`[Background Task] Room ${doc.id} is empty. Auto-deleting.`);
      store.deleteDocument(doc.id);
    }
  }
}, 30000);

server.listen(config.PORT, config.HOST, () => {
  console.log(`CRDT Express Backend running on http://${config.HOST}:${config.PORT}`);
  console.log(`CORS enabled for: ${config.CORS_ORIGINS.join(', ')}`);
});
