from pathlib import Path
import shutil

source = Path(__file__).resolve().parent / 'skills' / 'research-module-sync'
target = Path.home() / '.codex' / 'skills' / 'research-module-sync'
if not source.is_dir():
    raise SystemExit('skill source not found: ' + str(source))
if target.exists():
    raise SystemExit('skill target already exists; review it before replacing: ' + str(target))
target.parent.mkdir(parents=True, exist_ok=True)
shutil.copytree(source, target)
print('installed:', target)
