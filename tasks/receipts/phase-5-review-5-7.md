# Phase 5 Review 5.7 receipt

- Baseline: Review 5.6 correction `02aa323`.
- Reviewer: fresh independent reviewer `p56_review_57`; review-only, with no
  product or task-file edits.
- Scope: private-brand erasure and reconstruction, broad/default Event carriers,
  source and packed declarations, transaction submit/run, stream invoke,
  runtime shape, exports, and connected ownership and dispatch behavior.

The reviewer confirmed BUG-78. Explicitly instantiating a routed transaction or
stream with `Event = FlowEvent`, or annotating a route return as `FlowEvent`,
made the conditional brand payload collapse to `never`. Foreign events then
compiled through a machine accepting only a narrow Event union. Strict hostile
fixtures passed against both the committed source entry and packed package root.

The correction splits descriptor construction by route presence. Required and
optionally annotated routes preserve the complete Event brand, including the
public `FlowEvent` base type, while only a statically route-free config receives
the universal `never` brand. Public definition and binding annotations default
to their complete Event rather than erasing it. Existing inferred stream routes
now preserve their literal event kind explicitly.

The correction audit then confirmed BUG-79: object spread could retain a
route-free stream's phantom `never` brand while replacing `config.routes`, and
the runtime would execute the foreign replacement route. Route-free stream
results now retain `routes?: undefined`, while the machine invoke carrier checks
visible route callback returns against the machine event union independently of
the private brand. Source and packed clone regressions cover that boundary.

The reviewer's strict source and packed hostile fixtures, plus the correction
audit's clone fixture, now fail compilation. `pnpm fmt`, `pnpm lint`, and
`pnpm verify` pass: 138 test files and 1,104 tests, source and packed declaration
proofs, every TypeScript mode, all six production example builds, all six packed
CLI acceptance paths, and the production docs build.

Disposition: Review 5.7 is not a clean confirmation round. Review 5.8 is
required on its committed fix.
