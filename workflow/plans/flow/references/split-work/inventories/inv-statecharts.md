# Scope inventory: Statecharts.plan and SurfaceSimplification.plan

Sources checked: workflow/plans/archive/rewrite/Statecharts.plan, workflow/plans/archive/rewrite/SurfaceSimplification.plan, workflow/plans/archive/rewrite/explorations/reference-review.md (linked by SurfaceSimplification Q41), against workflow/plans/flow/FlowState.plan (FS), references/design/minimal-library.md (ML), references/design/entity-domain.md (ED) and references/dispatch-desk (DD).

Abbreviations: SC = Statecharts.plan, SS = SurfaceSimplification.plan, RR = reference-review.md. "KEPT (by ref)" means FS keeps the archived decision only by citing its ID (for example FS D11 "Kept from SurfaceSimplification D38 to D42") without restating the text in an outcome; counted as KEPT, but the text should be restated so C1 cannot erase it.

## Statecharts.plan

| Archived ref | Commitment (short) | Status | New location or decision | Recommendation | Reason |
| --- | --- | --- | --- | --- | --- |
| SC O1 | definition(config) returns Result of Definition or Diagnostic | CHANGED | FS O1, D8 (returns value, throws FlowError) | — | Same failure information, one fewer wrapper; capability preserved. |
| SC O1 | Closed config fields id, states, events, context?, operations?, memory? | CHANGED | FS O1 (id, states, events, internalEvents, input, memory, initial, context, operations) | — | Superset; preserved. |
| SC O1 | Provider.select is inert, preserves selected result type; declaring an edge creates no actor, subscription or work | KEPT | FS O1 (context), O3 ("nothing runs at construction") | — | |
| SC O1 | Selector may project provider memory/state (Theme.select(({memory}) => ...)) | KEPT | FS O1, O4 | — | |
| SC O1 | Binding supplies one exact compatible provider ref; the selected value is not the ref | CHANGED | FS D14 (wiring on ref or app default), O3 admission "compatible providers" | — | Preserved, declared once. |
| SC O1 | operations is a flat, closed named record; no generic registry or alternative container | KEPT | FS O1 (flat named record, now incl. domain handles) | — | |
| SC O1 | Names nonempty, <=256 UTF-8 bytes, reject C0, DEL, NUL, lone surrogates before building tokens | KEPT | FS O1, D9; O13 ports vectors | — | |
| SC O1 | No Unicode normalisation; composite identity uses fixed namespace tag + length-prefixed UTF-8 segments | KEPT | FS O1, D9 ("namespace tag" not restated) | — | Namespace tag is mechanism; length prefix kept. |
| SC O1 | Stable actor ref exact wire form; opaque refs runtime-local with no durable form | KEPT | FS D9 (actor ref wire form); local actors anonymous (D12), persist only on actorRef | — | Local actors cannot persist or be send targets (ML 9); equivalent. |
| SC O1 | Authored shape decoded once by one package-private Schema; machine never re-decodes (also SC D1) | DROPPED-SILENT | — | CONFIRM-DROP | Pure mechanism; the observable part (closed validation) is listed separately below. |
| SC O1 | Authors import no Schema; events are "bare" or callable declarations | CHANGED | FS D44 (Schema field records), O1 | — | Deliberate change; capability preserved. |
| SC O1 / SS O5 | Event constructors decode/validate payloads on every call; payload validation on admission stays (SS O5) | DROPPED-SILENT | FS O1 only says constructors exist; DD host.ts decodes boundary input via Schema | RESTORE | Binding guarantee: an envelope with an invalid payload (e.g. built in plain JS, or a cast) must not enter a turn. State: constructors validate and throw FlowError; send validates tag-in-public-universe and payload, rejecting with a diagnostic and no turn. |
| SC O1 | Bare constructors take zero arguments | CHANGED | ML 4/5 (E.SaveRequested(), bare reference for payload-free events) | — | Preserved. |
| SC O1 | Payloads cannot be arrays, custom-prototype records, or contain the reserved type field | CHANGED | FS D44/SS D56 (_tag envelope, field records); ML 4 allows Schema.instanceOf(File) in non-persisted machines | RESTORE (narrow) | Records-only follows from field records, opaque values are a deliberate gain. Still missing: a payload/memory field named `_tag` must be rejected at construction (the reserved envelope key moved from `type` to `_tag`). |
| SC O1 | Reject duplicate or partial declarations, invalid kinds, extra top-level fields | DROPPED-SILENT | FS O1 says construction "throws ... when construction fails" but lists no rules | RESTORE | Closed-grammar validation is the main guard against agent typos. Restate it, and add the new collision: the same event name in events and internalEvents. |
| SC O1 | Exact literal inference for IDs, paths, events, payloads, selected context without as const, satisfies, generics or wrappers | KEPT | FS V1 ("without annotations, explicit generics or assertions"), C3 | — | |
| SC O1 | Event tokens nominal; structural lookalikes not assignable | CHANGED | FS D44/D47, SS D56 (events are plain Schema.TaggedUnion values) | CONFIRM-DROP | Plain serialisable events are needed for Stories, persistence and boundary decoding (SS O4). Type-level separation of public and internal events (D19) replaces most of what nominality protected. Runtime check is covered by the payload-validation RESTORE above. |
| SC O1 | EventOf extracts envelopes; StateOf/EventOf accept Definition or Machine | CHANGED | ML "Deleted or absorbed" (derived Schemas: typeof Editor.Event.Type) | — | Preserved through derived Schemas. |
| SC O1 | memory({input}) is the sole Input/Memory source; omission gives void input and empty memory | CHANGED | FS O1, D45, D46 (input/memory Schema records + required initial) | — | Preserved. |
| SC O1 | Fresh actor runs the initializer exactly once | KEPT | FS O1, D46 | — | |
| SC O1 | Restore/resume never replay initializer or input | KEPT | FS O1, O8 | — | |
| SC O1 | Later behaviour sees memory, context, state and events, never the original input (input is not retained) | DROPPED-SILENT | FS O7 snapshot lists no input, but no rule says input is not retained | RESTORE | Determinism and restore rule: input is consumed by `initial` only; callbacks, snapshots and persisted records never carry it. One sentence in O1. |
| SC O1 | Only accepted transitions change actor-local memory | KEPT | FS O2 (updateMemory inside a macrostep), D1 | — | |
| SC O1 | Memory is not cache, projection or operation status | KEPT | FS D29 + lint | — | |
| SC O1 | Context naming another domain instance needs host re-keying/replacement, not memory reuse | CHANGED | FS D12 (one ref per record), O8 ("a different user is a new Runtime") | — | Equivalent recipe exists. |
| SC O2 | machine(definitionResult, cb) propagates failure without calling cb | CHANGED | FS D8 (throws) | — | Preserved. |
| SC O2 | Callback supplies S, E, O, onContext, onMemory, invalidate, clear | CHANGED | FS O1/O2 (onContext static list), ML deleted table (invalidate/clear on O.x), SS D16 (onMemory deleted) | — | Preserved in new forms. |
| SC O2 | Behaviour cannot enlarge the Definition universe; one-direction inference (NoInfer) | DROPPED-SILENT | — | RESTORE | Binding type guarantee: a machine cannot add states, events or operations; extra keys are type errors and construction errors. Add to O1 and V1 negative fixtures. |
| SC O2 | State tree at most ten levels deep (V1: accept 10, reject 11) | DROPPED-SILENT | — | RESTORE | Bound; also bounds default entry and fallthrough depth now that the microstep limit is gone. |
| SC O2 | Root and every compound require a states record and a direct-child default; leaves explicit, {} is an empty leaf | KEPT | FS O1 ("compound states name a default"); DD editor.machine.ts default: S.OPEN.EDITING | — | "Direct child" rule folded into the RESTORE below. |
| SC O2 | Missing, extra, misplaced, duplicate, non-direct nodes reject; foreign targets reject | DROPPED-SILENT | — | RESTORE | Machine state config must match the definition tree exactly; default must be a direct child; targets must be tokens of this machine. |
| SC O2 / SS O6 (D12) | Complete paths are typed tokens; token metadata under a symbol key so child names cannot collide; reserved-name checks stay | CHANGED (partly lost) | FS D20 (flat tokens with is, child; S.root) | RESTORE | Tokens now expose `is` and `child` and there is `S.root`; a state named `is`, `child` or a top-level `root` collides. Restate reserved names (or keep members under a symbol). |
| SC O2 | Exactly one active leaf published; matches accepts leaf or active ancestor | CHANGED | FS O1, D20, SS D50 (S.X.is true for state and descendants) | — | Preserved. |
| SC O2 | Node fields only on, redirect, activities, timers (+default/states) | CHANGED | FS O1 (on, activities, schedules, onContext) | — | Preserved minus redirect (below). |
| SC O2 | Handler: state-token shorthand, one transition, or ordered transitions | KEPT | FS O2 ("authored order"); ML 8a/DD `Escape: S.CLOSED` | — | |
| SC O2 | Transition: target; guard, updateMemory, actions, reenter | CHANGED | FS O2, D17 (target "self"), D23 (reenter deleted) | — | Covered except boundary semantics (row below). |
| SC O2 | Redirects (eventless, ordered `when` entries), stabilised after descendant transitions and memory changes | DROPPED-EXPLICIT | ML 7, ML "What we lose"; FS O15, D23 | CONFIRM-DROP (least sure) | Reason holds for mirroring memory into state. Gap: an initial state chosen from input/restored memory (e.g. start in AUTHED) now needs an extra event turn and an intermediate publication. Revisit if a real case appears, as ML says. |
| SC O2 | Defaults stabilise outermost-to-leaf, authored order, no intermediate work or publication | KEPT | FS O2 step 3 ("enter defaults outermost first"), one publication in step 5 | — | |
| SC O2 | reenter: exact containing boundary; releases that boundary's path and re-enters its target; reject Boolean/foreign/inactive/non-containing | DROPPED-EXPLICIT | ML 7, FS D23 | CONFIRM-DROP for the keyword; RESTORE the boundary rule | Debounce is covered by restartOn. But FS no longer says which states exit and enter for a transition (least common compound ancestor), what targeting the current state's own token or an ancestor token does (ML 7 only says flow check flags it), and therefore which activities and schedules restart. Restate exit/entry-set semantics as a binding rule. |
| SC O2 | Relative string targets and runtime path lookup rejected | KEPT | SS D9, ML 7 ("self" is the only string the target type allows) | — | |
| SC O2 | Substates share memory, context, protocol, mailbox, operations, lifetime; no identity, input, address, output, completion or snapshot | KEPT | FS D24 (nested states, no child actors) | — | |
| SC O2 | Terminal-looking leaves are ordinary leaves; they do not dispose actors, complete streams or close mailboxes (no final kind, SC C1) | DROPPED-SILENT | FS D50 lists no "final states" | RESTORE (one sentence) | Agents expect XState `final`. State: no final states; a leaf without handlers keeps the actor alive; only disposeActor/retain/Runtime disposal end it. |
| SC O2 | Independent actors may share a Machine | KEPT | FS D12, SS O3 (several refs per machine) | — | |
| SC O2 | Overlapping operation states are not a Cartesian product of modes | CHANGED | FS D39 activity lanes, D24/D50 (parallel regions: use separate actors) | — | Preserved via lanes. |
| SC O3 | Macrostep order: select transition/guard; updateMemory then actions on pre-turn snapshot; apply target and memory; validate batch, stage; publish then start work | KEPT | FS O2 steps 1-5 | — | Step 1 changed to nearest handler + fallthrough (D18). |
| SC O3 | Declined guard prevents later callbacks of that transition; later alternatives considered | KEPT | FS O2 step 1 | — | |
| SC O3 | updateMemory returns Partial<Memory>, shallow-merged once | KEPT | FS O2 ("memory patch") | — | Consider restating "shallow merge once". |
| SC O3 | Actions cannot read candidate memory | KEPT | FS O2 step 2 | — | |
| SC O3 | Redirects read candidate state/memory, never the event | DROPPED-EXPLICIT | ML 7 | CONFIRM-DROP | Redirect removed. |
| SC O3 | No handler/all decline: no issue, publication, TurnRecord, occurrence, work or consumed revision | KEPT | FS O2 ("changes nothing and publishes nothing") | — | |
| SC O3 | Private Story acknowledgment still settles once on a no-op | DROPPED-SILENT | — | CONFIRM-DROP | Mechanism; FS O9 process() drains regardless. |
| SS O6 (D28) | Actual denials are recorded in evidence | KEPT (by ref) | FS D21 cites SS D28; not restated in O2/O11 | Restate | Needed by `flow explain` evidence mode; note it must not create a revision (archived no-op rule). |
| SC O3 | Root can(snapshot, event) bound to the snapshot's exact Machine; no widened/cross-machine universe; no Machine-as-snapshot | CHANGED | FS O2, D22, D53 (check -> Allowed/Denied/Unhandled) | — | Preserved; keep the cross-machine negative fixture in V1. |
| SC O3 | Bound can(event) in selection | DROPPED-EXPLICIT | SS D17, FS D22, ML 8 | CONFIRM-DROP | Root check works on any snapshot including in useView. |
| SC O3 | can/check same eligibility rules; no mutation, admission, issues, redirect stabilisation, actions, operations or work | KEPT | FS O2 ("by the same rules ... it starts nothing") | — | |
| SC O3 / V3 | Querying an older snapshot uses its captured state, memory, context and passive reader cut | KEPT | ML 8 obligations (lanes stored in snapshot, not live) | — | Add to FS V3/V7. |
| SC O3 | No raw/untrusted decoder or new misuse error for can | DROPPED-SILENT | — | CONFIRM-DROP | Scoping note only. |
| SC O3 | Finite actions originate only from accepted event transitions | KEPT | FS O5 ("finite work only from accepted actions") | — | |
| SC O3 | Batch is one plan, list, null, empty or omitted | CHANGED | SS O1/D7 (static list), FS O1 | — | Preserved. |
| SC O3 | Invalid member/target/key rejects the entire batch; no valid prefix escapes | KEPT | FS O2 step 4 | — | Restate "no prefix". |
| SC O3 | Reject microstep 101 | DROPPED-EXPLICIT | FS O15 | CONFIRM-DROP | Without redirect/eventless transitions a macrostep cannot loop; depth is bounded by the (to-be-restored) depth limit. Note: actor send ping-pong is a cross-turn loop the limit never covered. |
| SC O3 | Reject ambiguous same-event ancestor/descendant handlers | DROPPED-EXPLICIT | FS D18, ML 7/8a | CONFIRM-DROP | Standard nearest-handler rule plus fallthrough is better and is drawn by flow graph. |
| SC O3 | User Effects never run during planning or before publication | KEPT | FS O2 step 5 | — | |
| SC O3 | Projection-only facts (lane/cache updates) publish complete projections without evaluating any transition, guard, action, memory update or hidden event | DROPPED-SILENT | FS O2 lists inputs that enter the mailbox but not lane-only publications | RESTORE | Ordering/determinism: a cache or stream update with no mapped outcome event republishes the snapshot (lanes) without running handlers, guards, schedules or reactions. |
| SC O3 | Mapped events become later ordinary mailbox turns | KEPT | FS O2 (all inputs enter one FIFO mailbox), O3 send | — | |
| SC O3 | Pre-commit authored callback defect: prior truth kept, one issue-only snapshot, ordered stable diagnostics, no occurrence/work, no retry (guard, memory, action, key, target, timer, binding, selector) | KEPT | FS O2 ("a defect in any authored callback before commit ...") | — | |
| SC O3 | After commit a cut cannot be abandoned or called rollback | DROPPED-SILENT | — | RESTORE (with next row) | |
| SC O3 (implied) | Defect policy for callbacks run outside a turn | DROPPED-SILENT (new gap) | FS covers only pre-commit callbacks | RESTORE | New surface runs callbacks after commit: outcome `.from` mappers, commit `writes`/`optimistic` data, `placeholder`, activity params/`when`, `restartOn`, schedule functions and `send` metadata mappers. Failure classification for each (issue, no event, writes not partially applied, no retry) is undefined. |
| SC O4 | Activities and onMemory own continuing plans; one plan/false/null per declaration; sentinel releases only that slot | CHANGED | FS O2 (activities with `when`), SS D16 | — | Preserved; when false releases the slot. |
| SC O4 | Identity = slot, kind, descriptor, canonical K; equal keeps generation and original P; changed releases once | KEPT | FS O2 | — | |
| SC O4 | Compound activities start parent-to-child and stop child-to-parent | DROPPED-SILENT | — | RESTORE | Ordering guarantee; activity params may read earlier activities' lanes (FS O2), so parent lanes must exist before children start. |
| SC O4 | Descendant changes do not restart unchanged parent work | DROPPED-SILENT | — | RESTORE | Core lifetime guarantee (OPEN's ticket subscription must survive EDITING -> SAVING). Fold into the exit/entry boundary rule. |
| SC O4 | onMemory.select equality: whole-value Object.is for scalars, fieldwise for plain records; no comparator; current/previous | DROPPED-EXPLICIT | SS D16, FS O15 | CONFIRM-DROP for onMemory; RESTORE an equality rule | FS now needs a stated change test for `restartOn` and `onContext` select ("when its selected value changes"). State one rule (Equal.equals, as useView D40), so a selector that builds a fresh record does not restart a debounce every turn. |
| SC O4 | Definition context selectors are graph edges; onContext is a machine-level registration | KEPT | FS O1, O2 | — | |
| SC O4 | Initial context selection silent; later changes yield one exact self-event or nothing | CHANGED | FS O2, D25 (static {select, when?, event}) | — | Preserved. |
| SC O4 | Only the ordinary event handler evaluates transition legality and finite actions | KEPT | FS O2 (reactions emit ordinary mailbox events) | — | |
| SC O4 | Timer names unique machine-wide; get(name) narrows to name union | CHANGED | FS O2 (named schedules); snapshot timers removed (D38) | RESTORE (narrow) | State that schedule names are unique per machine; inspection and any named Story command depend on it. |
| SC O4 | TimerSnapshot closed union idle/scheduled/fired/interrupt with startedAt, dueAt, firedAt | DROPPED-EXPLICIT | FS D38, ML 8 ("snapshot timers -> inspection; a countdown puts dueAt in memory") | RESTORE (as inspection/evidence content) | Removal from the public snapshot is fine. But FS never says what inspection records for schedules, and no callback is documented to receive `now`/`dueAt`, so the ML countdown recipe has no source. Restore schedule status in evidence and give updateMemory/actions the Runtime clock time or the schedule's dueAt. |
| SC O4 | Timestamps are Runtime Clock integer epoch ms | KEPT | FS O2 (Runtime Clock) | — | |
| SC O4 | Invalid delay rejected before mutation | DROPPED-SILENT | — | RESTORE | Bound/failure classification: a schedule function returning an invalid Duration or Schedule is a pre-commit defect with no partial arm. |
| SC O4 | Due timer consumes one generation once; fires even if the guard declines | CHANGED | SS D53 (timer guard removed; receiving guard filters) | — | Preserved; restate "each due step delivers exactly once". |
| SC O4 | Timer callbacks receive state, memory, snapshot, timer {name, startedAt, dueAt} | CHANGED | FS O2 (schedule fn {memory, now}; send .from(metadata)) | — | Preserved. |
| SC O4 / C1 | Timers target explicit events, never finite actions | KEPT | FS O2 (send is an event) | — | |
| SC O4 | Timer turn and target event are separate FIFO macrosteps; queued work may intervene | CHANGED | FS O2 (schedule's event enters the FIFO mailbox) | — | Preserved without the extra timer turn. |
| SC O4 / SS D53 | Compound timers start on activation, keep absolute deadlines through descendant changes, cancel on exit, restart only on owning-boundary re-entry | DROPPED-SILENT | SS D53 said "preserving ... exit/re-entry rules"; FS O2 only states restartOn | RESTORE | Lifetime guarantee; part of the boundary rule. Also say `target: "self"` never restarts schedules. |
| SC O4 | Equal-deadline ordering deterministic and Flow-owned | KEPT | FS O2 | — | |
| SC O4 | Polling: one due generation, next refresh only after settlement, failure waits one interval, no implicit retry | CHANGED (partly lost) | DD queue.machine.ts uses Schedule.spaced + PollDue refetch | RESTORE | With a free-running Schedule a refetch can fire while the previous one is in flight. State that a refetch of an entry with a lookup in flight joins it (no overlapping requests) and that failures are not retried implicitly. Overlaps the Resources inventory. |
| SC O4 | Suspension/resume keeps deadlines; at most one overdue refresh | DROPPED-EXPLICIT | FS D16 (suspension deleted) | CONFIRM-DROP for suspension; RESTORE the overdue rule | Suspension's removal is justified. The overdue rule still matters for restore and backgrounded tabs: an overdue schedule fires once, never as a burst. |
| SS D53 | Plain-duration schedule restores exactly; multi-step Schedule restarts on restore | DROPPED-SILENT | FS O8 says nothing about schedules | RESTORE | Persisted actors with schedules need a restore rule (deterministic, no replay). |
| SC D1 | Definition (shape) separate from Machine (behaviour); inert; deterministic traversal; no runtime tree is a consumer contract | KEPT | FS O1, O11 (internal representation is now a tool contract) | — | |
| SC D2 | One turn exposes one accepted cut; private plan shapes | KEPT | FS O2, D7 | — | |
| SC C1 | Exclude child-machine constructors, final/onDone, context mutation, entry/exit/invoke/always, transition submit, anonymous Effect callbacks, registered views, dynamic registration, activity kits | DROPPED-SILENT (partly) | FS D50 (child actors, history, parallel), D1 (no dynamic escape) | CONFIRM-DROP | Exclusions need no restatement; nothing in FS adds these features. Final states row above covers the one agents will expect. |
| SC C1 | Reject timer-owned finite actions and automatic operation retries | KEPT | FS O2 (schedules send events), O5 ("no automatic retry") | — | |
| SC C2 | Authoring input is not an untrusted reflection boundary (proxies, getters, symbols ...); validate ordinary malformed objects | DROPPED-SILENT | — | CONFIRM-DROP | Scoping statement; the "validate ordinary malformed objects" half is in the closed-validation RESTORE. |
| SC C2 | Byte/depth checks at runtime, not in types; no any/assertion erasure | KEPT | FS C3 ("no erased public type information") | — | |
| SC V1 | Grammar/identity fixtures: depth 10/11, 257-byte names, controls, surrogates, lookalikes, unknown fields; ASCII and 2/3/4-byte vectors; construction starts nothing | CHANGED | FS V1, V2, O13 (ported name vectors) | — | Depth and unknown-field cases fall with the RESTOREs above. |
| SC V2 | Recursive grammar, defaults, matching, one identity through nested changes | KEPT | FS V2, V3 | — | |
| SC V3 | Macrostep lanes, no-op, defect, check agreement | KEPT | FS V3 | — | |
| SC V4 | Equal plan keeps P/generation; parent/child lifetime; selector equality; cancellation/finalizer failure; timer ordering, descendant continuity, re-entry; overdue once | CHANGED (partly lost) | FS V3 (activity identity, schedule ordering, restartOn) | RESTORE | Add parent/child order, descendant continuity, and activity release/finalizer failure handling (a failing release is classified, reported once and never blocks the transition) to V3. |

## SurfaceSimplification.plan (incl. Q41 / reference-review.md)

| Archived ref | Commitment (short) | Status | New location or decision | Recommendation | Reason |
| --- | --- | --- | --- | --- | --- |
| SS goal | Principle "truth is a compilation target"; agent is primary author | KEPT | FS goal, D5 | — | |
| SS O1, D2, D7 | Structure is data, strict; callbacks never choose target, operation, descriptor or event type | KEPT | FS D1, O1 | — | |
| SS O1 | Inert App construction yields complete structure without callbacks or parsing TS | KEPT | FS O3, O11, V2 | — | |
| SS O1 | Structural list includes guard identities, persistence opt-ins and concurrency policies | KEPT | FS O11 (guards and deny codes, persistence opt-ins; concurrency via descriptors) | — | |
| SS O1, D18 | Actions are a static list; outcomes reference event constructors, never strings; argument mismatch is a type error | KEPT | FS O5, D25, D31 (bare or .from) | — | |
| SS O2, D3, D6 | Machine file is the spec; one internal representation; JSON/Mermaid renderers; checks and diffs read it | KEPT | FS D2, O11 | — | |
| SS O2 | Representation contains no user values, closures or secrets | DROPPED-SILENT | FS O11 lists contents only | RESTORE | Containment guarantee: `inspect(app)` and `flow graph` output may be shared or pasted to agents; state it holds no runtime values, closures or secrets (complements D48 redaction of traces). |
| SS O3, D4 | Acyclic upward read graph; cycle rejected before admission; no spawned children | KEPT | FS O4, D24 | — | |
| SS O3 | App lists closed machine set; unlisted machine's actors rejected as foreign | KEPT | FS O3 ("exact app, machine and ref provenance") | — | |
| SS O3 | One shared actor per ref per Runtime; several refs may name one machine | KEPT | FS D12, O3 | — | |
| SS O3, D11 | Wiring declared once on the ref; ensure/useActorByRef take no wiring; conflicting-bindings case disappears; local actors still pass bindings | CHANGED | FS D14 (ref or app default; local actors inherit) | — | Better than archived form. |
| SS O3, D13 | module removed; app({ id, persistenceVersion, machines }); tooling groups by machine ID prefix | CHANGED | FS D13, O3; persistenceVersion -> persistence.version (D41) | CONFIRM-DROP (grouping) | Grouping by prefix is cosmetic tooling. |
| SS O4, D5 | Future playback stays possible: Stories executor-agnostic data; events serialisable plain values; representation extensible (UI-trigger edges) | DROPPED-SILENT | — | RESTORE (as a constraint) | Owner direction preserves scope; one constraint line keeps playback buildable. Note the tension with opaque payloads (ML 4): Stories must fixture or redact them. |
| SS O5, D8 | definition/machine return values and throw FlowError; event constructors return envelope; no double exports | KEPT | FS O1, D8 | — | |
| SS O5 | Payload validation on admission stays | DROPPED-SILENT | — | RESTORE | Same as SC O1 payload row. |
| SS O6, D12 | Flat state paths; token metadata under symbol; reserved-name checks stay | CHANGED (partly lost) | FS D20 | RESTORE | See SC O2 reserved-name row (`is`, `child`, `root`). |
| SS O6, D14 | One FlowError with code, diagnostics, cause, Story evidence | KEPT | FS O10, D10 | — | |
| SS O6, D15 | useShallow removed | KEPT | FS O7, D40 | — | |
| SS O6, D16 | onMemory removed; activities incl. root; computed params + when; activities may read memory; previous arg dropped | KEPT | FS O2 | — | |
| SS O6, D17 | One root can; bound can removed; invalidate/clear static | CHANGED | FS D22 (check), O5 | — | Preserved. |
| SS O6, D19 | Story process() is the single drain | KEPT | FS O9 | — | |
| SS O6, D20 | Outcome members optional; omission sends no event; state still records outcome; writes apply on success; omitted failure/defect publishes an actor issue; flow check reports stuck states | KEPT | FS D32, O11 (stuck states); ML 8 item 6 (issue for unmapped outcomes) | — | Restate the issue rule in FS O5. |
| SS O6, D23, D24 | onContext static list {select, when?, event}; select reads context+memory; only context waves re-trigger; first silent; mailbox turns | KEPT | FS O2 | — | |
| SS O6, D23 | Event called with (current, previous) | CHANGED | FS D25 (.from(selected); previous stays in `when`) | — | Preserved. |
| SS O6, D23 | A handler that chose between events becomes several reactions sharing a selection | DROPPED-SILENT | — | RESTORE (narrow) | Order: when several reactions fire on one wave, their events enqueue in declaration order. Determinism. |
| SS O6, D23 | Selection cannot read the consumer's own state | KEPT | FS O2 ("select reads context and memory") | — | |
| SS O6, D25-D27 | Key projector: named record, derived values allowed, undefined absent, empty default, records only, partial-record invalidate/clear replaces tags | KEPT | FS O5, D30 | — | |
| SS O6, D25 | Execution parameters must be assignable to the key input (type rule) | DROPPED-SILENT | — | RESTORE | Prevents a key that ignores a parameter; overlaps Resources inventory. |
| SS O6, D25, D42 | Lint: resource/stream parameter fields missing from the key input | KEPT (by ref) | FS D11 cites SS D42; omitted from FS O11's enumerated check list | Restate | Catches two parameter sets sharing one cache entry (wrong data shown). |
| SS O6, D28 | Guards return true or deny(code, context?); literal code as const type parameter; never false | KEPT | FS O2, D21 | — | |
| SS O6, D28 | Possible deny codes per transition read exactly from types | KEPT | FS O11 (representation holds possible deny codes) | — | |
| SS O6, D42 | Warning for non-literal deny codes | KEPT (by ref) | FS D11 cites SS D42; omitted from O11 list | Restate | Static deny-code extraction depends on it. |
| SS O6, D28 | can(..., { explain }) reports denied candidates or no handler | CHANGED | FS D22, D53 (check Denied reasons, Unhandled) | — | Better. |
| SS O6, D30 | One outcomes container; finite and continuing members | KEPT | FS O5, D31 | — | |
| SS O6, D31-D32 | Transaction concurrency required; staleTime/gcTime required, Duration.Input | KEPT | FS O5, D34 | — | |
| SS O6, D33 | Stream adapter returns an Effect Stream; Stream.unwrap for scoped setup; push sources | KEPT | FS O5, D35 | — | |
| SS O6, D34 | Transaction/stream persistence follows the actor; only persist: false; resources opt in | KEPT | FS O5, O8 | — | |
| SS O6, D35 | Duration.Input for every time input; advanceTo absolute epoch ms | KEPT | FS D34, O9 | — | |
| SS O6, D36 | Model stateKey gets snapshot with state; explored counts distinct keys | KEPT | FS O9 | — | |
| SS O6, D37 | flow.config.ts with multiple App entries; App id namespaces Stories; Story-declared ids; duplicate/mismatch checks; --app selection | KEPT | FS D43, O9, O11 (id collisions) | — | --app selection belongs to the CommandLine inventory. |
| SS O6, D38 | Saved behaviour artifacts removed; on-demand graph and two-revision diff | KEPT | FS O11 | — | |
| SS O6, D39 | Inspect route four names; trace (import, export, summarise, diff) | CHANGED | FS O11, D11 (trace import/export; summarise/diff are CLI) | — | Preserved. |
| SS O6, D40 | CLI leaves incl. trace proof; explain static + evidence modes | CHANGED | FS O11, D11 (trace proof deleted) | — | trace proof belongs to Inspection/CommandLine inventories. |
| SS O6, D41 | Observed callback reads from Stories/inspection, labelled observed; inferred later | KEPT (by ref) | FS D11 cites SS D41; no outcome text | Restate | Agents learn read dependencies from it. |
| SS O6, D42 | flow check errors and warnings set | KEPT | FS O11 (+ entity rules) | — | Two warnings only by ref (rows above). |
| SS O6, D43 | Public operation/timer states drop generation; inspection keeps it; docs state guarantees in user terms | KEPT | FS D38, O7 (lanes have no generation) | — | |
| SS O6, D44-D48 | Effect where it owns the concept: Schema payloads, input/memory; Layer services; no spike | KEPT | FS D6, D15, D44, D45 | — | |
| SS O6, D46 | Operation data and error Schemas required where values cross a boundary (persisted resources/streams, SSR seeding) | DROPPED-SILENT | FS O5 descriptors list no data/error Schema; O8 mentions only memory Schemas | RESTORE | Needed for resource persistence and for SSR hydration (in scope per owner): descriptors with persist: true, or seeded from the server, must declare data and error Schemas. |
| SS O6, D49 | Built-in transition properties (denied and unhandled events change nothing) and deny-code coverage | DROPPED-SILENT | FS propertyTest is entity-only (O9) | RESTORE | Cheap generic test of a binding guarantee plus a coverage report agents can act on. Form: model()/flow check runs the two properties on every explored state and reports deny codes never exercised. |
| SS O6, D21 | Persistence plain object { storage, scope, version, codec? }; persistence() and filter removed; per-declaration persist flags only | CHANGED | FS O8, D41 (KeyValueStore in services, { scope, version }) | — | Preserved. |
| SS O6, D22 | Snapshots keep lifecycle; revisions move to inspection | KEPT | FS O7, D38 | — | |
| SS O7 | Invariants not yet adopted | KEPT | FS Q2 | — | |
| SS O7 | Dropped candidates: named guards, parameter-only readers, createRuntime, settle-by-default steps, Effect redesign, results in waiting state, renaming updateMemory, moving shared handlers | KEPT (as not adopted) | FS has none of them; ML 3 still calls createRuntime "open" | CONFIRM-DROP | Consistent; ML 3's "still open" note should be closed. |
| SS D1 | Correctness > reviewability > brevity; one canonical form; targets stay required | KEPT | FS D3; ML 7 rejects implicit targets | — | |
| SS D9 | Targets stay typed object tokens | KEPT | FS D20, ML 7 | — | |
| SS D10 | Simplify, do not redesign | KEPT | FS D4 | — | |
| SS D29 | guard and when stay separate keywords | KEPT | FS O2 (guard on transitions, when on activities/reactions) | — | |
| SS D50 | State tokens expose is (true for state and descendants) | KEPT | FS D20 | — | |
| SS D51 | Timer conditions use when | DROPPED-EXPLICIT | SS D53 superseded it | CONFIRM-DROP | Superseded within SS. |
| SS D53 | timers -> schedules {schedule, send}; Duration, Schedule or fn of {memory, now}; send envelope or fn of metadata; delay/target/guard/exhaustion event removed | CHANGED | FS O2, D23 (send is event or E.X.from(metadata); restartOn added) | — | Preserved. |
| SS D53 | Runtime steps schedules with Schedule.toStep on its Clock, preserving advanceToNextTimer and deterministic ordering | KEPT | FS O2, O9 | — | |
| SS D53 | CLI may preview any Schedule by simulation, labelled simulated | DROPPED-SILENT | — | RESTORE (low) | Lets an agent see a backoff's fire times without running it; fits `flow explain` or `flow graph`. |
| SS D52 | Invariants are a separate function, paused | KEPT | FS Q2 | — | |
| SS D54 | Outcomes keep mapping to events; no results in the waiting state | KEPT | FS O5 | — | |
| SS D55 | Definition derives Event, State, Input, Memory, Snapshot Schemas | KEPT | FS O1, D47 | — | |
| SS D56 | _tag envelope; type field removed | KEPT | FS O1, D44 | — | |
| SS D57, D61 | Operation state lanes are _tag PascalCase, matched with Match.valueTags | KEPT | FS O7, D39 | — | |
| SS D58 | Failures map by tag; untagged errors keep a single-event form | KEPT | FS O5, D31 | — | |
| SS D59 | Memory requires initial; once for fresh actor, never on restore | KEPT | FS D46 | — | |
| SS D60 | Keep definition and machine shape; no state-owned data | KEPT | FS D4, O1 | — | |
| SS C1 | Binding semantics stay (ordering, atomic publication, fencing, no replay, honest uncertainty, exact inference) | KEPT | FS D7 | — | |
| SS C2 | Proposal authority only; packages/flow-state frozen | KEPT | FS C2 | — | Authority clause is process. |
| SS C3 | Code-composition north star; Effect 4.0.5 is authority, not the beta checkout | KEPT | FS C3, C4, D6 | — | |
| SS V1 | Extractability review: derive representation by hand; any fact needing a callback fails | CHANGED | FS V2 (golden test) | — | Stronger. |
| SS V2 | Type feasibility spike; compile time per machine size | KEPT | FS V1 (records compile time) | — | "Per machine size" could be restated. |
| SS Q30 | Invariant-driven development | KEPT | FS Q2 | — | |
| RR P1 | Public and internal events; lint for public events unhandled in reachable leaf | KEPT | FS D19, O11 | — | |
| RR P2 | stay target | CHANGED | FS D17 (target "self") | — | |
| RR P3 | Keyed refs with retain; ensure on attach | KEPT | FS D12, D51 | — | |
| RR P3 | Ref identity derived from input, so id and input cannot disagree ("first input wins" problem) | DROPPED-SILENT | FS O3 keeps "the first accepted input wins" | RESTORE | Silent divergence: a later ensureActor/useActorByRef with a different input gets an actor about different data. Report a diagnostic when a later ensure's input differs from the accepted one (or derive the id from the input). |
| RR P4 | Flow-minted attempt identity | KEPT | FS D33 | — | |
| RR P5 | Commit writes, unknown outcome; flow check rule for leaving a waiting state | KEPT | FS D36, D31; ML 6 (flow check warning) | — | ML 6 warning should appear in FS O11's list. |
| RR P5 | Optional commit declared on a state (start on entry, cancel on exit) | DROPPED-SILENT | — | CONFIRM-DROP | Was optional; writes plus unknown already give every wait an exit. |
| RR P6 | E.X.from for payloads | KEPT | FS D25 | — | |
| RR P7 | restartOn | KEPT | FS O2, D23 | — | |
| RR P8 | Tagged check verdict | KEPT | FS D22, D53 | — | |
| RR P8 | Check rule: schedule-sent event whose every handler may deny with no alternative (silent give-up) | DROPPED-SILENT | — | RESTORE (low) | Catches the "stuck retrying" bug class (RR bug 4); fits the stuck-states warning. |
| RR P9 | Activity lanes in views; activity names unique | KEPT | FS D39, ML 8a | — | |
| RR P9 | s.O.saveTitle.latest for the actor's latest attempt | DROPPED-SILENT | ML 8 ("transactions are not read") | CONFIRM-DROP | Replaced by outcome events; better. |
| RR P10 | KeyValueStore; detect-and-refuse a second same-scope writer | CHANGED | FS O8, D41 (second tab runs without persistence + diagnostic) | — | Preserves the safety half; shared multi-tab persistence is in scope per owner (see final notes). |
| RR P10 | One blob per scope rewrites everything on each capture | DROPPED-SILENT | — | RESTORE (low) | Per-record keys in the KeyValueStore keep captures incremental; matters for multi-tab coordination. Overlaps Persistence inventory. |
| RR smaller | Restore fixture seeds (cache seeding for Stories) | DROPPED-SILENT | FS D42 deletes fixture({ seeds }) | RESTORE (narrow) | Story cache seeding is otherwise only via fixture adapters; overlaps StoriesAndModels inventory. |
| RR smaller | advanceToNextTimer({ name }) | DROPPED-SILENT | — | RESTORE (low) | Deterministic stepping of one schedule among several; needs unique schedule names. |
| RR smaller | Model traversal includes statically known schedule and outcome events | DROPPED-SILENT | FS O9 model takes `events` only | RESTORE | Public-events-only models cannot reach states that only internal events enter (D19 forbids sending them), so models silently under-explore. |
| RR smaller | Public type names Actor<typeof M>, Runtime<typeof App> | KEPT | FS O12 types | — | |
| RR smaller | State tokens expose literal path | CHANGED | FS O1 (State Schema literals), S.X.child | — | Preserved. |
| RR smaller | User switch = new Runtime; expiry as Session state | KEPT | FS O8 | — | |
| RR smaller | placeholder keeps previous page | KEPT | FS O7 | — | |
| RR missing | Infinite lists as a key family with view-side concatenation | CHANGED | FS D54 (paged lanes) | — | Better. |
