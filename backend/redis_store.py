import json
import logging
import os
import time

logger = logging.getLogger(__name__)

class InMemoryStore:
    """In-memory store fallback for development and testing."""
    def __init__(self):
        self.presence = {}          # doc_id -> { sid -> { user_id, username, joined_at } }
        self.sid_map = {}           # sid -> { doc_id, user_id, username }
        self.seen_ops = {}          # doc_id -> set of op_ids
        self.ops = {}               # doc_id -> list of op_data dicts
        self.snapshots = {}         # doc_id -> snapshot_string

    def add_presence(self, doc_id, user_id, username, sid):
        doc_id = str(doc_id)
        if doc_id not in self.presence:
            self.presence[doc_id] = {}
        info = {'user_id': user_id, 'username': username, 'sid': sid, 'joined_at': time.time()}
        self.presence[doc_id][sid] = info
        self.sid_map[sid] = {'doc_id': doc_id, 'user_id': user_id, 'username': username}
        return [v for v in self.presence[doc_id].values()]

    def remove_sid(self, sid):
        if sid in self.sid_map:
            mapping = self.sid_map.pop(sid)
            doc_id = mapping['doc_id']
            if doc_id in self.presence and sid in self.presence[doc_id]:
                self.presence[doc_id].pop(sid)
            return mapping
        return None

    def get_presence(self, doc_id):
        doc_id = str(doc_id)
        if doc_id in self.presence:
            return list(self.presence[doc_id].values())
        return []

    def is_op_seen(self, doc_id, op_id):
        doc_id = str(doc_id)
        return op_id in self.seen_ops.get(doc_id, set())

    def mark_op_seen(self, doc_id, op_id):
        doc_id = str(doc_id)
        if doc_id not in self.seen_ops:
            self.seen_ops[doc_id] = set()
        self.seen_ops[doc_id].add(op_id)

    def add_operation(self, doc_id, op_data):
        doc_id = str(doc_id)
        if doc_id not in self.ops:
            self.ops[doc_id] = []
        seq_num = len(self.ops[doc_id]) + 1
        op_data['seqNum'] = seq_num
        self.ops[doc_id].append(op_data)
        self.mark_op_seen(doc_id, op_data.get('opId'))
        return seq_num

    def get_operations_after(self, doc_id, after_seq_num=0):
        doc_id = str(doc_id)
        all_ops = self.ops.get(doc_id, [])
        return [op for op in all_ops if op.get('seqNum', 0) > after_seq_num]

    def set_snapshot(self, doc_id, snapshot_data):
        self.snapshots[str(doc_id)] = snapshot_data

    def get_snapshot(self, doc_id):
        return self.snapshots.get(str(doc_id), None)

    def ping(self):
        return True


class RedisStore:
    """Redis-backed storage for production rooms, presence, operations, and session state."""
    def __init__(self, redis_url):
        import redis
        self.client = redis.Redis.from_url(redis_url, decode_responses=True)

    def add_presence(self, doc_id, user_id, username, sid):
        doc_id = str(doc_id)
        info = json.dumps({'user_id': user_id, 'username': username, 'sid': sid, 'joined_at': time.time()})
        self.client.hset(f"doc:{doc_id}:presence", sid, info)
        self.client.hset("sid_map", sid, json.dumps({'doc_id': doc_id, 'user_id': user_id, 'username': username}))
        return self.get_presence(doc_id)

    def remove_sid(self, sid):
        mapping_str = self.client.hget("sid_map", sid)
        if mapping_str:
            self.client.hdel("sid_map", sid)
            mapping = json.loads(mapping_str)
            doc_id = mapping['doc_id']
            self.client.hdel(f"doc:{doc_id}:presence", sid)
            return mapping
        return None

    def get_presence(self, doc_id):
        doc_id = str(doc_id)
        raw_dict = self.client.hgetall(f"doc:{doc_id}:presence")
        return [json.loads(val) for val in raw_dict.values()]

    def is_op_seen(self, doc_id, op_id):
        doc_id = str(doc_id)
        return self.client.sismember(f"doc:{doc_id}:seen_ops", op_id)

    def mark_op_seen(self, doc_id, op_id):
        doc_id = str(doc_id)
        self.client.sadd(f"doc:{doc_id}:seen_ops", op_id)

    def add_operation(self, doc_id, op_data):
        doc_id = str(doc_id)
        seq_num = self.client.incr(f"doc:{doc_id}:seq")
        op_data['seqNum'] = seq_num
        self.client.rpush(f"doc:{doc_id}:ops", json.dumps(op_data))
        self.mark_op_seen(doc_id, op_data.get('opId'))
        return seq_num

    def get_operations_after(self, doc_id, after_seq_num=0):
        doc_id = str(doc_id)
        raw_ops = self.client.lrange(f"doc:{doc_id}:ops", after_seq_num, -1)
        res = []
        for raw in raw_ops:
            op = json.loads(raw)
            if op.get('seqNum', 0) > after_seq_num:
                res.append(op)
        return res

    def set_snapshot(self, doc_id, snapshot_data):
        self.client.set(f"doc:{str(doc_id)}:snapshot", json.dumps(snapshot_data))

    def get_snapshot(self, doc_id):
        raw = self.client.get(f"doc:{str(doc_id)}:snapshot")
        return json.loads(raw) if raw else None

    def ping(self):
        return self.client.ping()


def get_store(config):
    redis_url = getattr(config, 'REDIS_URL', '')
    is_prod = getattr(config, 'FLASK_ENV', 'development') == 'production'
    is_testing = getattr(config, 'TESTING', False)

    if redis_url:
        try:
            store = RedisStore(redis_url)
            store.ping()
            logger.info("Connected to Redis successfully.")
            return store
        except Exception as e:
            if is_prod and not is_testing:
                logger.critical(f"Failed to connect to Redis in production: {e}")
                raise RuntimeError(f"Production requires active Redis connection: {e}")
            logger.warning(f"Could not connect to Redis ({e}). Falling back to InMemoryStore for dev/testing.")
            return InMemoryStore()
    else:
        if is_prod and not is_testing:
            raise RuntimeError("REDIS_URL must be provided in production environment!")
        logger.info("No REDIS_URL provided. Using InMemoryStore for development/testing.")
        return InMemoryStore()
