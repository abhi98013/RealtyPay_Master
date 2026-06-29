#!/usr/bin/env python3
import http.server, pathlib, mimetypes, os

BUILD = pathlib.Path(__file__).parent.parent / "frontend" / "build"

class SPAHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        url_path = self.path.split("?")[0].split("#")[0].lstrip("/")
        target = BUILD / url_path if url_path else BUILD / "index.html"

        # Serve real static assets; fall back to index.html for SPA routes
        if not target.is_file():
            target = BUILD / "index.html"

        try:
            data = target.read_bytes()
            mime, _ = mimetypes.guess_type(str(target))
            self.send_response(200)
            self.send_header("Content-Type", mime or "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception:
            self.send_error(500)

    def log_message(self, *args):
        pass

if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", 3000), SPAHandler)
    server.serve_forever()
