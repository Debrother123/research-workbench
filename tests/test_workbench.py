import copy
import json
from pathlib import Path
import shutil
import sys
import tempfile
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import Store, Error
import assistant


class WorkbenchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.source = self.base / 'paper'
        shutil.copytree(ROOT / 'examples/toy-association', self.source)
        self.note = self.base / 'note.md'
        shutil.copyfile(ROOT / 'examples/toy-note.md', self.note)
        self.store = Store(self.base / 'workspace')
        self.original = assistant.hashes(self.source)
        self.paper = self.store.import_project('合成测试—not a paper', str(self.source), str(self.note))

    def tearDown(self):
        self.temp.cleanup()

    def test_import_nested_and_immutable(self):
        self.assertEqual(self.original, assistant.hashes(self.source))
        self.assertTrue(any(n['parent'] for n in self.paper['nodes']))
        self.assertEqual(self.paper['edges'], [])  # AST containment is NOT tensor flow
        self.assertEqual(self.paper['checks']['execution']['status'], 'pending')
        for node in self.paper['nodes']:
            c = node['code']
            self.assertEqual(c['sha256'], self.original[c['file']])

    def test_import_without_note_is_code_only(self):
        p = self.store.import_project('code-only', str(self.source), '')
        self.assertEqual(p['note_path'], '')
        self.assertEqual(p['note_text'], '')
        self.assertTrue(p['nodes'])
        self.assertEqual(p['checks']['execution']['status'], 'pending')
    def test_paper_layout_vs_semantic_and_conflict(self):
        p = copy.deepcopy(self.paper)
        p['nodes'][0]['x'] += 10
        saved = self.store.update_project(p['id'], {'revision': p['revision'], 'nodes': p['nodes']})
        self.assertEqual(saved['checks']['sync']['status'], 'pass')
        with self.assertRaises(Error) as conflict:
            self.store.update_project(p['id'], {'revision': p['revision'], 'brief': 'old revision'})
        self.assertEqual(conflict.exception.status, 409)
        saved['nodes'][0]['name'] = 'changed semantic label'
        with self.assertRaises(Error):
            self.store.update_project(saved['id'], {'revision': saved['revision'], 'nodes': saved['nodes']})

    def test_note_anchors_and_layout_sizes_validation(self):
        p = copy.deepcopy(self.paper)
        node_id = p['nodes'][0]['id']
        good_anchor = {node_id: {'heading': '方法分析', 'line_start': 66, 'line_end': 148, 'source': 'assistant-generated'}}
        saved = self.store.update_project(p['id'], {'revision': p['revision'], 'note_anchors': good_anchor})
        self.assertEqual(saved['note_anchors'], good_anchor)
        with self.assertRaises(Error):
            self.store.update_project(p['id'], {'revision': saved['revision'], 'note_anchors': {'ghost-node': good_anchor[node_id]}})
        bad = {'heading': '', 'line_start': 1, 'line_end': 2, 'source': 'assistant-generated'}
        with self.assertRaises(Error):
            self.store.update_project(p['id'], {'revision': saved['revision'], 'note_anchors': {node_id: bad}})
        bad2 = {'heading': 'x', 'line_start': 9, 'line_end': 2, 'source': 'user-confirmed'}
        with self.assertRaises(Error):
            self.store.update_project(p['id'], {'revision': saved['revision'], 'note_anchors': {node_id: bad2}})
        layout = {'engine': 'elk-layered', 'direction': 'DOWN', 'positions': {}, 'routes': {}, 'collapsed': [], 'sizes': {node_id: {'width': 420, 'height': 300}}}
        saved2 = self.store.update_project(p['id'], {'revision': saved['revision'], 'visual_layout': layout})
        self.assertEqual(saved2['visual_layout']['sizes'][node_id]['width'], 420)
        bad_layout = dict(layout, sizes={node_id: {'width': -5, 'height': 100}})
        with self.assertRaises(Error):
            self.store.update_project(p['id'], {'revision': saved2['revision'], 'visual_layout': bad_layout})

    def test_research_custom_edge_export(self):
        p = self.store.fork(self.paper['id'], '新方案')
        p['nodes'].append({'id': 'custom', 'name': '我的融合层', 'kind': 'custom', 'category': 'fusion', 'parent': None,
                           'x': 50, 'y': 20, 'code': None, 'inputs': [], 'outputs': [], 'parameters': {}, 'status': 'custom'})
        p['edges'].append({'id': 'new-edge', 'source': p['nodes'][0]['id'], 'target': 'custom', 'label': '待适配'})
        p = self.store.update_project(p['id'], {'revision': p['revision'], 'nodes': p['nodes'], 'edges': p['edges']})
        self.assertEqual(p['checks']['sync']['status'], 'warning')
        exported = self.store.export(p['id'])
        self.assertEqual(exported['status'], 'needs_adaptation')
        self.assertTrue((Path(exported['path']) / 'code/model.py').exists())
        self.assertTrue((Path(exported['path']) / 'graph.json').exists())
        self.assertEqual(self.original, assistant.hashes(self.source))
        self.assertNotEqual(exported['path'], self.store.export(p['id'])['path'])

    def test_paths_symlinks_secrets(self):
        (self.source / '.env').write_text('FAKE_TEST_SECRET=value')
        (self.source / 'private_key.txt').write_text('FAKE_PRIVATE_TEST_VALUE')
        try:
            (self.source / 'escape.py').symlink_to(self.note)
        except OSError as exc:
            if getattr(exc, 'winerror', None) == 1314:
                self.skipTest('symlink creation is unavailable on this Windows account')
            raise
        p = self.store.import_project('security', str(self.source), str(self.note))
        self.assertNotIn('.env', p['files'])
        self.assertNotIn('escape.py', p['files'])
        self.assertNotIn('private_key.txt', p['files'])
        with self.assertRaises(Error):
            self.store.code(p['id'], '../../note.md')
        with self.assertRaises(Error):
            self.store.directory('../anything')
        with self.assertRaises(Error):
            self.store.import_project('broad', '/', str(self.note))

    def test_graph_invalid_hierarchy_and_edges(self):
        p = self.store.fork(self.paper['id'])
        nodes = copy.deepcopy(p['nodes'])
        nodes[0]['parent'] = nodes[0]['id']
        with self.assertRaises(Error):
            self.store.update_project(p['id'], {'revision': p['revision'], 'nodes': nodes})
        with self.assertRaises(Error):
            self.store.update_project(p['id'], {'revision': p['revision'], 'edges': [{'id': 'x', 'source': 'missing', 'target': nodes[0]['id']}]})

    def test_external_code_change_diff_and_attestation(self):
        p = self.store.fork(self.paper['id'])
        root = self.store.directory(p['id'])
        assistant.checkpoint(root, p)
        report = self.base / 'report.md'
        report.write_text('Manually reviewed synthetic fixture: classes map to model.py and the training entry point maps to train.py. '
                          'This fixture is not an actual paper. No biological result or paper reproduction is claimed.')
        assistant.attest(root, p, report)
        self.assertTrue(assistant.verify(root, p)['valid'])
        code = root / 'working/model.py'
        code.write_text(code.read_text() + '\n# external edit\n')
        self.assertFalse(assistant.verify(root, p)['valid'])
        self.assertEqual(self.store.get_project(p['id'])['checks']['sync']['status'], 'warning')
        self.assertIn('model.py', self.store.diff(p['id'])['changed_files'])

    def test_library_dedup_and_tasks(self):
        first = self.store.extract(self.paper['id'])
        self.assertGreater(first['added'], 0)
        again = self.store.extract(self.paper['id'])
        self.assertEqual(again['added'], 0)
        p = self.store.fork(self.paper['id'])
        self.store.extract(p['id'])
        library = self.store.library()
        self.assertTrue(all(r['status'] == 'candidate' for r in library))
        self.assertTrue(any(len(r['sources']) > 1 for r in library))
        task = self.store.create_task(p['id'], 'adapt', 'Only inspect; no training requested')
        self.assertEqual(task['status'], 'pending')
        saved = json.loads(Path(task['path']).read_text())
        self.assertEqual(saved['input_revision'], p['revision'])

    def test_original_tampering_blocks_export(self):
        root=self.store.directory(self.paper['id'])
        (root/'original/model.py').write_text('tampered original')
        self.assertEqual(self.store.get_project(self.paper['id'])['checks']['sync']['status'],'fail')
        with self.assertRaises(Error): self.store.export(self.paper['id'])

    def test_new_file_change_and_manifest(self):
        p=self.store.fork(self.paper['id']);root=self.store.directory(p['id'])
        (root/'working/adapter.py').write_text('def adapter(x):\n    return x\n')
        self.assertEqual(self.store.get_project(p['id'])['checks']['sync']['status'],'warning')
        self.assertIn('adapter.py',self.store.diff(p['id'])['changed_files'])
        self.assertIn('def adapter',self.store.code(p['id'],'adapter.py')['content'])
        fork=self.store.fork(p['id'])
        self.assertTrue((self.store.directory(fork['id'])/'working/adapter.py').exists())

    def test_crlf_fork_preserves_original_bytes(self):
        (self.source/'crlf.py').write_bytes(b'x = 1\r\ny = 2\r\n')
        p=self.store.import_project('crlf',str(self.source),str(self.note))
        f=self.store.fork(p['id'])
        self.assertEqual(self.store.get_project(f['id'])['checks']['sync']['status'],'pass')
        self.assertEqual((self.store.directory(f['id'])/'original/crlf.py').read_bytes(),b'x = 1\r\ny = 2\r\n')

    def test_apply_reviewed_graph_and_stale_attestation(self):
        p=self.paper;root=self.store.directory(p['id']);graph={'nodes':copy.deepcopy(p['nodes']),'edges':[]}
        graph['nodes'][0]['description']='Reviewed synthetic source declaration'
        g=self.base/'graph.json';g.write_text(json.dumps(graph))
        r=self.base/'report.md';r.write_text('Source-reviewed synthetic graph. Each node was inspected against the local class or function declaration. '
                                           'This review records mapping only; no scientific fidelity or runtime validation is asserted.')
        assistant.apply_graph(root,p,g,r)
        updated=self.store.get_project(p['id'])
        self.assertTrue(assistant.verify(root,updated)['valid'])
        self.assertFalse(self.store.diff(p['id'])['graph_changed'])
        self.assertTrue(self.store.review(p['id'])['current'])

    def test_known_port_mismatch_is_not_forbidden(self):
        p=self.store.fork(self.paper['id'])
        p['nodes'][0]['outputs']=[{'name':'x','type':'tensor','shape':'N,64'}]
        p['nodes'][1]['inputs']=[{'name':'x','type':'tensor','shape':'N,32'}]
        p['edges']=[{'id':'edge','source':p['nodes'][0]['id'],'target':p['nodes'][1]['id'],'label':''}]
        p=self.store.update_project(p['id'],{'revision':p['revision'],'nodes':p['nodes'],'edges':p['edges']})
        self.assertEqual(p['checks']['interfaces']['status'],'warning')
        self.assertIn('mismatch',str(p['checks']['interfaces']['details']))

    def test_exported_fixture_smoke(self):
        exported=self.store.export(self.paper['id'])
        result=subprocess.run([sys.executable,'-B','train.py'],cwd=Path(exported['path'])/'code',capture_output=True,text=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('loss_after',result.stdout)
        self.assertEqual(self.original,assistant.hashes(self.source))
        export_id=Path(exported['path']).name
        viewed=self.store.export_code(self.paper['id'],export_id,'model.py')
        self.assertIn('class AssociationModel',viewed['content'])
        with self.assertRaises(Error):self.store.export_code(self.paper['id'],'../../bad','model.py')

    def test_finish_task_requires_mapping_and_updates_queue(self):
        p=self.store.fork(self.paper['id']);root=self.store.directory(p['id'])
        task=self.store.create_task(p['id'],'adapt','Synthetic test task')
        p=self.store.get_project(p['id'])
        r=self.base/'report.md';r.write_text('Synthetic fixture task result: source and graph mappings were reviewed against local definitions. '
                                           'No real paper or biological result is asserted; adaptation intentionally preserves fixture behavior.')
        with self.assertRaises(ValueError):assistant.finish_task(root,p,task['id'],'completed',r)
        assistant.attest(root,p,r)
        assistant.finish_task(root,p,task['id'],'completed',r)
        self.assertEqual(self.store.get_project(p['id'])['tasks'][0]['status'],'completed')
        self.assertEqual(json.loads(Path(task['path']).read_text())['status'],'completed')


if __name__ == '__main__':
    unittest.main()
