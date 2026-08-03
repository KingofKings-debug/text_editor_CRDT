# server/redis_store.py
import json
import time
import threading
import redis
from logger import logger

REDIS_HOST = "localhost"
REDIS_PORT = 6379
REDIS_DB = 0

class InMemoryRedisAdapter:
    """Thread-safe high-performance in-memory store for documents, LSEQ ops, and sessions."""
    def __init__(self):
        self.lock = threading.Lock()
        self.documents = {}      # doc_id -> meta dict
        self.operations = {}     # doc_id -> list of op dicts
        self.texts = {}          # doc_id -> str
        self.sessions = {}       # doc_id -> { sid -> peer_info }
        self.heartbeats = {}     # doc_id -> { sid -> timestamp }

    def list_documents(self):
        with self.lock:
            docs = []
            for doc_id, meta in self.documents.items():
                ops = self.operations.get(doc_id, [])
                text = self.texts.get(doc_id, "")
                docs.append({
                    "id": doc_id,
                    "title": meta.get("title", f"Room {doc_id}"),
                    "text_snapshot": text,
                    "created_at": meta.get("created_at", time.time()),
                    "updated_at": meta.get("updated_at", time.time()),
                    "op_count": len(ops),
                    "char_count": len(text)
                })
            return sorted(docs, key=lambda d: d["updated_at"], reverse=True)

    def create_document(self, doc_id, title, initial_text=""):
        with self.lock:
            now = time.time()
            meta = {
                "id": doc_id,
                "title": title or f"Room {doc_id}",
                "created_at": now,
                "updated_at": now
            }
            self.documents[doc_id] = meta
            self.texts[doc_id] = initial_text
            if doc_id not in self.operations:
                self.operations[doc_id] = []
            return self._get_document_unlocked(doc_id)

    def _get_document_unlocked(self, doc_id):
        if doc_id not in self.documents:
            return None
        meta = self.documents[doc_id]
        return {
            "id": doc_id,
            "title": meta["title"],
            "text_snapshot": self.texts.get(doc_id, ""),
            "created_at": meta["created_at"],
            "updated_at": meta["updated_at"]
        }

    def get_document(self, doc_id):
        with self.lock:
            return self._get_document_unlocked(doc_id)

    def update_document_title(self, doc_id, title):
        with self.lock:
            if doc_id in self.documents:
                self.documents[doc_id]["title"] = title
                self.documents[doc_id]["updated_at"] = time.time()
            return self._get_document_unlocked(doc_id)

    def update_document_text(self, doc_id, text):
        with self.lock:
            if doc_id in self.documents:
                self.texts[doc_id] = text
                self.documents[doc_id]["updated_at"] = time.time()

    def delete_document(self, doc_id):
        with self.lock:
            self.documents.pop(doc_id, None)
            self.operations.pop(doc_id, None)
            self.texts.pop(doc_id, None)
            self.sessions.pop(doc_id, None)
            self.heartbeats.pop(doc_id, None)

    def add_operation(self, doc_id, op_type, site_id, char, lseq_id):
        with self.lock:
            now = time.time()
            op = {
                "op_type": op_type,
                "site_id": site_id,
                "char": char,
                "lseq_id": lseq_id,
                "created_at": now
            }
            if doc_id not in self.operations:
                self.operations[doc_id] = []
            self.operations[doc_id].append(op)
            if doc_id in self.documents:
                self.documents[doc_id]["updated_at"] = now
            return len(self.operations[doc_id]) - 1

    def get_operations(self, doc_id, start_idx=0):
        with self.lock:
            ops = self.operations.get(doc_id, [])
            return ops[start_idx:]

    def set_session(self, doc_id, sid, peer_info):
        with self.lock:
            if doc_id not in self.sessions:
                self.sessions[doc_id] = {}
                self.heartbeats[doc_id] = {}
            self.sessions[doc_id][sid] = peer_info
            self.heartbeats[doc_id][sid] = time.time()

    def update_heartbeat(self, doc_id, sid):
        with self.lock:
            if doc_id in self.heartbeats and sid in self.heartbeats[doc_id]:
                self.heartbeats[doc_id][sid] = time.time()

    def get_active_peers(self, doc_id):
        with self.lock:
            room_sess = self.sessions.get(doc_id, {})
            return list(room_sess.values())

    def remove_session(self, doc_id, sid):
        with self.lock:
            removed = None
            if doc_id in self.sessions and sid in self.sessions[doc_id]:
                removed = self.sessions[doc_id].pop(sid, None)
                self.heartbeats[doc_id].pop(sid, None)
            return removed

    def cleanup_stale_sessions(self, timeout_seconds=30):
        now = time.time()
        stale_events = []
        with self.lock:
            for doc_id, h_dict in list(self.heartbeats.items()):
                stale_sids = [sid for sid, last_seen in h_dict.items() if now - last_seen > timeout_seconds]
                for sid in stale_sids:
                    removed = self.remove_session(doc_id, sid)
                    if removed:
                        stale_events.append((doc_id, removed, self.get_active_peers(doc_id)))
        return stale_events


class RedisStore:
    def __init__(self):
        self.redis_client = None
        self.use_redis = False
        self.memory = InMemoryRedisAdapter()
        self._init_redis()

    def _init_redis(self):
        try:
            r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, socket_timeout=0.2, socket_connect_timeout=0.2)
            r.ping()
            self.redis_client = r
            self.use_redis = True
            logger.info("Connected to Redis server. Using Redis storage.")
        except Exception:
            self.redis_client = None
            self.use_redis = False
            logger.info(f"Redis server not online at {REDIS_HOST}:{REDIS_PORT}. Using high-performance in-memory store.")

    def list_documents(self):
        if not self.use_redis:
            return self.memory.list_documents()
        try:
            doc_ids = self.redis_client.smembers("crdt:documents")
            docs = []
            for did_bytes in doc_ids:
                did = did_bytes.decode('utf-8')
                meta = self.get_document(did)
                if meta:
                    ops_count = self.redis_client.llen(f"doc:{did}:ops")
                    text = self.redis_client.get(f"doc:{did}:text") or b""
                    text_str = text.decode('utf-8')
                    meta["op_count"] = ops_count
                    meta["text_snapshot"] = text_str
                    meta["char_count"] = len(text_str)
                    docs.append(meta)
            return sorted(docs, key=lambda d: d.get("updated_at", 0), reverse=True)
        except Exception as e:
            logger.error(f"Redis list_documents error: {e}")
            self.use_redis = False
            return self.memory.list_documents()

    def create_document(self, doc_id, title, initial_text=""):
        mem_doc = self.memory.create_document(doc_id, title, initial_text)
        if not self.use_redis:
            return mem_doc
        try:
            now = time.time()
            self.redis_client.sadd("crdt:documents", doc_id)
            self.redis_client.hset(f"doc:{doc_id}:meta", mapping={
                "id": doc_id,
                "title": title or f"Room {doc_id}",
                "created_at": str(now),
                "updated_at": str(now)
            })
            self.redis_client.set(f"doc:{doc_id}:text", initial_text)
            return self.get_document(doc_id) or mem_doc
        except Exception as e:
            logger.error(f"Redis create_document error: {e}")
            self.use_redis = False
            return mem_doc

    def get_document(self, doc_id):
        mem_doc = self.memory.get_document(doc_id)
        if not self.use_redis:
            return mem_doc
        try:
            meta_raw = self.redis_client.hgetall(f"doc:{doc_id}:meta")
            if not meta_raw:
                return mem_doc
            meta = {k.decode('utf-8'): v.decode('utf-8') for k, v in meta_raw.items()}
            text_bytes = self.redis_client.get(f"doc:{doc_id}:text") or b""
            return {
                "id": meta.get("id", doc_id),
                "title": meta.get("title", f"Room {doc_id}"),
                "text_snapshot": text_bytes.decode('utf-8'),
                "created_at": float(meta.get("created_at", time.time())),
                "updated_at": float(meta.get("updated_at", time.time()))
            }
        except Exception as e:
            logger.error(f"Redis get_document error: {e}")
            self.use_redis = False
            return mem_doc

    def update_document_title(self, doc_id, title):
        mem_doc = self.memory.update_document_title(doc_id, title)
        if not self.use_redis:
            return mem_doc
        try:
            now = time.time()
            self.redis_client.hset(f"doc:{doc_id}:meta", mapping={"title": title, "updated_at": str(now)})
            return self.get_document(doc_id) or mem_doc
        except Exception as e:
            logger.error(f"Redis update_document_title error: {e}")
            self.use_redis = False
            return mem_doc

    def update_document_text(self, doc_id, text):
        self.memory.update_document_text(doc_id, text)
        if not self.use_redis:
            return
        try:
            now = time.time()
            self.redis_client.set(f"doc:{doc_id}:text", text)
            self.redis_client.hset(f"doc:{doc_id}:meta", "updated_at", str(now))
        except Exception as e:
            logger.error(f"Redis update_document_text error: {e}")
            self.use_redis = False

    def delete_document(self, doc_id):
        self.memory.delete_document(doc_id)
        if not self.use_redis:
            return
        try:
            self.redis_client.srem("crdt:documents", doc_id)
            self.redis_client.delete(f"doc:{doc_id}:meta")
            self.redis_client.delete(f"doc:{doc_id}:ops")
            self.redis_client.delete(f"doc:{doc_id}:text")
            self.redis_client.delete(f"room:{doc_id}:sessions")
            self.redis_client.delete(f"room:{doc_id}:heartbeats")
        except Exception as e:
            logger.error(f"Redis delete_document error: {e}")
            self.use_redis = False

    def add_operation(self, doc_id, op_type, site_id, char, lseq_id):
        mem_idx = self.memory.add_operation(doc_id, op_type, site_id, char, lseq_id)
        if not self.use_redis:
            return mem_idx
        try:
            now = time.time()
            op = {
                "op_type": op_type,
                "site_id": site_id,
                "char": char,
                "lseq_id": lseq_id,
                "created_at": now
            }
            op_str = json.dumps(op)
            length = self.redis_client.rpush(f"doc:{doc_id}:ops", op_str)
            self.redis_client.hset(f"doc:{doc_id}:meta", "updated_at", str(now))
            return length - 1
        except Exception as e:
            logger.error(f"Redis add_operation error: {e}")
            self.use_redis = False
            return mem_idx

    def get_operations(self, doc_id, start_idx=0):
        mem_ops = self.memory.get_operations(doc_id, start_idx)
        if not self.use_redis:
            return mem_ops
        try:
            raw_ops = self.redis_client.lrange(f"doc:{doc_id}:ops", start_idx, -1)
            if not raw_ops:
                return mem_ops
            ops = []
            for item in raw_ops:
                ops.append(json.loads(item.decode('utf-8')))
            return ops
        except Exception as e:
            logger.error(f"Redis get_operations error: {e}")
            self.use_redis = False
            return mem_ops

    def set_session(self, doc_id, sid, peer_info):
        self.memory.set_session(doc_id, sid, peer_info)
        if not self.use_redis:
            return
        try:
            now = time.time()
            self.redis_client.hset(f"room:{doc_id}:sessions", sid, json.dumps(peer_info))
            self.redis_client.hset(f"room:{doc_id}:heartbeats", sid, str(now))
        except Exception as e:
            logger.error(f"Redis set_session error: {e}")
            self.use_redis = False

    def update_heartbeat(self, doc_id, sid):
        self.memory.update_heartbeat(doc_id, sid)
        if not self.use_redis:
            return
        try:
            now = time.time()
            self.redis_client.hset(f"room:{doc_id}:heartbeats", sid, str(now))
        except Exception as e:
            logger.error(f"Redis update_heartbeat error: {e}")
            self.use_redis = False

    def get_active_peers(self, doc_id):
        mem_peers = self.memory.get_active_peers(doc_id)
        if not self.use_redis:
            return mem_peers
        try:
            raw_peers = self.redis_client.hgetall(f"room:{doc_id}:sessions")
            if not raw_peers:
                return mem_peers
            peers = []
            for _, val in raw_peers.items():
                peers.append(json.loads(val.decode('utf-8')))
            return peers
        except Exception as e:
            logger.error(f"Redis get_active_peers error: {e}")
            self.use_redis = False
            return mem_peers

    def remove_session(self, doc_id, sid):
        mem_removed = self.memory.remove_session(doc_id, sid)
        if not self.use_redis:
            return mem_removed
        try:
            val = self.redis_client.hget(f"room:{doc_id}:sessions", sid)
            self.redis_client.hdel(f"room:{doc_id}:sessions", sid)
            self.redis_client.hdel(f"room:{doc_id}:heartbeats", sid)
            return json.loads(val.decode('utf-8')) if val else mem_removed
        except Exception as e:
            logger.error(f"Redis remove_session error: {e}")
            self.use_redis = False
            return mem_removed

    def cleanup_stale_sessions(self, timeout_seconds=30):
        mem_stale = self.memory.cleanup_stale_sessions(timeout_seconds)
        if not self.use_redis:
            return mem_stale
        now = time.time()
        stale_events = list(mem_stale)
        try:
            doc_ids = self.redis_client.smembers("crdt:documents")
            for did_bytes in doc_ids:
                doc_id = did_bytes.decode('utf-8')
                hb_raw = self.redis_client.hgetall(f"room:{doc_id}:heartbeats")
                for sid_bytes, ts_bytes in hb_raw.items():
                    sid = sid_bytes.decode('utf-8')
                    ts = float(ts_bytes.decode('utf-8'))
                    if now - ts > timeout_seconds:
                        removed = self.remove_session(doc_id, sid)
                        if removed and not any(r[0] == doc_id and r[1].get('sid') == sid for r in stale_events):
                            stale_events.append((doc_id, removed, self.get_active_peers(doc_id)))
        except Exception as e:
            logger.error(f"Redis cleanup_stale_sessions error: {e}")
            self.use_redis = False
        return stale_events

redis_store = RedisStore()
