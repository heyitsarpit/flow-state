# Scope inventory: InspectionAndArtifacts.plan (archived)

Source: `workflow/plans/archive/rewrite/InspectionAndArtifacts.plan` (810 lines). The plan links no
`references/` file directly; the archived reference `archive/rewrite/references/tools/inspection.ts`
cites it as authority and was read for comparison (it shows the old `attachInspector(runtime, { capacity: 256 })`
returning `{ drain, snapshot, dispose }`).

New documents checked:
- `workflow/plans/flow/FlowState.plan` (FS): O9, O10, O11, O12, O15 (InspectionAndArtifacts row), D2, D7, D10, D11, D16, D38, D48, D50, C1, V9.
- `references/design/minimal-library.md` (ML): decisions 4 (opaque payloads redacted), 8 (snapshot `timers` to inspection), 9 (attachInspector as telemetry), 11 (trace import/export; summarize/diff to CLI; proof deleted), "Deleted or absorbed".
- `references/design/entity-domain.md` (ED, sections 1-9 normative): 1.2 (digests not values), 5.6 (evidence bound = "InspectionAndArtifacts O3"), 6.3, 6.4, 7.1-7.6.
- `references/dispatch-desk/tools/inspection.ts`, `tools/cli.ts`, `tools/diagnostics.ts` (DD).

Status key: KEPT, CHANGED (with capability-preservation judgement), DROPPED-EXPLICIT, DROPPED-SILENT.
Rec: RESTORE / CONFIRM-DROP / (none) for KEPT or capability-preserving CHANGED.

Cross-cutting observation: ED 5.6 and 6.3 (normative) bind evidence retention to "the bounded
retention model of InspectionAndArtifacts O3", an archived Plan. Under FS C1 that reference is
ambiguous (a normative document pointing at a provenance-only Plan). Every O3 row below therefore
recommends restating the rule in FS, not relying on the pointer.

## O1 Pure inspection and committed live projections

| Archived ref | Commitment (short) | Status | New location or decision | Recommendation | Reason |
| --- | --- | --- | --- | --- | --- |
| O1.1 | Pure graph/transition functions consume inert definitions and snapshots; may show selection, microsteps, memory patches, desired plans; never actual starts/releases/generations/pending/finalizers | CHANGED | FS O11 `inspect(app)` "without running a callback"; FS O2 `check(snapshot,event)` "starts nothing"; FS O9 `model()` pure transitions; FS O11 `flow explain` static or at checkpoint | RESTORE (part) | The "no actual-work claims" law survives. Lost: a way to ask "if this event arrives at this snapshot, what is the target, exit/entry order, memory patch, and activities/schedules started or released (desired)". check gives only Allowed/Denied/Unhandled. Restore as `flow explain <machine> --at <checkpoint> <event>` (and the same data in `render(..., "json")`) printing predicted target, exits/entries, memory patch and desired activity diff, labelled desired-not-actual. |
| O1.2 | Live inspection consumes committed TurnRecord/LifecycleRecord facts only; no arbitrary-snapshot trace; no second mutable history | KEPT | ED 7.4 ("every runtime decision is a trace event"), ED 7.5; DD inspection.ts ("committed evidence") | none | Committed-only evidence is restated for entity events and in the reference; FS O11 "ordered evidence". Recommend FS state it explicitly for machine turns too (see O4 records row). |
| O1.3 | TurnRecord and v2 models stay private; projections inferred | CHANGED | FS O11 `inspect(app)` returns "the internal representation", consumed by `render` | none | The representation becomes public data (agents read JSON); that is the intended "truth is a compilation target" form. No capability lost. |
| O1.4 | One formatter belongs to each projection | KEPT | FS D2 "one representation, renderers on demand"; FS O11 `render(model, "text"/"json"/"mermaid")` | none | Single renderer per representation. |
| O1.5 | Snapshot publication (latest current snapshot for slow readers) belongs to actors; evidence retention implies no replay stream | KEPT | FS O3 handle `snapshots`, `getSnapshot`; FS O7 one versioned store | none | Current-state publication is the actor's; inspection is separate. |
| O1.6 | Inspect route: 25 exact names (graphOf ... decompressTraceArtifact) subject to PackageContract gates | DROPPED-EXPLICIT | FS O11 "the long inspect restoration list [is] deleted"; FS O15; FS O12 four exports | CONFIRM-DROP | Surface ceremony; replaced by four exports plus CLI leaves. Capabilities behind individual names are assessed row by row below. |
| O1.7 | `graphOf(machine)` inferred graph | CHANGED | FS O11 `inspect(app)` + `render(model,"mermaid")`; `flow graph` | none | Same capability, app-scoped; machine selected by CLI argument. Preserved. |
| O1.8 | `inspectTransition(machine, snapshot, event)` transition for M | CHANGED | FS O2 `check`; FS O11 `flow explain ... statically or on a checkpoint` | RESTORE (see O1.1) | check gives the verdict, explain gives candidates and deny codes; the predicted result (target, patch) is not stated anywhere. |
| O1.9 | `inspectMicrosteps` microstep projection | CHANGED | FS O2 macrostep steps 1-5; FS O15 "the microstep limit" deleted | RESTORE (fold into O1.1) | Exit/entry order (outermost-first default entry) is user-visible ordering; expose it in explain output rather than a separate API. |
| O1.10 | `inspectActivities` (desired activities for a snapshot, starts nothing; Q2 candidate) | CHANGED | FS O7 / D39 `s.activities` lanes in every snapshot; FS O11 representation lists activities | CONFIRM-DROP | Lanes stored in the snapshot (ML 8 obligation) give current activities per cut; static declarations are in `inspect(app)`. |
| O1.11 | `whyNoTransition` returns explanation or undefined (not a failure channel) | CHANGED | FS O2 check returns `Unhandled` or `Denied { reasons }` (D22, D53); `flow explain` | none | Better form: closed verdict with reasons from every level tried. Preserved. |
| O1.12 | `formatNoTransitionSummary` | CHANGED | `flow explain` text output; DD cli.ts explain examples | none | CLI renders the same explanation. |
| O1.13 | `analyzeTrace` (route name, form unresolved) | CHANGED | `flow trace summarize` (FS O11; ML 11) | CONFIRM-DROP | Never had a form; summarize covers analysis. |
| O1.14 | `summarizeTrace(trace)` retained-window summary | CHANGED | `flow trace summarize` CLI leaf; ML 11 "summarise and diff stay CLI commands"; ML deleted table | none | Moved to CLI; programmatic form deleted by ML. Capability preserved through the CLI (see O6 rows for content losses). |
| O1.15 | `diffTrace(left,right)` preserving both operands | CHANGED | `flow trace diff` (FS O11, DD cli.ts) | none | Moved to CLI; see O6 for semantics losses. |
| O1.16 | `formatTrace(trace)` string | CHANGED | `flow trace summarize --format text` | none | Covered by CLI text output. |
| O1.17 | `formatInspectionEvent`, `formatInspectionTimeline` (format live inspection events) | DROPPED-SILENT | none; DD attachInspector sink receives `unknown` events | CONFIRM-DROP | Formatting is ceremony; sinks get structured data and can log JSON. Least-sure item: production debugging may want the same text the CLI prints (could be `render(events, "text")` later). |
| O1.18 | `formatRehydrationSummary(trace)` (what restore did) | DROPPED-SILENT | ED 7.4 has a `restore` event for entity records only | RESTORE | User-visible persistence debugging: what was restored, discarded (version mismatch, decode failure), restored as unknown. Restore as a `restore` section of `flow trace summarize`/`diff` fed by lifecycle `restore` evidence. Directly useful for SSR hydration and multi-tab (see final notes). |
| O1.19 | `formatResourceFreshnessReport(trace)` | DROPPED-SILENT | none (ED stale/repair evidence covers domain reads only) | RESTORE | Why a plain resource refetched or served stale is the most common data question. Restore as a summarize section (`freshness`) over resource facts. |
| O1.20 | `formatTransactionOverlapSummary(trace)` | DROPPED-SILENT | none | RESTORE | Concurrency policy outcomes (reject/serialize/cancel/allow overlaps, fenced results, unknown) are a binding guarantee users need to see. Restore as summarize section (`transactions`), keyed by attempt.id (D33). |
| O1.21 | `buildBehaviorContract`, `sliceBehaviorContract`, `diffBehaviorContracts`, `renderBehaviorContract` | DROPPED-EXPLICIT | FS O11 "Saved behaviour artifacts ... deleted"; FS O15; `flow graph`, `flow diff --base` | CONFIRM-DROP | On-demand graph and diff from the live app (FS D2, archived SurfaceSimplification D38) replace stored contracts; nothing goes stale. Reason holds. |
| O1.22 | `renderBehaviorCoverage(target, {moduleId?})` Story coverage of declared behaviour | DROPPED-SILENT | none (FS O11 flow check warns unreachable states, not Story coverage) | RESTORE | Not superseded: which transitions, deny codes, outcome edges and schedules no Story exercises is a user-visible capability agents need. Restore as `flow story coverage` (or `flow graph --coverage`) computed from Story runs over `inspect(app)`; scoped by machine, not module. |
| O1.23 | `{ moduleId?: string }` options; module slicing | DROPPED-EXPLICIT | FS D13 module removed | CONFIRM-DROP | Modules no longer exist; machine/app selection replaces them. |
| O1.24 | `renderBehaviorDiff` (unresolved form) | CHANGED | `flow diff --base main` (DD cli.ts) | none | CLI diff of two revisions. |
| O1.25 | `attachInspectionSink(runtime, sink)` returns `{ drain, dispose }`; drain awaitable; sink route-created, attaches once | CHANGED | FS O11 `attachInspector(runtime, sink)`; DD inspection.ts returns `detach()` (sync) | RESTORE | New reference loses awaitable drain and accepted-prefix dispose. Without drain, a host cannot flush telemetry before shutdown or a test cannot wait for evidence. Restore: `attachInspector` returns `{ drain(): Promise<void>, dispose(): Promise<void> }` with accepted-prefix semantics (O3). |
| O1.26 | `createInspectionBufferSink({ capacity? = 256 })` with `snapshot(): { records, truncatedBeforeSequence }` and `clear()` | CHANGED | Archived reference had `attachInspector(runtime, { capacity: 256 })`; new DD passes a callback; ED 7.5 "late-attached inspector gets that snapshot and a truncation marker"; ED 5.6 bounded retention | RESTORE | Bounded in-memory retention with an exact truncation marker is how traces get `truncatedBeforeSequence`; FS O11 keeps "truncation markers" but no longer says where the bound lives. Restore a bounded buffer form, e.g. `attachInspector(runtime, { capacity })` returning `{ snapshot, clear, drain, dispose }`, with the callback form as the alternative. |
| O1.27 | `importTraceArtifact(bytes: Uint8Array)` returns validated private trace | KEPT | FS O11 `trace` (import, export); DD `trace.import(new Uint8Array(...))` | none | Same capability. |
| O1.28 | `exportTraceArtifact(trace, options?)` returns Uint8Array; no filesystem authority | KEPT | FS O11; DD `trace.export(imported)` | none | Options (redactions) dropped with shares (O5). |
| O1.29 | No v1 object importer retained | KEPT (implied) | FS O12 "No deleted name survives as an alias" | none | No legacy importer. |
| O1.30 | `compressTraceArtifact` / `decompressTraceArtifact` | DROPPED-EXPLICIT | FS O11 "compression ... deleted"; FS O15 | CONFIRM-DROP | Artifacts are bounded at 2 MiB canonical; ordinary gzip outside the library covers transport. |

## O2 Shared portable structural codec

| Archived ref | Commitment (short) | Status | New location or decision | Recommendation | Reason |
| --- | --- | --- | --- | --- | --- |
| O2.1 | Persistence restore and artifact import/export share one Flow-owned structural walker, private Schema decoder and canonical decoded data | CHANGED | FS O11 "Trace artifacts use the shared bounded structural codec"; FS O15 "kept: shared bounded codec"; FS O8 memory "encoded with the definition's Schemas" | RESTORE (statement) | "Shared" is kept by name, but FS O8 no longer says persistence uses the same walker and bounds. Restore one sentence in FS O8/O11: persisted records, trace artifacts and (in future) SSR payloads pass the same bounded walker before Schema decoding. |
| O2.2 | Persistence owns its envelope and opaque application codec | CHANGED | FS D41 KeyValueStore + definition Schemas; codec option deleted | none | Owned by Persistence inventory; the application codec is replaced by Schemas. |
| O2.3 | Public bytes are strict UTF-8 stable-key JSON or exactly one gzip member; stop decompression at bound | CHANGED | compression deleted (FS O11) | CONFIRM-DROP (gzip part) | With compression gone only strict UTF-8 stable-key JSON remains; that part is DROPPED-SILENT, see O2.12. |
| O2.4 | Validate structure, versions, identity, descriptors, tokens, revisions and bounds before actor creation, external work or committed mutation | KEPT (partial) | FS O8 "restore validates and prepares detached data before services"; FS O3 admission validation "before any registration or work" | RESTORE (artifact part) | Restore an explicit rule that trace import validates fully before returning, and CLI evidence mode never runs app code (ED 7.3 says the latter). |
| O2.5 | No raw parser exception, undefined failure, generic corruption, Node Buffer or Cause tree escapes; one Diagnostic model | KEPT (partial) | FS O10 one FlowError, canonical diagnostics | RESTORE (codec part) | FlowError covers the type; the specific "no raw parser error / no generic corrupt / no undefined" rule is not restated. One line in FS O11. |
| O2.6 | Depth 32 (root zero) | DROPPED-SILENT | none (FS O5 restates key bounds 16/256/8,192 only) | RESTORE | Binding bound against hostile input; FS restated key bounds the same way, so restate artifact/persistence bounds. |
| O2.7 | 10,000 visited nodes | DROPPED-SILENT | none | RESTORE | Same. |
| O2.8 | Array length 4,096 | DROPPED-SILENT | none | RESTORE | Same. Note: interacts with entity paged lanes (ED) and long traces; check the number against a capacity-256 buffer's records array. |
| O2.9 | One string or key 262,144 UTF-8 bytes | DROPPED-SILENT | none | RESTORE | Same. |
| O2.10 | Decompressed or canonical encoded UTF-8 2,097,152 bytes | DROPPED-SILENT | none | RESTORE | Same (canonical-size bound; the decompressed part goes with compression). |
| O2.11 | Bounds uniform across boot, behaviour, trace, shares, opaque carriers; no envelope overrides | DROPPED-SILENT | none | RESTORE | Uniformity (no per-artifact override) is what keeps persisted state and traces mutually loadable; restate for persistence and trace. |
| O2.12 | Counters, revisions, generations, sequences, timestamps are non-negative safe integers (`NonNegative`) | KEPT (partial) | FS O3 "safe-integer headroom" checked at admission | RESTORE (wire rule) | Restore as the wire rule for traces and persisted records. |
| O2.13 | Boot counter at MAX_SAFE_INTEGER invalid; reserve terminal-publication and cleanup credits | KEPT (partial) | FS O3 "capacity and headroom" (O15 ApplicationsAndActors kept) | none | Headroom is kept; exact credits are mechanism. |
| O2.14 | Public timestamps are integer epoch ms from Runtime Clock; Stories use TestClock | KEPT (partial) | FS O9 TestClock; FS O2 schedules on Runtime Clock | RESTORE (wire rule) | Restate that trace timestamps are integer epoch ms from the Runtime Clock, so Story traces are deterministic (FS V7 "identical traces"). |
| O2.15 | Host-neutral Web text APIs; TextEncoder byte counts; reject lone surrogates before encoding | KEPT (names only) | FS O1/D9 rejects lone surrogates in names, exact UTF-8 bytes | RESTORE | Name rules are kept; the same law for artifact/persisted string content is not. |
| O2.16 | Never replace surrogates, approximate UTF-8 with UTF-16 length, use Node Buffer in shared code, host-specific or second encoder | DROPPED-SILENT | none | RESTORE | Portability guarantee; needed for SSR (server Node, client browser) and browser-run CLI tooling. |
| O2.17 | Node, Bun, Deno and browsers produce equal canonical bytes and stable-ref identities from equal input | DROPPED-SILENT | none | RESTORE | Binding compatibility guarantee; SSR hydration depends on it (see notes). |
| O2.18 | Canonical JSON: keys and ID-indexed declarations sorted by UTF-8 byte order; authored child/event/checkpoint/record/diagnostic/fact order preserved; JSON.stringify numbers; no normalisation | DROPPED-SILENT | ED 6.3 canonical order for repair lists only | RESTORE | Determinism of artifacts (FS V7 identical traces, trace diff) requires a canonical encoding. |
| O2.19 | Exactly one trailing newline; artifacts uncompressed stable-key UTF-8 JSON | DROPPED-SILENT | none | RESTORE (minor) | Byte-stable artifacts for diffs in git; one line. |
| O2.20 | Artifact order rules do not replace Resources key ordering or -0 normalisation | KEPT | FS O5 keys keep archived byte grammar | none | Key grammar is separately kept. |
| O2.21 | Public byte processing = strict UTF-8, JSON parse, one private Schema decoder to fresh canonical data | DROPPED-SILENT | none | RESTORE (fold into O2.1) | Pipeline statement; one line. |
| O2.22 | Synchronous Runtime construction inert, no storage read | KEPT | FS O3 "construct() is synchronous and inert" | none | |
| O2.23 | ready() reads and validates detached boot data; values validated before service acquisition, store installation, activation, handle escape | KEPT | FS O3 bootstrap order; FS O8 "restore validates and prepares detached data before services" | none | |
| O2.24 | Do not re-decode compiled machine input or run boot decoding for artifact-only operations | KEPT | ED 7.3 "Evidence mode never runs application code" | none | |
| O2.25 | Reject malformed/cyclic data, -0, non-finite numbers, parser failures, duplicate keys, trailing bytes, over-limit input | DROPPED-SILENT | none | RESTORE | Hostile-input rejection; part of the codec rule. Concatenated gzip/unsupported compression parts go with compression. |
| O2.26 | Compression failures map to DecompressionFailed | DROPPED-EXPLICIT | compression deleted | CONFIRM-DROP | No compression. |
| O2.27 | Private direct-decoder behaviour unspecified for proxies, getters, sparse arrays etc. | DROPPED-SILENT | none | CONFIRM-DROP | Explicitly non-normative mechanism. |
| O2.28 | Failures keep ownership (structural, bound, identity, external input, application, cleanup, interruption, I/O, invariant); bounds name limit and path separately | DROPPED-SILENT | FS O10 classification Failure/Defect/Interruption, code, path | RESTORE | Failure classification is a binding guarantee; restate that bound failures name the limit and path. |
| O2.29 | Diagnostic owns classification/code/path/details/summary/help; wire projections invent no second type nor mirror Cause | KEPT | FS O10 | none | |

## O3 Ordered bounded inspection evidence

| Archived ref | Commitment (short) | Status | New location or decision | Recommendation | Reason |
| --- | --- | --- | --- | --- | --- |
| O3.1 | Every successful turn exposes one atomic committed actor/store cut | KEPT | FS O2 step 5; FS O7 one versioned store; FS D7 | none | |
| O3.2 | One Runtime-global sequence shared by turn and lifecycle facts | KEPT (partial) | ED 7.4 "Every event carries the Runtime's sequence number ... one total order" | RESTORE (statement in FS) | Stated in ED for entity events vs machine transitions; FS should state it for all evidence including lifecycle. |
| O3.3 | Acknowledgment follows evidence acceptance and never waits for user Effects; StoreFanout causal | KEPT (partial) | ED 7.5 / DD "never delays a turn"; FS O4 causal waves | none | |
| O3.4 | Lifecycle snapshot precedes its event; lifecycle facts do not advance machine-turn revision or create TurnRecords | CHANGED | FS O2 lists "lifecycle fact" as a mailbox input decided in a macrostep; FS D16 lifecycle active/disposing/disposed | RESTORE (clarify) | FS O2 now reads as if lifecycle is a machine turn, contradicting the archived rule that lifecycle never manufactures a turn. Clarify: lifecycle facts are evidence ordered in the mailbox, with no machine transition and no synthetic terminal turn. |
| O3.5 | Lifecycle data: actor/app/plan/incarnation provenance, full snapshot, from/to/cause, both revisions, timestamp, sequence | DROPPED-SILENT | FS D38 revisions move to inspection (no schema) | RESTORE | Lifecycle evidence (create, restore, dispose, retain expiry, Runtime disposal) is how users debug actor lifetimes, grace-period disposal (FS Q1) and retain. Restore a lifecycle record with cause. |
| O3.6 | Fresh publication revision zero; hydration restores persisted publication and turn revisions | DROPPED-SILENT | FS D38 revisions inspection-only | RESTORE | Revisions must be continuous across restore or trace comparison across restore breaks; directly relevant to SSR/multi-tab hydration. |
| O3.7 | No prepare record or terminal-disposal machine turn | CHANGED | FS D16 deletes prepared state | none | Prepared state deleted; "no terminal machine turn" covered by O3.4 restore. |
| O3.8 | Buffer capacity default 256, non-negative integer, exact including zero | CHANGED | Archived reference capacity 256; new DD callback sink; ED 5.6 bound by pointer | RESTORE | See O1.26. |
| O3.9 | snapshot() returns records + marker; clear() preserves sequence; marker null iff nothing omitted, else greatest omitted/cleared sequence | DROPPED-SILENT | FS O11 "truncation markers" (artifacts only) | RESTORE | Exact marker semantics are what make "insufficient evidence" (ED 6.3) honest. |
| O3.10 | Clear advances only through retained tail; queued accepted records may arrive later | DROPPED-SILENT | none | RESTORE (with O3.9) | Part of the buffer contract. |
| O3.11 | One sink attaches once to one Runtime; sees post-attachment records only; pre-attachment snapshot empty/null | DROPPED-SILENT | none | RESTORE | Isolation guarantee ("no mixed-Runtime state"); matters with per-request Runtimes (SSR). |
| O3.12 | Late attachment marks greatest unseen sequence (except zero) | KEPT | ED 7.5 "a late-attached inspector gets that snapshot and a truncation marker" | none | Normative in ED; mirror in FS. |
| O3.13 | drain/dispose wait only through accepted prefixes before detaching | DROPPED-SILENT | DD returns sync detach | RESTORE | See O1.25. |
| O3.14 | Slow sinks never delay acknowledgment/StoreFanout, never mutate/roll back commits, never retain actor-owned history | KEPT | ED 7.5 "never delays them"; DD inspection.ts | none | Restate the no-mutation part in FS. |
| O3.15 | A failing sink detaches alone; others continue; no silent omission | DROPPED-SILENT | none | RESTORE | Failure isolation is a binding guarantee for production telemetry (ML 9 makes attachInspector the supported production observer). Also say how the failure is reported (a diagnostic). |
| O3.16 | No persisted buffers, no second mutable history | KEPT (partial) | FS O11; ED 7.4 values only in attachInspector's in-memory events | none | |
| O3.17 | Admission/commits reserve actor/store/sequence cleanup capacity before mutation | KEPT | FS O3 "capacity and headroom" (O15) | none | |
| O3.18 | Sequence exhaustion refuses work before commit | KEPT (partial) | FS O3 safe-integer headroom before registration | RESTORE (one clause) | Extend headroom to the evidence sequence explicitly. |
| O3.19 | Disposal drains terminal lifecycle evidence in reverse dependency order | DROPPED-SILENT | FS O3 disposal waits for commits | RESTORE | Ordering guarantee at shutdown; telemetry and Story cleanup evidence depend on it. |
| O3.20 | Changed-ref hints apply only to their revision; skipped readers reread current state | DROPPED-SILENT | FS O7 one versioned store, tear-free reads | CONFIRM-DROP | Mechanism; the versioned store and tear-free useView give the user-visible guarantee. |
| O3.21 | Records durable only by explicit sink export, preserving order, marker, app identity, format version | KEPT (partial) | FS O11 trace export; DD `flow story run --trace-output` | none | Explicit export only; identity/version preservation covered by O4 restore. |

## O4 Canonical raw behaviour and trace schemas

| Archived ref | Commitment (short) | Status | New location or decision | Recommendation | Reason |
| --- | --- | --- | --- | --- | --- |
| O4.1 | Behaviour artifact kind/version, appId, persistenceVersion, appPlanFingerprint, requirements, modules, machines, Story metadata | DROPPED-EXPLICIT | FS O11, O15 saved behaviour artifacts deleted | CONFIRM-DROP | Replaced by on-demand `inspect(app)`/`flow graph`/`flow diff`. |
| O4.2 | Behaviour fingerprint: SHA-256 over canonical {appId, persistenceVersion, requirements, modules, machines}; recomputed on encode/import; ArtifactIdentityMismatch | CHANGED | ED 6.4 "description is fingerprinted into the App's identity" (no algorithm/preimage) | RESTORE | An App identity fingerprint still exists (ED) and traces need it to refuse comparing traces from different apps. Restore: canonical SHA-256 of the internal representation (`inspect(app)` canonical JSON) carried in every trace; mismatch is a failure, not a difference. |
| O4.3 | Trace header: kind "trace-artifact", version, storyId, appId, persistenceVersion, appPlanFingerprint, capturedAt | DROPPED-SILENT | FS O11 names no fields | RESTORE | Versioned, self-identifying artifacts are a compatibility guarantee; CLI `trace diff` and `explain --trace` need storyId and app identity. Keep the same header in the new vocabulary (persistence version from `runtimeSetup.persistence.version`). |
| O4.4 | truncatedBeforeSequence: Nullable<NonNegative> | KEPT | FS O11 "truncation markers"; FS O15 | none | Field form unspecified; covered by O4.3 restore. |
| O4.5 | Ordered records and checkpoints | KEPT | FS O11 "ordered evidence"; FS O9 checkpoints | none | |
| O4.6 | outcome completed/failed; end, failure, cleanup; nullable fields present as null | KEPT (partial) | FS O10 FlowError Story evidence; DD diagnostics.ts "completed checkpoints, end when captured, cleanup" | RESTORE (trace form) | In-process FlowError keeps the envelope; the artifact must carry the same outcome/end/failure/cleanup so a failed run's trace is still loadable. |
| O4.7 | Completed requires end, null failure, complete cleanup; failed requires failure; end never finality | DROPPED-SILENT | none | RESTORE | Evidence invariants; "end is not finality" prevents false claims. |
| O4.8 | Cleanup failure cannot produce successful evidence | DROPPED-SILENT | none | RESTORE | Binding failure-classification guarantee. |
| O4.9 | Checkpoint captures carry exact actor targets plus Runtime now / pendingWork | KEPT (partial) | FS O9 "Checkpoints are atomic cuts carrying snapshots, entity repair evidence and diagnostics" | RESTORE (now, pending work) | Snapshot `timers` moved to inspection (ML 8, FS D38); a checkpoint without `now` and pending schedules/work cannot answer "what was due". Restore `now` and pending schedules/operations in checkpoint evidence. |
| O4.10 | Unknown members and omitted nullable members reject (closed schema) | DROPPED-SILENT | none | RESTORE | Closed-schema rule (archived C1); cheap and binding. |
| O4.11 | Preserve record/checkpoint/fact/diagnostic order, sequence, context and provider revisions, store revision, timer identity, operation occurrence/generation, issue ownership | KEPT (principle) | FS D38 revisions and timers move to inspection; archived SurfaceSimplification D43 generation stays in evidence (provenance) | RESTORE (enumerate) | D38 says they move to inspection but no document lists what evidence carries; restore the list in FS O11. |
| O4.12 | Decoder rejects marker inconsistent with retained records; non-null marker prevents complete equality | KEPT (partial) | DD cli.ts "equal when both traces are complete and match"; ED 6.3 insufficient evidence | RESTORE (decoder check) | Equality rule kept; decoder consistency check silent. |
| O4.13 | Lifecycle tuples: restore prepared->prepared before start; start; suspend; resume; dispose | CHANGED | FS D16 active/disposing/disposed; suspension/prepared deleted | CONFIRM-DROP (tuples) | Superseded by D16. Keep distinct causes (O4.14). |
| O4.14 | Fresh creation, restore, attachment, owner disposal and Runtime disposal are distinct causes; no synthetic terminal TurnRecord | DROPPED-SILENT | none | RESTORE | Cause distinctions (now: created, restored, ensured, retain expired, disposeActor, grace-period disposal, Runtime disposal) are user-visible debugging data. |
| O4.15 | Resource fact lanes: missing, pending, ready, refreshing, failure, defect, interrupted | CHANGED | FS D39 lanes (Missing deleted), pending flag, placeholder, stale | RESTORE (new form) | Facts must be closed unions in the new lane vocabulary; currently no fact schema exists. |
| O4.16 | Transaction fact lanes incl. unknown with reconcileRequired:true; Flow attempt evidence only, no adapter remote identity | CHANGED | FS O5 unknown outcome; D33 attempt.id public | RESTORE (new form) | Facts should carry attempt.id, policy decision, writes applied/reverted and unknown; no adapter journal. |
| O4.17 | Stream facts: idle/running/complete/interrupted/failure/defect with hasValue/latest/emissionCount correlation | DROPPED-SILENT | FS O5 streams latest-value projection, no replay | RESTORE (new form) | Closed facts for activity stream lanes. |
| O4.18 | Inconsistent generation/occurrence/retention/latest/reconciliation rejects as InvalidTraceRecord | DROPPED-SILENT | none | RESTORE | Hostile-artifact rejection. |
| O4.19 | Operation discriminants owned by operation capabilities; wire facts never create behaviour | KEPT (implied) | FS O11 evidence is observation; ED 7.4 | none | |
| O4.20 | Context, store, timer and issue facts keep identities and authored order | DROPPED-SILENT | FS O4 context; FS D23 schedules | RESTORE (fold into record list) | Machine/runtime trace events are not enumerated anywhere in the new documents; only entity events are (ED 7.4). Restore a machine-side event table: turn (event, handler level, guard/deny codes, from/to, memory patch digest, actions), schedule armed/fired/restarted, context wave, actor send / SendTargetAbsent, operation facts, lifecycle, issue. |
| O4.21 | Only ordered DiagnosticProjection serialized; no Cause shape, traversal order or fiber ids | DROPPED-SILENT | FS O10 (FlowError carries optional in-process cause) | RESTORE | Containment: raw Cause (stack traces, fiber ids, possibly data) must never reach an artifact. |
| O4.22 | Only in-process FlowDisposeError and FlowStoryExecutionError keep full Cause | CHANGED | FS D10 one FlowError with optional cause | none | Preserved under one error type. |
| O4.23 | Story envelope keeps completed checkpoints, optional end, failure boundary, primary diagnostic, ordered cleanup diagnostics, cancellation, sequence facts, full Cause | KEPT | FS O10; DD diagnostics.ts | none | Cancellation and sequence facts not named; minor. |
| O4.24 | Code InvalidDescriptorId | CHANGED | FS O10 regenerated vocabulary; FS O1 name rules | none | Construction diagnostics remain; exact code name regenerated. |
| O4.25 | Code DuplicateDescriptorId | CHANGED | FS O11 flow check "id collisions" | none | |
| O4.26 | Code DuplicateMachineValue | CHANGED | FS O3 app lists machines | none | Construction check presumed in vocabulary regen; confirm in V2. |
| O4.27 | Codes DuplicateModuleOwnership, MissingModuleReference | DROPPED-EXPLICIT | FS D13 | CONFIRM-DROP | Modules removed. |
| O4.28 | Code InvalidStateDefault | CHANGED | FS O1 compound states name a default; construction throws | none | |
| O4.29 | Code UnresolvedRequirementId | DROPPED-EXPLICIT | FS D15 Layer services (requirements tables gone) | CONFIRM-DROP | Services are Layers; Effect types the requirement. |
| O4.30 | Code InvalidStoryMetadata | CHANGED | FS D42 deletes title/description; Story id kept; archived SurfaceSimplification duplicate ids fail flow check | none | flow check covers ids. |
| O4.31 | Codes InvalidTraceRecord, InvalidLifecycleTransition, InvalidStoryEvidence | DROPPED-SILENT | FS O10 vocabulary regenerated, these not named | RESTORE | Trace import needs specific codes, never generic corrupt (O4.32). |
| O4.32 | ArtifactIdentityMismatch | DROPPED-SILENT | none | RESTORE | With O4.2. |
| O4.33 | WrongArtifactKind (share to raw import) | DROPPED-EXPLICIT | share deleted (D48) | CONFIRM-DROP | Only one artifact kind remains; a version/kind mismatch can use the trace code. |
| O4.34 | InvalidArtifactOperand | CHANGED | ED 7.6 unknown read/entity/key exits 2 | RESTORE (one code) | CLI query refusals still need one code (see O6). |
| O4.35 | Keep exact category/path/bound details; never undefined or generic corrupt-artifact | DROPPED-SILENT | FS O10 | RESTORE (with O2.5) | |
| O4.36 | Reject deleted Scenario/v1/root/child/final/replay shapes | DROPPED-SILENT | none | CONFIRM-DROP | Legacy-shape exclusion is covered by a version discriminant plus closed schema (O4.3, O4.10). |
| O4.37 | Standalone trace import needs no App or gateway; no hidden registry; no public fingerprint API | KEPT | DD `trace.import(bytes)` takes no App | none | |

## O5 Defensive byte export and redacted shares

| Archived ref | Commitment (short) | Status | New location or decision | Recommendation | Reason |
| --- | --- | --- | --- | --- | --- |
| O5.1 | Import/export defensive: caller mutation of bytes cannot affect artifact or Runtime | KEPT | FS O15 "kept: defensive bytes" | none | Restate in FS O11 body (only O15 mentions it). |
| O5.2 | Omitted/empty redactions return byte-identical raw output | DROPPED-EXPLICIT | FS D48 | CONFIRM-DROP | No options. |
| O5.3 | Share artifact kind/version with selected values replaced by "[REDACTED]" and a redactions manifest | DROPPED-EXPLICIT | FS D48, O11, O15 | CONFIRM-DROP (with condition) | Schema `sensitive` annotation is a single mechanism and ED 7.4 makes artifacts carry digests not values. Capability "share a trace without private data" is preserved only if (a) every value that can be private is either Schema-annotated or digested by default, and (b) digests resist dictionary reversal. Condition: specify the digest as keyed (seeded per run in Stories, per Runtime in production) so low-entropy values such as emails cannot be recovered; and state whether machine memory/context values in artifacts are values or digests (ED says artifacts carry digests; FS O11 says only sensitive fields are digests). |
| O5.4 | Never redact identities, fingerprints, versions, discriminants, ordering, sequence, truncation, codes, cleanup, status | CHANGED | D48 annotates application Schema fields only | none | Annotations apply to application fields, so protected structure is safe by construction. |
| O5.5 | Path grammar (ArtifactValuePath), canonical path order, display paths, InvalidArtifactOperand for bad paths | DROPPED-EXPLICIT | D48 | CONFIRM-DROP | Path redaction deleted. |
| O5.6 | Share bounds include manifest; share uncompressed; no share importer/decoder/CLI/proof/replay/persistence/boot | DROPPED-EXPLICIT | D48 | CONFIRM-DROP | No share kind. |
| O5.7 | Opaque payloads (e.g. File) in traces | KEPT | ML 4 "Traces redact such fields" | none | Not in archived plan; noted for completeness. |

## O6 Trace queries and artifact comparison

| Archived ref | Commitment (short) | Status | New location or decision | Recommendation | Reason |
| --- | --- | --- | --- | --- | --- |
| O6.1 | Behaviour diff and live behaviour check compare the same canonical projection, optionally by module; equal/different only | CHANGED | `flow diff --base` (FS O11; DD exit 1 on difference) | none | Behaviour check against a saved artifact is gone with saved artifacts; diff of two revisions preserves the capability. |
| O6.2 | Trace summary reports retained-window counts/timeline, includes marker, outcome completed or incomplete | CHANGED | `flow trace summarize` with `--read/--entity/--sequence` (ED 7.6); ED explain "insufficient evidence" exit 0 | RESTORE (marker/completeness) | New summarize is entity-centred; restore an unfiltered summary (counts and timeline per actor) that always prints the truncation marker and whether evidence is complete. |
| O6.3 | Trace proof requires complete evidence; EvidenceUnavailable on any non-null marker | DROPPED-EXPLICIT | ML 11 "trace proof is deleted"; FS D11, O15 | CONFIRM-DROP | Proving a selector over an artifact duplicates Story assertions on checkpoints (FS O9). Moderately confident: CI on stored artifacts without rerunning Stories loses a yes/no check, but `flow story run` is deterministic and cheap. |
| O6.4 | Selectors issues, timeline, actor:<id>, correlation:<id>; split at first colon; selectors are data | CHANGED | ED 7.6 `--read`, `--entity`, `--sequence` filters | RESTORE | Machine-side filters are lost: restore `--actor <ref id>`, `--issues` and a correlation filter (now `--attempt <attempt.id>`, D33) on `trace summarize`. Keep "filters are data, split at first colon". |
| O6.5 | Query refusals: Failure / InvalidArtifactOperand with details.reason EvidenceUnavailable or UnknownSelector, exact paths and marker | CHANGED | ED 7.6 unknown read/entity/key exits 2; ED 7.6 explain exits 0 with "insufficient evidence" | RESTORE (detail) | Exit codes kept; restore one diagnostic code with a reason detail and the marker so agents can branch on data (FS O10 "branch on stable data"). |
| O6.6 | Under truncation, absence is not ordinary unknown | KEPT | ED 6.3 "the answer says so ('insufficient evidence'), never 'none'" | none | Normative in ED; mirror in FS for machine queries. |
| O6.7 | Trace diff equal only when both complete and every selected section matches | KEPT | DD cli.ts "equal when both traces are complete and match" | none | Reference only; restate in FS O11. |
| O6.8 | Differing retained facts are different even under truncation; matching retained facts with truncation are incomplete (three outcomes) | DROPPED-SILENT | none | RESTORE | Honest comparison: without "incomplete", a matching truncated diff is reported as equal or as an error. Specify outcome and exit status (e.g. exit 0 with "incomplete", or a distinct exit). |
| O6.9 | Incompatible App/AppPlan identity is failure, not difference | DROPPED-SILENT | none | RESTORE | With O4.2. |
| O6.10 | Sections event-sequence, transitions, state-changes, issues, resource-patches, resource-freshness, transaction-outcomes, stream-outcomes, timer-behavior; default all | CHANGED | ED 7.6 adds `repairs`; no other section named | RESTORE | Restore the section set in the new vocabulary (events, transitions, states, issues, resources, freshness, transactions, streams, schedules, sends, lifecycle, repairs), default all. |
| O6.11 | CommandLine owns process projection and exit status without redefining meanings | KEPT | FS O11 "one result deciding output and exit status"; DD cli.ts exit 0/1/2 | none | |

## Decisions

| Archived ref | Commitment (short) | Status | New location or decision | Recommendation | Reason |
| --- | --- | --- | --- | --- | --- |
| D1 | Canonical structure shared and private; adapters own I/O, apps own codecs, CLI owns transport; one model feeds Story/CLI; no extra decoder/public schema | KEPT (partial) | FS D2 one representation; FS O11 shared codec | none | App codecs replaced by Schemas (D41). |
| D2 | Share output has no evidence authority | DROPPED-EXPLICIT | FS D48 | CONFIRM-DROP | No share kind. |
| D3 | Observable guarantees (atomic cuts, global order, accepted-prefix drains, nonblocking sinks, causal reads, pre-commit capacity refusal) replace prescribed choreography | KEPT (partial) | ML intro "Guarantees ... all stay; only their vocabulary moves inside"; FS D7 | RESTORE (drains, capacity refusal) | Atomic/ordered/nonblocking kept; accepted-prefix drain is lost (O1.25). |

## Constraints

| Archived ref | Commitment (short) | Status | New location or decision | Recommendation | Reason |
| --- | --- | --- | --- | --- | --- |
| C1.a | Keep schemas closed: every required wire field, discriminator, correlation, bound; no alternate decoder, migration envelope, public TurnRecord hierarchy, raw Cause carrier, artifact-specific bound | DROPPED-SILENT | none | RESTORE | See O4.10, O2.11, O4.21. |
| C1.b | PackageContract owns inspect-route deferral and restoration gates | DROPPED-EXPLICIT | FS O15 PackageContract "deleted: the temporary restoration lists" | CONFIRM-DROP | Ceremony. |
| C2 | No actor retention setter, mutable TraceLog, implicit persistent history, fabricated trace, sink-owned actor work, share input, snapshot-based replay | KEPT (partial) | DD "Observation never starts work"; FS O8 no replay; FS O11 | RESTORE (one line) | Restate "inspection never starts work, never mutates, never persists implicitly, no fabricated traces" in FS O11; currently only a reference-file comment. |
| C3 | Checks are planned obligations | DROPPED-EXPLICIT | FS verification all "Planned" | CONFIRM-DROP | Process wording; FS keeps the same posture. |

## Verification

| Archived ref | Commitment (short) | Status | New location or decision | Recommendation | Reason |
| --- | --- | --- | --- | --- | --- |
| V1 | Pure projections start no work; live records match production; one formatter; private types absent from packed declarations | KEPT (partial) | FS V2 golden internal representation without running callbacks; FS V10 packed consumers | none | |
| V2.a | Byte validity vectors (ASCII, 2/3/4-byte, malformed UTF-8, 256/257-byte names, lone surrogates, composed/decomposed) | KEPT (names) / DROPPED-SILENT (artifact content) | FS V2 "ported name and key byte vectors" | RESTORE | Extend FS V9 with artifact-content byte vectors. |
| V2.b | Structure and exact-bound vectors (malformed JSON, duplicate keys, cycles, -0, non-finite, each bound edge) | KEPT (partial) | FS V9 "trace round trips and bounds" | RESTORE (detail) | FS V9 names bounds but no bound values exist to test (O2.6-O2.10). |
| V2.c | Compression vectors | DROPPED-EXPLICIT | compression deleted | CONFIRM-DROP | |
| V2.d | Identity/readiness validation: construction reads nothing; ready validates before acquisition; failure leaves state unchanged; artifact paths invoke no boot decoder | KEPT | FS V6 restore without replay; FS O3 | none | |
| V2.e | Host portability: full vectors on Node; compact fixture on Bun, Deno, Chromium, Gecko, WebKit; equal bytes/digests | DROPPED-SILENT | none | RESTORE | Needed for SSR and for digests (D48) to match across hosts. |
| V3.a | Committed ordering and lifecycle vectors | KEPT (partial) | FS V3 one versioned store cut | RESTORE (lifecycle ordering) | Add lifecycle-evidence ordering to FS V3/V9. |
| V3.b | Stalled and failing sinks: ack and fanout complete with a held sink; failing sink detaches alone | DROPPED-SILENT | none | RESTORE | Production observer guarantee needs its race test in FS V9. |
| V3.c | Capacity, attachment, truncation vectors | DROPPED-SILENT | none | RESTORE | With O1.26. |
| V3.d | Drain, exhaustion, reverse-dependency disposal vectors | DROPPED-SILENT | none | RESTORE | With O1.25, O3.19. Existing baseline `packages/flow-state-rewrite/src/runtime-next/test/evidence-sink-owner.test.ts` is covered by FS O13 "evidence journal: port the algorithms and their behavioural tests". |
| V4 | Schema vectors: round trip, ordering, nulls, SHA-256 recomputation, App mismatch, every operation union, lifecycle tuple, end/failure/cleanup, negative mapping; nested layouts pending | DROPPED-SILENT (mostly) | FS V9 "trace round trips"; ED 7.6 asks for "the recorded domain layout in the inspection schema" | RESTORE | Needs a schema to test; follows O4 restores. |
| V5 | Share redaction vectors | CHANGED | FS V9 "sensitive-field digests" | none | Replaced with digest vectors; add a dictionary-resistance vector (O5.3). |
| V6 | Selector, comparison, identity, incomplete-evidence vectors through programmatic and installed CLI; stderr-only, exit 2 | KEPT (partial) | FS V9 "every CLI leaf's output and exit status" | RESTORE (cases) | Name the incomplete-diff and identity-mismatch cases in FS V9. |

## Questions

| Archived ref | Commitment (short) | Status | New location or decision | Recommendation | Reason |
| --- | --- | --- | --- | --- | --- |
| Q2.a | inspectActivities form | CHANGED | s.activities lanes | CONFIRM-DROP | See O1.10. |
| Q2.b | buildBehaviorContract({ app, stories }) and renderBehaviorCoverage | DROPPED-EXPLICIT (build) / DROPPED-SILENT (coverage) | FS O11 | CONFIRM-DROP (build), RESTORE (coverage) | See O1.21, O1.22. |
| Q2.c | Compression async form | DROPPED-EXPLICIT | FS O11 | CONFIRM-DROP | |
| Q2.d | analyzeTrace form | CHANGED | flow trace summarize | CONFIRM-DROP | |
| Q2.e | sliceBehaviorContract form | DROPPED-EXPLICIT | modules removed | CONFIRM-DROP | |
| Q2.f | renderBehaviorDiff form | CHANGED | flow diff | none | |

## Conflicts found in the new documents (for the plan owner)

1. FS O11 says `flow-state/inspect` exports `inspect(app)`; ED 7.5 (normative) uses `inspect(runtime).domains.notes.answers()` as a passive current-state read, and ED 7.6 lists it as an amendment. FS should say whether `inspect` also accepts a Runtime.
2. FS O11 says only fields annotated `sensitive` become digests; ED 1.2 and 7.4 say artifacts carry digests, not values, for entity events. State which values a trace artifact carries for machine memory, context and events.
3. FS O2 lists "lifecycle fact" as a mailbox input decided in a macrostep; the archived rule (and the evidence model) says lifecycle never produces a machine turn.
4. ED 5.6 and 6.3 bind evidence retention to "InspectionAndArtifacts O3", which FS C1 makes provenance-only.
5. DD `attachInspector(runtime, sink)` returns a synchronous `detach`; the archived reference returned `{ drain, snapshot, dispose }` with a capacity. FS O11 does not specify the return.
