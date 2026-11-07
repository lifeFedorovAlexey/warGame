"""Local review server with fresh assets and versioned review URLs."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import re

os.chdir(Path(__file__).resolve().parents[1])

class ReviewHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = re.sub(r'^/review/[^/]+/', '/', path)
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def log_message(self, format, *args):
        if len(args) > 1 and str(args[1]).startswith(('4', '5')):
            super().log_message(format, *args)

print('warGame review: http://127.0.0.1:8766/demo/', flush=True)
ThreadingHTTPServer(('127.0.0.1', 8766), ReviewHandler).serve_forever()
