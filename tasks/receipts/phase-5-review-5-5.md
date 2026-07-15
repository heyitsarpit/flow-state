# Phase 5 Review 5.5 receipt

- Baseline: Review 5.4 correction `959ab6e`.
- Reviewer: fresh independent reviewer `p56_review_55`; review-only, with no
  product or task-file edits.
- Scope: routed-event witness erasure through source and emitted declarations,
  broad/default carriers, inline streams, packed consumers, and all six
  installed application CLIs.

The reviewer confirmed BUG-76. Because the full routed-event witness was
optional, a normal mapped `Omit` could remove it from transaction and stream
definitions without a cast. The resulting markerless carriers compiled through
submit, `flow.run`, and stream invoke for foreign discriminants and incompatible
same-kind payloads.

The correction makes the witness required and runtime-present as `undefined`.
Its declared type still carries the full routed Event, while runtime-only
transaction access deliberately omits the compile-time witness. Definitions,
explicit public bindings, and markerless mapped carriers now have distinct and
enforced structural contracts. Source and packed regressions cover transaction
submit/run and stream invoke Omit attacks.

Focused source, emitted-declaration, packed-consumer, and hostile repro checks
passed. Final correction verification passed with `pnpm fmt`, `pnpm lint`, and
`pnpm verify`: 138 test files and 1,104 tests, all source and packed type proofs,
six application builds, packed CLI acceptance, and generated docs.

Disposition: Review 5.5 has no unresolved blocker after correction, but it was
not a clean confirmation round. Review 5.6 is required on the committed fix.
