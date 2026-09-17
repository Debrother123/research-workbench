# Research Workbench v1 contract

Local-only Python 3.9+ standard-library backend. The frontend (revised 2026-09-14, DEC-006) renders the module canvas with **React Flow + vendored ELK.js**, bundled locally with esbuild into `static/bundle/`; runtime makes no network, CDN, or telemetry calls, never executes imported code, and never calls cloud models. React Flow/React are MIT; ELK is EPL-2.0; licenses ship in `static/vendor/`. Legacy hand-written canvas files remain until the migration completes. Project root is this directory. Default loopback port 8765. Browser API prefix `/api`.

## File-first data

`workspace/projects/<uuid>/project.json`, `original/` immutable snapshot, `working/` research code; `versions/`, `exports/`, `tasks/`. Original code repository is never edited. Original snapshot copies code/config/docs, excludes symlinks, secrets, VCS, caches, environments, binaries/large data; exclusions are recorded and export labels references. Avoid recursive importing of app/workspace or broad roots. All project IDs and project-relative file paths checked at backend boundary.

Project object: `{id,name,mode:'paper'|'research',revision:1,created_at,updated_at,note_path,note_text,source_path,brief:'',nodes:[],edges:[],checks:{},files:[],exports:[],tasks:[],warnings:[],baseline_graph_hash}`. `files` array strings relative to snapshot/working.

Node: `{id,name,kind,category,parent:null|id,x,y,description,code:{file,start,end,sha256},inputs:[],outputs:[],parameters:{},implementation_id:null,status:'candidate'|'checked'|'custom',selection_reason:''}`. `inputs/outputs` arrays of `{name,type,shape}` strings, may be empty/unknown. Code can be null for unimplemented ideas. `kind` generic concept, `name` user-defined display. `category` data|encoder|fusion|head|loss|training|evaluation|custom. Parent means structural containment, NOT execution. Graph may have unresolved custom nodes. Edge `{id,source,target,label:''}` links existing nodes. Inferred AST containment/calls must not be reported as verified tensor dataflow; do not invent execution edges from source order.

Check report `{source_mapping:{status,details:[]},interfaces:{status,details:[]},execution:{status,details:[]},paper_fidelity:{status,details:[]},sync:{status,details:[]}}`. status pass|warning|pending|fail. Runtime initially pending; static parse is not execution nor paper fidelity. Editing semantic graph marks sync warning until explicit assistant verification tied to content hashes; layout-only changes must not mark semantic dirty. Manually changed working code detected by hash.

## API (JSON success; failures non-2xx `{error}`)

- GET `/api/projects` -> `{projects:[{id,name,mode,revision,updated_at}]}`
- POST `/api/projects` `{name,source_path,note_path}` -> full project, static AST candidate decomposition only. Paths must exist. Never execute imports.
- GET `/api/projects/<id>` -> full project (refresh sync detection)
- PUT `/api/projects/<id>` `{revision, name?,brief?,nodes?,edges?,visual_layout?,note_anchors?}` -> full project, optimistic concurrency 409 on stale; graph semantic changes in paper mode rejected, positions allowed; research arbitrary edits permitted after validation. `visual_layout` may carry `collapsed` (expanded-state memory) and `sizes` (user-resized group dimensions), both presentation-only.
- POST `/api/projects/<id>/fork` `{name?}` -> new research project, preserves immutable original and copies current working.
- GET `/api/projects/<id>/code?file=<relative>&version=original|working` -> `{file,content,sha256}`. Version defaults working; allow only text in project snapshot/working.
- GET `/api/projects/<id>/diff` -> `{diff,graph_changed,changed_files:[]}` comparing original/working plus baseline graph.
- POST `/api/projects/<id>/validate` -> report, also persisted in project checks (increment revision and UI reload).
- POST `/api/projects/<id>/export` -> `{path,status,files:[],warnings:[]}`. Complete copied working tree, original provenance/hash manifest, frozen graph, requirements if present, adaptation plan for unresolved graph; never pretend changed graph rewrote arbitrary Python. When semantic graph differs and not assistant adapted: `status:'needs_adaptation'`, generated plan explicit and unchanged source labeled. Fresh export unique directory, never overwrite.
- POST `/api/projects/<id>/tasks` `{type:'decompose'|'adapt'|'verify'|'extract',instructions:''}` -> `{id,status:'pending',path}`. External assistant queue; not auto-executed, explicitly displayed pending. Stored graph/revision inputs.
- GET `/api/library` -> `{implementations:[]}`. Implementation: `{id,concept,name,category,status:'candidate'|'checked',source_project_id,source_file,source_start,source_end,source_hash,description,differences,advantages,limitations,evidence_level,inputs:[],outputs:[]}`. References only, do not silently copy dependent snippets as standalone runnable units.
- POST `/api/projects/<id>/extract` -> `{added,skipped}` candidate library records from code-backed nodes, SHA dedup preserving sources (record `sources` array); no automatic checked promotion.
- POST `/api/projects/<id>/select-implementation` `{node_id,concept}` -> full project. Assistant/task-driven selection: compatible checked implementations only if explicit interface can be checked; otherwise enqueue selection task, return project with pending task and no guessed substitution. No UI implementation picker required.
- GET `/api/session` -> `{token}`; mutation requests require `X-Workbench-Token`. Reject cross-origin POST, hostile Host headers, require JSON content type, bind 127.0.0.1 only. No arbitrary shell/run endpoint. Static routes fixed allowlist. CORS not enabled.

## UI

Chinese local research tool, light paper background, dark ink and teal accents. Layout (DEC-006): left project/library rail, center three-pane work area — collapsible note panel with heading anchors and bidirectional canvas highlight, React Flow module canvas (ELK layered layout, orthogonal routing, group nodes with functional-color backgrounds, collapse/expand, minimap, module directory and search), right source/parameters/verification inspector with note-section and Obsidian deep links. Rail, note panel, and inspector widths are user-draggable (persisted in browser localStorage); selected groups expose resize handles (persisted in `visual_layout.sizes`, presentation-only). Canvas defaults to the collapsed root-module skeleton and remembers expand state (`visual_layout.collapsed`, presentation-only). Node cards show operation name plus verification badge (✓ checked / ⚠ discrepancy / ? pending); full 作用/代码实际/笔记边界 text lives in the inspector. Edge labels only for verified key tensors; inferred labels must say 推断. File tree/full project code accessible. Breadcrumb for parent drilldown; automatic layout; custom node add/rename/delete; edge create/delete; save explicit, unsaved indicator. Node delete removes descendant nodes and incident edges. Paper view read-only semantic operations with fork CTA. Research brief editable. Import dialog source folder + note path. Project switch, fork, code export, diff, checks, external AI queue and candidate library affordances. Every async action handles errors/loading; use textContent not untrusted HTML. No fictitious example paper claims.

## Note anchors

Project objects may carry additive `note_anchors`: `{node_id: {heading, line_start, line_end, source: 'assistant-generated'|'user-confirmed'}}`. It maps nodes to embedded-note sections for panel highlight and Obsidian deep links (`obsidian://open?vault=<vault>&file=<urlencoded path>%23<urlencoded heading>`). It is project metadata, not graph semantics: it does not affect semantic hashing, code hashes, or paper interpretation. New papers get anchors via assistant generation followed by user confirmation.

## Acceptance

Temporary synthetic fixture, distinctly labeled, validates paths/import/source immutability, nested nodes, persistence/conflict, custom nodes/edges, fork, export, library provenance, checks, stale sync, request security. Real HDGAT source was supplied as HDGAT-main.zip and imported for drug-disease (not DTI) mapping and browser acceptance. Author code was not executed. Current evidence and limits are in ACCEPTANCE.md.
