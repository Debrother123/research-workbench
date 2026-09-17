"""Loopback-only HTTP entry point; no imported-code execution."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import webbrowser
from urllib.request import urlopen
from urllib.parse import parse_qs, urlsplit

from backend import Store, Error


def make_server(store, port=8765):
    token = secrets.token_urlsafe(32)
    static = Path(__file__).resolve().parent / 'static'

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass

        def reply(self, value, status=200):
            body = json.dumps(value, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(body)

        def handle_request(self):
            expected = '127.0.0.1:' + str(self.server.server_port)
            localhost = 'localhost:' + str(self.server.server_port)
            host = self.headers.get('Host', '')
            if host not in (expected, localhost):
                raise Error('Invalid Host', 403)
            origin = self.headers.get('Origin')
            if origin and origin != 'http://' + host:
                raise Error('Cross-origin request rejected', 403)
            if self.headers.get('Sec-Fetch-Site') == 'cross-site':
                raise Error('Cross-site request rejected', 403)
            parsed = urlsplit(self.path)
            path = parsed.path
            if self.command == 'GET' and path in ('/', '/index.html', '/app.js', '/style.css', '/workflow.js', '/workflow.css', '/notes.js', '/favicon.svg', '/vendor/elk.bundled.js', '/bundle/canvas.js', '/bundle/canvas.css'):
                filename = 'index.html' if path == '/' else path[1:]
                f = static / filename
                if not f.is_file():
                    raise Error('Static file not found', 404)
                body = f.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml'}[f.suffix])
                self.send_header('Content-Length', str(len(body)))
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
                self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
                self.end_headers()
                self.wfile.write(body)
                return
            data = {}
            if self.command in ('POST', 'PUT'):
                if not secrets.compare_digest(self.headers.get('X-Workbench-Token', ''), token):
                    raise Error('Missing or invalid session token', 403)
                if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
                    raise Error('JSON content type required', 415)
                try:
                    length = int(self.headers.get('Content-Length', '0'))
                    if length < 0 or length > 8 * 1024 * 1024:
                        raise Error('Request body too large', 413)
                    data = json.loads(self.rfile.read(length))
                    if not isinstance(data, dict):
                        raise ValueError()
                except (ValueError, UnicodeError):
                    raise Error('Invalid JSON object')
            if path == '/api/session' and self.command == 'GET':
                return self.reply({'token': token})
            if path == '/api/health' and self.command == 'GET':
                return self.reply({'app': 'research-workbench', 'version': '0.1.0'})
            if path == '/api/library' and self.command == 'GET':
                return self.reply({'implementations': store.library()})
            if path == '/api/projects':
                if self.command == 'GET':
                    return self.reply({'projects': store.list_projects()})
                if self.command == 'POST':
                    return self.reply(store.import_project(data.get('name', ''), data.get('source_path', ''), data.get('note_path', '')), 201)
            pieces = path.strip('/').split('/')
            if len(pieces) >= 3 and pieces[:2] == ['api', 'projects']:
                pid = pieces[2]
                if len(pieces) == 3:
                    if self.command == 'GET':
                        return self.reply(store.get_project(pid))
                    if self.command == 'PUT':
                        return self.reply(store.update_project(pid, data))
                if len(pieces) == 4:
                    action = pieces[3]
                    if self.command == 'GET':
                        if action == 'code':
                            query = parse_qs(parsed.query)
                            return self.reply(store.code(pid, query.get('file', [''])[0], query.get('version', ['working'])[0]))
                        if action == 'diff':
                            return self.reply(store.diff(pid))
                        if action == 'review':
                            return self.reply(store.review(pid))
                        if action == 'export-code':
                            query = parse_qs(parsed.query)
                            return self.reply(store.export_code(pid, query.get('export_id', [''])[0], query.get('file', [''])[0]))
                    if self.command == 'POST':
                        if action == 'fork':
                            return self.reply(store.fork(pid, data.get('name')))
                        if action == 'validate':
                            return self.reply(store.validate(pid))
                        if action == 'export':
                            return self.reply(store.export(pid))
                        if action == 'tasks':
                            return self.reply(store.create_task(pid, data.get('type'), data.get('instructions', '')))
                        if action == 'extract':
                            return self.reply(store.extract(pid))
                        if action == 'select-implementation':
                            return self.reply(store.select_implementation(pid, data.get('node_id'), data.get('concept', '')))
            raise Error('Route not found', 404)

        def dispatch(self):
            try:
                self.handle_request()
            except Error as e:
                self.reply({'error': str(e)}, e.status)
            except (OSError, ValueError, KeyError, TypeError) as e:
                self.reply({'error': 'Invalid request or inaccessible project: ' + str(e)}, 400)

        do_GET = dispatch
        do_POST = dispatch
        do_PUT = dispatch

    return ThreadingHTTPServer(('127.0.0.1', port), Handler)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--workspace', default=str(Path(__file__).resolve().parent / 'workspace'))
    parser.add_argument('--open', action='store_true', help='Open the local workbench in your browser')
    args = parser.parse_args()
    try:
        server = make_server(Store(args.workspace), args.port)
    except OSError:
        if args.open:
            try:
                with urlopen('http://127.0.0.1:%s/api/health' % args.port, timeout=2) as r:
                    existing = json.load(r)
                if existing.get('app') == 'research-workbench':
                    webbrowser.open('http://127.0.0.1:%s' % args.port)
                    print('Opened existing local workbench.')
                    return
            except (OSError, ValueError):
                pass
        raise
    print('Research Workbench: http://127.0.0.1:%s' % server.server_port, flush=True)
    if args.open:
        webbrowser.open('http://127.0.0.1:%s' % server.server_port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
