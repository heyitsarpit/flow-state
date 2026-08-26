# Artifact wire contract

Status: package-private pointer; not an exported package API.

`PERSISTENCE_AND_ARTIFACTS.md` is the sole semantic and schema authority for WIRE-020A/B/C, including the
decoded artifact model, canonical bytes, SHA-256 fingerprint, bounds, gzip/trailing-byte rules, and the
export-only trace-share artifact. This file contains no independent schema, notation, or behavior. Story,
CLI, and share-export implementations consume the model and rules defined there; `CLI.md` owns CLI
projections, and `PUBLIC_API.md` owns the API boundary.

Trace-share/artifact references remain `WIRE-020A/B/C` and `API-P04`; any mismatch resolves to
`PERSISTENCE_AND_ARTIFACTS.md`.
