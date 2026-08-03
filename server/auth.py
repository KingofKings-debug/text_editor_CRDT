# server/auth.py
import jwt
import time
from functools import wraps
from flask import request, jsonify

JWT_SECRET = "crdt-lseq-jwt-secret-key-2026"
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRATION_SECONDS = 86400  # 24 hours

def generate_token(site_id, user_name="Anonymous", room_id=None):
    now = int(time.time())
    payload = {
        "site_id": site_id,
        "user_name": user_name,
        "room_id": room_id,
        "iat": now,
        "exp": now + TOKEN_EXPIRATION_SECONDS
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token):
    if not token:
        return None
    try:
        # Strip 'Bearer ' if present
        if token.startswith("Bearer "):
            token = token[7:]
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization") or request.args.get("token")
        payload = verify_token(token)
        if not payload:
            return jsonify({"error": "Unauthorized or invalid JWT token"}), 401
        request.user = payload
        return f(*args, **kwargs)
    return decorated
