# Inventory: archived Persistence.plan and PackageContract.plan

Sources read: workflow/plans/archive/rewrite/Persistence.plan (O1-O5, D1-D2, C1-C2, V1-V5; no
questions section), workflow/plans/archive/rewrite/PackageContract.plan (O1-O4, D1-D2, C1-C3,
V1-V4; no questions section), the linked archive references (references/app/persistence.ts,
references/README.md, api-reference.ts) and explorations/reference-review.md (the only archive
text on multi-tab beyond the two Plans). Compared against workflow/plans/flow/FlowState.plan
(O1-O15, D1-D54, C1-C4, V1-V10, Q1-Q3), references/design/minimal-library.md (section 10 and the
"What we lose" table), references/design/entity-domain.md (persistence paragraph, section 5/7),
and references/dispatch-desk/app/persistence.ts, setup.ts, host.ts, features/Tickets/ticket.operations.ts.
Also checked packages/flow-state-rewrite/package.json (the "package shell" O13 keeps).

Abbreviations: FS = FlowState.plan; ML = minimal-library.md; ED = entity-domain.md; DD = dispatch-desk.

## Part A: Persistence.plan

| Archived ref | Commitment (short) | Status | New location or decision | Recommendation | Reason |
| --- | --- | --- | --- | --- | --- |
| P.O1 | Persistence is optional; no provider means no persistence I/O | KEPT | FS O3 `persistence?`; DD setup.ts has none | - | Optional field on runtimeSetup. |
| P.O1 | Persistence options given but no storage service: archived made storage a required field | DROPPED-SILENT | FS O8 puts KeyValueStore "in services" | RESTORE | State that `persistence` without a KeyValueStore in the Layer is a type error (requirement in R), never a silent no-op. |
| P.O1 | construct() synchronous and inert; no provider I/O at construction | KEPT | FS O3 "construct() is synchronous and inert"; DD host.ts "inert: no storage" | - | |
| P.O1 | Web Storage and IndexedDB adapters normalise typed read/write/remove failures, cancellation and lifetime | CHANGED | FS D41: Effect KeyValueStore (DD uses KeyValueStore.layerStorage(() => localStorage)) | RESTORE (partial) | Web Storage is covered by Effect. IndexedDB (large quotas, async, off-main-thread) has no named path in the new docs; verify Effect 4.0.5 ships an IndexedDB KeyValueStore layer, otherwise document/ship one. localStorage alone (about 5 MB, synchronous) is not enough for entity record stores. |
| P.O1 | Default codec rejects unsupported values without stringification or silent loss | CHANGED | FS O8 / ML 10: memory encoded with definition Schemas; resource data via `result` Schema (DD ticket.operations.ts) | RESTORE | Keep the guarantee: a value that fails Schema encode is a typed CodecFailure, never lossy coercion or `JSON.stringify` fallback. |
| P.O1 | Application codec validates opaque domain values synchronously and purely | CHANGED | FS D41 (definition Schemas) | RESTORE | Effect 4 Schemas can have effectful/service-requiring transformations. Require persisted Schemas (Memory, resource `result`) to be synchronous with no service requirements (type error otherwise), so restore stays detached before services (FS O8 kept rule). |
| P.O1 | Flow validates envelopes, identities, persistenceVersion, plan compatibility, bounds and executable-work rejection | CHANGED | FS O8 "restore validates and prepares detached data before services" (generic) | RESTORE | Name what is validated: app id, scope, version, machine/state/event/ref identities against the receiving app, bounds. Without it a deploy that renames a state has undefined restore behaviour. |
| P.O1 | Persisted bytes use the shared structural codec and byte bounds (InspectionAndArtifacts O2) | DROPPED-SILENT | FS O11 applies the shared bounded codec only to trace artifacts | RESTORE | One bounded codec for persisted records too (one-line statement in O8); protects against oversized/hostile storage contents. |
| P.O1 | Actor refs and resource/transaction/stream declarations opt in separately with persist true | CHANGED | FS O8 / ML 10: actorRef and resource persist select; "transactions and streams follow their actor"; but FS O5 still lists `persist?` on transaction() and stream(), and DD uses `persist: false` on a stream | RESTORE (clarify) | Internal inconsistency. Decide: transaction/stream `persist` is opt-out only (default follows actor) or delete the field. Either is fine; it must be stated. |
| P.O1 | Every persist default is false | DROPPED-SILENT | not stated | RESTORE | One line: nothing is durable unless declared. Binding safety default (and the "follows its actor" default for streams needs a stated direction). |
| P.O1 | Durable operations never make their actor durable implicitly | DROPPED-SILENT | not stated | RESTORE | One line: resource persist never selects actors; actor selection comes only from actorRef persist. |
| P.O1 | Exclusion-only identity filter (kind, identity, owning actor, canonical K) | DROPPED-EXPLICIT | FS O15 Persistence "deleted: ... filter"; D41; archived SurfaceSimplification D21 | CONFIRM-DROP | Per-declaration flags are the single selection source. Least-sure item: per-instance exclusion (e.g. never persist a specific sensitive workspace) is lost; can be revisited. |
| P.O1 | Fixtures and story.machine inherit no browser/session storage by default | DROPPED-SILENT | FS O9 silent; Stories run on the production Runtime with the setup's Layer | RESTORE | Stories must not read/write real localStorage. Rule: Stories and story.machine run with an in-memory KeyValueStore (or no persistence) unless the fixture provides one; determinism (FS O9 V7) depends on it. |
| P.O1 | Provider is one logical record per Runtime and scope | CHANGED | KeyValueStore is multi-key; FS/ML do not define record layout | RESTORE | Consistent-cut capture (kept) is meaningless if restore can read a torn mix of keys. Specify: each capture commits atomically per scope (one record, or keyed records plus an atomic commit marker/manifest written last). |
| P.O1 | Provider is not an Implementation, AppPlan input or second Runtime | DROPPED-SILENT | Implementation deleted (FS D15) | CONFIRM-DROP | Ceremony tied to deleted surfaces. |
| P.O1 | Not a cross-tab synchronizer, conflict resolver or same-scope writer protocol; cross-tab coordination unspecified | CHANGED | FS O8 / ML 10: second tab on the same scope runs without persistence and reports a diagnostic; FS D50 lists multi-tab shared persistence as a non-goal | RESTORE | Owner direction: multi-tab shared persistence is in scope. The archive gives nothing to reuse here except the exclusion; see final report section 4 for constraints a design must keep. The new detect-and-refuse rule is an improvement and should stay as the fallback. |
| P.O1 | Codec never does storage I/O, runs Effects, creates actors, resumes work or decodes a full boot payload | CHANGED | Schemas replace codec | RESTORE | Covered by the "synchronous, no-requirement Schemas" row above. |
| P.O1 | PersistenceStorage read/write/remove exact signatures | DROPPED-EXPLICIT | FS D41, O15 | CONFIRM-DROP | KeyValueStore owns the concept (FS D6). |
| P.O1 | Persistence fields {storage, scope, codec, filter?} | CHANGED | FS O8 `persistence: { scope, version }` | CONFIRM-DROP | Equivalent or better; version moved from app to options (archive SurfaceSimplification D21 already did this). |
| P.O1 | PersistenceCodec encode/decode | DROPPED-EXPLICIT | FS D41 | CONFIRM-DROP | Definition Schemas replace it (with the purity restore above). |
| P.O1 | Constructors webStorage, indexedDbStorage, persistence() | DROPPED-EXPLICIT | FS D41, O15 | CONFIRM-DROP | KeyValueStore layers replace them (subject to the IndexedDB check). |
| P.O1 | Options closed: no extra fields or overloads | KEPT | FS O12 "no alias, overload or adapter" | - | Should also be a runtime rejection; see PackageContract O3 row on unknown config fields. |
| P.O1 | PersistenceValue is bounded canonical JSON | DROPPED-SILENT | - | RESTORE | Folded into the shared bounded codec row. |
| P.O1 | PersistenceSlot / PersistenceEntry expose only identity metadata | DROPPED-EXPLICIT | deleted with filter (FS O15) | CONFIRM-DROP | No filter, no entry type. |
| P.O1 / O5 | Canonical diagnostics: StorageFailure, CodecFailure, IdentityVersionMismatch, MalformedData, ConcurrentCapture, NonDurableContextProvider | CHANGED | FS O8 keeps NonDurableContextProvider and ConcurrentCapture; FS O10 regenerates the vocabulary | RESTORE | Add StorageFailure, CodecFailure, IdentityVersionMismatch (or VersionMismatch), MalformedData to the regenerated vocabulary with remediation. These are the corruption/version/quota cases users hit. |
| P.O1 | FlowPersistenceError terminal host compatibility error | DROPPED-EXPLICIT | FS D10 (one FlowError) | CONFIRM-DROP | FlowError with a closed code replaces it. |
| P.O1 / O5 | Raw Cause only at readiness/disposal boundaries, never in persisted carriers | DROPPED-SILENT | - | RESTORE | Security/containment: stack traces, server error bodies and secrets must not be written into storage. One line in O8. |
| P.O2 | Restore validates against the receiving compiled app (app id, version, identities, exact refs) | CHANGED | FS O8 generic "validates" | RESTORE | See validation row; also needed for lazy features (persisted actors of not-yet-loaded machines). |
| P.O2 | No generic identity migration, assertion-cast input, alias or public mutable hydration | DROPPED-SILENT | - | RESTORE (decide) | Neither design has migration. Must state the version-mismatch policy. Recommend: mismatched or unknown-identity records are discarded per scope with an IdentityVersionMismatch diagnostic and the Runtime starts fresh (readiness does not fail), while Schema-level decode transformations are the supported way to accept old memory shapes. Archive was silent on discard vs fail. |
| P.O2 | K never reconstructs P, supplies capabilities or authorises execution | CHANGED | Activities recompute params from declarations (FS O2) | CONFIRM-DROP | P is always recomputed from memory/context in the new model; key-to-input inversion cannot arise. |
| P.O2 | Flow structural validation and app value validation remain distinct | DROPPED-SILENT | - | CONFIRM-DROP | Mechanism; user-visible part is the distinct codes (restored above). |
| P.O2 | Readiness order 1-5: validate detached data, acquire services, install actors/facts/one store, ensure initial actors and resolve refs, seal/baseline/activate/expose | KEPT | FS O3 ready() order; O8 "restore validates and prepares detached data before services"; O15 ApplicationsAndActors kept bootstrap order | - | |
| P.O2 | Failed/incomplete bootstrap exposes no actor, external work or handle and releases ownership | KEPT | FS O3 (shared bootstrap, rollback in reverse order); O15 | - | |
| P.O2 | Restore never runs fresh-memory init or replays input | KEPT | FS O1 initial "never on restore"; O8 | - | |
| P.O2 | Retain committed bases, generation fences, overlay provenance, stale-completion facts, observed revisions, exact bindings | DROPPED-SILENT | - | RESTORE | Especially: what happens to optimistic writes (FS D36, now shared and seen by every reader) pending at capture. Rule: persist the confirmed base only (as ED already says for entities); a restored pending commit's optimistic write is either reapplied as pending with its unknown commit or dropped, stated explicitly. |
| P.O2 | Context baselines derive from restored providers, never serialized selected values | KEPT (partial) | FS O3 silent baselines; O8 closed context graph | RESTORE (one line) | FS O7 snapshot now includes `context`; say explicitly that snapshot context is never persisted. |
| P.O2 | Durable actors need stable actorRef(machine,id,{persist:true}) | KEPT | FS O3, O8; DD editor.ref.ts | - | |
| P.O2 | ensureActor owns restore-or-create; createActor fresh and local | KEPT | FS O3 | - | |
| P.O2 | A restored stable actor stays Runtime-owned and captureable without another ensureActor | DROPPED-SILENT | FS O3 lifetime rules (Runtime / retain / disposeActor) don't mention restored actors | RESTORE | Specify: restored durable actors are installed and active at ready(); ensureActor on a restored ref returns it and ignores input (restored counts as first accepted input); the retain clock of a restored-but-unused actor starts at ready. |
| P.O2 | Wire identity uses length-prefixed UTF-8 segments, never Buffer/UTF-16 | KEPT | FS O1 names, D9 "actor ref wire form" | - | |
| P.O2 | Capture membership: registered non-disposed durable actors and their transitive provider closure; exclude local, tombstones, disposed, child/dynamic | KEPT (partial) | FS O8 closure; children and dynamic actors deleted (D24) | RESTORE (one line) | Say what disposeActor and retain expiry do to a persisted record (recommend: removed from the next capture). Users need to know whether closing an editor forgets its draft. |
| P.O2 | Suspended durable actors are captured | CHANGED | FS D16 deletes suspension | CONFIRM-DROP | No suspended state remains. |
| P.O2 | Operation durability never changes actor selection | DROPPED-SILENT | - | RESTORE | Same as the "never implicit" row. |
| P.O2 | Actor facts: ref, machine, state, memory, bindings, operation facts, issues, referenced refs, observed revisions | KEPT (partial) | FS O8: memory via Schemas; state/memory implied | RESTORE (list) | Issues and observed revisions not mentioned; list the persisted fact set in O8. |
| P.O2 | Private durable facts: finite cursors, timer due/consumed activation facts, pending mapped outcomes | CHANGED | Timers became schedules (FS D23); restore semantics for schedules unstated | RESTORE | Decide and state: on restore a schedule keeps its due time (fires at once if overdue) or restarts from entry. The autosave debounce and lock backoff in DD depend on it. |
| P.O2 | Never persist mailboxes, commands, fibers, scopes, callbacks, services, sessions, transports, buffered emissions, executable work | KEPT (partial) | FS O8 "never replays input, initial, events or finite work" | RESTORE (one line) | State that admitted but unprocessed mailbox events are not persisted (lost on reload), so authors don't expect them. |
| P.O2 | Resource data is one canonical base, not actor-private copies | KEPT | FS O5 one store; D29; ED persistence paragraph | - | |
| P.O3 | Capture reads the canonical store once and published actor state atomically; actor revisions no newer than store | KEPT | FS O8 "one consistent actor and store cut"; O2 one committed cut; O7 one versioned store | - | |
| P.O3 | Capture between completed publications; no public barrier API | KEPT | FS O8; O2 | - | |
| P.O3 | Closed context propagation; exact provider refs and revisions | KEPT | FS O8 "closed durable context graph" | - | |
| P.O3 | Reject mixed cuts, newer revisions, closure changes, orphan/partial payloads, duplicate bases, context overrides | KEPT (summary) | FS O8 | - | Test-level detail moves to V6. |
| P.O3 | Context debt gives retryable ConcurrentCapture, never stale/partial capture | KEPT | FS O8 "ConcurrentCapture retryable" | RESTORE (one line) | Say who retries: the Runtime retries at the next settled cut; it is not a user-facing failure. |
| P.O3 | Capture performs no external work, emits no context event, mutates no Runtime truth | DROPPED-SILENT | - | RESTORE | Binding guarantee (D7 spirit); one line. |
| P.O3 | Non-durable required provider fails the whole consumer closure with terminal NonDurableContextProvider; never promote/substitute/omit | KEPT | FS O8; O11 flow check "persisted consumers of non-persisted providers"; DD persistence.ts | - | Static check is an improvement. |
| P.O3 | Diagnostic names consumer id, provider id, provider machine and every failing contextBindings.<key>; multiple failures all reported | CHANGED | contextBindings deleted (FS D12, D14); content unstated | RESTORE | Keep the content with the new path (ref/app-default `context.<key>`); multiple invalid bindings must all be reported. |
| P.O3 | Remediation names actorRef(provider,id) and ensureActor; never ID-bearing createActor/substitution | KEPT (generic) | FS O10 "every code has actionable remediation" | - | Remediation text becomes "mark the provider ref persist: true". |
| P.O4 | One canonical store; projections from refs and store truth; providers before consumers | KEPT | FS O3, O8 | - | |
| P.O4 | Silent derived-context baseline; no manufactured onContext events | KEPT | FS O2 "first selection is silent"; O3 | - | |
| P.O4 | Drain pending mapped outcomes before rematerialising continuing declarations | DROPPED-SILENT | - | RESTORE | Ordering guarantee; also defines when a restored commit's `unknown` outcome event is delivered. |
| P.O4 | Baseline installed before activity reconciliation or handle escape | KEPT | FS O3 | - | |
| P.O4 | In-flight resource execution never resumes | KEPT | FS O8 "never replays ... finite work" | - | |
| P.O4 | Key-only (unsubscribed) restored entries stay passive until a live binding | DROPPED-SILENT | - | RESTORE | Restoring a persisted cache must not trigger fetches by itself. |
| P.O4 | Pinned P; oldest live binding for automatic refetch; caller P for refetch | KEPT | FS O5 kept list | - | |
| P.O4 | Restored collection follows descriptor policy, no invented gcTime/lookup defaults | CHANGED | FS D34 makes staleTime/gcTime required; restored freshness and gc clock unstated | RESTORE | Say how restored entries count for staleTime (recommend: stale at restore, so live data wins, matching ED "restore lowers every restored answer's frontier") and when gcTime starts for restored unobserved entries. |
| P.O4 | Actor-effective reads add only that owner's previews | CHANGED | Actor-local previews deleted (FS D36) | CONFIRM-DROP | Replaced by shared optimistic writes; restore handling covered by the optimistic row. |
| P.O4 | Actor/global counters never reset across restore | DROPPED-SILENT | - | RESTORE | Fencing, ordinals and attempt.id reuse depend on it. |
| P.O4 | Running streams keep latest/hasValue/count projection; fresh owned generation after outcomes drain; no emission replay | KEPT (partial) | FS O8 "streams follow their actor"; O15 Streams "persistence without running work"; O5 "no replay" | RESTORE (one line) | State that a restored stream lane keeps its latest value as data and resubscribes fresh, with no replay. |
| P.O4 | Terminal streams never restart | DROPPED-SILENT | - | RESTORE (decide) | Under activities, re-entry would resubscribe. Decide whether a stream that completed before capture restarts after reload. |
| P.O4 | Missing P fails closed | CHANGED | Activities recompute P | CONFIRM-DROP | P cannot be missing for a declared activity. |
| P.O4 | Pending remote transactions restore as unknown/reconcileRequired unless evidence rules out invocation | KEPT | FS O8 "pending remote commits restore as unknown"; DD persistence.ts | RESTORE (one line) | Specify delivery: the restored commit's `outcomes.unknown` event runs as an ordinary turn after ready. Also entity: ED "write restored as uncertain persists the keys it predicted" (kept). |
| P.O4 | A saved not-yet-invoked fact covers only its cut; delayed writes cannot prove non-invocation | DROPPED-SILENT | - | RESTORE | Binding honesty rule; absent, an implementation could restore as interrupt from a stale record. |
| P.O4 | Pending local transactions restore as interrupted without replay | CHANGED | No local/remote split in FS O5 | RESTORE (reword) | Commits queued (serialize) but never invoked at capture restore as `interrupt`, only if the record proves non-invocation after the cut; otherwise `unknown`. |
| P.O4 | Reconciliation uses the same adapter-recorded identity; Runtime does not manage the adapter journal | CHANGED | FS D33 attempt.id minted by Flow, reused on reconciliation; ML "persisted" | CONFIRM-DROP | Better form (Flow-owned identity). |
| P.O4 | Terminal transactions restore only in accepted state representation | CHANGED | Transaction readers deleted (FS D39) | CONFIRM-DROP | No transaction state is read by views. |
| P.O4 | Never replay lookup/commit work, input, init or old emissions | KEPT | FS O8, D7 | - | |
| P.O4 | Persisted counters are safe integers with headroom; exhausted input fails before installation | KEPT (partial) | FS O3 admission keeps "safe-integer headroom" | RESTORE (one line) | Extend to restored counters. |
| P.O5 | Runtime observes committed publications for writes; distinct from inspection sinks | KEPT (implied) | FS O8 ordered writes | - | |
| P.O5 | Writes serialized per scope, may coalesce; older never replaces newer | KEPT (partial) | FS O8 "writes per scope are ordered" | RESTORE | Coalescing and flush timing unstated. Specify a coalescing window and a flush on page hide / visibility hidden, or a reload can lose the last edits. |
| P.O5 | No actor owns the provider | DROPPED-SILENT | - | CONFIRM-DROP | Mechanism. |
| P.O5 | Persisted transaction facts are Flow attempt evidence; last good record may predate invocation | DROPPED-SILENT | - | RESTORE | Same as the "saved fact covers only its cut" row. |
| P.O5 | Write failure keeps committed truth and last good record; never fails a committed actor turn | KEPT (partial) | FS O8 "a failed write keeps the last good record" | RESTORE | State that a committed turn never fails because of a write, and where StorageFailure (e.g. quota exceeded) is reported: attachInspector plus a Runtime-level diagnostic the app can observe. |
| P.O5 | Codec failure commits no Runtime mutation | DROPPED-SILENT | - | RESTORE | Encode failure skips that write and reports CodecFailure. |
| P.O5 | Disposal stops observation, finalises the latest accepted write, then releases the provider | DROPPED-SILENT | - | RESTORE | Flush on dispose; matters for Runtime-per-user switch (ML 10). |
| P.O5 | Typed cancellation/cleanup with honest failure evidence | KEPT | FS O10 one FlowError; O15 ApplicationsAndActors | - | |
| P.O5 | Structural/bound/decompression/app-domain/cleanup/I/O failures distinguishable; no raw parser exception or generic corruption/undefined escapes | DROPPED-SILENT | - | RESTORE | Corruption handling: malformed storage never throws a raw JSON/Schema error, never silently becomes "empty", always a MalformedData diagnostic with the policy above. |
| P.D1 | Durability is explicit declaration ownership; no replay authority | KEPT | FS O8, D7 | - | |
| P.D2 | Restore and writes in one Runtime lifecycle; detached validation; no partial bootstrap | KEPT | FS O3, O8 | - | |
| P.C1 | No cross-tab sync, same-scope writer protocol, conflict resolution | CHANGED | FS O8 second-tab refusal; D50 non-goal | RESTORE | Owner direction (multi-tab in scope). |
| P.C1 | No public boot decoder/payload or mutable hydration API | DROPPED-SILENT | FS O7 "SSR hydration out of scope" | RESTORE (revise) | SSR hydration is in scope; replace the prohibition with one sanctioned path (see report section 4), still no generic mutable hydration. |
| P.C1 | No generic migration/fingerprint API; no automatic durability | DROPPED-SILENT | - | RESTORE | Covered by the version-mismatch policy and default-false rows. |
| P.C1 | Share artifacts are not persistence or boot inputs | DROPPED-EXPLICIT | share artifacts deleted (FS D48, O11) | CONFIRM-DROP | Traces must likewise never be restore inputs; one line would be cheap. |
| P.C1 | No provider I/O during synchronous construction | KEPT | FS O3 | - | |
| P.C2 | No actor aliases, actor-private cache, serialized selected context, implicit retry, terminal stream restart, key-to-input inversion | KEPT (partial) | FS O5 no automatic retry; one store | RESTORE | Selected-context and terminal-stream rows above. |
| P.C2 | All structural bytes use shared codec bounds | DROPPED-SILENT | - | RESTORE | Shared bounded codec row. |
| P.V1 | Provider types/purity/default-off tests; zero construction I/O; no storage inheritance by fixtures | CHANGED | FS V6 (one line) | RESTORE | Add: construction inertness, default-off, Story isolation from real storage. |
| P.V2 | Bootstrap tests: compatible/incompatible app/version/identity; failure injected at each readiness boundary; no handle on failure; restored actor captureable | CHANGED | FS V6 "restore-without-replay" | RESTORE | Add version/identity mismatch and per-boundary failure injection. |
| P.V3 | Capture race proofs; suspended debt; whole-closure NonDurableContextProvider; two invalid slots both reported | CHANGED | FS V6 "consistent capture, durable context closure" | RESTORE | Keep the race and multiple-failure fixtures. |
| P.V4 | No-replay hydration of key-only, previews, pending commits, streams; counter exhaustion; delayed-write crash scenario (save pre-invocation, adapter dispatches, newer write suppressed, crash, restore old bytes, expect unknown) | CHANGED | FS V6 "restore-without-replay" | RESTORE | The delayed-write crash scenario is the decisive honesty test; keep it verbatim. |
| P.V5 | Sync Web Storage and async IndexedDB failures, delayed older writes, coalescing, codec failure, cancellation, disposal with pending writes; turn succeeds despite write failure | CHANGED | FS V6 "last-good writes and the second-tab rule" | RESTORE | Add the failure matrix and disposal flush. |

## Part B: PackageContract.plan

| Archived ref | Commitment (short) | Status | New location or decision | Recommendation | Reason |
| --- | --- | --- | --- | --- | --- |
| K.O1 | Four routes: flow-state, /react, /testing, /inspect | KEPT | FS O12; O15 PackageContract | - | |
| K.O1 | Named exports only; no package-owned namespace objects | CHANGED | FS O12 exports `trace` (import, export) as an object | CONFIRM-DROP | Deliberate single namespace value for trace; closed list still holds. |
| K.O1 | Root values (actorRef, app, definition, Diagnostic, Implementation, machine, module, resource, runtimeSetup, stream, transaction) | CHANGED | FS O12 root list (D13 module removed, D15 Implementation removed, entity names added) | CONFIRM-DROP | Superseded by decisions. |
| K.O1 | Implementation value/type with succeed/effect/merge | DROPPED-EXPLICIT | FS D15 | CONFIRM-DROP | Layers replace it. |
| K.O1 | Standalone can query | DROPPED-EXPLICIT | FS D22 check | CONFIRM-DROP | check replaces it. |
| K.O1 | Root types (Definition, StateToken, EventToken, StateOf, EventOf, Machine, MemoryOf, InputOf, RequirementsOf, Resource, Transaction, ActorRef, Module, App, RuntimeSetup, Runtime, Implementation, CanonicalKeyInput) | CHANGED | FS O12 types Definition, Machine, App, ActorRef, Actor, Snapshot, Runtime, Diagnostic; ML table: derived Schemas replace helpers | CONFIRM-DROP | Less sure: helper types like a component prop typed by a machine's snapshot rely on `Snapshot`; covered. RuntimeSetup type not exported (authors pass `typeof setup`). |
| K.O1 | Operation unions inferred through named families, not parallel status aliases | KEPT | FS D39 lanes as _tag unions | - | |
| K.O1 | Deferred restoration lists (persistence names, React hooks, testing names) | DROPPED-EXPLICIT | FS O15 "deleted: the temporary restoration lists" | CONFIRM-DROP | React hooks restored in O12; persistence names replaced by D41; testing names by D42. |
| K.O1 | Closed 25-name inspect restoration list | DROPPED-EXPLICIT | FS O11, O15 InspectionAndArtifacts | CONFIRM-DROP | Least-sure: formatRehydrationSummary had no successor. Recommend restore evidence (what was restored, discarded, marked unknown) as trace events, no new export. |
| K.O1 | Temporary empty routes and runtime shell (app, construct, ready) | DROPPED-EXPLICIT | FS O15 | CONFIRM-DROP | Scaffold only. |
| K.O1 | No root builders re-exported from non-root routes, deep imports, internal service tags, stores, ManagedRuntime, boot, harness, artifact types | KEPT | FS O12 closed lists, "no deep imports"; V10 absence | - | |
| K.O1 | useShallow under ReactAndHosts | DROPPED-EXPLICIT | FS O7, D40 | CONFIRM-DROP | Equal.equals replaces it. |
| K.O2 | Public types keep literal inference, nominal identity, unions, field presence, variance, requirements, failure channels; no any/assertions/explicit generics | KEPT | FS V1, C3 | - | |
| K.O2 | Declarations contain no implementation-only routes, recursive config carriers or erased environment requirements | DROPPED-SILENT | - | RESTORE | Add to V10: packed `.d.mts` files are self-contained and reference no internal path. |
| K.O2 | One maintained quickstart compiled against the packed package | CHANGED | FS V10 Dispatch Desk as runnable app; "packed consumers of all four routes" | RESTORE (one line) | Require the Dispatch Desk (or a quickstart) to compile against the packed tarball, not workspace source. |
| K.O2 | Consumers: small/medium isolated, strict, isolatedModules, isolated declaration emit, packed ESM, React 18 and 19 | DROPPED-SILENT | FS V10 only "packed consumers of all four routes" | RESTORE | Next.js/Vite consumers compile with isolatedModules; React 18 vs 19 support must be a stated, tested matrix. |
| K.O2 | No compiler benchmark arithmetic; recursive carriers avoid excessive instantiation | CHANGED | FS V1 "record compile time" | CONFIRM-DROP | Equivalent. |
| K.O3 | DELETE/REPLACE/RETAIN/HISTORICAL semantics; no alias, overload, adapter, shim | KEPT | FS O12, O13 | - | |
| K.O3 | DEL-001 registered views, useView(view), view can | KEPT | FS O7 useView(actor, select); D22 | - | Deletion stands. |
| K.O3 | DEL-002 child actors and their persistence/snapshots | KEPT | FS D24, D50 | - | |
| K.O3 | DEL-003 dynamicMachines, auto roots, runtime.actor, ID-bearing local creation, dynamic-root persistence | KEPT | FS O3 createActor anonymous | - | Lazy features must not reintroduce dynamic roots; see report section 4. |
| K.O3 | DEL-004 handle disposal replaced with leases/four lifecycles | CHANGED | FS D12, D16: leases deleted, three lifecycles | CONFIRM-DROP | Superseded. |
| K.O3 | DEL-005 initial/flat-only/final/onDone/output/Boolean reentry | KEPT | FS O1, O2 | - | |
| K.O3 | DEL-006 activity kits, operation refs, byKey/byLane/enumeration | KEPT | FS O2, O5 | - | |
| K.O3 | DEL-007 recursive sharing/custom equality replaced by Object.is | CHANGED | FS D40 Equal.equals | CONFIRM-DROP | Superseded. |
| K.O3 | DEL-008 React shells, root-only hooks, useResource, broad subscriptions | KEPT | FS O7 | - | |
| K.O3 | DEL-009 callable story, perform/deliver/... replay, mutable harness | KEPT | FS O9, D42 | - | |
| K.O3 | DEL-010 mutable v1 boot, root/child/final wire, replay inspect, old Story schemas | KEPT | FS O11, O13 | - | SSR hydration must not revive mutable boot. |
| K.O3 | DEL-011 historical documents as provenance | KEPT | FS C1 | - | |
| K.O3 | RET-001 four routes, ESM/import conditions | KEPT | FS O12 "ESM only"; package shell kept (O13) | - | |
| K.O3 | RET-001 one Effect identity (peer) | DROPPED-SILENT | packages/flow-state-rewrite/package.json lists effect as a dependency, not a peer | RESTORE | Two Effect copies break Layer/Context identity and Schema instanceof. Effect must be a peerDependency with the pinned range. |
| K.O3 | RET-001 React compatibility boundary | DROPPED-SILENT | no React peer declared | RESTORE | React must be an optional peer (only flow-state/react imports it) with the 18/19 range. |
| K.O3 | RET-002 synchronous send, production mailbox, scoped stores, fencing, Cause/cleanup | KEPT | FS O3, O5 | - | |
| K.O3 | RET-003 exact resource/transaction status discriminants | CHANGED | FS D39 lanes | CONFIRM-DROP | Superseded. |
| K.O3 | RET-004 canonical key/getState/getData readers | CHANGED | FS D39 | CONFIRM-DROP | Superseded. |
| K.O3 | RET-005 FlowProvider, revised actor hooks, passive useView | KEPT | FS O7 | - | |
| K.O3 | Deleted inputs fail before actor creation, mutation, acquisition, publication or work | DROPPED-SILENT | FS O1 throws FlowError for failed construction, but unknown/deleted config keys are not said to fail | RESTORE | Agents will write old fields (timers, redirect, contextBindings). Closed configs: unknown or deleted fields throw FlowError at construction with a remediation naming the replacement. |
| K.O3 | Replacement and deleted surfaces never coexist in code, declarations or guidance | KEPT | FS O12, V10 | - | |
| K.O3 | Deleted names appear only in ledger/provenance/negative proofs | KEPT | FS V10 | - | |
| K.O4 | Promotion only after owner proofs and package/consumer/browser/installed-CLI gates with receipts | KEPT (partial) | FS O14 S10, V10; O15 CommandLine keeps installed-binary parity | RESTORE (one line) | Add real-browser gates (Chromium/Gecko/WebKit) for persistence, multi-tab and React. |
| K.O4 | Focused typecheck/source scan cannot establish behaviour | DROPPED-SILENT | FS C4 testing-policy | CONFIRM-DROP | Process rule covered by the testing skill. |
| K.O4 | Proving app Todo Essentials | CHANGED | FS V10 Dispatch Desk | CONFIRM-DROP | Covered. |
| K.O4 | Proving app Incident Console (bindings, conflicts, streams, CLI, browser lifetime) | CHANGED | FS V10 Dispatch Desk and entity examples | CONFIRM-DROP | Covered except browser lifetime (see browser gates). |
| K.O4 | Proving app Hydrated Offline Notes: request isolation, context-closed persistence, first-render consistency, outbox/reconnect/disposal, exact restore, trusted seeding | DROPPED-SILENT | FS V10 has no SSR or offline proving app | RESTORE | The only proving app for SSR hydration and real-browser persistence. Extend Dispatch Desk with a Next.js host (server render, hydrate, reload restore, two tabs) or restore this app. |
| K.O4 | Application-authored bounded feed (drop/coalesce without Flow pressure options) | DROPPED-SILENT | - | CONFIRM-DROP | Less sure; it proved the absence of a feature rather than a capability. |
| K.O4 | Map every old clause before cutover; cleanup after no-residue audit | CHANGED | FS O13, O15, V10 absence | CONFIRM-DROP | Equivalent. |
| K.O4 | Frozen package unchanged; cutover needs later authorization | KEPT | FS C2 | - | |
| K.D1 | Each capability owns its whole consumer contract | CHANGED | FS single Plan | CONFIRM-DROP | Superseded by one owner. |
| K.D2 | One decisive owner proof per invariant; integration adds reachability only | DROPPED-SILENT | - | CONFIRM-DROP | Process guidance. |
| K.C1 | Toolchain: Node 22.18+, nub, TS 7, Vite Plus, Effect rc.112 | CHANGED | FS C3 Effect 4.0.5, TS 7; package.json engines node >=22.18 | CONFIRM-DROP | Updated pins. |
| K.C1 | Shared codecs (definition, ref, key, persistence, artifact, CLI) use host-neutral ECMAScript/Web APIs and TextEncoder; no Buffer, no UTF-16 counts, no second encoder | KEPT (partial) | FS D9 names, O5 key bytes, O13 ports vectors | RESTORE (one line) | Make host neutrality a constraint: the same package runs in Node SSR, edge runtimes and browsers, and a record written on one must decode on another. |
| K.C1 | Reject lone surrogates via isWellFormed or equivalent fallback | KEPT | FS O1 names | - | Extend to persisted strings via the shared codec. |
| K.C1 | Equal input gives equal bytes on Node, Bun, Deno, Chromium, Gecko, WebKit | DROPPED-SILENT | - | RESTORE | Cross-host determinism of keys and identities (SSR server key must equal client key). |
| K.C2 | Build via pinned commands, never hand-edit dist; focused gates (check:types, build, check:build-output, check:packed-consumers, check:static-harness) | KEPT | FS O13 keeps package shell and scripts; C3 | - | |
| K.C2 | Product/browser/published gates required before promotion | KEPT (partial) | FS V10 | RESTORE | Same as browser gates row. |
| K.C3 | Proposal/source boundaries; greenfield rewrite; approval does not authorise commits | CHANGED | FS goal, C1, C2 | CONFIRM-DROP | Process. |
| K.V1 | Runtime imports and packed declarations for all four routes match closed lists; reject namespaces/re-exports/deep imports | KEPT | FS V10 | - | |
| K.V2 | Portable codec vectors on Node (full) and Bun/Deno/Chromium/Gecko/WebKit (compact) | DROPPED-SILENT | FS V2 ports byte vectors on one host | RESTORE | See cross-host row. |
| K.V3 | Removed forms rejected behaviourally before side effects; residue audit | KEPT (partial) | FS V10 absence of names in exports/declarations | RESTORE | Add behavioural rejection of deleted config fields. |
| K.V4 | Proving apps via packed APIs and browser/request/CLI boundaries with failure/interruption/cleanup cases | KEPT (partial) | FS V10 | RESTORE | Request (SSR) and browser boundaries missing. |

## Not in either archived Plan but found while checking (for the caller)

- Server vs client entries: neither the archive nor the new docs specify a `"use client"` directive
  on flow-state/react, a `react-server` export condition, or which routes are safe to import from a
  Next.js Server Component. Needed for the Next.js host.
- Tree shaking: the kept package shell has `"sideEffects": false`; no document states it as a
  requirement. One line in FS O12 would protect it (route modules must have no import-time effects).
- Lazy features (archive ApplicationsAndActors C1, not my Plan): "async module import before
  construction or a separately scoped lazy application island does not expand a live graph";
  ML section 2 sketches `lazy(() => import(...))`. Persistence interaction: restore validates against
  the receiving app, so a persisted actor of a not-yet-loaded machine must be retained untouched
  (not discarded as IdentityVersionMismatch) until its machine loads.
