#!/usr/bin/env python3
"""Create a writable personal workspace from the tracked demo workspace."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEMO = ROOT / 'demo-workspace'
WORKSPACE = ROOT / 'workspace'


def main() -> None:
    if not DEMO.is_dir():
        raise SystemExit('demo-workspace is missing')
    projects = WORKSPACE / 'projects'
    if projects.is_dir() and any(projects.iterdir()):
        print('personal workspace already exists:', WORKSPACE)
        return
    shutil.copytree(DEMO, WORKSPACE, dirs_exist_ok=True)
    for path in projects.glob('*/project.json'):
        project = json.loads(path.read_text(encoding='utf-8'))
        note_path = str(project.get('note_path') or '')
        if note_path.startswith('demo-workspace/'):
            project['note_path'] = 'workspace/' + note_path[len('demo-workspace/'):]
            path.write_text(json.dumps(project, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('personal workspace created:', WORKSPACE)


if __name__ == '__main__':
    main()