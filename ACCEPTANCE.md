# Acceptance record

The public demo was built from the reviewed `PerturbationBaselines2` project after the note-framework reorganization.

- Python tests: run `python -m unittest discover -s tests -v`.
- Demo integrity: run `python assistant.py verify demo-workspace/projects/b32e5244-c083-4ade-9b11-dc386ab17901`.
- Frontend: `cd frontend && npm ci && node build.mjs`.
- The bundled browser assets are committed so the application runs without Node.
- The upstream source is copied under its MIT license; the note and graph are project metadata.
- The app never executes imported repository code automatically.
