# server/logger.py
import logging
import json
import time
import sys

class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage()
        }
        if hasattr(record, 'room_id'):
            log_record['room_id'] = record.room_id
        if hasattr(record, 'site_id'):
            log_record['site_id'] = record.site_id
        if hasattr(record, 'event'):
            log_record['event'] = record.event
        if hasattr(record, 'latency_ms'):
            log_record['latency_ms'] = record.latency_ms
        return json.dumps(log_record)

def setup_logger(name="crdt_server"):
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
        
    return logger

logger = setup_logger()
