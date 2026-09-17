#!/usr/bin/env python3
"""File-first assistant checkpoints and evidence-bound graph/code attestations.

This never executes imported Python or proves paper fidelity. Run `--help`.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def hashes(root):
    result = {}
    if not root.is_dir() or root.is_symlink():
        raise ValueError('Expected regular project directory')
    for p in sorted(root.rglob('*')):
        if p.is_symlink():
            raise ValueError('Symlink forbidden: ' + str(p))
        if p.is_file():
            result[p.relative_to(root).as_posix()] = digest(p.read_bytes())
    return result


def graph_hash(project):
    # Share exact semantics with backend, so moving a node isn't a model change.
    from backend import graph_digest
    return graph_digest(project)


def atomic_json(path, value):
    tmp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        tmp.replace(path)
    finally:
        if tmp.exists():
            tmp.unlink()


def load_project(path):
    root = Path(path).expanduser().resolve()
    if not (root / 'project.json').is_file():
        raise ValueError('project.json not found')
    for name in ('original', 'working', 'project.json'):
        if (root / name).is_symlink():
            raise ValueError('Symlink project artifacts forbidden')
    return root, json.loads((root / 'project.json').read_text(encoding='utf-8'))


def copy_tree(src, dst):
    """Copy a project tree while tolerating Windows paths beyond MAX_PATH."""
    if os.name == 'nt':
        result = subprocess.run(
            ['robocopy', str(src), str(dst), '/E', '/COPY:DAT', '/R:0', '/W:0',
             '/NFL', '/NDL', '/NJH', '/NJS', '/NP'],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        if result.returncode >= 8:
            raise RuntimeError('robocopy failed (%s): %s' % (result.returncode, (result.stdout or '').strip()))
    else:
        shutil.copytree(src, dst)


def checkpoint(root, project):
    ident = dt.datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:8]
    target = root / 'assistant-checkpoints' / ident
    original_hashes = hashes(root / 'original')
    working_hashes = hashes(root / 'working')
    target.mkdir(parents=True, exist_ok=False)
    shutil.copy2(root / 'project.json', target / 'project.json')
    copy_tree(root / 'working', target / 'working')
    record = {'created_at': now(), 'project_id': project['id'],
              'revision': project['revision'], 'original_hashes': original_hashes,
              'working_hashes': working_hashes, 'graph_hash': graph_hash(project)}
    atomic_json(target / 'checkpoint.json', record)
    return {'path': str(target), **record}


def attest(root, project, report):
    report_path = Path(report).expanduser().resolve()
    if not report_path.is_file() or report_path.stat().st_size < 80:
        raise ValueError('Provide a substantive existing mapping review report; this command does not create evidence')
    content = report_path.read_bytes()
    records = root / 'assistant-reports'
    records.mkdir(exist_ok=True)
    saved = records / (uuid.uuid4().hex + '.md')
    saved.write_bytes(content)
    record = {'attested_at': now(), 'project_id': project['id'],
              'revision': project['revision'], 'graph_hash': graph_hash(project),
              'working_hashes': hashes(root / 'working'),
              'original_hashes': hashes(root / 'original'),
              'report_file': saved.relative_to(root).as_posix(),
              'report_sha256': digest(content),
              'scope': 'assistant-reviewed graph/code correspondence; not runtime or paper reproduction'}
    atomic_json(root / 'assistant-attestation.json', record)
    return record


def verify(root, project):
    checks = []
    path = root / 'assistant-attestation.json'
    if not path.exists():
        return {'valid': False, 'checks': ['No assistant attestation; mapping remains unverified']}
    record = json.loads(path.read_text())
    if record['graph_hash'] != graph_hash(project):
        checks.append('Semantic graph changed since review')
    if record['working_hashes'] != hashes(root / 'working'):
        checks.append('Working code changed since review')
    if record.get('original_hashes') != hashes(root / 'original'):
        checks.append('Original snapshot changed since review')
    report = (root / record['report_file']).resolve()
    if root not in report.parents or not report.is_file() or digest(report.read_bytes()) != record['report_sha256']:
        checks.append('Review report absent or changed')
    checkpoint_files = sorted((root / 'assistant-checkpoints').glob('*/checkpoint.json'))
    if checkpoint_files:
        oldest = json.loads(checkpoint_files[0].read_text())
        if oldest['original_hashes'] != hashes(root / 'original'):
            checks.append('Original snapshot changed since first assistant checkpoint')
    return {'valid': not checks, 'checks': checks or ['Reviewed graph/code content unchanged'],
            'scope': 'content integrity only; report judgment is separate'}


def apply_graph(root, project, graph_file, report_file):
    """Assistant-controlled enrichment; original paper source must be untouched."""
    from backend import Store, atomic
    graph = json.loads(Path(graph_file).read_text(encoding='utf-8'))
    report = Path(report_file)
    if not report.is_file() or report.stat().st_size < 80:
        raise ValueError('Reviewed mapping evidence required')
    store = Store(root.parent.parent)
    if hashes(root / 'original') != project['original_hashes']:
        raise ValueError('Original snapshot changed; cannot apply graph')
    if project['mode'] == 'paper' and hashes(root / 'working') != project['original_hashes']:
        raise ValueError('Paper working copy changed; fork before adapting')
    updated = dict(project, nodes=graph['nodes'], edges=graph['edges'])
    store._graph_validate(updated)
    if store._read(project['id'])['revision'] != project['revision']:
        raise ValueError('Project changed while preparing graph; reload and review again')
    checkpoint(root, project)
    # This is code-backed enrichment of the paper, not a redesign. Research
    # graph baselines remain fixed even after successful code adaptation.
    if project['mode'] == 'paper':
        updated['baseline_graph_hash'] = graph_hash(updated)
        atomic(root / 'baseline-graph.json', {'nodes': updated['nodes'], 'edges': updated['edges']})
    atomic(root / 'versions' / ('revision-%s.json' % project['revision']), project)
    store._save(updated)
    attest(root, updated, report)
    store.validate(project['id'])
    return {'project_id': project['id'], 'nodes': len(updated['nodes']),
            'edges': len(updated['edges']), 'report': str(report)}


def finish_task(root, project, task_id, status, report_file):
    from backend import Store, atomic
    if str(uuid.UUID(task_id)) != task_id:
        raise ValueError('Invalid task ID')
    task_path = root / 'tasks' / (task_id + '.json')
    if task_path.is_symlink() or not task_path.is_file():
        raise ValueError('Task not found')
    task = json.loads(task_path.read_text())
    if task.get('project_id') != project['id']:
        raise ValueError('Task belongs to a different project')
    report = Path(report_file).resolve()
    if not report.is_file() or report.stat().st_size < 80:
        raise ValueError('Substantive task result report required')
    if status == 'completed' and task['type'] in ('adapt', 'decompose') and not verify(root, project)['valid']:
        raise ValueError('Current graph/code review must pass before completing adaptation/decomposition')
    target = root / 'assistant-reports' / (uuid.uuid4().hex + '.md')
    target.parent.mkdir(exist_ok=True)
    target.write_bytes(report.read_bytes())
    task.update(status=status, completed_at=now(), result_report=target.relative_to(root).as_posix(),
                result_graph_hash=graph_hash(project), result_source_hashes=hashes(root/'working'))
    atomic(task_path, task)
    project['tasks'] = [task if t['id'] == task_id else t for t in project['tasks']]
    Store(root.parent.parent)._save(project)
    return {'task_id':task_id,'status':status,'report':str(target)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for command in ('checkpoint', 'verify', 'attest', 'apply-graph'):
        p = sub.add_parser(command)
        p.add_argument('project_dir')
        if command in ('attest', 'apply-graph'):
            p.add_argument('--report', required=True)
        if command == 'apply-graph':
            p.add_argument('--graph', required=True)
    finish = sub.add_parser('finish-task')
    finish.add_argument('project_dir')
    finish.add_argument('task_id')
    finish.add_argument('--status', choices=['completed','blocked'], required=True)
    finish.add_argument('--report', required=True)
    args = parser.parse_args()
    root, project = load_project(args.project_dir)
    if args.command == 'checkpoint':
        result = checkpoint(root, project)
    elif args.command == 'attest':
        result = attest(root, project, args.report)
    elif args.command == 'apply-graph':
        result = apply_graph(root, project, args.graph, args.report)
    elif args.command == 'finish-task':
        result = finish_task(root, project, args.task_id, args.status, args.report)
    else:
        result = verify(root, project)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result.get('valid') is False else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError) as e:
        print(str(e), file=sys.stderr)
        sys.exit(2)
