# 本地试玩服务器（禁用缓存，改完代码刷新即生效）：python serve.py  然后打开 http://localhost:8765
import http.server

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

with http.server.ThreadingHTTPServer(('', 8765), NoCache) as s:
    print('Starleaf: http://localhost:8765', flush=True)
    s.serve_forever()
