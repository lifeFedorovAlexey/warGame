"""Receive local gameplay diagnostics without restarting the game server."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from datetime import datetime, timezone
import json
import re

ROOT = Path(__file__).resolve().parents[1] / 'campaign' / 'reports' / 'live-navigation'
ROOT.mkdir(parents=True, exist_ok=True)
LOCK = Lock()
STATUS = {'service': 'warGame-navigation', 'batches': 0, 'events': 0, 'lastSession': None, 'lastReceived': None}
ORIGINS = {'http://127.0.0.1:8766', 'http://localhost:8766'}


class Handler(BaseHTTPRequestHandler):
    def respond(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        origin = self.headers.get('Origin')
        if origin in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != '/health':
            return self.respond(404, {'error': 'unknown endpoint'})
        with LOCK:
            status = dict(STATUS)
        self.respond(200, status)

    def do_POST(self):
        if self.path != '/navigation' or self.headers.get('Origin') not in ORIGINS:
            return self.respond(403, {'error': 'local game origin required'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 512 * 1024:
                return self.respond(413, {'error': 'batch too large'})
            data = json.loads(self.rfile.read(length))
            session, events = data['session'], data['events']
            if not isinstance(session, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', session):
                raise ValueError('invalid session')
            if not isinstance(events, list) or len(events) > 100:
                raise ValueError('invalid events')
            received = datetime.now(timezone.utc).isoformat()
            lines = [json.dumps({'received': received, 'session': session, 'event': event}, ensure_ascii=False) + '\n'
                     for event in events if isinstance(event, dict)]
            with LOCK:
                path = ROOT / (session + '.jsonl')
                if path.exists() and path.stat().st_size > 12 * 1024 * 1024:
                    path.replace(ROOT / (session + '.previous.jsonl'))
                with path.open('a', encoding='utf-8') as stream:
                    stream.writelines(lines)
                STATUS.update(batches=STATUS['batches'] + 1, events=STATUS['events'] + len(lines),
                              lastSession=session, lastReceived=received)
            self.respond(200, {'accepted': len(lines)})
        except (ValueError, KeyError, TypeError):
            self.respond(400, {'error': 'invalid diagnostic batch'})

    def log_message(self, *_):
        pass


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 8767), Handler)
    print('Local navigation collector ready', flush=True)
    server.serve_forever()
