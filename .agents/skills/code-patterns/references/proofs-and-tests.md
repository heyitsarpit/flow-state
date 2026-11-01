# Proofs and tests

Read this when a change needs behavior proofs for the real owner, not a local stand-in.

## CP-15 — Test the real owner

- **Bad:** Local Sets proving deduplication, fabricated mailboxes proving capacity, flags standing in for disposal, source/title parity as behavior proof, sleep-based synchronization, or counting pending tests as passes.
- **Good:** Exercise actual owners with Deferred checkpoints, TestClock, scoped fibers, and explicit drains. Decorate real acquisition to observe or gate it; do not replace the behavior under test. Keep faults, revisions, identities, and expected outcomes visible.
- **Data proofs:** Test every constructor and `$match` branch. Add a compile proof for exhaustive cases. Do not use `$is` as proof that untrusted input is valid.
- **Keep:** Pure graph/equality/lineage unit tests and integration tests for cross-owner ordering/lifetimes. Reproduce bugs before repair; new characterization may already pass. Pending cases remain unproven. Consolidate weaker tests only after stronger owner proofs pass; extract only routine typed setup.
