# server/app.py
import os
import random
import time
import string
import threading
from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS

from redis_store import redis_store
from auth import generate_token, verify_token, require_auth
from logger import logger

app = Flask(__name__, static_folder="../build", static_url_path="")
CORS(app)
app.config['SECRET_KEY'] = 'crdt-lseq-jwt-secret-key-2026'

# Configure Redis message queue for multi-instance pub/sub if Redis is available
MESSAGE_QUEUE = 'redis://localhost:6379/0' if redis_store.use_redis else None

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    message_queue=MESSAGE_QUEUE,
    async_mode='gevent' if 'gevent' in globals() else 'threading',
    ping_timeout=25,
    ping_interval=10
)

USER_COLORS = [
    '#FF5722', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5',
    '#2196F3', '#03A9F4', '#00BCD4', '#009688', '#4CAF50',
    '#8BC34A', '#CDDC39', '#FFC107', '#FF9800', '#FF5722'
]

def generate_id(length=8):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

# ── HEARTBEAT STALE SESSION MONITOR THREAD ─────────────────────────────────

def heartbeat_monitor_loop():
    logger.info("Heartbeat session monitor thread started.")
    while True:
        try:
            time.sleep(10)
            stale_events = redis_store.cleanup_stale_sessions(timeout_seconds=30)
            for room_id, left_user, active_peers in stale_events:
                logger.info(
                    f"Stale session cleaned up: {left_user.get('user_name')} in room {room_id}",
                    extra={'room_id': room_id, 'site_id': left_user.get('site_id'), 'event': 'stale_cleanup'}
                )
                socketio.emit('room_presence', {
                    'peers': active_peers,
                    'left_user': left_user
                }, room=room_id)
        except Exception as e:
            logger.error(f"Error in heartbeat_monitor_loop: {e}")

monitor_thread = threading.Thread(target=heartbeat_monitor_loop, daemon=True)
monitor_thread.start()

# ── REST API ENDPOINTS ───────────────────────────────────────────────────

@app.route('/api/auth/token', methods=['POST'])
def get_auth_token():
    data = request.json or {}
    site_id = data.get('siteId') or generate_id(8)
    user_name = data.get('userName') or f"User-{site_id[:4]}"
    room_id = data.get('roomId')
    token = generate_token(site_id, user_name, room_id)
    return jsonify({
        'token': token,
        'siteId': site_id,
        'userName': user_name,
        'roomId': room_id
    })

@app.route('/api/documents', methods=['GET'])
def get_documents():
    start_time = time.time()
    docs = redis_store.list_documents()
    latency_ms = (time.time() - start_time) * 1000
    logger.info(f"Listed {len(docs)} documents", extra={'event': 'list_documents', 'latency_ms': latency_ms})
    return jsonify(docs)

@app.route('/api/documents', methods=['POST'])
def create_document():
    data = request.json or {}
    doc_id = data.get('id') or generate_id(8)
    title = data.get('title') or f"Room {doc_id}"
    initial_text = data.get('initialText') or ""
    
    existing = redis_store.get_document(doc_id)
    if existing:
        return jsonify(existing), 200
        
    doc = redis_store.create_document(doc_id, title, initial_text)
    logger.info(f"Room created: {doc_id}", extra={'room_id': doc_id, 'event': 'create_document'})
    return jsonify(doc), 201

@app.route('/api/documents/<doc_id>', methods=['GET'])
def get_document(doc_id):
    doc = redis_store.get_document(doc_id)
    if not doc:
        # Strict check: Do NOT auto-create! Return 404 if room does not exist.
        return jsonify({'error': 'No room found with this ID'}), 404
        
    ops = redis_store.get_operations(doc_id)
    return jsonify({
        'document': doc,
        'operations': ops
    })

@app.route('/api/documents/<doc_id>', methods=['PUT'])
def update_document(doc_id):
    data = request.json or {}
    title = data.get('title')
    text = data.get('text')
    
    doc = redis_store.get_document(doc_id)
    if not doc:
        return jsonify({'error': 'No room found with this ID'}), 404
        
    if title:
        doc = redis_store.update_document_title(doc_id, title)
    if text is not None:
        redis_store.update_document_text(doc_id, text)
        doc = redis_store.get_document(doc_id)
        
    return jsonify(doc or {})

@app.route('/api/documents/<doc_id>', methods=['DELETE'])
def delete_document(doc_id):
    doc = redis_store.get_document(doc_id)
    if not doc:
        return jsonify({'error': 'No room found with this ID'}), 404
    redis_store.delete_document(doc_id)
    logger.info(f"Room deleted: {doc_id}", extra={'room_id': doc_id, 'event': 'delete_document'})
    return jsonify({'success': True})

# ── SOCKET.IO HANDSHAKE & REAL-TIME EVENT HANDLERS ───────────────────────

@socketio.on('connect')
def handle_connect(auth=None):
    start_time = time.time()
    token = None
    if isinstance(auth, dict):
        token = auth.get('token')
    elif request.args.get('token'):
        token = request.args.get('token')
        
    user_payload = verify_token(token) if token else None
    latency_ms = (time.time() - start_time) * 1000
    
    logger.info(
        f"Client connected: {request.sid} (JWT Authenticated: {user_payload is not None})",
        extra={'event': 'connect', 'latency_ms': latency_ms}
    )

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    docs = redis_store.list_documents()
    for doc in docs:
        room_id = doc['id']
        removed = redis_store.remove_session(room_id, sid)
        if removed:
            active_peers = redis_store.get_active_peers(room_id)
            socketio.emit('room_presence', {
                'peers': active_peers,
                'left_user': removed
            }, room=room_id)
            logger.info(
                f"Client disconnected: {sid} from room {room_id}",
                extra={'room_id': room_id, 'site_id': removed.get('site_id'), 'event': 'disconnect'}
            )

@socketio.on('join_room')
def handle_join_room(data):
    start_time = time.time()
    room_id = data.get('roomId')
    site_id = data.get('siteId')
    user_name = data.get('userName') or f"User-{site_id[:4]}"
    last_op_index = data.get('lastOpIndex', 0)
    token = data.get('token')
    
    if not room_id or not site_id:
        emit('room_error', {'message': 'Invalid Room ID or Site ID'})
        return
        
    # Check if room exists! If not, notify client.
    doc = redis_store.get_document(room_id)
    if not doc:
        logger.warn(f"Join attempted for non-existent room: {room_id}")
        emit('room_error', {'message': f"No room found with ID: {room_id}. Please check the Room ID or create a new room."})
        return

    # JWT authentication check
    user_payload = verify_token(token) if token else None
    if user_payload:
        site_id = user_payload.get('site_id', site_id)
        user_name = user_payload.get('user_name', user_name)
        
    join_room(room_id)
    sid = request.sid
    
    color_idx = sum(ord(c) for c in site_id) % len(USER_COLORS)
    peer_info = {
        'sid': sid,
        'site_id': site_id,
        'user_name': user_name,
        'color': USER_COLORS[color_idx],
        'cursor': 0
    }
    
    redis_store.set_session(room_id, sid, peer_info)
    ops = redis_store.get_operations(room_id, start_idx=last_op_index)
    active_peers = redis_store.get_active_peers(room_id)
    
    jwt_token = generate_token(site_id, user_name, room_id)
    latency_ms = (time.time() - start_time) * 1000
    
    logger.info(
        f"User {user_name} ({site_id}) joined room {room_id}",
        extra={'room_id': room_id, 'site_id': site_id, 'event': 'join_room', 'latency_ms': latency_ms}
    )
    
    emit('room_joined', {
        'document': doc,
        'operations': ops,
        'peers': active_peers,
        'self': peer_info,
        'token': jwt_token,
        'startIndex': last_op_index
    })
    
    emit('room_presence', {
        'peers': active_peers,
        'joined_user': peer_info
    }, room=room_id, include_self=False)

@socketio.on('heartbeat')
def handle_heartbeat(data):
    room_id = data.get('roomId')
    sid = request.sid
    if room_id:
        redis_store.update_heartbeat(room_id, sid)

@socketio.on('lseq_op')
def handle_lseq_op(data):
    start_time = time.time()
    room_id = data.get('roomId')
    op_type = data.get('type')
    lseq_id = data.get('lseqId')
    char = data.get('char')
    site_id = data.get('siteId')
    text_snapshot = data.get('textSnapshot')
    
    if not room_id or not lseq_id:
        return
        
    op_idx = redis_store.add_operation(room_id, op_type, site_id, char, lseq_id)
    if text_snapshot is not None:
        redis_store.update_document_text(room_id, text_snapshot)
        
    latency_ms = (time.time() - start_time) * 1000
    data['opIndex'] = op_idx
    data['latencyMs'] = round(latency_ms, 2)
    
    emit('lseq_op', data, room=room_id, include_self=False)

@socketio.on('cursor_move')
def handle_cursor_move(data):
    room_id = data.get('roomId')
    site_id = data.get('siteId')
    cursor = data.get('cursor', 0)
    emit('peer_cursor', {
        'siteId': site_id,
        'cursor': cursor
    }, room=room_id, include_self=False)

@socketio.on('update_title')
def handle_update_title(data):
    room_id = data.get('roomId')
    title = data.get('title')
    if room_id and title:
        redis_store.update_document_title(room_id, title)
        emit('title_changed', {'title': title}, room=room_id, include_self=False)

# ── STATIC FILE SERVING FOR PRODUCTION REACT BUILD ────────────────────────

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_react(path):
    build_dir = app.static_folder
    if path != "" and os.path.exists(os.path.join(build_dir, path)):
        return send_from_directory(build_dir, path)
    elif os.path.exists(os.path.join(build_dir, 'index.html')):
        return send_from_directory(build_dir, 'index.html')
    else:
        return "CRDT Redis Backend Server is Running!", 200

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting Scalable Redis-backed Flask CRDT Server on http://localhost:{port}")
    socketio.run(app, host='0.0.0.0', port=port, debug=False, use_reloader=False, allow_unsafe_werkzeug=True)
