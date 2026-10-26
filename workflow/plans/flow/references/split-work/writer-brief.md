# Plan writer brief

Repository: /Users/arpit/Developer/flow-state. You write ONLY the files assigned to you below
(capability plans under workflow/plans/flow/ and their ledgers under
workflow/plans/flow/references/ledger/). Do not edit any other file. Other writers are working
in parallel on the other plans.

## What this is

Flow State (TypeScript + Effect 4.0.5 statecharts and data for AI-agent-written React/Next.js
apps) has one entry plan, workflow/plans/flow/FlowState.plan, which compressed the scope of
fifteen archived plans (workflow/plans/archive/rewrite/*.plan) too far: it names features without
their semantics, and its constraint C1 says the archive is provenance only, so anything not
restated is lost. Seven inventories classified every archived commitment. You now write the
capability plans that own the full contract for their area. FlowState.plan will be cut down
afterwards (by the owner) to the entry: goal, principles, cross-cutting decisions, package map,
build stages, code disposition and the plan map.

## Read first

1. workflow/plans/flow/references/split-work/decisions.md — 31+ BINDING rulings. Restate them; never reopen them.
2. workflow/plans/flow/FlowState.plan — the current text for your area (its O/D/C/V items). Every
   FlowState decision relevant to your area moves into your plan (cite "was FlowState D27" in the
   decision text so references can be repointed).
3. Your assigned inventories in workflow/plans/flow/references/split-work/inventories/inv-*.md. Every row recommending RESTORE becomes
   normative text in your plan unless decisions.md overrides it; CONFIRM-DROP rows are dropped
   (record them in the ledger). Use your judgement on rows marked low priority, but record each.
4. The adopted design references in workflow/plans/flow/references/design/ (minimal-library.md,
   entity-domain.md, server-rendering.md, lazy-features.md, multi-tab.md). Where a design is the
   source, your plan states the contract and links the design section for rationale and examples.
5. workflow/plans/flow/references/split-work/review-findings.md — review findings that touch plan semantics in your area.
6. The archived plans you are replacing, for exact wording of restored rules.
7. The reference application workflow/plans/flow/references/dispatch-desk/ — each outcome gets a
   "Reference:" line pointing at the dispatch-desk file that demonstrates it, if one does; if none
   does, say "Reference: none yet (stage S10 adds it)".

Sol reviews: workflow/plans/flow/references/split-work/reviews/. Existing capability plans
already written (Machines.plan, Operations.plan, ServerRendering.plan) are examples of the
expected depth and style; do not edit them unless your assignment says so.

## Format

- The .plan grammar: copy the structure of FlowState.plan and the archived plans (plan <Name>,
  title, status proposed, goal, outcomes, decisions, constraints, verification, questions;
  4-space indented items "O1  Title" then 8-space body). Avoid wide tables (the formatter breaks
  them; use lists). Cross-references use @plan.<Name>.<ID> (e.g. @plan.Runtime.O3) and may only
  target the outcome IDs in the skeleton below (other plans' decisions and verification IDs are
  not fixed yet); refer to FlowState entry decisions as "FlowState D1" etc. in prose.
- Write semantics, not feature names: inputs, results, ordering, bounds (with numbers), failure
  results and their diagnostic codes, what never happens. Plans may be long (archived plans ran
  200-800 lines); be complete and precise, not padded.
- Each plan has verification items naming concrete tests/gates, including the inventories' V
  additions, and a questions section for genuinely open items with a recommended answer.
- Run `workflow format --write <your files>` then `workflow check <your plan path>` from the repo
  root and fix every finding in your files. A check finding caused by another writer's
  not-yet-written plan (a dangling @plan ref into the skeleton) is acceptable; say so.
- Ledger file workflow/plans/flow/references/ledger/<Name>.md: a short header ("Provenance only;
  @plan <Name> is the authority"), then one list entry per inventory row for your area:
  `- <archived ref> — <commitment> — KEPT|CHANGED|RESTORED|DROPPED — <where now / reason>`.
  Every inventory row assigned to your area appears exactly once. Rows the inventories placed in
  your inventory but which belong to another plan in the skeleton: list them with
  "→ <OtherPlan>" so nothing is lost.

## Outcome skeleton (IDs fixed; you may append O-items after these, never renumber)

- Machines: O1 Definitions and machines (authoring, Schema field records, closed construction
  checks); O2 States and transitions (hierarchy, exit/entry rule, targets, self, reserved names,
  depth 10); O3 Turns (macrostep, ordering, atomic publication, callback failures, payload
  validation at admission); O4 Guards, deny and check; O5 Schedules; O6 Activities and outcomes
  in machines (.from, value/finite outcomes, lane-only publications run nothing); O7 Context
  reactions.
- Runtime: O1 Apps (closed list, lazy entries per LazyFeatures, wiring defaults, construction
  errors); O2 Setup and readiness (Layers, ready(), bootstrap order incl. storage acquisition
  before restore validation); O3 Actor identity (refs, ids, incarnations, ensure/create,
  conflicts, retain and "use"); O4 Mailboxes and send (admission, bounds, before-attach buffer,
  actor-to-actor, target failures); O5 Context propagation; O6 Lifecycle and disposal; O7
  Isolation (per Runtime, per principal, per request).
- Operations: O1 Descriptors and keys; O2 Resources; O3 Transactions and commits (concurrency
  table, attempt.id, outcomes, unknown, retry(attempt)); O4 Streams; O5 Writes and optimistic
  layers; O6 Activity lanes (tags, data, pending, placeholder, paging, hasMore); O7 Cancellation
  and cleanup.
- EntityDomains: O1 The normative design and its amendments; O2 Rules restated from archived
  citations; O3 Peer and hydrate sources; O4 propertyTest and audit mode; O5 Bounds.
- Persistence: O1 Configuration and storage (KeyValueStore, scope, version, IndexedDB layer); O2
  What is persisted; O3 Capture and writes (cut, layout, manifest, coalescing, flush); O4 Restore
  (order, in-flight work, schedules, resources, dormant records); O5 Failure policy; O6 Attempt
  durability.
- MultiTab: O1 Writer election; O2 Mirrors; O3 Per-tab actors; O4 Handover; O5 Peer record
  deltas; O6 Forget and sign-out; O7 Degradation; O8 TabCoordination service and scheduler.
- ServerRendering: O1 dehydrate and the request Runtime; O2 Settle; O3 Payload; O4 Hydrate
  boundary and the no-mismatch rule; O5 Precedence; O6 Isolation guards; O7 Next.js integration.
- LazyFeatures: O1 Lazy entries; O2 Adoption; O3 Dormant records; O4 Lazy features and server
  rendering; O5 Tools and checks.
- React: O1 Provider and Runtime ownership; O2 Hooks and the first render; O3 Attach, detach,
  Strict Mode and grace; O4 Eligibility in views; O5 Errors in views.
- Testing: O1 Stories; O2 process, the clock and the turn budget; O3 Fixtures; O4 Checkpoints;
  O5 Models; O6 propertyTest; O7 Isolation, tabs and hydration in Stories; O8 Cancellation,
  cleanup and failure evidence.
- Diagnostics: O1 FlowError; O2 The code vocabulary; O3 Cause; O4 Rendering.
- Inspection: O1 inspect(app) and inspect(runtime); O2 The structural codec; O3 Inspector sinks;
  O4 Traces; O5 Redaction and digests; O6 Renderers.
- CommandLine: O1 Grammar and leaves; O2 Process guarantees; O3 Output contract; O4 Trace
  queries; O5 flow check rules; O6 Configuration discovery.
- Package: O1 Routes; O2 Dependencies and peers; O3 Exports and types; O4 Consumer checks.

## Final message

Under 600 words: files written, workflow check result, the count of ledger rows by disposition,
any ruling you found impossible or contradictory (with the conflict), and cross-plan items you
assumed another plan owns.
