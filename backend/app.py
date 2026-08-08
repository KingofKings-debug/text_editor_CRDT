import os
import logging
from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO
from config import Config
from models import db
from redis_store import get_store
from crdt_routes import crdt_bp
from socket_events import register_socket_events

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config.from_object(Config)

# Enable CORS with configured origins
CORS(app, resources={r"/api/*": {"origins": app.config['CORS_ORIGINS']}})

# Initialize JWT
jwt = JWTManager(app)

# Initialize DB
db.init_app(app)

# Initialize Redis / InMemory Store
store = get_store(app.config)
app.config['STORE'] = store

# Initialize SocketIO
socketio = SocketIO(app, cors_allowed_origins="*")

# Register Blueprints
app.register_blueprint(crdt_bp, url_prefix='/api')

# Also register original hackathon blueprint if routes.py exists
try:
    from routes import api_bp
    app.register_blueprint(api_bp, url_prefix='/api/hackathon')
except ImportError:
    pass

# Register SocketIO events
register_socket_events(socketio)


@app.route('/health', methods=['GET'])
def health_check():
    """Liveness probe."""
    return jsonify({'status': 'healthy', 'service': 'crdt-backend'}), 200


@app.route('/ready', methods=['GET'])
def readiness_check():
    """Readiness probe checking DB and Store status."""
    db_ok = False
    store_ok = False
    try:
        db.session.execute(db.select(1))
        db_ok = True
    except Exception as e:
        logger.error(f"Readiness check DB error: {e}")

    try:
        store_ok = store.ping()
    except Exception as e:
        logger.error(f"Readiness check Store error: {e}")

    if db_ok and store_ok:
        return jsonify({'status': 'ready', 'db': 'ok', 'store': 'ok'}), 200
    else:
        return jsonify({'status': 'not_ready', 'db': db_ok, 'store': store_ok}), 503


with app.app_context():
    db.create_all()


if __name__ == '__main__':
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')
    logger.info(f"Starting server on {host}:{port} (debug={debug})")
    socketio.run(app, host=host, port=port, debug=debug, allow_unsafe_werkzeug=True)
