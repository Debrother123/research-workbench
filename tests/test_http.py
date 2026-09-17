import json
from pathlib import Path
import shutil
import sys
import tempfile
import threading
import unittest
from urllib import request, error

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import Store
from server import make_server


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.server = make_server(Store(self.base / 'workspace'), 0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = 'http://127.0.0.1:' + str(self.server.server_port)
        self.token = self.call('/api/session')[1]['token']

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def call(self, path, method='GET', body=None, headers=None):
        req = request.Request(self.url + path, method=method,
                              data=json.dumps(body).encode() if body is not None else None,
                              headers=headers or {})
        try:
            with request.urlopen(req, timeout=5) as r:
                content = r.read()
                return r.status, json.loads(content) if 'application/json' in r.headers['Content-Type'] else content
        except error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_request_security_and_assets(self):
        self.assertEqual(self.call('/api/projects','POST',{})[0],403)
        self.assertEqual(self.call('/api/session',headers={'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.call('/api/session',headers={'Host':'evil.example'})[0],403)
        self.assertEqual(self.call('/api/session',headers={'Sec-Fetch-Site':'cross-site'})[0],403)
        self.assertEqual(self.call('/favicon.svg')[0],200)
        self.assertIn(b'app.js',self.call('/')[1])
        self.assertEqual(self.call('/../backend.py')[0],404)

    def test_read_only_mode_rejects_project_mutations(self):
        temp = tempfile.TemporaryDirectory()
        read_only = make_server(Store(Path(temp.name) / 'workspace'), 0, allow_mutations=False)
        thread = threading.Thread(target=read_only.serve_forever, daemon=True)
        thread.start()
        url = 'http://127.0.0.1:' + str(read_only.server_port)
        try:
            with request.urlopen(url + '/api/session', timeout=5) as r:
                token = json.loads(r.read())['token']
            req = request.Request(
                url + '/api/projects', method='POST', data=b'{}',
                headers={'Content-Type': 'application/json', 'X-Workbench-Token': token},
            )
            with self.assertRaises(error.HTTPError) as caught:
                request.urlopen(req, timeout=5)
            self.assertEqual(caught.exception.code, 403)
        finally:
            read_only.shutdown()
            read_only.server_close()
            thread.join()
            temp.cleanup()
    def test_http_import_save_export(self):
        source = self.base / 'source'
        shutil.copytree(ROOT / 'examples/toy-association',source)
        headers={'Content-Type':'application/json','X-Workbench-Token':self.token}
        status,p = self.call('/api/projects','POST',{'source_path':str(source),'note_path':str(ROOT/'examples/toy-note.md'),'name':'HTTP test'},headers)
        self.assertEqual(status,201)
        prefix='/api/projects/'+p['id']
        self.assertEqual(self.call(prefix+'/code?file=..%2F..%2Fbackend.py')[0],404)
        status,fork = self.call(prefix+'/fork','POST',{'name':'research'},headers)
        self.assertEqual(status,200)
        status,exported=self.call('/api/projects/'+fork['id']+'/export','POST',{},headers)
        self.assertEqual(status,200)
        self.assertTrue((Path(exported['path'])/'code'/'model.py').is_file())


if __name__=='__main__':
    unittest.main()
