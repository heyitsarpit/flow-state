# Scope inventory: StoriesAndModels.plan (archived)

Source: workflow/plans/archive/rewrite/StoriesAndModels.plan (O1-O6, D1-D3, C1-C3, V1-V6, Q1-Q4) and the
Story parts of workflow/plans/archive/rewrite/references (README, editor.story.ts, api-reference.ts).

New documents checked: FlowState.plan (FS), minimal-library.md (ML), entity-domain.md (ED, sections 1-9
normative), entities.md, principles.md, sync-engine-adapter.md, references/dispatch-desk (DD).

Abbreviations: FS O9 = FlowState.plan outcome O9; ML s11 = minimal-library section 11; ED s6.3 = entity-domain
section 6.3; DD editor.story.ts = dispatch-desk/features/Tickets/editor/editor.story.ts.

## Cross-cutting finding (read first)

ED s6 (normative through FS O6) says: "Stories keep every rule of minimal-library.md section 11 and the
StoriesAndModels plan", and ED s6.3 says "O4's copying and failed-capture rules apply", and ED s6.5 lists
"Amendments to the StoriesAndModels plan". So a normative new document incorporates the archived Plan by
reference, while FS C1 says archived Plans establish nothing and FS D42 / O15 delete parts of it. This is an
internal contradiction. Resolution recommended: restate the kept rules (the RESTORE rows below) in FS O9/V7 and
change ED s6 to cite FS O9 instead of the archived Plan. ED s6's command list also omits `ensure` (FS D52) and
`setContext`.

Rows marked "KEPT (reference only)" are visible in dispatch-desk code but not stated in FS, ML or ED; FS says
dispatch-desk shows decisions, so a rule found only there is weakly held. Those are recommended for a one-line
restatement.

## Inventory

| # | Archived ref | Commitment (short) | Status | New location or decision | Recommendation | Reason |
|---|---|---|---|---|---|---|
| 1 | O1 | `story.app(runtimeSetup, options?)` builder | KEPT | FS O9 `story.app(setup, { id, fixtures })`; ML s11 | - | Same form, `id` added |
| 2 | O1 | `story.machine(machine, options?)` focused builder | KEPT | FS O9 `story.machine(machine, { id, input, context?, fixtures })` | - | Same form |
| 3 | O1 | `story.actor(machine, options?)` recipe builder | DROPPED-EXPLICIT | FS D42, D12; ML s1, s11 | CONFIRM-DROP, with a clarification (see #4) | Refs replace recipes; local actors reached by story.machine |
| 4 | O1/O2 | App Stories can exercise Story-local actors wired through real providers (recipes with contextBindings) | CHANGED (partial loss) | FS D42: app Stories target refs only; story.machine supplies context directly | RESTORE (clarify) | A local-only machine (useActor) can only be tested with hand-supplied context, never through its real app-default wiring. State that a Story module may declare its own `actorRef(machine, id)` for any machine the App lists, which inherits the app-default wiring and is ensured with `.ensure` |
| 5 | O1, C1 | `story` is a non-callable namespace; reject callable story, `.with` | DROPPED-SILENT | FS O12 lists `story` only | CONFIRM-DROP | Surface ceremony; FS O12 closes the route |
| 6 | O1 | App Stories require typed RuntimeSetup, never bare App or live Runtime | KEPT | FS O9 signature `story.app(setup, ...)` | - | Signature implies it |
| 7 | O1, O6 | Machine Stories use a private one-machine AppPlan and one fresh implicit actor on the production engine | CHANGED (underspecified) | FS O9 "focused kind for a local actor"; no setup argument | RESTORE | Not stated where a focused Story's services come from (no setup argument), whether fixtures must then form a complete service closure, which persistence it uses, or which App it belongs to. Restore: story.machine builds a private one-machine app on the production Runtime; its services are exactly its fixtures (type error when a service the machine's operations need is missing); in-memory persistence; it is discovered only under an App that lists the machine |
| 8 | O1 | Options are closed (extra fields reject) | DROPPED-SILENT | FS D5 (mistakes are type errors) in spirit | RESTORE (type negatives in V7) | Cheap binding type law; agents misspell options |
| 9 | O1 | Metadata `title?`, `description?` | DROPPED-EXPLICIT | FS D42, ML s11 | CONFIRM-DROP | `id` names a Story; description belongs in code comments |
| 10 | O1 | Metadata `tags?` | DROPPED-SILENT | not mentioned (D42 names title, description, maxTurns) | CONFIRM-DROP | No CLI leaf filters by tag; globs in flow.config.ts group Stories |
| 11 | O1 | Metadata does not affect identity | DROPPED-SILENT | `id` is now the identity (DD flow.config.ts comment: namespaced by app) | CONFIRM-DROP | Metadata gone; id is identity |
| 12 | O1, O3 | `maxTurns` option, default 100; unknown finite work reaching it fails | DROPPED-EXPLICIT | FS D42, ML s11 delete the option | RESTORE (as a fixed internal bound, not an option) | Deleting the option deleted the bound: nothing stops `process()` from looping forever on a zero-delay schedule or a send ping-pong between actors. ED s8.1 already assumes "the turn bound reached" for propertyTest. Restore a fixed Runtime turn bound per `process()` that fails the run with a closed FlowError code (for example StoryTurnLimit) and evidence |
| 13 | O1 | Exact non-void input required; void input forbidden | CHANGED (silent at type level) | FS O9 shows `input`; FS D51 (no options for input-free machines) for ensure | RESTORE (type rule) | State: story.machine and `.ensure` require `input` exactly when the machine declares input and forbid it otherwise |
| 14 | O1 | Focused Stories require exact selected context when the machine reads context, forbid it when absent | CHANGED (weakened) | FS O9 `context?` is optional with no rule | RESTORE | Optional context leaves a focused actor with declared context slots and no providers undefined. Required exactly when the machine declares context; forbidden otherwise |
| 15 | O1 | Builders are inert: no live handles, Runtime, loops, assertions, predicates, branches, callbacks, raw memory/state/snapshot overrides, boot unions, extra actors | KEPT (reference only) | DD editor.story.ts header "Inert scenario plans; importing them runs nothing"; ML s4 "no test-only escape" | RESTORE (one sentence in FS O9) | `flow story list/describe` (FS O11) depend on plans being static data; no state override must stay a rule, not a habit |
| 16 | O1 | Every command returns a new plan and leaves its prefix unchanged (persistent branching) | KEPT (reference only) | DD editor.story.ts (`desk(...)` helper, `focused` -> `readonly`) | RESTORE | Binding guarantee the reference relies on; not stated anywhere normative |
| 17 | O1 | Derived runs replay the prefix independently in fresh isolated Runtimes; no live fork | DROPPED-SILENT | FS V7 "identical traces from identical runs" is weaker | RESTORE | Isolation of branches sharing a prefix is the determinism guarantee for prefix reuse |
| 18 | O1 | Checkpoint names accumulate as exact literal keys; duplicate, widened string and unknown literal access reject | KEPT (reference only) | DD editor.test.tsx uses `run.checkpoints.saving`, `["still-editing"]` | RESTORE (type rule + V7 negative) | Typed checkpoint map is the main Story ergonomics guarantee |
| 19 | O1 | StoryRun = `{ checkpoints, end }` | KEPT | ED s6.3 ("every checkpoint and run.end"); DD editor.test.tsx `run.end` | - | Shape preserved |
| 20 | O1, O3 | `run({ signal?: AbortSignal })` | DROPPED-SILENT | FS O9 names `run` only | RESTORE | Cancellation of a Story run (CLI Ctrl-C, test timeouts) needs the signal; see #39 |
| 21 | O1 | Commands accept validated event envelopes, not constructor Result values | CHANGED (preserves) | FS D8 (constructors return values), D44, D47, D19 (public events only) | - | Equivalent; Result values no longer exist |
| 22 | O1, O4 | Private untrusted-name lookup checks own keys; inherited/unknown names reject with usage error; no public dynamic getter | CHANGED (preserves) | FS D10 (FlowError); ED s7 exit 2 for unknown checkpoint; FS O11 closed CLI grammar | - | CLI rule kept for `--at`; error class unified |
| 23 | O1 | Implementation is a complete service graph; seeds never close a missing requirement; RequirementsOf survives installation | CHANGED | FS D15 (Layers), ML "Deleted" (RequirementsOf) | RESTORE only the closure part, via #7 | For app Stories the setup's Layer is complete; for focused Stories closure is the open gap in #7. Type plumbing itself: confirm drop |
| 24 | O2 | `fixture({ id, implementation, seeds? })` | DROPPED-EXPLICIT | FS D42; FS O9 "Fixtures are Effect Layers" | CONFIRM-DROP | Layers are the better, Effect-native form |
| 25 | O2 | Runtime-owned resource seeds (pre-populated cache without a lookup) | DROPPED-EXPLICIT | FS D42 | CONFIRM-DROP (least sure) | A fixture Layer answering the first lookup reaches the same visible state after `process()`; seeds also bypassed the real lookup path |
| 26 | O2 | Fixture providers override App providers by service identity | CHANGED (preserves, mechanism unstated) | FS O9 "Layers that override service methods"; DD testing/fixtures.ts | RESTORE (one line) | Say how: fixtures are merged over the setup's services so each fixture's services replace the setup's by Tag |
| 27 | O2 | Duplicate fixture providers reject rather than choosing by order | DROPPED-SILENT | none | RESTORE | With Layers, two fixtures providing the same Tag (DD SlowSave and LockedSave both provide TicketApi) silently resolve by merge order. Reject with a FlowError at Story construction, or define order explicitly |
| 28 | O2 | Providers construct once per Runtime; each run has fresh scoped state | KEPT | ED s6.1 (state in a Ref inside the Layer scope, fresh per run); DD app/demo-api.ts | - | |
| 29 | O2 | Recipes: exact machine, input, contextBindings; run-local opaque refs; same recipe object one actor per run | DROPPED-EXPLICIT | FS D12, D42 | CONFIRM-DROP | Refs give stable identity; `.ensure(ref, { input })` is the equivalent |
| 30 | O2 | Validate missing/extra/foreign/mismatched/disposed/cyclic dependencies before construction | KEPT | FS O3 admission validation and rollback; O4 cycles reject before admission | - | Applies to ensure in Stories via production Runtime |
| 31 | O2 | Materialize providers first; leases; dispose Story actors in reverse dependency order; app-owned shared actors stay Runtime-owned | CHANGED | FS D52 (explicit `.ensure` steps), D12/D16 (leases deleted) | RESTORE (ordering part, via #40) | Leases go legitimately; disposal order at run end is now unspecified |
| 32 | O2 | Fixtures replace complete service functions only: never operation kernels, pending-occurrence mocks, matchers/control registries, arbitrary cache mutation | KEPT | ML s4 ("no test-only escape"); FS D19; DD testing/fixtures.ts header | - | Guaranteed by the closed surface (FS O12) |
| 33 | O3 | Commands `process`, `advance(duration)`, `advanceTo`, `advanceToNextTimer`, `checkpoint`, `run` | KEPT | FS O9; ML s11; ED s6 | - | |
| 34 | O3 | `advanceTo(epochMilliseconds)` input | CHANGED (unit silent) | FS O9 names it; ML s11 "for cron" | RESTORE (one line) | Input type (epoch ms, Date or DateTime) unstated |
| 35 | O3 | App `send(target, event)`; machine `send(event)` and `setContext(context)` | KEPT | FS O9, D52 (adds `ensure`) | - | |
| 36 | O3 | App targets an exact recipe or app-owned ref, never a machine family | CHANGED (preserves) | FS D42 refs | - | |
| 37 | O3 | App Stories never inject selected context directly | KEPT | FS O9 (setContext only for focused Stories) | - | |
| 38 | O3 | setContext uses production turns; equal value is a no-op; silent initial baseline | KEPT (partial) | FS O2 onContext first selection silent; FS O4 equal settlement clears debt; DD editor.test.tsx "same reaction path" | RESTORE (one line) | State that setContext enters as a context wave on the production path |
| 39 | O3 | Cancellation closes admission, stops later commands, preserves partial evidence, waits for non-abortable finalization | DROPPED-SILENT | none (no signal) | RESTORE | Binding cleanup/failure guarantee; pairs with #20 |
| 40 | O3 | Cleanup order: close sinks/queues; release Story actors reverse dependency; dispose Runtime; finalize fixture/host scopes last; deterministic | DROPPED-SILENT | none | RESTORE | Run-end cleanup order and its determinism is unspecified; fixture Layers with finalizers need it |
| 41 | O3 | Execution/cancellation failure is primary; else first cleanup failure; cleanup failure never returns success | DROPPED-SILENT | DD tools/diagnostics.ts comment mentions "cleanup" only | RESTORE | Failure classification rule |
| 42 | O3 | Each App run calls `construct()` once and owns a fresh Runtime, fixture capabilities, TestClock | KEPT | FS O9 (production Runtime with TestClock, seeded ids, seeded Random) | - | Seeded ids/Random are new and good |
| 43 | O3 | Isolated in-memory Persistence per run; never inherit an external Persistence instance | DROPPED-SILENT | none; DD app/setup.ts DeskSetup includes `KeyValueStore.layerStorage(() => localStorage)` | RESTORE (high) | As written, `story.app(DeskSetup)` would read and write the host's localStorage under the real scope: runs would leak into each other and into the app. Restore: every Story run replaces the KeyValueStore with a fresh in-memory store |
| 44 | O3 | Production bootstrap, restoration, validation, activation, ensure, acknowledged mailbox dispatch, cleanup | KEPT | FS O9 (production Runtime); FS O3 readiness | - | |
| 45 | O3 | `process()` drains ready mailbox, context, reconciliation, same-time deadlines, scheduler and finite work until a command or future time is needed | CHANGED (definition lost) | FS O9 "process() is the one explicit drain" | RESTORE (high) | The drain set and stop condition are the core determinism contract. Must include settling external work that completes without clock movement (sync-engine-adapter A6 lists exactly this as open) |
| 46 | O3 | process does not move time, invent results, intercept pending work, or hide pending external calls/streams; clock movement never processes implicitly | DROPPED-SILENT | DD stories always pair `advance` with `process` (implied only) | RESTORE | Without it an implementation may auto-drain on advance and Stories change meaning |
| 47 | O3 | One envelope error (FlowStoryExecutionError) with Cause, checkpoints, optional end, failure boundary, primary and ordered cleanup diagnostics, cancellation, accepted/drained sequence facts | CHANGED (partial loss) | FS D10, O10 (FlowError carries Story evidence); DD tools/diagnostics.ts lists completed checkpoints, end when captured, cleanup | RESTORE | Name the Story evidence members on FlowError: completed checkpoints, end if captured, failing command index, cause, cleanup diagnostics in order, cancelled flag, accepted/drained evidence sequence. Also answers archived Q1 |
| 48 | O3 | Story transaction evidence records attempts without the adapter's private remote identity or recovery authority | CHANGED (preserves) | FS D33 (attempt.id public, seeded in Stories) | CONFIRM-DROP (remainder) | attempt.id is now a Flow identity; no recovery API exists |
| 49 | O3 | Timer refresh fencing delegated to Statecharts | CHANGED (preserves) | FS D23, O2 schedules on the Runtime Clock with deterministic ordering | - | |
| 50 | O4 | A checkpoint captures immediately (no drain); run.end follows the last command and precedes cleanup; it is not actor finality | KEPT (partial) | ED s6.3 (run.end); DD queue.story.ts `predicted` checkpoint before process; FS O11 warns send-then-checkpoint | RESTORE (one line) | Timing of capture is binding for evidence |
| 51 | O4 | Checkpoint membership: exact static Story closure; exclude unrelated actors | CHANGED (unspecified) | none; DD reads `checkpoint.actor(ref)` | RESTORE | Define membership: every actor alive in the Story's fresh Runtime at the cut (CheckpointProvider in ML s8a already assumes local actors are included). Simpler than the archived closure because the Runtime is per run |
| 52 | O4, D3 | Story membership is independent of persistence opt-in; non-persisted actors are valid evidence | DROPPED-SILENT | none | CONFIRM-DROP if #51 is restored as "all actors" | Follows automatically |
| 53 | O4 | One atomic cut over published snapshots and one store revision | KEPT | FS O9; ED s6.2 | - | |
| 54 | O4 | Checkpoint exposes `runtime.now` and `runtime.pendingWork` (also on run.end) | DROPPED-SILENT | FS D38 moved timers to inspection | RESTORE | Asserting "nothing in flight", the TestClock time and pending schedules is how a Story proves quiescence; ED s8.2 "quiet" and V7 live parity need it. Restore `checkpoint.now` and `checkpoint.pending` (pending operations and schedules with due times) |
| 55 | O4 | Actor issues captured in the cut | KEPT | FS O7 snapshot `issues`; FS O9 diagnostics in checkpoints | - | |
| 56 | O4 | Accepted evidence prefix captured at the cut | KEPT | ED s6.3 (repairs/skips/diagnostics from run start to cut); FS O11 ordered evidence | - | |
| 57 | O4 | Suspended context debt yields retryable ConcurrentCapture rather than an incomplete cut | CHANGED | FS D16 (suspension deleted); FS O4/O7 publish only complete cuts | CONFIRM-DROP (least sure) | Checkpoints read published cuts, which are causally complete by FS O4; a blocked wave simply is not published yet |
| 58 | O4 | App evidence reads `checkpoint.actor(ref).snapshot`; machine evidence reads `checkpoint.snapshot` | KEPT (reference only) | DD editor.test.tsx | RESTORE (one line in FS O9) | Public read shape lives only in the reference |
| 59 | O4 | Lookup reads captured data only: no live work, time movement, create/restore/dispose; no authority to resume a Runtime; checkpoints never resumable | KEPT | ML s8 (passive reads, serialisable checkpoints); ML s8a CheckpointProvider records `send`; FS O12 closed | - | |
| 60 | O4 | Flow copies its containers; evidence immutable; app opaque values retain identity | KEPT (partial) | FS O7 plain frozen snapshots; ML s4 opaque payloads | - | Opaque identity follows from frozen-not-cloned |
| 61 | O4 | Release read/selection leases after run.end | DROPPED-SILENT | none | CONFIRM-DROP | Pure mechanism |
| 62 | O4 | Failed capture never fabricates end; completed checkpoints survive later failure | KEPT (by reference) | ED s6.3 "O4's copying and failed-capture rules apply"; DD tools/diagnostics.ts | RESTORE (restate in FS O9/O10) | Only held by a pointer into an archived Plan, which FS C1 voids |
| 63 | O4 | Accepted evidence order and wire projections owned by inspection | KEPT | FS O11 ordered evidence with truncation | - | |
| 64 | O5 | `model(baseStory, { stateKey })` | KEPT | FS O9 | - | |
| 65 | O5 | Base must be a fresh, command-empty machine Story | DROPPED-SILENT | DD uses a fresh story.machine | RESTORE (type rule) | Prevents app Story reduction and commands the model cannot predict |
| 66 | O5 | Preserve machine/input/context/fixtures/progress policy and empty command tuple in path Stories | KEPT | FS O9 "each path's story replays live" | - | |
| 67 | O5 | stateKey gets the predicted snapshot and returns a canonical key covering guard-relevant facts; no identity fallback | CHANGED (preserves) | FS D30 record keys; DD stateKey returns a record; Q4 answered by FS O7 (`state`) | RESTORE (one line) | State that the returned record is canonicalised with the D30 key grammar and bounds |
| 68 | O5 | Only getShortestPaths and getSimplePaths | KEPT | FS O9 | - | |
| 69 | O5 | Options `{ events, maxDepth = 20, limit = 100 }`, events per call, event cost one | KEPT | FS O9 | - | |
| 70 | O5 | maxDepth non-negative safe integer; limit positive safe integer | DROPPED-SILENT | none | RESTORE (fold into #72) | Input validation |
| 71 | O5 | Return `{ paths, truncated, explored }`; explored counts distinct keys | KEPT | FS O9 (answers archived Q2) | - | |
| 72 | O5 | Shortest = stable candidate-order BFS, first path per unseen key; simple = candidate-order DFS, no repeated key; zero-step path included; truncated = a bound hid a reachable candidate | DROPPED-SILENT | none | RESTORE | Result order is the determinism contract tests compare against |
| 73 | O5 | Defects and noncanonical keys throw synchronously with no partial results | DROPPED-SILENT | none | RESTORE | Failure classification; should be a FlowError |
| 74 | O5 | Traversal is pure: no Effects, services, fixtures, Runtime, operations, mutation, restore, time | KEPT | FS O9 "traverses pure transitions" | - | |
| 75 | O5 | Async outcomes traversable only as already-authored candidate events | CHANGED (capability lost) | FS D19, ML s4: outcomes are internalEvents, which Stories may not send; DD model events list only public events | RESTORE (decision needed) | A model can no longer move past SAVING because Saved/SaveFailed are internal. Options: allow internal events in model candidate sets for prediction, with each path's Story replaying them through fixtures; or let candidates name operation outcomes (`O.saveTitle` success/failure tag) that the model maps through the outcomes table. Without one, models cover only the synchronous slice of a machine |
| 76 | O5 | Each path retains predicted final projection, per-step data/issues, weight, description, metadata | DROPPED-SILENT | FS O9 mentions only path.story | RESTORE | Path shape (steps with event and predicted snapshot, final key) is what an agent reads from a model |
| 77 | O5 | path.story extends the base with candidate events and empty checkpoints; ordinary Story | KEPT | FS O9; DD editor.test.tsx | - | |
| 78 | O5 | Live parity: compare final and prefix keys with the same stateKey | KEPT | FS O9, V7 "live parity" | - | |
| 79 | O5 | No second interpreter; predict no primitive snapshots; synthesize no checkpoints | DROPPED-SILENT | none | RESTORE (one line) | Model and Runtime must share one transition function, or parity is luck |
| 80 | O5 | React attachment remains outside the machine timeline | DROPPED-SILENT | none | CONFIRM-DROP | Self-evident |
| 81 | O6 | `behavior({ app, stories })` gateway | DROPPED-EXPLICIT | FS D43 flow.config.ts `defineConfig({ apps: [{ app, stories }] })` | CONFIRM-DROP | Better form; but carry its validation rules (#82, #83) |
| 82 | O6 | External Story ids; reject empty and duplicate ids | CHANGED (preserves) | FS O9 `{ id }`; FS O1 name rules; FS O11 flow check id collisions; DD flow.config.ts namespacing | - | |
| 83 | O6 | Reject missing/mixed App identity, incompatible App Stories, machine Stories outside the supplied App | DROPPED-SILENT | none | RESTORE | Discovery must reject a Story whose setup's App differs from its config entry, and a machine Story whose machine that App does not list |
| 84 | O6 | Validation/registration synchronous; acquires no services, Runtime, actor, fixture, sink | KEPT (reference only) | DD tools/cli.ts "story list ... without running them"; DD editor.story.ts header | RESTORE (one line in O9/O11) | describe/list must stay inert |
| 85 | O6 | CLI is the only gateway consumer; trusted loading/containment owned by CommandLine | CHANGED | FS O11 CLI; CommandLine items belong to that inventory | - | |
| 86 | D1 | Stories execute on the production Runtime; hosts own assertions, pass/fail, retries, naming; no second engine/scheduler/store/evidence/cleanup | KEPT | FS O9; principles.md Stories row | - | |
| 87 | D2 | Model predictions require live parity | KEPT | FS O9, V7 | - | |
| 88 | D3 | Evidence membership separate from persistence closure | DROPPED-SILENT | none | CONFIRM-DROP if #51 restored | See #52 |
| 89 | C1 | Reject perform/deliver/receive/simulate/flush/settle/setTime/final/replay, pending-result injection, synthetic suspend/resume, fork/restore/fromCheckpoint, testing runtimes, replay/provide/clock helpers | KEPT | FS O12 closed routes, "no deleted name survives"; ML s4 no test-only escape | - | |
| 90 | C1 | FlowStoryExecutionError is the sole named testing class | CHANGED (preserves) | FS D10 one FlowError | - | |
| 91 | C2 | Models acquire no executable authority (no restore, inferred events, filters, custom weights/serializers, Effects, fibers, Scopes) | KEPT (partial) | FS O9 pure transitions; FS O12 closed | CONFIRM-DROP (list detail) | Closed surface covers it; "no inferred events" interacts with #75 |
| 92 | C3 | Temporary testing-route deferral and restoration gates | DROPPED-EXPLICIT | FS O15 PackageContract: restoration lists deleted | CONFIRM-DROP | Archived delivery ceremony |
| 93 | V1 | Type negatives: missing/extra fields, void input, context-free context, missing fixture closure, duplicate/widened names, unknown keys | DROPPED-SILENT | FS V7 lists none | RESTORE in V7 | Proof for #8, #13, #14, #18, #7 |
| 94 | V1 | One prefix extended three ways, run twice: prefix unchanged, fresh Runtime/fixtures/persistence per run; construction runs nothing | DROPPED-SILENT | FS V7 "identical traces from identical runs" only | RESTORE in V7 | Proof for #15-#17, #43 |
| 95 | V1, V2, V5 | Exact RequirementsOf unions and Scope removal on inferred Story/fixture/model types | DROPPED-SILENT | ML deleted RequirementsOf | CONFIRM-DROP | Type plumbing of a deleted surface; closure proof moves to #93 |
| 96 | V2 | Fixture proofs: provider override, duplicate fixtures, service acquisition failure, cancellation | DROPPED-SILENT | none | RESTORE in V7 | Proof for #26, #27, #39, #47 |
| 97 | V2 | Recipe identity, repeated slots, stable/transitive refs, foreign/cyclic recipes | DROPPED-SILENT | recipes deleted; admission tests in FS V3 | CONFIRM-DROP | Covered by FS V3 admission tests |
| 98 | V2 | Seeds never satisfy services; kernels stay production-owned | DROPPED-SILENT | seeds deleted | CONFIRM-DROP | |
| 99 | V3 | Processing proofs: FIFO sends, pending external calls/streams, ready reconciliation/context/timers, setContext, maxTurns, clock-only movement without draining | DROPPED-SILENT | FS V7 silent | RESTORE in V7 | Proof for #12, #45, #46 |
| 100 | V3 | Cancel before/during commands and each cleanup phase; injected cleanup failures; blocked-send provider cancellation settles once | DROPPED-SILENT | none | RESTORE in V7 | Proof for #39-#41 |
| 101 | V4 | Atomic evidence, unknown/inherited lookup, unrelated actors, concurrent publication, failure before/after end capture | KEPT (partial) | FS V7 "checkpoint atomicity and reads" | RESTORE (failure truth part) | Failure-before/after-end cases unproved |
| 102 | V4 | Compare direct and CLI evidence, diagnostics, Cause projection | KEPT (partial) | FS V9 CLI leaf outputs | RESTORE (one parity case) | `flow story run` must report what `run()` returned |
| 103 | V5 | Independent small-graph oracle: BFS/DFS order, zero-step, cycles, equal keys, both limits, noncanonical keys, call-local events | DROPPED-SILENT | FS V7 "model path bounds" | RESTORE in V7 | Proof for #72, #73 |
| 104 | V5 | Live parity comparing stateKey, snapshots, turns, pending work, operation facts, context, cleanup | KEPT (partial) | FS V7 "live parity" | - | Detail can follow from #54 |
| 105 | V6 | Gateway brand identity and inert discovery | CHANGED | FS D43; FS V9 | RESTORE (inert discovery case in V9) | Proof for #83, #84 |
| 106 | Q1 | FlowStoryExecutionError member shape | CHANGED, still open | FS O10 FlowError "Story evidence" unspecified | RESTORE (answer via #47) | |
| 107 | Q2 | What `explored` counts | KEPT (answered) | FS O9 "distinct state keys" | - | |
| 108 | Q3 | advance input and units | KEPT (answered) | FS D34 Duration.Input; DD `advance("2 seconds")` | - | |
| 109 | Q4 | stateKey's state member name | KEPT (answered) | FS O7 `state`; DD stateKey | - | |
| 110 | refs README | Persistent branches syntax; evidence reads; pure model paths (illustrations) | KEPT | DD editor.story.ts, editor.test.tsx | - | Reference app carries the syntax |
| 111 | refs README finding 8 | No fixture pattern to hold a request open, so "revoked mid-save" outcome depended on adapter timing | KEPT (resolved) | DD testing/fixtures.ts SlowSave delays on TestClock; DD revokedWhileSaving test | - | |

## Counts

KEPT (including partial, by reference, reference-only and answered): 46
CHANGED: 24
DROPPED-EXPLICIT: 8
DROPPED-SILENT: 33
Total: 111
