# Scope inventory: Resources, Transactions, Streams (operations)

Sources checked: archive/rewrite/{Resources,Transactions,Streams}.plan (their `references/README.md` links point to the archived Dispatch Desk, which illustrates only); new: flow/FlowState.plan (FP), references/design/minimal-library.md (ML), references/design/entity-domain.md (ED, sections 1-9 normative), references/dispatch-desk (DD, reference only; FP says the plan wins). Cross-checked ReactAndHosts O4 and Persistence O4 only where my plans cite them.

Abbreviations: R = Resources, T = Transactions, S = Streams. "Plain" = an operation not registered in an entity domain (ED covers domain operations only).

| Archived ref | Commitment (short) | Status | New location or decision | Recommendation | Reason |
|---|---|---|---|---|---|
| R.O1 | resource({id,key,lookup,persist?,staleTime?,gcTime?}) inert descriptor | CHANGED | FP O5, D34 (staleTime/gcTime required Duration.Input; key optional) | - | Capability preserved; Q1 closed |
| R.O1 | key projector synchronous (params)=>K | KEPT | FP O5/D30 (named record projector) | - | |
| R.O1 | lookup(params,{signal}) preserves exact A/E/R | KEPT | FP O5, D33 | - | |
| R.O1 | persist defaults false; true opts committed canonical data into Persistence | KEPT | FP O5, O8 | - | |
| R.O1 | Omitting optional fields authorises no freshness/retention defaults | CHANGED | FP D34 (fields required, no defaults) | - | Stronger form |
| R.O1/Q1 | staleTime/gcTime input domain, Infinity acceptance | CHANGED | FP D34 Duration.Input | RESTORE (clarify) | Say whether `Duration.infinity` means never stale / never collected (common TanStack need) and whether zero is legal |
| R.O1 | P/K/A/E/R preserved through descriptor, O, machine, app, Runtime, fixture, Story | KEPT | FP V1 type spike, O5 | - | |
| R.O1 | K tuple form | DROPPED-EXPLICIT | FP D30 named records | CONFIRM-DROP | Better form; grammar/bounds kept |
| R.O1 | K-derived tags | DROPPED-EXPLICIT | FP O5, D30, O15 | CONFIRM-DROP | Partial-record matching per family plus entity targets (Entity.all/where) cover most uses; cross-family "everything for workspace X" now needs one target per family |
| R.O1 | Canonical key grammar, UTF-8 bytes, raw UTF-16 record ordering, no Unicode normalisation, -0 -> 0 | KEPT | FP O5 "archived byte grammar and bounds", O13 port key.ts with byte vectors | - | Incorporated by explicit reference |
| R.O1 | Bounds 16 levels / 256 nodes / 8,192 bytes | KEPT | FP O5 | - | |
| R.O1 | Project, validate, deep-copy and freeze K before ownership/admission/mutation/adapter call; invalid input changes nothing | DROPPED-SILENT | FP only names grammar and bounds | RESTORE | Binding failure-before-mutation guarantee; one sentence in O5 |
| R.O1 | Reject getters/toJSON/accessors/classes/cycles/sparse arrays/bigint/symbols/lone surrogates; never run user code | KEPT | FP O5 (grammar), O13 port with vectors | - | Part of the ported algorithm; state it in V4 |
| R.O1 | Failures name exact path; structural vs domain failures distinct | CHANGED | FP O10 diagnostics with path | RESTORE (minor) | Path now a record path; keep the requirement in the key diagnostic |
| R.O1 | Undefined rejected in K | CHANGED | FP O5/D30: undefined properties are absent | - | Deliberate, better for optional filters |
| R.O1 | No custom hash/equality/second key | KEPT | FP O5 (one canonical form, D3) | - | Implicit; fine |
| R.O1 | Every result-changing discriminator (tenant, account, permission, session) belongs in K; Runtime partitioning never replaces it | DROPPED-SILENT | FP O8 "a different user is a new Runtime" partly contradicts | RESTORE | Security/containment: two principals or permission levels in one Runtime would otherwise share cache entries; state as an authoring rule and add a doc/lint note |
| R.O1 | Secrets in K are observable unless hashed/replaced before projection | DROPPED-SILENT | FP D48 covers Schema fields, not keys | RESTORE | Keys land in traces/persistence; say key fields honour the sensitive annotation or must be hashed |
| R.O1 | K never reconstructs executable P or authorises execution | DROPPED-SILENT | - | RESTORE | Needed for persisted/hydrated entries (and SSR): a key-only entry cannot run a lookup |
| R.O1 | Equal key bytes share identity per descriptor per Runtime | KEPT | FP O5 "one canonical store per Runtime" | - | |
| R.O1 | Running generation keeps pinned P; automatic generations use oldest live binding; refetch uses caller P | KEPT | FP O5 kept list | - | |
| R.O1 | ResourceFamily methods key/getData/getState/lookup/subscribe/refetch/setData/cancel | CHANGED | FP O5 (O.x.lookup/refetch/subscribe/setData/invalidate/clear in declarations), D39 deletes readers | CONFIRM-DROP (readers) | Readers replaced by lanes and descriptor.get |
| R.O1 | ResourceState closed union missing/pending/ready/refreshing/failure/defect/interrupted with retention rules | CHANGED | FP D39 lanes (_tag union, data, pending, stale); tags appear only in DD QueueList.tsx | RESTORE | Plan must enumerate lane tags and rules: Refreshing always carries data; Failure/Defect/Interrupted may retain previous data; absent = undefined lane |
| R.O1 | Generation number exposed in state | DROPPED-EXPLICIT | FP D38 (revisions to inspection) | CONFIRM-DROP | Mechanism, inspection keeps it |
| R.O1 | Finite mappers success/failure/defect/interrupt; continuing value/failure/defect/interrupt | KEPT | FP O5, D31, D32 | - | Plus unknown, complete |
| R.O1 | Mappers receive no Exit/Cause/state/lifecycle | KEPT | ML 5 `.from(value)` | - | |
| R.O1 | Typed failure mapper unavailable when E is never | DROPPED-SILENT | - | RESTORE (type rule) | Cheap type-level guard against dead outcome edges; add to V1 negatives |
| R.O1 | Planned cancel/release/supersession never invokes an authored interrupt mapper | DROPPED-SILENT | - | RESTORE | High: leaving a state that owns an activity, or a key change, must not deliver Interrupted events to the machine; only adapter-side interruption maps |
| R.O1 | Placeholder is descriptor metadata, creates no canonical write | CHANGED | ML 8 item 3 / 8a (activity placeholder function, never persisted) | - | Better form, purity kept |
| R.O2 | One canonical truth per Runtime; equal descriptor/K shares data and lookup generations (request dedup) | KEPT | FP O5 kept list | - | Dedup implied by shared generations; say "concurrent equal-key lookups share one in-flight request" explicitly in V4 |
| R.O2 | Separate Runtimes, SSR requests, tests, browser roots isolated | KEPT | FP O5, O7 per-request Runtime | - | |
| R.O2 | Actor release cannot change another actor's lifetime or preview | CHANGED | FP D36 shared optimistic | - | Lifetime part kept (O3); preview part intentionally shared |
| R.O2 | Readers and unreturned plans passive: no insert, lease, freshness change, collection, revision, work | KEPT | FP O7 descriptor.get passive; ML 8 "passive reads that insert nothing" | - | |
| R.O2 | Any actor may read an entry it never materialised | KEPT | FP O7 descriptor.get(s,keyInput) | - | |
| R.O2 | Unbound reads and updaters use committed base; actor reads add own preview layers | CHANGED | FP D36 (optimistic seen by every reader) | - | Intentional; see T.O3 rows |
| R.O2 | Canonical revision advanced by base/generation/freshness/invalidation/hydration/eviction | DROPPED-EXPLICIT | FP D38 (revisions to inspection), O7 one versioned store | CONFIRM-DROP | Mechanism; one versioned store remains |
| R.O2 | Other actors observe an actor-initiated write only after initiating snapshot publishes, its record is accepted, ack settles | KEPT | FP O2 step 5 (one committed cut of actor and store), O7 | - | |
| R.O2 | Stale/unrelated revision facts publish nothing; skipped revisions reread current | KEPT | FP O7 one versioned store, useView tear-free | - | |
| R.O2 | Only adjacent projection-only facts coalesce; terminal/lifecycle/mapped facts keep boundaries | DROPPED-SILENT | - | RESTORE (minor) | Ordering guarantee for evidence and Stories; one line in O2 or O5 |
| R.O2 | Capture never sees a half-published actor/store commit | KEPT | FP O8 consistent capture | - | |
| R.O3 | Lookup/refetch finite, only from accepted event actions | KEPT | FP O5 kept list | - | |
| R.O3 | Subscribe is continuing ownership from activities (or onMemory) | CHANGED | FP O2 activities (onMemory deleted O15) | - | Equivalent |
| R.O3 | Activation, reads, timers, memory revisions, completion never admit finite work | KEPT | FP O5 "finite work only from accepted actions" | - | |
| R.O3 | Fresh lookup may settle without adapter call; stale/missing/invalidated lookup starts a generation; refetch forces | DROPPED-SILENT | FP O5 lists lookup and refetch but not their difference | RESTORE | Core freshness semantics (what staleTime does) unstated for plain resources |
| R.O3 | Key-only hydrated entries stay passive until live P exists | DROPPED-SILENT | - | RESTORE | Needed by persisted resources (persist:true) and by SSR hydration |
| R.O3 | Releasing a binding removes its projection, never deletes canonical data; collection by gcTime policy; no unconditional idle retention | CHANGED | FP D34 required gcTime; ED 5.5 Holding (domain answers: gcTime after last subscriber) | RESTORE | State the plain-resource holding rule: entry held by subscriptions, in-flight lookups and live optimistic writes; collected gcTime after the last |
| R.O3 | Continuing identity = slot, kind, descriptor, K; equal keeps work and P; changed releases once; false/null/exit releases | KEPT | FP O2 activities; ML 8 lane undefined when key falsy; `when` | - | |
| R.O3 | Shared lookup work interrupted only at its final owner; first/middle owner release leaves others and data intact | DROPPED-SILENT | - | RESTORE | High: with dedup, one actor leaving must not abort another actor's lookup |
| R.O3 | Activation maps existing canonical value once; later replacements map value; equal values and preview-only changes emit no value event | DROPPED-SILENT | - | RESTORE | High: now that optimistic writes are shared (D36), must say whether an optimistic change fires `value` outcomes into other machines (archived: no) and that equal values are silent |
| R.O3 | Every finite occurrence settles once, including equal-value or fresh-cache success | DROPPED-SILENT | - | RESTORE | A lookup action on fresh data must still deliver its success outcome, or machines wait forever |
| R.O3 | Outcome classification: adapter interruption, typed failure, defect, release failure distinct | KEPT | FP O5 outcomes, O10 classification | - | |
| R.O3 | Accepted cancel(K) interrupts this actor's finite occurrences for K, suppresses late result, changes no data | DROPPED-EXPLICIT | ML 8 table "resource .cancel lost", D39; but FP O5 still lists cancel among actions generically | RESTORE (clarify) | Conflict between ML and FP O5. Also unstated: what happens to a finite lookup started by an action when the actor leaves that state (commits survive; lookups?) |
| R.O3 | Completion fence: incarnation, kind, descriptor, K, ordinal, generation; requested interruption alone is no fence | KEPT | FP O5 "generation fencing of late results", D7 | - | |
| R.O3 | Late results/finalizers cannot mutate current data, collected entries, replacement bindings, other actors | KEPT | FP O5, D7 | - | |
| R.O3 | Safe-integer headroom for terminal publication and cleanup; exhaustion fails before mutation | KEPT | FP O3 "capacity and headroom" | - | |
| R.O3 | Offline never blocks explicit lookup/subscribe/refetch or cancels work | KEPT | FP O5 kept list | - | |
| R.O3 | Reconnect/focus refresh only active subscriptions that are stale/missing with no in-flight generation | DROPPED-SILENT | ED 5.2/5.3 mention focus refetch and reconnect for domain answers only | RESTORE | User-visible (refetch on focus/reconnect); specify for plain resources, the trigger source (a service/Layer the host supplies) and Story control |
| R.O3 | After-refresh events schedule after settlement; failure waits one interval | CHANGED | FP D23 schedules (DD queue poll) | CONFIRM-DROP | Schedules express polling and backoff better |
| R.O3 | No automatic retry, poll helper, or paused-resource policy | KEPT | FP O5 "no automatic retry"; D23 schedules | - | Make "no automatic retry" explicitly cover lookups, not only commits |
| R.O4 | Lookup success installs canonical data | KEPT | FP O5 store | - | |
| R.O4 | Transaction/stream output canonical only through explicit setData | CHANGED | ML 6 writes; ED listen `.as`, write `.one` (domain declares meaning) | - | Domain declaration is the explicit form |
| R.O4 | setData(K, A or updater of committed A); undefined declines | CHANGED | ML 6 setData(({value}) => ({key, data: fn})) | RESTORE (minor) | Keep "updater returning undefined declines" and "updater reads committed base" explicitly |
| R.O4 | Accepted write fences older lookup generations, clears failure/stale metadata | DROPPED-SILENT | FP O5 "generation fencing" is generic | RESTORE | A lookup that started before a setData must not overwrite it when it lands late |
| R.O4 | Equal writes may refresh freshness; only effective value changes map value | DROPPED-SILENT | - | RESTORE | Merge with the equal-value rule above |
| R.O4 | Completion writes publish before the mapped outcome | DROPPED-SILENT | ED 5.5 Publication (domain only) | RESTORE | High: a machine handling Saved must see the cache already updated; ordering within one cut |
| R.O4 | Invalidate/clear targets exact, tags, families | CHANGED | FP O5/D30 family + partial key record | - | See tags row |
| R.O4 | Validate all targets, expand against one pre-mutation index, stable order, first-seen dedup, reject whole action above 256 or invalid | KEPT | FP O5 kept list | - | |
| R.O4 | Missing exact targets / zero matches are successful no-ops | DROPPED-SILENT | - | RESTORE (minor) | Determines whether an invalidate of an empty cache is an issue |
| R.O4 | Invalidate retains data, marks stale, changes no running generation, starts no lookup directly | DROPPED-SILENT | ED 5.3 (domain: subscribed answers refetch, others stale) | RESTORE | High: say what invalidate does for plain resources; the ML 6 example assumes the active list refetches |
| R.O4 | Clear fences work, removes data/metadata/optimistic layers, interrupts per final owner; surviving subscribers see absent and reacquire | DROPPED-SILENT | ML 8 keeps `.clear()` "for removing a deleted record" | RESTORE | Semantics unstated |
| R.O4 | Each nonempty action publishes one atomic revision; no partial prefix | KEPT | FP O5, O2 step 4-5 | - | |
| R.O4 | Boot/SSR/fixture writes via construction-owned private authority, no public writer | DROPPED-EXPLICIT | FP D50 (SSR hydration non-goal); fixtures now Layers (D42) | RESTORE (SSR) | Owner put SSR hydration in scope; reuse this as the server-to-client seeding boundary. Fixture half: CONFIRM-DROP (Layers) |
| R.O4 | Runtime disposal, not a cache-clear-all escape hatch, owns full removal | KEPT | FP O3 disposal; O5 no whole-runtime target | - | |
| R.D1 | Canonical data and actor work separately owned | KEPT | FP O5 | - | |
| R.D2 | Execution consumes P, readers consume K; only returned plans execute | CHANGED | FP D1 static declarations, D39 | - | |
| R.C1 | No registry, resources.get, bound refs, second cache, read-triggered subscription, retry/seed helpers | KEPT | FP O12 closed routes, D4 | - | |
| R.C2 | No wildcard/whole-runtime invalidate, partial batch, custom hash, cross-runtime sharing, invented defaults, offline gate, implicit promotion | KEPT | FP O5, D34 | - | |
| R.V1 | Type proofs of P/K/A/E/R, lanes, constructor fields, negatives | KEPT | FP V1 | - | |
| R.V1 | Key vectors: grammar, reflection, mutation, byte order, surrogates, each bound; invalid key changes nothing | KEPT | FP V2 (ported vectors), V4 | - | Add "invalid key leaves store/ordinals unchanged" |
| R.V2 | Two-actor sharing, two-Runtime/SSR isolation, passive reads allocate nothing, release keeps truth | DROPPED-SILENT | FP V4 lists none of these | RESTORE | Add to V4 |
| R.V2 | Write/notification/capture interleavings | KEPT | FP V3 one versioned store, V6 capture | - | |
| R.V3 | Fresh/stale/missing/invalidated lookup, pinned P, owner order, equal-value settlement, offline/reconnect/focus | CHANGED | FP V4 "freshness and collection" | RESTORE | Name final-owner, equal-value and focus/reconnect cases |
| R.V3 | Races with cancel/disposal/collection; planned cleanup never calls interrupt mapper; exhaustion | DROPPED-SILENT | FP V4 "fencing" only | RESTORE | |
| R.V4 | Writes vs old generations, updater decline, write-before-outcome; target batches at 256 and 257 | CHANGED | FP V4 key/partial invalidation | RESTORE | Name the 256 bound and write-before-outcome cases |
| R.Q1 | Mapper container, tag/placeholder forms, duration types | CHANGED | FP D31 outcomes, ML 8 placeholder, D34 | - | Closed |
| T.O1 | transaction({id,key?,commit,persist?,concurrency?}) | CHANGED | FP O5, D34 (concurrency required) | - | Q2 closed |
| T.O1 | Omitted key means K=[] | CHANGED | FP O5 empty record | - | |
| T.O1 | commit(params,{signal}) returns Effect, not Promise, not implicit write | KEPT | FP O5, D33 adds attempt | - | |
| T.O1 | No identity getter / reporting callback | DROPPED-EXPLICIT | FP D33 attempt.id | CONFIRM-DROP | Better: Flow-minted idempotency identity |
| T.O1 | Key/getState passive; missing read idle | DROPPED-EXPLICIT | FP D39 (transaction readers deleted) | CONFIRM-DROP | Outcomes become events |
| T.O1 | Commit admitted only by accepted actions; activation/reads/reentry/restore never admit; retry needs a new event | KEPT | FP O5 kept list, O8 no replay | - | |
| T.O1 | States idle/pending/success/failure/defect/interrupted/unknown(reconcileRequired) | CHANGED | FP O5/D31 outcome members incl. unknown | - | Pending per row via lane `pending` |
| T.O1 | No raw Cause, no attempt-history collection on the family | KEPT | FP O5, O11 | - | |
| T.O1 | Mappers return event envelopes; failure unavailable for E=never | CHANGED | FP D31 (exhaustive tag record) | RESTORE (type rule) | Same as R.O1 E=never; also say how an untagged E maps |
| T.O1 | CommitOptions {writes:({value})=>setData[], outcomes} | CHANGED | FP O5/D36 {optimistic?, writes?, outcomes} | - | |
| T.O1 | No completion-side invalidate/clear | DROPPED-EXPLICIT | FP D36 | CONFIRM-DROP | Reason holds (ML 6 save-after-close bug) |
| T.O1 | persist default false; only for independently persistable owner | CHANGED | FP O8 "transactions follow their actor"; O5 still lists persist? | RESTORE (clarify) | O5 and O8 disagree on whether transaction persist exists; say opt-out only |
| T.O2 | Attempts actor-local per descriptor/K; completion authority = incarnation, K, kind, ordinal, generation | KEPT | FP O5 per-occurrence fencing | - | |
| T.O2 | Every admitted occurrence settles once | DROPPED-SILENT | - | RESTORE | One-line binding guarantee (pairs with "every wait has an exit", ML 6) |
| T.O2 | Policy table: reject declines with no ordinal; cancel settles prior then admits; allow keeps layers, only current generation drives projection/route; serialize FIFO, preview at dequeue, cancelled queued never invokes | CHANGED | FP O5 "four policies" named only; ED 5.5 per-record queues (domain) | RESTORE | High: under `allow` which attempts' outcomes reach the machine; whether `reject` produces an issue/outcome; when serialize applies optimistic |
| T.O2 | Concurrency independent per actor and per key; no cross-actor lane | CHANGED | ED 5.5 adds cross-actor per-record queue for predicting domain writes | RESTORE (plain) | Say plain transactions remain per-actor-per-key |
| T.O2 | Cancellation/fencing registered before any adapter execution | KEPT | FP O5 fencing, D7 | - | |
| T.O2 | cancel(K) affects this actor's current occurrences for K | KEPT | FP O5 cancel action; ML editor O.saveTitle.cancel | - | |
| T.O2 | Planned cancel/release/disposal records cleanup without interrupt mapper | CHANGED | ML 6 / FP O5: cancel after invocation fires `unknown`; ED 5.5 queued cancel settles interrupted | RESTORE (clarify) | State which member fires for each cancel point: before invocation -> interrupt (or none?), after -> unknown |
| T.O2 | Finalizers release once in reverse acquisition order | DROPPED-SILENT | - | CONFIRM-DROP | Effect Scope semantics provide it |
| T.O2 | One-based monotonic non-reused ordinals; headroom | KEPT | FP O15 (ordinals kept), O3 | - | |
| T.O2 | Removing/replacing/disposing a binding never creates another attempt | KEPT | FP O5, O3 disposal waits for commits | - | |
| T.O2 | Bounded terminal facts; history only in bounded inspection evidence | KEPT | FP O11 bounded evidence | - | |
| T.O3 | Optimistic layer actor-local | DROPPED-EXPLICIT | FP D36 | CONFIRM-DROP | Owner-agreed; shared is the TanStack expectation |
| T.O3 | Ordered layers; failure/defect removes only its layer and replays remaining in order | CHANGED | ML 6 revert; ED 5.1 replay (domain only) | RESTORE | Plain optimistic writes need the replay rule, or reverting one of two stacked writes loses the other |
| T.O3 | Success promotes write atomically before mapped outcomes | DROPPED-SILENT | - | RESTORE | Same as write-before-outcome |
| T.O3 | Compare-and-set on captured base; if base changed keep remote truth, record conflict issue; stale promotion never overwrites newer base | DROPPED-SILENT | ML 6 says only "a revert never overwrites newer data"; ED 5.5 ordering (domain only) | RESTORE | Plain `writes` setData on settlement can overwrite data from a lookup that started later; adopt ED's request-start ordering rule or CAS for plain writes |
| T.O3 | Interrupted never-invoked work removes its layer | DROPPED-SILENT | ED 5.5 (domain) | RESTORE (minor) | Fold into a plain-resource ending table |
| T.O3 | Writes validate as a batch; invalid prefix publishes nothing | KEPT | FP O2 step 4 | - | |
| T.O3 | Equal canonical value still settles occurrence once | DROPPED-SILENT | - | RESTORE | Merge with settle-once |
| T.O4 | Optimistic on unknown | CHANGED | FP O5 "stay pending on unknown" | RESTORE | How a pending-on-unknown optimistic write ends for a plain resource is unstated (ED uses forced repair); without it the lane stays pending forever |
| T.O4 | Adapter owns durable journal of remote identity, acknowledged before irreversible dispatch | CHANGED | FP D33 attempt.id minted and persisted with the attempt | RESTORE | High: say when attempt.id is durable relative to adapter invocation (persist ack before invoke for persisted actors, or document that the adapter must journal); a coalesced persistence write is not acknowledgment |
| T.O4 | Invoked adapter counts as possibly dispatched; cancel after invocation -> unknown; fence late publication | KEPT | FP O5 kept list | - | |
| T.O4 | Never-invoked queued work settles interrupted | KEPT | ED 5.5 (domain); FP O5 invocation boundary | - | State for plain too |
| T.O4 | No remote rollback claimed; preview removal cannot reverse remote effect | KEPT | FP D7, O5 | - | |
| T.O4 | Journal independent of Runtime Persistence; no-provider/persist-false remain valid | CHANGED | FP D33 | RESTORE (clarify) | Non-persisted Runtimes still need the reconciliation story |
| T.O4 | Reconciliation reuses identity; not a new request or retry | KEPT | FP O5, D33 | - | |
| T.O4 | Compensation is a separate explicit operation; no outbox/saga/rollback API | DROPPED-SILENT | - | CONFIRM-DROP | Falls out of "no automatic retry" and workflow in machines |
| T.O4 | Restore: pending remote work -> unknown unless evidence excludes invocation, incl. after capture | KEPT | FP O8 "pending remote commits restore as unknown" | - | |
| T.O4 | Pending local (never invoked) occurrences restore interrupted, no replay | DROPPED-SILENT | - | RESTORE (minor) | |
| T.O4 | K never reconstructs P on restore | DROPPED-SILENT | - | RESTORE | See R.O1 |
| T.D1-D3 | Concurrency per actor/key; preview vs truth authority; app-owned journal | CHANGED | FP D34, D36, D33 | - | Covered by rows above |
| T.C1 | No scope/lane, registry, retry helper, cross-actor scheduler, terminal registry, raw Cause | CHANGED | FP O12; ED adds per-record queue (cross-actor lane) by design | - | Amendment explicit in ED 5.5 |
| T.C2 | persist never makes an actor durable; never serialize executable work; no reversal claims | KEPT | FP O8 | - | |
| T.V1 | Type proofs, negatives (wrong option containers, Result-returning mapper) | KEPT | FP V1 | - | |
| T.V2 | Concurrency x equal/different keys x two actors; races vs disposal/new incarnation/exhaustion | CHANGED | FP V4 "four concurrency policies" | RESTORE | Name race and two-actor cases |
| T.V3 | Stacked previews, rollback replay, CAS conflict | CHANGED | FP V4 "optimistic writes and their revert" | RESTORE | Add stacked-revert and late-overwrite cases |
| T.V4 | Remote boundary: journal ack gates dispatch; crash after capture; no new request | CHANGED | FP V4 "unknown and attempt reuse", V6 | RESTORE | Add attempt.id durability-before-invocation and crash cases |
| T.Q2 | Omitted concurrency policy | CHANGED | FP D34 required | - | Closed |
| S.O1 | stream({id,key,subscribe,persist?}) | CHANGED | FP O5 (key optional), D35 Stream return | - | Q1 closed |
| S.O1 | Stream is an actor-owned session, not a store entry; no cross-actor dedup | KEPT | FP O5 kept list, D? (O15) | RESTORE (clarify) | ML 8/FP O7 say descriptor.get peeks a "stream cache entry", which presumes a shared entry; define which session `get` reads |
| S.O1 | No stream cancel, getData, registry, occurrence handle | KEPT | FP D39 | - | |
| S.O1 | States idle/running/complete/failure/defect/interrupted; complete distinct from interrupted | CHANGED | FP D39 lanes | RESTORE | Enumerate stream lane tags (Running/Complete/Failure/Defect/Interrupted) and data retention after terminal |
| S.O1 | hasValue and emissionCount | CHANGED | lane data (undefined when absent) | CONFIRM-DROP (count) | data undefined covers hasValue only if V excludes undefined; say so |
| S.O1 | Mappers value/complete/failure/defect/interrupt; no Cause | KEPT | FP O5, D31 | - | |
| S.O1 | persist retains latest/terminal/generation/declaration/key for durable owner only | CHANGED | FP O8 follows actor; DD opt-out persist:false | - | |
| S.O2 | Continuing identity slot/kind/descriptor/K; equal keeps generation and P; changed releases once | KEPT | FP O2 activities | - | |
| S.O2 | Second distinct live declaration in one actor for the same descriptor/K rejects without disturbing existing work | DROPPED-SILENT | - | RESTORE | Two activities over one session would duplicate connections; static error where provable, runtime issue otherwise |
| S.O2 | Different actors stay independent for equal descriptor/K | KEPT | FP O5 per-actor sessions | - | |
| S.O2 | Planned close/release has no mapped outcome, never calls interrupt mapper | DROPPED-SILENT | - | RESTORE | Same as R.O1 planned-cleanup row |
| S.O2 | Cleanup defects record issues without rolling back published transitions | DROPPED-SILENT | - | RESTORE (minor) | |
| S.O2 | Emission updates latest projection; emissions create no finite occurrences | KEPT | FP O5 latest-value projection | - | |
| S.O2 | Slow readers skip intermediate values; adjacent projection-only updates coalesce; no history/replay | KEPT | FP O5 "no replay" | - | |
| S.O2 | No pressure options; app-authored dropping in the stream program | DROPPED-SILENT | - | RESTORE | High: with `value` mapped to events and a bounded mailbox (FP O3 AdmissionOverloaded), say what happens when a stream outpaces turns (pull one emission per turn / coalesce pending value events / issue) |
| S.O2 | Projection-only publication evaluates no transition, guard or action | KEPT | FP O7 lanes stored in snapshot | - | Implicit; one line helps |
| S.O2 | Emissions change machine state only via mapped events or explicit writes | KEPT | FP D29, ED listen `.as` | - | |
| S.O2 | Fence before emission/terminal publication; stale generation facts ignored | KEPT | FP O5 fencing | - | |
| S.O2 | Terminal settles once; terminal streams never restart implicitly | DROPPED-SILENT | - | RESTORE | Say a completed activity stays complete until its identity changes or its state is re-entered |
| S.O2 | Count/generation exhaustion fails before publication | KEPT | FP O3 headroom | - | |
| S.O3 | Never persist fibers/scopes/transports/buffers/history; stream never makes actor durable | KEPT | FP O8, O15 Streams "persistence without running work" | - | |
| S.O3 | Hydration keeps latest/terminal without replay; drain pending outcomes, then rematerialise active declaration from live P in a new generation; terminal does not restart; missing P fails closed | CHANGED | FP O8 "restore never replays"; O15 kept | RESTORE (minor) | Ordering "drain outcomes before rematerialising" and "terminal does not restart after restore" not restated |
| S.D1/D2 | Sessions not shared entries; latest without history | KEPT | FP O5 | - | |
| S.C1 | No subscribeMany/each, unsubscribe handle, child-actor equivalent, terminal restart, K->P inversion | KEPT | FP D1, D24 | - | |
| S.C2 | Planned release is cleanup; phased remote work needs an actor | KEPT | FP O5 | - | |
| S.V1 | Type proofs | KEPT | FP V1 | - | |
| S.V2 | Duplicate declaration, zero/one/many emissions, slow reader, release paths, races | CHANGED | FP V4 "stream sessions" | RESTORE | Name the cases |
| S.V3 | Durable projection and fresh-session hydration | CHANGED | FP V6 | RESTORE (minor) | Add stream restore cases |
| S.Q1 | Adapter return and mapper container | CHANGED | FP D35, D31 | - | Closed |
