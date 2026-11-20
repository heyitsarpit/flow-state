---
questions advisor-questions
status open 2026-11-20
---
# Questions for an advisor (2026-11-20)

**Bottom line:** ten design questions for a strong outside model, in the order they block work. Questions 1 to 4 gate
the next Tasks in P4's Order; 4 and 7 are the agenda of the trust-boundaries consult the user set for P4's close
(2026-11-19). Answers come back as proposals; nothing here is decided.

Each question names the class of bug and the freedom behind it, not just a symptom, because of the case study below.
An answer should say which freedom it removes, how it is shown (a Story, a type test, a run rule), and what it costs.

## Where each question is best resolved

An advisor earns its cost in two cases: a bug class that keeps coming back across Tasks (no single builder sees the
whole family), and a design that spans many modules before code exists. Everything else is better answered at
development time, by the lead with the code in hand, its experiments, and the loop's blind redesign at convergence.

| Priority | Question                | Posture                                        | Why                                                           |
| -------- | ----------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| 1        | 4. Saved records        | Advisor (trust-boundaries consult)             | A repeating class across Restore, Codec and releases          |
| 2        | 7. Raw throws           | Advisor (trust-boundaries consult)             | A repeating class, fixed one entry at a time                  |
| 3        | 2. Fragments            | Advisor, or a blind design at T109's start     | The largest unbuilt model; five open items interact           |
| 4        | 1. Body types           | Development time: a type spike at T109's start | Code-bound; needs `tsc` probes on the real files              |
| 5        | 3. Emits and props      | Development time                               | Mostly decided (emits and context slots accepted)             |
| 6        | 5. Reads and operations | Development time, product choices to the user  | Offline, resume and retry placement are the user's            |
| 7        | 6. Rules on definitions | Settled                                        | Accepted as @plan.Rules (2026-11-20); @task.V3.T106 builds it |
| 8        | 8. React                | Development time                               | Clear prior art; P5                                           |
| 9        | 9. Entities             | Later (P5), advisor optional                   | Not needed before P5                                          |
| 10       | 10. Repeated wiring     | Development time, late audit                   | Needs every fixture built first                               |

Take only 4, 7 and 2 to an advisor; the rest stay here as context for the leads that build them.

## Case study: T99, when hardening failed and structure worked

@task.V3.T99 ("Runtime life completed", 2026-11-19) is how this project learned to converge.

1. Its first close review found a store write whose cleanup died reported as success, the Cause lost. The fix round
   tightened the check.
2. The second close review found typed cleanup failures and an abort losing the Cause: the same root cause twice. The
   first convergence was again a stricter version of the same idea (fold every fiber's Cause at close).
3. The user paused it and asked for a from-scratch redesign of background-work lifetimes, blind to the draft.
4. The blind "Owner" design made 9 of the 12 known gaps impossible by structure, and found by a scratch experiment
   that Effect's Scope close succeeds while a cleanup dies. The user accepted it in one turn; T99 closed on its next
   review.

The Epic's convergence rule now reads (the user, after T99): on code that already runs, a convergence names the
freedom the class comes from, asks what one broad solution removes the whole class here and in every part with the
same freedom, and takes it away by structure: an independent blind redesign, library behaviour verified by running
it, a comparison with any paused fix, and a guard with planted faults. The same pattern sits behind T20's restore
failures (now @task.V3.T92) and the repeated raw-throw fixes (now @task.V3.T98).

## Ground rules for every answer

- Correctness first, then reading at a glance, then agent UX; standard upfront contracts over clever hybrids.
- The core is pure, synchronous and deterministic and returns work as data; Effect only in the host and edges; build
  nothing parallel to Effect.
- No internal wiring (ids, keys, timers) in user code; a property sits next to the thing it describes.
- Don't break static analysis, the single compiled graph, Stories or CLI inspection.
- Prior art first: Effect, XState, TanStack DB, and the code in `codebases/`.
- Read the Plans in `wiki/plans/flow/`, the core Specs in `wiki/specs/core/`, and the code in
  `packages/flow-state-v3/src/`.

## Needed soon (P4)

### 1. Machine-body types that hold at any depth [answered: user 2026-11-20; the body as one const type parameter checked with Exact, @proposal.body-types]

Unblocks @task.V3.T57's leftovers, then @task.V3.T109, @task.V3.T76, @task.V3.T77.

- **Symptom:** depth-2 schedule names and delays widen to `string`; typed context, `key` and `pausedBy` in callbacks
  are not done; a misspelt body or returned key compiles.
- **Class and freedom:** the body is one object literal inferred against a deep generic, so TypeScript widens
  literals and skips excess-key checks on returned objects.
- **Tried:** an `ExactBody` over the inferred body (@task.V3.T104) kept the refusals but broke contextual typing of
  handles and sends, and moved errors to the enclosing key; reverted. T57 made one failed attempt at the widening.
- **Ask:** one typing design for `machine(Def, ({ S, E, C, O }) => …)` that keeps literals and exact keys at every
  depth without losing contextual typing; or the smallest change of shape (curried, builder, per-state helpers) that
  does, with its cost to reading.
- **Read:** `src/machine.ts`, `src/compile-body.ts`, `tests/types/` (especially `excess-keys.test-d.ts`),
  `wiki/plans/flow/references/pages/T104-type-seams.md`.

### 2. Fragments: placement, admission and release [answered: user 2026-11-20; one address per incarnation, two holders, @proposal.fragment-lifetimes]

Unblocks @task.V3.T109 and @task.V3.T110.

- **Open items:** 3 (`.history` versus interrupts: pause instead of leave), 21 (the subject path as the admission rule
  for node traits and subroutines), 22 (placements sharing an operation when their paths differ), 24 (releasing
  without interrupting), 26 (per-copy fan-out of write members), all in `open-items.md`.
- **Class and freedom:** a fragment can be placed, copied (`.each`), nested and frozen (`.resumable()`), and each
  combination decides on its own when work is admitted, kept or released.
- **Ask:** one model in which a placement's work is admitted, kept and released by a single rule (the subject path?)
  across traits, copies, nesting, resumable freezing and subroutines; what `whenAbandoned` sees; how `ReleaseOverdue`
  bounds release.
- **Read:** @plan.Machines.O1, @plan.Runtime.O6, @spec.Turn.R30, @proposal.ui-primitives-decisions (§9),
  the fixture catalog's step 2 rows.

### 3. Emits and props as one boundary [answered: agent orchestrator 2026-11-21; two declared channels, emits recorded once and never replayed, props one owner; @proposal.spec-boundary-channels (still proposed)]

Unblocks @task.V3.T77 and @task.V3.T76, and the React binding after them.

- **Class and freedom:** three channels cross an actor's edge (props from a parent, context from a provider, emits to a
  view) and each could grow its own rules for timing, replay and addressing.
- **Ask:** where the line sits between props, context and emits; how a fragment copy's emit is addressed (instance
  path and `.each` key); that nothing is stored or replayed after a reload; how Stories assert emits with no listener.
- **Read:** @plan.Machines.O2, @spec.Turn.R29, `wiki/conventions/view-commands.md`,
  @proposal.context-slots (the accepted context design).

### 4. Saved records as one design (trust-boundaries consult) [answered: user 2026-11-20; record Schemas built from Compiled, @proposal.saved-records]

Unblocks @task.V3.T92 (deferred by the user) and @task.V3.T56.

- **Symptom:** the record format moved to 4 in @task.V3.T107 and to 5 in @task.V3.T57, each with its own step; T20 hit
  the failure limit because restore trusted parts of a record nobody checked; a slot added by a later release fires a
  reaction once on reload.
- **Class and freedom:** each Task adds fields to the record and its own decode and upgrade path, and a release can
  change a definition in ways nothing compares.
- **Ask:** one record shape decoded through Schemas built from the compiled app, with branded keys and each fact
  stored once (can context bindings be derived and not saved?); and one release model that maps renames, adds and
  removes of states, slots, schedules and operations without losing or making up an ending.
- **Read:** @spec.Restore, @spec.Codec, @task.V3.T20's reviews, `wiki/conventions/boundaries.md`, revisit.md's
  migration entries, `src/core/actor-record.ts`.

## Needed before P5 features

### 5. Reads and operations, the in-machine half [answered: user 2026-11-20; no timing or retry option in Flow, every call input decoded once at admission, @proposal.machine-calls]

Unblocks @task.V3.T21.

- **Open items:** 4 (where `timeout` and `retry` live), 9 (offline as a reason to wait before invocation), 10 (resuming
  never-sent work across a reload); and a lookup's input has no run-time Schema check.
- **Ask:** the smallest set of rules for a call made from a machine: where its timing and retry policy live, what
  waits before invocation, what survives a reload, and where its input is decoded.
- **Read:** @plan.Operations, @spec.Reads, @spec.WriteLanes.

### 6. Rules on definitions [answered: user 2026-11-20; accepted as @plan.Rules, @proposal.rules]

Accepted: @proposal.rules, now @plan.Rules (invariants, turns and terminals,
with rule coverage); @task.V3.T106 builds it. Kept here for the record; no advisor needed.

### 7. One answer for raw throws (trust-boundaries consult) [answered: user 2026-11-20; one gated constructor with a Made brand, @proposal.raw-throws]

Unblocks @task.V3.T98.

- **Class and freedom:** a public entry point can throw instead of refusing with a FlowError, and construction can
  trust a value it never decoded; it keeps coming back (@task.V3.T94, @task.V3.T104) and is fixed one entry at a time.
- **Ask:** one structure that ends the class: every public call returns or refuses through one path, and construction
  decodes whole at the boundary.
- **Read:** @task.V3.T94, @task.V3.T98, @spec.Diagnostics, `tests/surface/`.

## Needed for P5's UI and data

### 8. React and Next.js bindings with server rendering [open: 2026-11-20]

Unblocks @task.V3.T30 and @task.V3.T108.

Partly answered (2026-11-21): @proposal.spec-ui-host designs the publication, hooks, emit delivery and hydration; how
presentation fits with bippy waits on the user's answer to @proposal.react-instrumentation-bippy.

- **Ask:** the binding's shape over `useSyncExternalStore` (one snapshot per published turn), emits delivered to views,
  hydration and dehydration while writes are in flight, and how presentation fits with the instrumentation proposal.
- **Read:** @plan.React, @plan.ServerRendering, @proposal.react-instrumentation-bippy, `codebases/ui-sdk`.

### 9. The entity store as the sync seam [answered: agent orchestrator 2026-11-21; one judge for every confirmed source plus claims; @proposal.spec-data-layer (still proposed)]

Unblocks @task.V3.T24 and @task.V3.T25.

- **Ask:** the smallest entity-domain design that keeps optimistic writes coherent across screens and leaves a seam
  for Zero or TanStack DB without a rewrite. Entities are optional but not up for cutting.
- **Read:** @plan.EntityDomains, @plan.Operations.

### 10. Wiring every app still writes [open: 2026-11-20]

From open item 15 ("absorb repeated wiring").

- **Ask:** across every fixture in `packages/flow-state-v3/fixtures/`, which wiring each app repeats that Flow should
  own, and which of it can move into Flow without new concepts.
- **Read:** `open-items.md` §15, the fixtures, `wiki/conventions/fixture-catalog.md`.
