# Artifact wire contract

Status: historical package-private pointer; not active authority or an exported package API.

Current artifact requirements: [Artifacts.plan](../../../../workflow/plans/Artifacts.plan).
Current work status: [P4.task](../../../../workflow/tasks/Rewrite/P4.task).

Historically, `PERSISTENCE_AND_ARTIFACTS.md` was the semantic and schema authority for
WIRE-020A/B/C, including the
decoded artifact model, canonical bytes, SHA-256 fingerprint, bounds, gzip/trailing-byte rules, and the
export-only trace-share artifact. This file contains no independent schema, notation, or behavior. Story,
CLI, and share-export implementations consume the model and rules defined there; `CLI.md` owns CLI
projections, and `PUBLIC_API.md` owns the API boundary.

Trace-share/artifact references remain `WIRE-020A/B/C` and `API-P04`; any mismatch resolves to
`PERSISTENCE_AND_ARTIFACTS.md`.
