from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token, create_refresh_token, jwt_required,
    get_jwt_identity, get_jwt
)
from models import db, User, Document, DocumentPermission, DocumentOperation
import json

crdt_bp = Blueprint('crdt', __name__)

def check_document_access(user_id, document_id):
    """Returns permission role ('OWNER', 'EDITOR', 'VIEWER') or None."""
    doc = Document.query.get(document_id)
    if not doc:
        return None, None
    if doc.owner_id == user_id:
        return doc, 'OWNER'
    perm = DocumentPermission.query.filter_by(document_id=document_id, user_id=user_id).first()
    if perm:
        return doc, perm.role
    return doc, None

# ----------------------------
# Authentication Routes
# ----------------------------
@crdt_bp.route('/auth/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not username or not email or not password:
        return jsonify({'msg': 'Username, email, and password are required'}), 400

    if User.query.filter((User.username == username) | (User.email == email)).first():
        return jsonify({'msg': 'User with this username or email already exists'}), 400

    user = User(username=username, email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))
    return jsonify({
        'access_token': access_token,
        'refresh_token': refresh_token,
        'user': {'id': user.id, 'username': user.username, 'email': user.email}
    }), 201


@crdt_bp.route('/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'msg': 'Email and password are required'}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({'msg': 'Invalid email or password'}), 401

    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))
    return jsonify({
        'access_token': access_token,
        'refresh_token': refresh_token,
        'user': {'id': user.id, 'username': user.username, 'email': user.email}
    }), 200


@crdt_bp.route('/auth/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    current_user_id = get_jwt_identity()
    new_access_token = create_access_token(identity=current_user_id)
    return jsonify({'access_token': new_access_token}), 200


@crdt_bp.route('/auth/me', methods=['GET'])
@jwt_required()
def me():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'msg': 'User not found'}), 404
    return jsonify({'id': user.id, 'username': user.username, 'email': user.email}), 200


# ----------------------------
# Document Management Routes
# ----------------------------
@crdt_bp.route('/documents', methods=['GET'])
@jwt_required()
def list_documents():
    user_id = int(get_jwt_identity())
    # Owned documents
    owned_docs = Document.query.filter_by(owner_id=user_id).all()
    # Shared documents
    perms = DocumentPermission.query.filter_by(user_id=user_id).all()
    shared_doc_ids = [p.document_id for p in perms]
    shared_docs = Document.query.filter(Document.id.in_(shared_doc_ids)).all() if shared_doc_ids else []

    res = []
    for doc in owned_docs:
        res.append({'id': doc.id, 'title': doc.title, 'role': 'OWNER', 'created_at': doc.created_at.isoformat()})
    
    perm_dict = {p.document_id: p.role for p in perms}
    for doc in shared_docs:
        res.append({'id': doc.id, 'title': doc.title, 'role': perm_dict.get(doc.id, 'VIEWER'), 'created_at': doc.created_at.isoformat()})

    return jsonify(res), 200


@crdt_bp.route('/documents', methods=['POST'])
@jwt_required()
def create_document():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    title = data.get('title', '').strip() or 'Untitled Document'

    doc = Document(title=title, owner_id=user_id)
    db.session.add(doc)
    db.session.commit()

    # Automatically add OWNER permission entry
    perm = DocumentPermission(document_id=doc.id, user_id=user_id, role='OWNER')
    db.session.add(perm)
    db.session.commit()

    return jsonify({'id': doc.id, 'title': doc.title, 'role': 'OWNER'}), 201


@crdt_bp.route('/documents/<int:doc_id>', methods=['GET'])
@jwt_required()
def get_document(doc_id):
    user_id = int(get_jwt_identity())
    doc, role = check_document_access(user_id, doc_id)
    if not doc or not role:
        return jsonify({'msg': 'Document not found or access denied'}), 403

    # Fetch permissions list if OWNER or EDITOR
    permissions = []
    if role in ('OWNER', 'EDITOR'):
        perms = DocumentPermission.query.filter_by(document_id=doc_id).all()
        for p in perms:
            u = User.query.get(p.user_id)
            if u:
                permissions.append({'user_id': u.id, 'username': u.username, 'email': u.email, 'role': p.role})

    return jsonify({
        'id': doc.id,
        'title': doc.title,
        'role': role,
        'owner_id': doc.owner_id,
        'permissions': permissions
    }), 200


@crdt_bp.route('/documents/<int:doc_id>', methods=['DELETE'])
@jwt_required()
def delete_document(doc_id):
    user_id = int(get_jwt_identity())
    doc, role = check_document_access(user_id, doc_id)
    if role != 'OWNER':
        return jsonify({'msg': 'Only document owner can delete document'}), 403

    DocumentPermission.query.filter_by(document_id=doc_id).delete()
    DocumentOperation.query.filter_by(document_id=doc_id).delete()
    db.session.delete(doc)
    db.session.commit()

    return jsonify({'msg': 'Document deleted successfully'}), 200


@crdt_bp.route('/documents/<int:doc_id>/permissions', methods=['POST'])
@jwt_required()
def set_document_permission(doc_id):
    user_id = int(get_jwt_identity())
    doc, role = check_document_access(user_id, doc_id)
    if role != 'OWNER':
        return jsonify({'msg': 'Only document owner can modify permissions'}), 403

    data = request.get_json() or {}
    target_email = data.get('email', '').strip().lower()
    target_role = data.get('role', 'EDITOR').upper()

    if target_role not in ('EDITOR', 'VIEWER', 'OWNER'):
        return jsonify({'msg': 'Invalid role specified'}), 400

    target_user = User.query.filter_by(email=target_email).first()
    if not target_user:
        return jsonify({'msg': f'User with email {target_email} not found'}), 404

    existing_perm = DocumentPermission.query.filter_by(document_id=doc_id, user_id=target_user.id).first()
    if existing_perm:
        existing_perm.role = target_role
    else:
        new_perm = DocumentPermission(document_id=doc_id, user_id=target_user.id, role=target_role)
        db.session.add(new_perm)

    db.session.commit()
    return jsonify({'msg': f'Permission updated for {target_user.username}', 'user_id': target_user.id, 'role': target_role}), 200


@crdt_bp.route('/documents/<int:doc_id>/ops', methods=['GET'])
@jwt_required()
def get_document_ops(doc_id):
    user_id = int(get_jwt_identity())
    doc, role = check_document_access(user_id, doc_id)
    if not role:
        return jsonify({'msg': 'Access denied'}), 403

    after_seq = int(request.args.get('after', 0))
    store = current_app.config.get('STORE')
    if store:
        ops = store.get_operations_after(doc_id, after_seq)
    else:
        db_ops = DocumentOperation.query.filter(
            DocumentOperation.document_id == doc_id,
            DocumentOperation.seq_num > after_seq
        ).order_by(DocumentOperation.seq_num.asc()).all()
        ops = [json.loads(op.op_data) for op in db_ops]

    return jsonify({'doc_id': doc_id, 'after_seq': after_seq, 'operations': ops}), 200


@crdt_bp.route('/documents/<int:doc_id>/snapshot', methods=['GET', 'POST'])
@jwt_required()
def handle_snapshot(doc_id):
    user_id = int(get_jwt_identity())
    doc, role = check_document_access(user_id, doc_id)
    if not role:
        return jsonify({'msg': 'Access denied'}), 403

    store = current_app.config.get('STORE')

    if request.method == 'POST':
        if role not in ('OWNER', 'EDITOR'):
            return jsonify({'msg': 'Only editors/owners can upload state snapshot'}), 403
        data = request.get_json() or {}
        snapshot_str = data.get('snapshot')
        if snapshot_str:
            doc.snapshot = json.dumps(snapshot_str) if isinstance(snapshot_str, (dict, list)) else str(snapshot_str)
            db.session.commit()
            if store:
                store.set_snapshot(doc_id, doc.snapshot)
            return jsonify({'msg': 'Snapshot saved successfully'}), 200
        return jsonify({'msg': 'Snapshot content missing'}), 400

    # GET snapshot
    snapshot_content = None
    if store:
        snapshot_content = store.get_snapshot(doc_id)
    if not snapshot_content:
        snapshot_content = doc.snapshot

    return jsonify({'doc_id': doc_id, 'snapshot': snapshot_content}), 200
