"""File-first workbench storage. Imported Python is parsed, never executed."""
import ast
import copy
import datetime
import difflib
import hashlib
import json
import math
import os
import re
from pathlib import Path
import shutil
import threading
import uuid


class Error(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(value):
    if not isinstance(value, bytes):
        value = json.dumps(value, sort_keys=True, ensure_ascii=False).encode()
    return hashlib.sha256(value).hexdigest()


def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(str(temporary), str(path))


def semantic(p):
    return digest({'nodes': [{k: v for k, v in n.items() if k not in ('x', 'y', 'status')} for n in p['nodes']], 'edges': p['edges']})


graph_digest = semantic


EXCLUDED = {'.git', '.svn', '.hg', '.venv', 'venv', 'env', 'node_modules', '__pycache__', '.ssh', '.aws', '.config', 'workspace', '.idea', '.pytest_cache'}
SUFFIXES = {'.py', '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.csv', '.tsv', '.sh', '.r', '.ipynb', '.rst', '.cpp', '.h', '.c', '.gitignore', '.lock'}


def permitted(path):
    name = path.name.lower()
    return not (name.startswith('.env') or any(s in name for s in ('credential', 'secret', 'private_key', 'id_rsa', 'id_ed25519')) or path.suffix.lower() in {'.pem', '.key', '.p12'}) and (path.suffix.lower() in SUFFIXES or name in {'dockerfile', 'makefile', 'license', 'requirements', 'pipfile'})


class Store:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.projects = self.root / 'projects'
        self.projects.mkdir(exist_ok=True)
        self.lock = threading.RLock()

    def directory(self, project_id):
        try:
            if str(uuid.UUID(project_id)) != project_id:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise Error('Invalid project ID')
        directory = self.projects / project_id
        if not directory.is_dir() or directory.is_symlink():
            raise Error('Project not found', 404)
        return directory

    def _read(self, project_id):
        return json.loads((self.directory(project_id) / 'project.json').read_text(encoding='utf-8'))

    def _save(self, p, bump=True):
        if bump:
            p['revision'] += 1
        p['updated_at'] = now()
        atomic(self.directory(p['id']) / 'project.json', p)
        return p

    def list_projects(self):
        with self.lock:
            result = []
            for f in self.projects.glob('*/project.json'):
                p = json.loads(f.read_text(encoding='utf-8'))
                result.append({k: p[k] for k in ('id', 'name', 'mode', 'revision', 'updated_at')})
            return sorted(result, key=lambda p: p['updated_at'], reverse=True)

    def _inventory(self, folder):
        files, skipped, total = [], [], 0
        for base, directories, names in os.walk(str(folder), followlinks=False):
            base = Path(base)
            for d in list(directories):
                child = base / d
                if d in EXCLUDED or child.is_symlink():
                    skipped.append(str(child.relative_to(folder)) + '/ (excluded directory)')
                    directories.remove(d)
            for name in sorted(names):
                f = base / name
                relative = f.relative_to(folder).as_posix()
                if f.is_symlink() or not f.is_file() or not permitted(f):
                    skipped.append(relative + ' (excluded file type or sensitive name)')
                    continue
                size = f.stat().st_size
                if size > 2 * 1024 * 1024:
                    skipped.append(relative + ' (over 2 MiB; external reference)')
                    continue
                try:
                    content = f.read_bytes()
                    content.decode('utf-8')
                    if b'\x00' in content:
                        raise UnicodeError()
                except UnicodeError:
                    skipped.append(relative + ' (non UTF-8 text)')
                    continue
                total += size
                if len(files) >= 2000 or total > 32 * 1024 * 1024:
                    raise Error('Import exceeds 2000 files or 32 MiB text limit')
                files.append(relative)
        return sorted(files), skipped

    def import_project(self, name, source_path, note_path):
        with self.lock:
            source_input, note_input = Path(source_path).expanduser(), Path(note_path).expanduser()
            source, note = source_input.resolve(), note_input.resolve()
            forbidden = {Path('/'), Path.home(), Path.home() / 'Documents', Path(__file__).resolve().parent}
            approved_import = self.root / 'imports' in source.parents
            if source_input.is_symlink() or not source.is_dir() or source in forbidden or self.root == source or (self.root in source.parents and not approved_import) or source in self.root.parents:
                raise Error('Choose a specific source repository outside the workbench workspace')
            if note_input.is_symlink() or not note.is_file() or note.suffix.lower() not in ('.md', '.txt') or note.stat().st_size > 2 * 1024 * 1024 or not permitted(note):
                raise Error('Note must be a regular UTF-8 Markdown/text file under 2 MiB')
            try:
                note_text = note.read_text(encoding='utf-8')
            except UnicodeError:
                raise Error('Note is not UTF-8')
            files, excluded = self._inventory(source)
            if not files:
                raise Error('No supported text source files found')
            project_id = str(uuid.uuid4())
            directory = self.projects / project_id
            directory.mkdir()
            for version in ('original', 'working'):
                for rel in files:
                    target = directory / version / rel
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(str(source / rel), str(target))
            p = {'id': project_id, 'name': str(name or source.name)[:200], 'mode': 'paper', 'revision': 1, 'created_at': now(), 'updated_at': now(), 'note_path': str(note), 'note_text': note_text, 'source_path': str(source), 'brief': '', 'nodes': [], 'edges': [], 'checks': {}, 'files': files, 'exports': [], 'tasks': [], 'warnings': ['AST candidate decomposition only: containment is not tensor dataflow.'] + excluded}
            p['source_hashes'] = self._hashes(directory / 'working', files)
            p['original_hashes'] = dict(p['source_hashes'])
            for rel in files:
                if not rel.endswith('.py'):
                    continue
                content = (directory / 'working' / rel).read_text(encoding='utf-8')
                try:
                    tree = ast.parse(content)
                except SyntaxError as e:
                    p['warnings'].append('{}: static parse failed at line {}'.format(rel, e.lineno))
                    continue
                def visit(tree, parent=None):
                    for child in ast.iter_child_nodes(tree):
                        if isinstance(child, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                            node_id = uuid.uuid4().hex
                            title = child.name
                            low = title.lower()
                            category = next((v for k, v in [('loss', 'loss'), ('train', 'training'), ('eval', 'evaluation'), ('pool', 'encoder'), ('gcn', 'encoder'), ('gat', 'encoder'), ('encode', 'encoder'), ('data', 'data'), ('fusion', 'fusion'), ('predict', 'head')] if k in low), 'custom')
                            p['nodes'].append({'id': node_id, 'name': title, 'kind': 'class' if isinstance(child, ast.ClassDef) else 'function', 'category': category, 'parent': parent, 'x': (len(p['nodes']) % 3) * 260, 'y': (len(p['nodes']) // 3) * 150, 'description': ast.get_docstring(child) or 'Static source declaration; behavior and paper meaning require review.', 'code': {'file': rel, 'start': child.lineno, 'end': getattr(child, 'end_lineno', child.lineno), 'sha256': p['source_hashes'][rel]}, 'inputs': [], 'outputs': [], 'parameters': {}, 'implementation_id': None, 'status': 'candidate', 'selection_reason': ''})
                            visit(child, node_id)
                        else:
                            visit(child, parent)
                visit(tree)
            p['baseline_graph_hash'] = semantic(p)
            atomic(directory / 'baseline-graph.json', {'nodes': p['nodes'], 'edges': p['edges']})
            p['checks'] = self._checks(p)
            return self._save(p, False)

    def _hashes(self, directory, files):
        result = {}
        for rel in files:
            f = directory / rel
            if f.is_file() and not f.is_symlink() and directory.resolve() in f.resolve().parents:
                result[rel] = digest(f.read_bytes())
        return result

    def code(self, project_id, file, version='working'):
        if version not in ('original', 'working'):
            raise Error('Invalid code version')
        p = self._read(project_id)
        available = p['files'] if version == 'original' else self._inventory(self.directory(project_id) / 'working')[0]
        if file not in available:
            raise Error('File not present in project manifest', 404)
        base = self.directory(project_id) / version
        f = base / file
        if not f.is_file() or f.is_symlink() or base.resolve() not in f.resolve().parents or f.stat().st_size > 2 * 1024 * 1024:
            raise Error('Unsafe or missing file')
        try:
            content = f.read_text(encoding='utf-8')
        except UnicodeError:
            raise Error('File is not UTF-8 text')
        return {'file': file, 'content': content, 'sha256': digest(f.read_bytes())}

    def _checks(self, p):
        directory = self.directory(p['id'])
        working_files = self._inventory(directory / 'working')[0]
        hashes = self._hashes(directory / 'working', working_files)
        stale = [f for f in set(working_files) | set(p['source_hashes']) if hashes.get(f) != p['source_hashes'].get(f)]
        original_files = self._inventory(directory / 'original')[0]
        original_changed = self._hashes(directory / 'original', original_files) != p['original_hashes']
        unmapped = [n['name'] for n in p['nodes'] if not n.get('code')]
        invalid = [n['name'] for n in p['nodes'] if n.get('code') and hashes.get(n['code']['file']) != n['code'].get('sha256')]
        dirty = semantic(p) != p['baseline_graph_hash']
        attested = self._attested(p, hashes)
        if attested and not unmapped and not invalid:
            dirty, stale = False, []
        interfaces = self._interfaces(p)
        return {'source_mapping': {'status': 'fail' if original_changed else ('warning' if unmapped or invalid else 'pass'), 'details': (['Immutable original snapshot hash mismatch.'] if original_changed else []) + ['Unimplemented: ' + n for n in unmapped] + ['Stale source mapping: ' + n for n in invalid]}, 'interfaces': interfaces, 'execution': {'status': 'pending', 'details': ['Imported code is never automatically executed.']}, 'paper_fidelity': {'status': 'pending', 'details': ['Assistant must compare note/paper with code; static parsing is insufficient.']}, 'sync': {'status': 'fail' if original_changed else ('warning' if dirty or stale else 'pass'), 'details': (['Original snapshot changed.'] if original_changed else []) + (['Semantic graph changed; source adaptation pending.'] if dirty else []) + ['Working file changed: ' + f for f in stale]}}

    def _interfaces(self, p):
        nodes = {n['id']: n for n in p['nodes']}
        unknown, failures = [], []
        for edge in p['edges']:
            outputs = nodes[edge['source']].get('outputs', [])
            inputs = nodes[edge['target']].get('inputs', [])
            if len(outputs) != 1 or len(inputs) != 1:
                unknown.append(edge['id'] + ': explicit single input/output port unavailable')
                continue
            for key in ('type', 'shape'):
                a, b = outputs[0].get(key), inputs[0].get(key)
                if not a or not b or a in ('unknown', '?') or b in ('unknown', '?'):
                    unknown.append(edge['id'] + ': ' + key + ' unknown')
                elif a != b:
                    failures.append(edge['id'] + ': declared ' + key + ' mismatch: ' + str(a) + ' vs ' + str(b))
        return {'status': 'warning' if failures else ('pending' if unknown or not p['edges'] else 'pass'), 'details': failures + unknown + (['Static declared-port check only; not a runtime or semantic guarantee.'] if p['edges'] else ['No tensor dataflow edges supplied.'])}

    def _attested(self, p, hashes):
        directory = self.directory(p['id'])
        path = directory / 'assistant-attestation.json'
        if not path.is_file() or path.is_symlink():
            return False
        try:
            record = json.loads(path.read_text(encoding='utf-8'))
            report = directory / record['report_file']
            return (record.get('graph_hash') == semantic(p) and record.get('working_hashes') == hashes and report.is_file() and not report.is_symlink() and directory in report.resolve().parents and digest(report.read_bytes()) == record.get('report_sha256'))
        except (OSError, ValueError, KeyError, TypeError):
            return False

    def get_project(self, project_id):
        with self.lock:
            p = self._read(project_id)
            p['checks'] = self._checks(p)
            p['working_files'] = self._inventory(self.directory(project_id) / 'working')[0]
            return p

    def review(self, project_id):
        directory = self.directory(project_id)
        attestation = directory / 'assistant-attestation.json'
        if not attestation.is_file() or attestation.is_symlink():
            return {'current': False, 'content': '尚无助手核验报告，请创建拆解或核验任务。'}
        record = json.loads(attestation.read_text(encoding='utf-8'))
        report = directory / record['report_file']
        if not report.is_file() or report.is_symlink() or directory not in report.resolve().parents or report.stat().st_size > 2 * 1024 * 1024:
            raise Error('Unsafe or missing report')
        p = self._read(project_id)
        return {'current': self._attested(p, self._hashes(directory / 'working', self._inventory(directory / 'working')[0])),
                'content': report.read_text(encoding='utf-8')}

    def export_code(self, project_id, export_id, file):
        if not re.fullmatch(r'\d+-[0-9a-f]{12}', export_id):
            raise Error('Invalid export ID')
        base = self.directory(project_id) / 'exports' / export_id / 'code'
        if not base.is_dir() or base.is_symlink():
            raise Error('Export not found', 404)
        files = self._inventory(base)[0]
        if file not in files:
            raise Error('File not present in export', 404)
        f = base / file
        return {'file': file, 'content': f.read_text(encoding='utf-8'), 'sha256': digest(f.read_bytes())}

    def _graph_validate(self, p):
        if not isinstance(p['nodes'], list) or not isinstance(p['edges'], list) or len(p['nodes']) > 5000 or len(p['edges']) > 10000:
            raise Error('Invalid or oversized graph')
        ids = set()
        working = self.directory(p['id']) / 'working'
        available = set(self._inventory(working)[0])
        line_counts = {}
        for n in p['nodes']:
            if not isinstance(n, dict) or not isinstance(n.get('id'), str) or not n['id'] or n['id'] in ids or not isinstance(n.get('name'), str):
                raise Error('Nodes require unique IDs and names')
            ids.add(n['id'])
            for coordinate in ('x', 'y'):
                if not isinstance(n.get(coordinate, 0), (int, float)) or not math.isfinite(n.get(coordinate, 0)) or abs(n.get(coordinate, 0)) > 1e7:
                    raise Error('Invalid coordinate')
            c = n.get('code')
            if c and (not isinstance(c, dict) or c.get('file') not in available or not isinstance(c.get('start'), int) or not isinstance(c.get('end'), int) or c['start'] < 1 or c['end'] < c['start']):
                raise Error('Invalid code locator')
            if c:
                if c['file'] not in line_counts:
                    line_counts[c['file']] = len((working / c['file']).read_text(encoding='utf-8').splitlines())
                if c['end'] > line_counts[c['file']]:
                    raise Error('Code locator exceeds file line count')
            for key in ('inputs', 'outputs'):
                ports = n.get(key, [])
                if not isinstance(ports, list) or any(not isinstance(port, dict) or any(not isinstance(port.get(k, ''), str) for k in ('name', 'type', 'shape')) for port in ports):
                    raise Error('Ports must be arrays of name/type/shape objects')
            if not isinstance(n.get('parameters', {}), dict):
                raise Error('Parameters must be an object')
        parents = {n['id']: n.get('parent') for n in p['nodes']}
        for node in parents:
            seen, current = set(), node
            while current is not None:
                if current not in ids or current in seen:
                    raise Error('Invalid or cyclic containment')
                seen.add(current)
                current = parents[current]
        edge_ids = set()
        for edge in p['edges']:
            if not isinstance(edge, dict) or edge.get('source') not in ids or edge.get('target') not in ids or not edge.get('id') or edge['id'] in edge_ids:
                raise Error('Invalid graph edge')
            edge_ids.add(edge['id'])
        visual = p.get('visual_layout')
        if visual is not None:
            if not isinstance(visual, dict) or visual.get('engine') not in (None, 'elk-layered') or visual.get('direction') not in (None, 'DOWN', 'RIGHT'):
                raise Error('Invalid visual layout metadata')
            positions = visual.get('positions', {})
            if not isinstance(positions, dict) or not set(positions).issubset(ids):
                raise Error('Invalid visual layout positions')
            for position in positions.values():
                if not isinstance(position, dict) or any(not isinstance(position.get(key), (int, float)) or not math.isfinite(position.get(key)) for key in ('x', 'y')):
                    raise Error('Invalid visual layout position')
            routes = visual.get('routes', {})
            if not isinstance(routes, dict) or not set(routes).issubset(edge_ids):
                raise Error('Invalid visual layout routes')
            point_count = 0
            for segments in routes.values():
                if not isinstance(segments, list):
                    raise Error('Invalid visual layout route')
                for segment in segments:
                    if not isinstance(segment, list) or len(segment) < 2:
                        raise Error('Invalid visual layout route segment')
                    point_count += len(segment)
                    for point in segment:
                        if not isinstance(point, dict) or any(not isinstance(point.get(key), (int, float)) or not math.isfinite(point.get(key)) for key in ('x', 'y')):
                            raise Error('Invalid visual layout route point')
            if point_count > 50000:
                raise Error('Oversized visual layout routes')
            collapsed = visual.get('collapsed', [])
            if not isinstance(collapsed, list) or not set(collapsed).issubset(ids):
                raise Error('Invalid visual layout collapsed')
            sizes = visual.get('sizes', {})
            if not isinstance(sizes, dict) or not set(sizes).issubset(ids):
                raise Error('Invalid visual layout sizes')
            for size in sizes.values():
                if not isinstance(size, dict) or any(not isinstance(size.get(key), (int, float)) or not math.isfinite(size.get(key)) or size.get(key) <= 0 or size.get(key) > 5000 for key in ('width', 'height')):
                    raise Error('Invalid visual layout size')
        anchors = p.get('note_anchors')
        if anchors is not None:
            if not isinstance(anchors, dict) or not set(anchors).issubset(ids):
                raise Error('Invalid note anchors')
            for anchor in anchors.values():
                if not isinstance(anchor, dict) or not isinstance(anchor.get('heading'), str) or not anchor['heading'] or len(anchor['heading']) > 300:
                    raise Error('Invalid note anchor heading')
                if anchor.get('source') not in ('assistant-generated', 'user-confirmed'):
                    raise Error('Invalid note anchor source')
                if not isinstance(anchor.get('line_start'), int) or not isinstance(anchor.get('line_end'), int) or anchor['line_start'] < 1 or anchor['line_end'] < anchor['line_start'] or anchor['line_end'] > 1000000:
                    raise Error('Invalid note anchor lines')

    def update_project(self, project_id, data):
        with self.lock:
            p = self._read(project_id)
            if data.get('revision') != p['revision']:
                raise Error('Revision conflict; reload before saving', 409)
            updated = copy.deepcopy(p)
            for key in ('name', 'brief', 'nodes', 'edges', 'visual_layout', 'note_anchors'):
                if key in data:
                    updated[key] = data[key]
            if not isinstance(updated['name'], str) or not isinstance(updated['brief'], str):
                raise Error('Name and brief must be strings')
            self._graph_validate(updated)
            if p['mode'] == 'paper' and semantic(updated) != semantic(p):
                raise Error('Fork the paper before changing its semantic graph', 409)
            updated['checks'] = self._checks(updated)
            atomic(self.directory(project_id) / 'versions' / ('revision-%s.json' % p['revision']), p)
            return self._save(updated)

    def fork(self, project_id, name=None):
        with self.lock:
            p = self._read(project_id)
            old = self.directory(project_id)
            p['id'], p['mode'], p['revision'] = str(uuid.uuid4()), 'research', 1
            p['name'] = name or p['name'] + ' · research'
            p['created_at'], p['exports'], p['tasks'], p['parent_project_id'] = now(), [], [], project_id
            new = self.projects / p['id']
            new.mkdir()
            for version in ('original', 'working'):
                version_files = p['files'] if version == 'original' else self._inventory(old / 'working')[0]
                for rel in version_files:
                    self.code(project_id, rel, version)  # validate relative path and text safety
                    target = new / version / rel
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(old / version / rel, target)
            if (old / 'baseline-graph.json').is_file():
                shutil.copyfile(old / 'baseline-graph.json', new / 'baseline-graph.json')
            elif semantic(p) == p['baseline_graph_hash']:
                atomic(new / 'baseline-graph.json', {'nodes': p['nodes'], 'edges': p['edges']})
            return self._save(p, False)

    def validate(self, project_id):
        with self.lock:
            p = self._read(project_id)
            self._graph_validate(p)
            p['checks'] = self._checks(p)
            self._save(p)
            return p['checks']

    def diff(self, project_id):
        p = self._read(project_id)
        changes, output = [], []
        for rel in sorted(set(p['files']) | set(self._inventory(self.directory(project_id) / 'working')[0])):
            try:
                before = self.code(project_id, rel, 'original')['content']
            except Error:
                before = ''
            try:
                after = self.code(project_id, rel)['content']
            except Error:
                after = ''
            if before != after:
                changes.append(rel)
                output.extend(difflib.unified_diff(before.splitlines(True), after.splitlines(True), fromfile='original/' + rel, tofile='working/' + rel))
        baseline_file = self.directory(project_id) / 'baseline-graph.json'
        graph_diff = {}
        if baseline_file.is_file():
            base = json.loads(baseline_file.read_text(encoding='utf-8'))
            for key in ('nodes', 'edges'):
                def normalize(item):
                    return {k: v for k, v in item.items() if k not in ('x', 'y', 'status')}
                before = {n['id']: normalize(n) for n in base[key]}
                after = {n['id']: normalize(n) for n in p[key]}
                graph_diff[key] = {'added': [after[i] for i in after.keys() - before.keys()],
                                   'removed': [before[i] for i in before.keys() - after.keys()],
                                   'changed': [{'before': before[i], 'after': after[i]} for i in before.keys() & after.keys() if before[i] != after[i]]}
        return {'diff': ''.join(output)[:1000000], 'changed_files': changes, 'graph_changed': semantic(p) != p['baseline_graph_hash'], 'graph_diff': graph_diff}

    def export(self, project_id):
        with self.lock:
            p = self.get_project(project_id)
            if p['checks']['sync']['status'] == 'fail':
                raise Error('Original snapshot integrity check failed; export blocked', 409)
            destination = self.directory(project_id) / 'exports' / (str(p['revision']) + '-' + uuid.uuid4().hex[:12])
            destination.mkdir(parents=True)
            files, omitted = self._inventory(self.directory(project_id) / 'working')
            for rel in files:
                target = destination / 'code' / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(str(self.directory(project_id) / 'working' / rel), str(target))
            dirty = p['checks']['sync']['status'] != 'pass' or p['checks']['source_mapping']['status'] != 'pass'
            status = 'needs_adaptation' if dirty else 'generated_unverified'
            warnings = p['warnings'] + omitted + ['Source copied, not executed. Graph edits do not automatically rewrite Python. Data/weights and excluded files require external paths.']
            atomic(destination / 'graph.json', p)
            atomic(destination / 'changes.json', self.diff(project_id))
            atomic(destination / 'provenance.json', {'source_path': p['source_path'], 'original_hashes': p['original_hashes'], 'export_hashes': self._hashes(destination / 'code', files), 'revision': p['revision'], 'status': status, 'warnings': warnings})
            (destination / 'ADAPTATION.md').write_text('# Export status: ' + status + '\n\nThis is a complete allowed working-text snapshot, not an automatically adapted model.\nGraph changes: ' + str(semantic(p) != p['baseline_graph_hash']) + '\n\nReview graph.json, implement intended graph changes in code, verify source mappings, dependencies and inputs, then run a small forward/loss/backward check in an approved environment. Runtime and paper fidelity remain unverified.\n', encoding='utf-8')
            (destination / '使用说明.md').write_text('# 导出工程\n\n状态：' + status + '\n\n- `code/`：当前工作代码与允许复制的配置、说明文件。\n- `graph.json`：固定的模块结构、参数、源码映射和研究说明。\n- `changes.json`：相对基线的代码与结构差异。\n- `provenance.json`：来源、文件哈希、缺失资产和排除记录。\n- `ADAPTATION.md`：适配步骤；未执行任何作者训练代码。\n\n画布改动如未经过助手适配，不会自动改写任意 Python。请将整个导出目录交给助手，不要只拼贴单个函数。\n\n原材料目录：' + p['source_path'] + '\n\n运行入口与依赖以 code 内原 README/配置为准；没有时待助手补齐，不自动推测安装或执行。\n', encoding='utf-8')
            result = {'path': str(destination), 'status': status, 'files': files, 'warnings': warnings}
            p['exports'].append(result)
            self._save(p)
            return result

    def create_task(self, project_id, task_type, instructions=''):
        if task_type not in ('decompose', 'adapt', 'verify', 'extract') or not isinstance(instructions, str):
            raise Error('Invalid task')
        with self.lock:
            p = self._read(project_id)
            task_id = str(uuid.uuid4())
            path = self.directory(project_id) / 'tasks' / (task_id + '.json')
            task = {'id': task_id, 'type': task_type, 'status': 'pending', 'path': str(path), 'instructions': instructions, 'project_id': project_id, 'input_revision': p['revision'], 'graph_hash': semantic(p), 'source_hashes': self._hashes(self.directory(project_id) / 'working', self._inventory(self.directory(project_id) / 'working')[0]), 'created_at': now()}
            atomic(path, task)
            p['tasks'].append(task)
            self._save(p)
            return task

    def library(self):
        path = self.root / 'library.json'
        return json.loads(path.read_text(encoding='utf-8')) if path.exists() else []

    def extract(self, project_id):
        with self.lock:
            p, library = self._read(project_id), self.library()
            added = skipped = 0
            for n in p['nodes']:
                c = n.get('code')
                if not c:
                    continue
                data = self.code(project_id, c['file'])
                if data['sha256'] != c['sha256']:
                    skipped += 1
                    continue
                source_hash = digest('\n'.join(data['content'].splitlines()[c['start'] - 1:c['end']]).encode())
                provenance = {'project_id': project_id, 'file': c['file'], 'start': c['start'], 'end': c['end'], 'file_hash': c['sha256']}
                existing = next((r for r in library if r['source_hash'] == source_hash), None)
                if existing:
                    if provenance not in existing['sources']:
                        existing['sources'].append(provenance)
                    skipped += 1
                    continue
                library.append({'id': str(uuid.uuid4()), 'concept': n.get('kind', 'custom'), 'name': n['name'], 'category': n.get('category', 'custom'), 'status': 'candidate', 'source_project_id': project_id, 'source_file': c['file'], 'source_start': c['start'], 'source_end': c['end'], 'source_hash': source_hash, 'description': n.get('description', ''), 'differences': 'Not comparatively reviewed.', 'advantages': 'Not established.', 'limitations': 'Dependencies and behavior need review; reference is not a standalone runnable snippet.', 'evidence_level': 'static_source_only', 'inputs': n.get('inputs', []), 'outputs': n.get('outputs', []), 'sources': [provenance]})
                added += 1
            atomic(self.root / 'library.json', library)
            return {'added': added, 'skipped': skipped}

    def select_implementation(self, project_id, node_id, concept):
        p = self._read(project_id)
        if p['mode'] != 'research':
            raise Error('Implementation selection requires a research fork', 409)
        if not any(n['id'] == node_id for n in p['nodes']):
            raise Error('Unknown node')
        self.create_task(project_id, 'adapt', 'Select and verify an implementation for node {} concept {}; do not silently substitute. Respect research brief and frozen source provenance.'.format(node_id, concept))
        return self.get_project(project_id)
