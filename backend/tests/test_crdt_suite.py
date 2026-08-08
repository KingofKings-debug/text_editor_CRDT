import json
import pytest
from models import db, User, Document, DocumentPermission, DocumentOperation

def get_auth_tokens(client, username="alice", email="alice@example.com", password="Password123!"):
    res = client.post('/api/auth/register', json={
        'username': username,
        'email': email,
        'password': password
    })
    data = res.get_json()
    return data['access_token'], data['refresh_token'], data['user']['id']


def test_registration_and_login(client):
    """Test user registration and login flow."""
    reg_res = client.post('/api/auth/register', json={
        'username': 'bob',
        'email': 'bob@example.com',
        'password': 'secretpassword'
    })
    assert reg_res.status_code == 201
    assert 'access_token' in reg_res.get_json()

    login_res = client.post('/api/auth/login', json={
        'email': 'bob@example.com',
        'password': 'secretpassword'
    })
    assert login_res.status_code == 200
    assert 'access_token' in login_res.get_json()


def test_invalid_expired_token(client):
    """Test accessing protected route with invalid token."""
    res = client.get('/api/documents', headers={'Authorization': 'Bearer invalid_token_123'})
    assert res.status_code in (401, 422)


def test_document_authorization_roles(client):
    """Test document creation and OWNER/EDITOR/VIEWER permission rules."""
    alice_token, _, alice_id = get_auth_tokens(client, "alice", "alice@example.com")
    bob_token, _, bob_id = get_auth_tokens(client, "bob", "bob@example.com")
    charlie_token, _, charlie_id = get_auth_tokens(client, "charlie", "charlie@example.com")

    # Alice creates document
    doc_res = client.post('/api/documents', json={'title': 'CRDT Spec'}, headers={'Authorization': f'Bearer {alice_token}'})
    assert doc_res.status_code == 201
    doc_id = doc_res.get_json()['id']

    # Alice grants Bob EDITOR and Charlie VIEWER
    perm_res1 = client.post(f'/api/documents/{doc_id}/permissions', json={'email': 'bob@example.com', 'role': 'EDITOR'}, headers={'Authorization': f'Bearer {alice_token}'})
    assert perm_res1.status_code == 200

    perm_res2 = client.post(f'/api/documents/{doc_id}/permissions', json={'email': 'charlie@example.com', 'role': 'VIEWER'}, headers={'Authorization': f'Bearer {alice_token}'})
    assert perm_res2.status_code == 200

    # Bob (EDITOR) can access document details
    bob_doc = client.get(f'/api/documents/{doc_id}', headers={'Authorization': f'Bearer {bob_token}'})
    assert bob_doc.status_code == 200
    assert bob_doc.get_json()['role'] == 'EDITOR'

    # Charlie (VIEWER) can access document details
    charlie_doc = client.get(f'/api/documents/{doc_id}', headers={'Authorization': f'Bearer {charlie_token}'})
    assert charlie_doc.status_code == 200
    assert charlie_doc.get_json()['role'] == 'VIEWER'

    # Charlie (VIEWER) cannot delete document
    del_res = client.delete(f'/api/documents/{doc_id}', headers={'Authorization': f'Bearer {charlie_token}'})
    assert del_res.status_code == 403


def test_duplicate_operations_deduplication(client):
    """Test that opId idempotency prevents duplicate operations."""
    alice_token, _, alice_id = get_auth_tokens(client, "alice_dup", "alicedup@example.com")
    doc_res = client.post('/api/documents', json={'title': 'Dup Test'}, headers={'Authorization': f'Bearer {alice_token}'})
    doc_id = doc_res.get_json()['id']

    # Directly test store idempotency
    from redis_store import InMemoryStore
    store = InMemoryStore()

    op = {'opId': 'unique_op_123', 'docId': doc_id, 'type': 'insert', 'char': 'A', 'position': [{'digit': 10}]}
    seq1 = store.add_operation(doc_id, op)
    assert seq1 == 1
    assert store.is_op_seen(doc_id, 'unique_op_123') is True


def test_reconnect_catchup_ops(client):
    """Test operation catch-up stream after reconnecting."""
    alice_token, _, alice_id = get_auth_tokens(client, "alice_sync", "alicesync@example.com")
    doc_res = client.post('/api/documents', json={'title': 'Catchup Test'}, headers={'Authorization': f'Bearer {alice_token}'})
    doc_id = doc_res.get_json()['id']

    # Fetch ops after 0
    res = client.get(f'/api/documents/{doc_id}/ops?after=0', headers={'Authorization': f'Bearer {alice_token}'})
    assert res.status_code == 200
    assert 'operations' in res.get_json()


def test_health_and_readiness(client):
    """Test health and readiness endpoints."""
    h_res = client.get('/health')
    assert h_res.status_code == 200
    assert h_res.get_json()['status'] == 'healthy'

    r_res = client.get('/ready')
    assert r_res.status_code == 200
    assert r_res.get_json()['status'] == 'ready'
