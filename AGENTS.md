# Agent instructions

## Required companion skill

The app is not fully automatic. Static import only produces AST candidates. For note-grounded decomposition, graph updates, code adaptation, and evidence verification, read and follow:

- `skills/research-module-sync/SKILL.md`
- `skills/research-module-sync/references/workflow.md`

Install it for Codex with `python install_skill.py` when a full workflow is requested. Do not claim that import alone completed the paper/module mapping.
## Start here

- Read `README.md` and `INSTALL_WITH_AI.md` before setup.
- Use Python 3.9+; no third-party Python packages are required for normal use.
- The default demo workspace is `demo-workspace`.
- The local server binds only to `127.0.0.1` and has no cloud/model API.

## Run and verify

```bash
python -m unittest discover -s tests -v
python assistant.py verify demo-workspace/projects/b32e5244-c083-4ade-9b11-dc386ab17901
python server.py --workspace demo-workspace --port 8765 --open
```

Check `http://127.0.0.1:8765/api/health` before reporting success.

## Safety boundaries

- Never execute imported paper/repository code automatically.
- Never modify `original/`; use `working/` or a research fork for changes.
- Do not upload local code, notes, credentials, or workspace data.
- Keep generated user workspaces separate from `demo-workspace`.
- Do not claim paper reproduction from static parsing.
- Preserve MIT and third-party license notices.