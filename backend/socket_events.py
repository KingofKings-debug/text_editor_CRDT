import json
import logging
from flask import request, current_app, session
from flask_socketio import join_room, leave_room, emit, disconnect
from flask_jwt_extended import decode_token
from models import db, User, Document, DocumentPermission, DocumentOperation

logger = logging.getLogger(__name__)

def register_socket_events(socketio):

    @socketio.on('connect')
    def handle_connect(auth):
        token = None
        if auth and isinstance(auth, dict):
            token = auth.get('token')
        if not token:
            token = request.args.get('token')

        if not token:
            logger.warning(f"Socket connection rejected: No token provided (SID: {request.sid})")
            return False  # Rejects connection

        try:
            # Decode JWT access token
            decoded = decode_token(token)
            user_id = int(decoded['sub'])
            user = User.query.get(user_id)
            if not user:
                return False

            session['user_id'] = user.id
            session['username'] = user.username
            logger.info(f"Socket connected: User {user.username} (ID: {user.id}, SID: {request.sid})")
            emit('connected', {'user_id': user.id, 'username': user.username})
        except Exception as e:
            logger.warning(f"Socket connection rejected: Invalid token ({e})")
            return False

    @socketio.on('join_document')
    def handle_join_document(data):
        user_id = session.get('user_id')
        username = session.get('username')
        if not user_id:
            emit('error', {'msg': 'Unauthorized session'})
            return

        doc_id = data.get('doc_id')
        if not doc_id:
            emit('error', {'msg': 'Document ID is required'})
            return

        doc_id = int(doc_id)
        # Check permissions
        doc = Document.query.get(doc_id)
        if not doc:
            emit('error', {'msg': 'Document not found'})
            return

        role = None
        if doc.owner_id == user_id:
            role = 'OWNER'
        else:
            perm = DocumentPermission.query.filter_by(document_id=doc_id, user_id=user_id).first()
            if perm:
                role = perm.role

        if not role:
            emit('error', {'msg': 'Access denied to document'})
            return

        room = f"doc_{doc_id}"
        join_room(room)

        store = current_app.config.get('STORE')
        presence_list = []
        if store:
            presence_list = store.add_presence(doc_id, user_id, username, request.sid)

        emit('room_joined', {
            'doc_id': doc_id,
            'role': role,
            'presence': presence_list
        })

        # Broadcast updated presence list to room
        emit('presence_update', {'presence': presence_list}, room=room)

    @socketio.on('submit_operation')
    def handle_submit_operation(data):
        user_id = session.get('user_id')
        if not user_id:
            emit('error', {'msg': 'Unauthorized session'})
            return

        # Check payload size limit (max 64KB)
        raw_json = json.dumps(data)
        if len(raw_json.encode('utf-8')) > 65536:
            emit('error', {'msg': 'Operation payload size exceeds limit (64KB)'})
            return

        op_id = data.get('opId')
        doc_id = data.get('docId')
        op_type = data.get('type')

        if not op_id or not doc_id or op_type not in ('insert', 'delete'):
            emit('error', {'msg': 'Invalid operation payload structure'})
            return

        doc_id = int(doc_id)

        # Check write permissions (OWNER or EDITOR only)
        doc = Document.query.get(doc_id)
        if not doc:
            emit('error', {'msg': 'Document not found'})
            return

        role = 'OWNER' if doc.owner_id == user_id else None
        if not role:
            perm = DocumentPermission.query.filter_by(document_id=doc_id, user_id=user_id).first()
            if perm:
                role = perm.role

        if role not in ('OWNER', 'EDITOR'):
            emit('error', {'msg': 'Read-only access (VIEWER role cannot modify document)'})
            return

        store = current_app.config.get('STORE')

        # Idempotency check: if op was already seen, acknowledge without re-broadcasting
        if store and store.is_op_seen(doc_id, op_id):
            emit('op_ack', {'opId': op_id, 'status': 'duplicate'})
            return

        # Assign sequence number and store operation
        seq_num = 0
        if store:
            seq_num = store.add_operation(doc_id, data)
        else:
            existing_count = DocumentOperation.query.filter_by(document_id=doc_id).count()
            seq_num = existing_count + 1
            data['seqNum'] = seq_num

        # Backup persistence in DB
        try:
            db_op = DocumentOperation(
                op_id=str(op_id),
                document_id=doc_id,
                user_id=user_id,
                seq_num=seq_num,
                op_data=json.dumps(data)
            )
            db.session.add(db_op)
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            logger.debug(f"DB operation log duplicate or error: {e}")

        # Acknowledge to sender
        emit('op_ack', {'opId': op_id, 'seqNum': seq_num, 'status': 'ok'})

        # Broadcast operation to all other clients in document room
        room = f"doc_{doc_id}"
        emit('remote_operation', data, room=room, include_self=False)

    @socketio.on('heartbeat')
    def handle_heartbeat(data):
        doc_id = data.get('doc_id')
        if doc_id:
            store = current_app.config.get('STORE')
            if store:
                presence_list = store.get_presence(doc_id)
                emit('presence_update', {'presence': presence_list}, room=f"doc_{doc_id}")

    @socketio.on('disconnect')
    def handle_disconnect():
        store = current_app.config.get('STORE')
        if store:
            mapping = store.remove_sid(request.sid)
            if mapping:
                doc_id = mapping['doc_id']
                room = f"doc_{doc_id}"
                presence_list = store.get_presence(doc_id)
                emit('presence_update', {'presence': presence_list}, room=room)
        logger.info(f"Socket disconnected (SID: {request.sid})")
