# Next: morning handback (2026-10-31)

All paths are under `workflow/plans/flow/references/explorations/machine-fragments/` unless noted. Nothing is pushed;
no `.plan` file is touched; every step is its own commit.

## Read in this order

1. **Streams: decide whether to merge.** `merge-6-streams/proposal-v2.md` revision 7.1 (f055417c), decisions
   `merge-6-streams/decisions-v2.md` S1–S10. The executable model passes I1–I27 (model/RESULTS.md, 4207e210). Held
   because review 5 (`reviews/v2-review-5.md`) still had one High after my two allowed rounds; its fix is S10 + 7.1,
   checked by the model but not re-reviewed by Opus. To merge: one Opus check of 7.1, then the merge (rules 67+).
2. **Big delegated changes to review** (`delegated-decisions.md`, `merged/stories/decisions-v2.md`):
   - Stories T3 (`Story.make` for every subject; amends your F7), T5 (`process()` removed, the `Fake` module, `expect`
     rejects `run()`, a frame per publication, `propertyTest` takes any Story), T6 (`world`, one address shape,
     `reload`/`openTab({ from })`, `together({ advance })`), T7 (settling on `executionMode: "sync"`).
   - Merge order SX1: Stories merged before streams (rules 61–66; streams renumbers from 67).
   - Streams S8–S10 (`fresh` only with an empty declared `from`; placement-path identity; pages oldest first; `initial`
     and `registered`).
3. **API gaps from the dispatch desk** (13, `../dispatch-desk/REVIEW.md` section 3, class c), your call: paging on live
   reads (`more`/`hasMore`); a handle for a placed fragment's view (`useFragment`); one `LaneEntry` type for
   `unsettledWrites`, Inspection and `Story.inspection`; how fakes push and close on stream endpoints and their error
   tags; `File` bytes beside persisted memory (`useRuntime`/`useService`); `hold({ after: n })`; generator spellings;
   CLI flags.
4. **Small design gaps** (10, same table, class b): each has a proposed one-line answer for machine-design.md.

## Done overnight

- **Merged into machine-design.md:** operations in fragments (rules 48–60), Stories (rules 61–66, section 2.10), each
  with an Opus merge-correctness check and fixes.
- **`apps/features`:** 13 area pages (Haiku), reviewed (Sonnet), site builds (665054d7).
- **Dispatch desk** (`../dispatch-desk/`): rewritten on the merged design in 14 batches (README has the feature map and
  43 design gaps), Opus review (`REVIEW.md`), 25 misuses and 20 app mistakes fixed (b9728cc3, d5471e43). Effect-only
  files type-check. Two small app items left: gap 34 (declare `NoResponse` on read ports) and S-H1 (export the
  adapters from `next/http-api.ts` so the fakes need no copies).

## Then: the path to implementation

Accept machine-design.md; write it into the `.plan` files (Operations, Machines, EntityDomains, Persistence, Runtime,
Testing, Inspection, ServerRendering, React; remove `model()`); a small type spike (B13); then
`packages/flow-state-rewrite` against the plans with `nub run verify`. Backlog that does not block: `open-items.md`
(item 15 wiring audit, item 20 from-scratch experiment, the rest).
