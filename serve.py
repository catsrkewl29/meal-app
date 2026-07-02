import http.server, socketserver, os
DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(DIR)
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=DIR, **k)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", 5173), H) as httpd:
    print("serving on 5173")
    httpd.serve_forever()
