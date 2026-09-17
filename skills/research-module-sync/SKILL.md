---
name: research-module-sync
description: Import paper notes and local code into Research Workbench, inspect or adapt module graphs, curate implementation provenance, and keep graph/code versions synchronized. Use for this workbench's external AI tasks, not arbitrary repository edits or automatic training.
---

# Research module sync

Operate the user's local Research Workbench through its file-first project contract. The app's **pending AI task is a request artifact, not proof that an agent is running**. Read the task and the user's current authorization before executing it.

## Locate the project

Ask for the workbench root only if absent from current context; never scan unrelated private folders. Read `<workbench>/CONTRACT.md`, the selected `workspace/projects/<id>/project.json`, task input if supplied, research brief, and current checks. Read [references/workflow.md](references/workflow.md) for the selected operation. Use `<workbench>/assistant.py --help` for checkpoint commands.

## Invariants

- The paper view uses that paper's source, never a supposedly better library replacement. Never change the supplied source repository or `original/`. Fork a research project for modifications.
- The graph is functional structure, not a transcript of every code statement. Containment is not execution; source-order or class-name matches alone do not establish tensor flow. Inspect call sites/configuration. Mark uncertain connections and note/code conflicts explicitly.
- Nodes have user-defined names, including custom nodes. Preserve those names. Coarse and fine views share one hierarchy. Layout-only changes must not alter computation.
- A graphical connection is a research proposal until code has been adapted. Exporting original code plus a change plan does not implement a changed model. After adaptation, inspect code/graph correspondence and test the actual relevant behavior; do not claim automatic generation worked when only an export succeeded.
- The user is not the code auditor. Resolve technical questions by reading and testing. Ask only for research-intent choices that the sources do not settle.
- Run no code from an imported repository simply to inspect it. Inspect runtime commands and dependencies first. Small execution tests require an explicit adaptation/run request; cloud uploads, credentials and school-server jobs need their own scope.
- AI selection uses the research brief, interface semantics, dependencies and evidence. Prefer compatible checked implementations. If none are verified, explain the candidate choice and adapter requirements; do not label it best by assumption. Preserve selected implementation version and source hash.
- Library differences distinguish factual implementation behavior, measured advantages, and hypotheses. Normalize only demonstrated behavior-preserving differences. Never delete original provenance or promote a candidate by a checkbox alone.

## Complete a task

1. Create a checkpoint before modifying working code or graph; retain the previous revision and file hashes.
2. Make reviewable changes to `working/` and the graph together. Never mark sync verified solely because hashes were refreshed.
3. Run static mapping/interface checks. If authorized, run an inspected bounded smoke test; distinguish parsing, forward/loss/backward execution and paper reproduction.
4. Write an evidence report with exact inspected paths, mapping decisions, test commands/results, pending uncertainties and source hashes. Use `assistant.py attest` only after independently checking the correspondence; it binds the report to current semantic graph and working hashes, and does not promote execution or paper-fidelity status.
5. Re-run validation, check that originals match the import manifest, and give the user the modified version, differences, test status and remaining gaps. Update task status only for the work actually performed; a failed test is not completed adaptation.

No need to install model APIs into the browser. This Skill is the external assistant contract; backend checks enforce hashes/paths/revisions. Do not invent a `Skill` tool dependency.
