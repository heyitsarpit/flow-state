**Start with S1 as an exploratory spike; close the contract gaps before treating this as an implementation-ready build brief.**

Verified: I read `FlowState.plan`, both adopted design documents in full, every Dispatch Desk file, the entity goals/examples, and the rewrite source structure plus selected implementations and tests. `workflow check --json` passes. I did not compile the illustrative application or rerun package tests; runtime consequences below are inferred from the authored contracts.

Paths below are relative to `workflow/plans/flow/`, except those beginning `packages/` or `node_modules/`.

## Stage readiness and missing contracts

These are observable contracts an implementer would otherwise choose independently. Internal algorithms can remain implementation choices where they preserve those contracts.

| Stage / gate | Finding and proposed specification | Reference coverage |
|---|---|---|
| **S1 / V1** | **Should-fix; enough to start exploring.** O1/O5/O7 name the surface without complete signatures. Define callback environments, finite versus continuing outcome tables, event-constructor overloads, lane unions, and state-dependent narrowing in an O1/O7 type-spike checklist. V1 should explicitly include the new reference application, rather than primarily naming minimal-library’s older editor. | Good positive examples of `.from`, wiring, guards, schedules and lanes. Almost no negative fixtures; annotations and assertions already occur, so V1 needs to distinguish permitted application annotations from inference failures. |
| **S2 / V2** | **Blocker to gate completion.** O10/O11 require canonical diagnostics, a structural codec and complete representation, but give neither a closed diagnostic catalogue nor representation/codec schemas and limits. Specify these in foundation Specs linked from O10/O11; adopt exact key-byte vectors explicitly instead of depending on archive terminology. | Invalid-definition and render examples exist. No diagnostic goldens, codec boundary fixtures or complete representation golden. |
| **S3 / V3** | **Should-fix; partial start possible.** O2/O3 specify ordering well, but mailbox capacity/options, internal-message overflow, equal-deadline tie order, schedule metadata, selection equality and retention ownership remain open. Specify these in runtime contracts under O2–O4, including what counts as an actor’s “last use.” | Editor and Session cover ordinary turns and context changes. No diamond, overload, rollback, disposal race, retain expiry or cross-actor atomic-read scenario. |
| **S4 / V4** | **Should-fix; partial start possible.** O5 lists concurrency policies without defining their exact scope and rejection results. Specify actor/descriptor/key grouping, serialized-queue bounds, overlapping optimistic-write rollback, unmapped outcomes, lane transitions and cancellation settlement under O5. | Only `reject` and `serialize` are declared. No plain-resource optimistic/writes example, `allow`/`cancel`, collection boundary, or late-result race. |
| **S5 / V5** | **Blocker to complete implementation.** Entity §5 provides substantial algorithms, but reconciliation has no callable protocol; `basedOn` has no exact shape; version comparison, loader `notFound`, missing-field reads and failed forced-repair queue release need contracts. Specify these in entity §§4–6. | Dispatch Desk covers one versioned entity, predictions and repair. Nested entities, multi-record queues, confirmation omissions, creates, deletes and audit are absent or appear only as declarations/prose elsewhere. |
| **S6 / V6** | **Blocker to gate completion.** O8 leaves storage format, version mismatch, corrupt-record policy, capture trigger/coalescing and scope ownership unspecified. The second-tab guarantee needs a coordination protocol and host capabilities beyond naming KeyValueStore. Specify these under O8. | `app/persistence.ts:8` supplies configuration; lines 15–26 describe expected behavior. No capture/restore or two-owner scenario. |
| **S7 / V7** | **Blocker.** O9 needs an exact drain/quiescence contract, execution budget, fixture precedence, model-key equivalence rules and the property-test control protocol discussed below. Put these in a testing Spec linked from O9. | Stories and checkpoint rendering provide useful examples. No identical-run trace assertion, `getSimplePaths`, truncation case or actual model/live key comparison. |
| **S8 / V8** | **Blocker at the public boundary.** O7 forbids render-time attachment but examples immediately read a non-null actor. Define the first-render handle/snapshot, missing-provider and lookup-only behavior, ref changes, grace duration and reattachment identity under O7. | Shared-actor views are extensive. No React `useActor` example, initial unattached render, Strict Mode test or multi-selector tearing test. |
| **S9 / V9** | **Blocker to gate completion.** O11 needs a source-analysis contract, complete CLI grammar, artifact schemas/limits, sensitive annotation identity and digest rules. Define these in inspection/CLI Specs. | `tools/cli.ts` is a cookbook of expected strings and exits; it is not a leaf-by-leaf executable specification. Redaction appears only in comments. |
| **S10 / V10** | **Should-fix; preparation can start.** O14/V10 need explicit cutover acceptance: package identity, consumer migration, binary publication, proving-app commands and experiment success criteria. Record these under O12/O14. | Dispatch Desk is a substantial reference. The seven entity examples explicitly elide operation bodies (`entity-domain-examples.md:6`); they are domain sketches, requiring significant application construction. |

## Blocking cross-stage findings

**Blocker — structural compilation lacks a specified mechanism.** O11 requires possible deny codes without running callbacks (`FlowState.plan:273`), while `editor.machine.ts:18` computes them inside an ordinary shared function. Static declarations expose transition targets, but do not themselves expose that function’s possible returns.

Entity recording adds a separate mandatory source checker, including rejection of unreadable compiled/generated declarations (`entity-domain.md:470–476`). No contract connects source locations, imported helpers, transpilation and runtime construction.

**Proposed change:** choose declarative guard metadata or a supported source-compilation mechanism. Specify its accepted grammar, helper resolution, unavailable-source behavior and construction integration. Schedule its foundation in S2/S5; leaving it until S9 cannot satisfy V2 or development-time domain validation.

**Blocker — the promised reusable evidence is not a reproducible handoff.** S5/V5 require porting the draft-8 spike and runtime model. The document explicitly places the spike outside the repository (`entity-domain.md:1177`); §15.3 describes the model without an artifact location. My repository filename search found no corresponding model.

Separately, `propertyTest` promises generated writes, lost/reordered responses, reconnects and restores (§8.1), but the reference supplies only read inputs and a Layer (`testing/tickets.property.test.ts:12–23`). Neither write-input generation nor network control follows from erased TypeScript parameter types and arbitrary service implementations.

**Proposed change:** make the spike/model retrievable with pinned commands and mutation cases. Define write generators, network/lifecycle controls, fixture-oracle access and shrinking in the property-test contract. Demonstrate one complete generated write-and-loss sequence before implementing the generic helper.

## Reference corrections required before it becomes the baseline

All evidence here is verified source; execution consequences are inferred.

| Severity | Evidence | Specific proposed change |
|---|---|---|
| **Should-fix** | `ticket.domain.ts:29` declares key `[workspaceId, ticketId]`; line 56 orders by `updatedAt, ticketId`, despite entity §4.4 requiring the complete key suffix. | Add both key fields to the order and align the demo comparator, or explicitly adopt a rule permitting condition-fixed key fields to be omitted. |
| **Should-fix** | `ticket.operations.ts:64,71` passes Stream-returning callbacks to `TicketApi.use`. Installed Effect requires an Effect-returning callback (`node_modules/effect/src/Context.ts:106`). `ticket-api.ts:23,30–31` also uses Schema value names as types without `typeof`. | Acquire the service through a Stream-compatible composition and correct the Schema type projections. Include these adapters in S1 compilation. |
| **Should-fix** | `queue.story.ts:53–54` checkpoints immediately after `send`, claiming the commit has started. O9 makes `process()` the explicit drain; O11 specifically warns about this sequence. | Add a delayed assignment fixture, process admission/start, then checkpoint while settlement remains blocked. Preserve a separate assertion that send-only has not executed work. |
| **Should-fix** | Focused and model Stories use `fixtures: []` (`editor.story.ts:100,109`) despite the editor’s TicketApi-dependent activities. `RenamedElsewhere` fabricates a pushed row without updating its backing server (`testing/fixtures.ts:39–41`). | Supply complete focused-story services. Make the pushed rename update fixture server state before emitting, so subsequent repairs read the same server truth. |
| **Should-fix** | SAVING always transitions to SAVED (`editor.machine.ts:121–123`); SAVED is empty (line 131). The newer draft survives, but SaveRequested and autosave are unavailable there; the UI displays “Saved” (`TicketPanel.tsx:34`). | On successful save, return to EDITING when the draft differs from the confirmed title. Extend `editedWhileSaving` to prove the remaining draft can be saved without another keystroke. |

The last correction matters particularly: an implementer faithfully matching the reference would preserve text while still presenting an unsaved draft as saved.

## O13: what the source supports

**Verified:** O13 correctly identifies the public runtime route: `src/public/root.ts:32` exports `runtime/runtime.ts`. That runtime assembles actor admission, context and evidence internally (`runtime/runtime.ts:2221–2254`). `runtime-next` remains unwired at its facade: `runtime-next/runtime-assembly.ts:23–31` installs `actorUnavailable` for actor methods.

The port candidates are credible. Key canonicalisation has ownership and byte-bound vectors (`operation/test/key.test.ts:32`); lineage has shared-ancestry/conflict tests (`runtime-next/test/context-lineage-owner.test.ts:73`); the evidence journal has acceptance/retention machinery. Structural copy is also useful, but should not be mistaken for the bounded serialized artifact codec S2 requires.

**Should-fix — distinguish internal implementation from public capability.** The wired runtime’s public type exposes only `app` and `ready` (`runtime/runtime.ts:744–751`). Operation descriptors and actor-side execution/fencing machinery exist, including `runtime-next/actor/actor-operation-work.ts:40`, although a complete shared operation kernel does not.

**Proposed change:** add an O13 disposition table naming source owner, public reachability, reusable tests, replacement stage and deletion gate. Label “795 tests pass” as a dated command/commit receipt; I did not verify that count or result.

## Plan structure and sequencing

One `.plan` with adopted references is appropriate. Outcomes with Reference lines give useful entry points; decision provenance explains reversals without restoring archive authority. Recreating thirteen capability Plans would duplicate ownership.

**Should-fix:** references currently identify files more precisely than contracts. C1 forbids filling silence from archives, while normative entity text still imports archived retention/capture rules (`entity-domain.md:712,753,777`).

**Proposed change:** retain the single Plan, add narrowly scoped normative Specs for shared protocols, and link stage Tasks to requirement IDs, owner files and executable proofs. Promote required archived rules into current authority.

**Should-fix:** O14 allows S6 after S4 although entity persistence requires S5, and S7 owns `propertyTest`/CheckpointProvider while S5/V5 already needs the property suite.

**Proposed change:** split core and entity gates for S6/S7; schedule minimal Story/property infrastructure before V5. Resolve whether `sync-engine-adapter.md:3–23` binds version 1, since it claims current requirements that O6 describes as a future path.

**Verdict: ready after listed changes.** S1 exploration can proceed; the full build brief is not yet closed.

1. Specify structural compilation and mandatory source checking.
2. Recover reproducible spike/model evidence and define `propertyTest` controls.
3. Fix the reference’s type, ordering, checkpoint, fixture and unsaved-draft conflicts.
4. Close stage contracts and correct cross-stage prerequisites.
5. Add precise O13 source dispositions and a dated verification receipt.