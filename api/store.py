import os
import json
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler

# Vercel KV environment variables
KV_URL = os.environ.get("KV_REST_API_URL")
KV_TOKEN = os.environ.get("KV_REST_API_TOKEN")

LOCAL_DB_FILE = os.path.join(os.path.dirname(__file__), "..", "local_db.json")

def get_data(key: str) -> dict:
    if KV_URL and KV_TOKEN:
        try:
            req = urllib.request.Request(f"{KV_URL}/get/{key}", headers={"Authorization": f"Bearer {KV_TOKEN}"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode())
                val = data.get("result")
                if val:
                    return json.loads(val)
        except Exception:
            pass
    else:
        if os.path.exists(LOCAL_DB_FILE):
            with open(LOCAL_DB_FILE, "r") as f:
                db = json.load(f)
                return db.get(key)
    return None

def set_data(key: str, value: dict):
    if KV_URL and KV_TOKEN:
        try:
            req = urllib.request.Request(f"{KV_URL}/set/{key}", headers={"Authorization": f"Bearer {KV_TOKEN}"}, method="POST")
            req.add_header("Content-Type", "application/json")
            # Upstash/Vercel KV expects the value to be JSON encoded inside the request body if using raw HTTP, 
            # or just sending it as the body string. 
            # Actually, standard Vercel KV REST syntax: POST body is just the value.
            body = json.dumps(value).encode()
            with urllib.request.urlopen(req, data=body, timeout=5) as resp:
                pass
        except Exception:
            pass
    else:
        db = {}
        if os.path.exists(LOCAL_DB_FILE):
            with open(LOCAL_DB_FILE, "r") as f:
                db = json.load(f)
        db[key] = value
        with open(LOCAL_DB_FILE, "w") as f:
            json.dump(db, f)

class handler(BaseHTTPRequestHandler):
    def _send(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send({})

    def do_GET(self):
        try:
            from urllib.parse import parse_qs, urlparse
            qs = parse_qs(urlparse(self.path).query)
            key = qs.get("key", [""])[0]
            if not key:
                self._send({"error": "Key is required"}, 400)
                return
            
            val = get_data(key)
            self._send({"data": val})
        except Exception as e:
            self._send({"error": str(e)}, 500)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            key = payload.get("key")
            value = payload.get("value")
            
            if not key or value is None:
                self._send({"error": "Key and value required"}, 400)
                return
                
            set_data(key, value)
            self._send({"success": True})
        except Exception as e:
            self._send({"error": str(e)}, 500)

    def log_message(self, *args):
        pass
