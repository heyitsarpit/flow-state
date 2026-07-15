# Phase 5 Review 5.8 receipt

- Baseline: Review 5.7 correction `e4b8cda`.
- Reviewer: fresh independent reviewer `p56_review_58`; review-only, with no
  product or task-file edits.
- Scope: routed-event brands, transaction and stream composition, source and
  packed declarations, direct and optional annotations, object-spread attacks,
  runtime descriptor identity, package exports, and structural quality.

The reviewer confirmed BUG-80. A route-free transaction can be spread before a
markerless foreign transaction. The first operand contributes its phantom
private `never` brand, while the second replaces the enumerable config and
transaction-runtime symbol. The recombined carrier compiles through a narrow
machine and its runtime emits the foreign event. Independent source and packed
fixtures both reproduced the type escape, and the runtime fixture emitted
`{"type":"FOREIGN","value":7}`.

The analogous stream attack is rejected by the visible-route constraint. The
remaining hostile matrix rejected broad and annotated Event carriers, payload
mismatches, public and direct descriptor annotations, marker reconstruction,
explicit `RoutedEvent = never` weakening, optional configs, arrays, inferred
machines, and stream config replacement. Focused public-type tests, package
build and output hygiene, TypeScript-mode proofs, packed consumers, CLI help,
and docs build passed. `flow-core.ts` remains below the 1,000-line presumptive
decomposition threshold, and no separate Effect-channel or ownership defect was
confirmed.

Disposition: Review 5.8 is not clean. BUG-80 remains open under `P5.0a`, `P5.6`
remains incomplete, and a fresh Review 5.9 is required after any correction.
