# Companion skill

`research-module-sync` is the required external-assistant workflow for full Research Workbench usage.

It covers:

- note-grounded module decomposition;
- graph and working-code synchronization;
- checkpoints and reviewed graph application;
- evidence reports and attestations;
- `verify` checks after changes.

Read:

- `research-module-sync/SKILL.md`
- `research-module-sync/references/workflow.md`

Install for Codex from the repository root:

```bash
python install_skill.py
```

Without this skill, the app can still display the demo and generate static AST candidates, but it cannot complete the reviewed paper-to-module workflow.