# Pre-coding audit and implementation plan

Status: resolved pre-coding audit; normative decisions have been promoted into the contracts, proof matrix, and phase manifests

## Outcome

The implementation pack is coherent enough to execute Phase 0. All owner questions found by this
audit were resolved on 2026-08-09 and promoted into the normative contracts; product implementation
still begins only after Phase 0 creates the executable proof/deletion indexes and green receipt.

No product, example application, export, test source, or runtime source was changed during this
audit. Existing unrelated worktree changes were preserved; this pass changed only the
implementation contracts, phase manifests, rationale, audit, test catalog, and illustrative
examples needed to make the coding boundary explicit.

## Material read and checked

The audit followed the complete 29-file transitive Markdown link graph rooted at
`implementation/README.md` and `implementation/tasks/README.md`, including every contract, all
nine phase manifests, the scratchpad, workflow coverage, quick examples, and the linked XState
parallel-workflow source. It also read the two textual authority inputs,
`DESIGN_DECISIONS.md` and `IMPLEMENTATION_BLOCKERS.md`, the receipt convention, every live package
entry point and export map, the named source/test/example evidence, and the installed Effect v4
source used by the pinned dependency.

The link graph currently has no missing file target. This only proves link existence; Phase 0 must still index textual file citations and contract IDs because many authoritative references are code-formatted paths rather than Markdown links.

## Current checkout and baseline

- Starting commit: `3fdc1023037bb54b251018eac1246bdf54447f14` on `main`.
- Pre-existing worktree: 24 modified implementation/rationale files, one deleted `implementation/BLOCKER_RESOLUTIONS.md`, and three untracked contract companions; these changes predate this audit and must be listed in every overlapping receipt.
- Toolchain: Node `22.22.1`, pnpm `10.13.1`, Vite Plus `0.2.1`, TypeScript `6.0.3`, Vitest `4.1.9`, Effect and Effect Platform Node `4.0.0-beta.86`, React `19.2.7`, Next `16.2.9`, and Playwright `1.61.1`.
- Effect source: `/Users/arpit/.effect` exists but is Effect `3.19.15`, so it is not valid evidence for this implementation; use the pinned installed source at `node_modules/.pnpm/effect@4.0.0-beta.86/node_modules/effect/src` and the matching vendored source at `docs/codebases/effect-v4/packages/effect`.
- Live package tests: 130 files and 1,086 tests passed.
- Library evidence: source typecheck, package build, build-output hygiene, TypeScript-mode proofs, and packed-consumer proofs passed.
- Existing examples: all six maintained example builds and the shared CLI acceptance check passed.
- Browser evidence: ordinary Playwright passed 9 tests and skipped the supervisor-only restart case; `test:acceptance` then passed all 10 cases under the isolated supervisor.
- Documentation: the Vocs production build passed.
- Broad gate: the first sandboxed `pnpm verify` stopped when Turbopack could not bind an internal port; the same Incident Console build and browser suite passed outside the sandbox, and the complete port-capable retry exited 0 as the authoritative broad baseline.

The green baseline proves the current implementation is internally consistent. It does not prove any vNext contract, because the live exports, runtime, React hooks, test executor, artifacts, CLI, and examples are still the owners the phase plan intends to replace.

## Resolved decisions required before Phase 1

### A1 — Durable binding identity is not serializable as written

`GLO-09`, `SEM-019`, and `WIRE-007` included declaration-object and outcome-map identity in a durable activity identity, but object and function identities do not survive a process boundary. Resolution: use the compiled machine ID, state token, activity kind, zero-based declaration ordinal, and materialized ref/key as the stable binding identity; declaration reordering requires a `persistenceVersion` migration, and allocation identity or function source is never serialized.

### A2 — Public snapshot start cannot restore private actor truth

`TEST-003` said a story snapshot start restored one public actor snapshot, while `ActorState` deliberately keeps binding cursors, pending outcomes, activity identities, and store authority private. A public snapshot also cannot reconstruct the canonical shared store without promoting an actor projection into store truth. Resolution: remove snapshot starts from vNext and permit only fresh starts or complete branded boot starts; `ActorSnapshot` remains observation-only.

### A3 — SSR preload conflicts with a construction-fixed server snapshot

`HOST-014` requires `getServerSnapshot` to read the fixed construction snapshot, while the same rule and `HOST-015` require server preload through actor events before render. A post-construction preload cannot appear in the original construction snapshot. Resolution: preload in one request runtime, dehydrate and dispose it, then construct a mutation-free render runtime from that boot so its construction snapshot is fixed and preloaded; hydrate the client from the same boot.

### A4 — Branded boot migration has no public re-entry path

The root exports an app-branded `RuntimeBootPayload<App>`, while WIRE requires application code to validate opaque memory and payloads before passing unknown storage input to `runtime`. The public API did not define how validated unknown data received the brand without an assertion or private codec. Resolution: expose `decodeRuntimeBoot(app, unknown, { decodeDomain })` as the sole app-bound re-entry path; it defensively copies and validates the exact-version Flow envelope, visits each opaque slot once for application validation/normalization, and returns the branded payload without widening `runtime.boot` to unchecked `unknown`. A persistence-version change rejects boot rather than attempting generic identity migration.

### A5 — Canonical carrier rules need one exact hostile-input contract

`GLO-05` and `WIRE-001` were less strict than `WIRE-016`, which also rejects accessors, symbol keys, unsupported prototypes, sparse arrays, reserved prototype keys, and oversized/deep inputs. Neither contract settled `-0`, whose JSON round trip becomes `0`, or the exact encoded text. Resolution: use the WIRE-016 walker for every canonical ref/key constructor, reject `-0`, accessors, throwing proxies, reserved prototype keys, sparse arrays, symbols, and unsupported prototypes synchronously, and emit WIRE-001A compact canonical JSON for both in-process identity and artifacts.

### A6 — Composite ID encoding and collision namespaces are underspecified

Actor IDs concatenate app, root, machine, parent, and host segments, but allowed ID characters, escaping, maximum lengths, reserved delimiters, and the collision namespace across machines, descriptors, views, fixtures, controls, tags, and host IDs were not completely fixed. Resolution: preserve exact source spelling with no Unicode or locale normalization, reject empty, control-containing, lone-surrogate, or over-256-byte UTF-8 values, encode composite identities with length-prefixed segments, order keys by raw UTF-16 code units, and use named collision namespaces rather than one accidental global namespace.

### A7 — Construction failure must be atomic across several roots

`HOST-001` says a root memory-factory defect fails synchronous runtime construction before a handle or activity escapes, but the contract did not say what happened when a later root factory failed after earlier allocation, or when a dynamic/child factory failed. Resolution: materialize root memories into private locals in compiled root order before creating any shell cell, queue, or registry entry; on failure discard the locals and call no later factory, while dynamic/child creation uses the same publish-after-success rule.

### A8 — Dynamic lookup wording should cover every existing durable incarnation

The public API example looks up a stable dynamic actor after ordinary creation, while several phase statements said the overload returned a "restored" actor. Resolution: `runtime.actor(machine, { id })` looks up any currently registered stable-ID dynamic actor, whether freshly created or hydrated, and never creates, adopts, or revives it.

### A9 — Time-control edge behavior is missing

The story contract did not define backward `setTime`, `advanceToNextTimer` with no timer, invalid durations, equal deadlines, or `maxTurns` validation. Resolution: reject backward, negative, non-safe, and non-finite time, allow equal `setTime`, make no-next-timer an immediate command error with pending-work evidence, process equal deadlines in stable runtime order, and require `maxTurns` to be a positive safe integer before runtime acquisition.

### A10 — Type-performance ownership contradicts itself

`TYPE-P04` says peak memory is recorded but must not gate because it varies by host, while Phase 6 asked for checked-in instantiation and memory ceilings. Phase 1 also required the large-app baseline before Phase 6 created the named performance command. Resolution: Phase 1 owns the app carrier fixture, declaration and instantiation gate, and non-gating memory telemetry; Phase 6 adds story/model fixtures to the same command without converting memory or wall time into release gates.

### A11 — Proof ownership is partial and receipt naming is inconsistent

Several `PROOF-*` rows were described as partially closed by several phases, but receipts must list closed IDs and the task index had no single proof-owner table. Receipt naming was also `PHASE_<N>.md` in the receipt README and task index, but long descriptive filenames in Phases 5–8. Resolution: Phase 0 splits broad proofs into stable subcase IDs with exactly one closing phase, permits later phases to rerun dependency cases without closing them twice, and uses `PHASE_<N>.md` throughout.

### A12 — The open-question ledgers disagree

The implementation README and scratchpad said only `SP-B025` and `SP-N003` remained open, `IMPLEMENTATION_BLOCKERS.md` labeled Q1–Q12 as open, and Phase 8 said to resolve B12/Q12. Resolution: Q1–Q12 are historically resolved by named contract IDs, Phase 8 implements and proves the already settled runbook lease rule, and the scratchpad contains no open semantic item.

### A13 — Callback-produced refs cannot expand a pure AppPlan invisibly

Preview callbacks, transaction invalidation callbacks, and computed invalidation selectors may materialize refs that are not statically visible in their binding objects, while AppPlan must compile the complete resolver closure without executing callbacks. Resolution: callbacks may return only refs whose descriptor AppPlan already admitted through an explicit root or binding closure, validate that fact before mutation, and do not add a second public dependency tuple.

### A14 — The exact token and transition algorithm is not yet normative

The public grammar listed allowed state-node properties but did not fully define token fields, event payload collision rules, exact guard/update argument objects, exhaustive state records, shallow memory merge, ordered transition and redirect selection, default `reenter`, timer-delay evaluation, guard defects, or `can()` parity. Resolution: use frozen `{ kind, name, id }` tokens and readonly plain event envelopes, forbid payload-owned `type`, and make the contract's single pure microstep algorithm authoritative for execution and `can()`.

### A15 — One-argument `useView` cannot be compile-time root-branded as declared

A view is constructed before a module/app decides whether it is public, yet `TYPE-013` said `useView(view)` was available only for public root views. Resolution: keep the selected type statically exact, resolve the view through the provider runtime's AppPlan at runtime, and throw a deterministic zero-or-multiple-root diagnostic.

### A16 — Application requirements must exclude Flow-owned Scope

Descriptors preserve their exact raw Effect requirement `R`, while execution wraps each activity with `Effect.scoped`; in pinned Effect v4, that removes `Scope` from the resulting environment. Resolution: descriptor internals retain raw `R`, while `RequirementsOf` removes `Scope.Scope` because the Flow ManagedRuntime owns it.

### A17 — Several "exact" public snapshot unions are still narrative

The transaction union stored a broad `TransactionRef` instead of carrying its exact ref type, and stream, timer, and child unions were described rather than normatively enumerated. Resolution: parameterize transaction snapshots by exact `Ref` and make the enumerated members and field-absence rules in `SNAPSHOTS.md` exhaustive.

### A18 — The public cutover cannot stay green under the current phase boundaries

Phase 1 was required to delete the old public grammar while forbidding runtime/story/server/CLI replacement work and passing packed consumers that execute the old API. A later staggered route switch also violated CUT-001 and could not keep legacy testing/server/inspect compatible without a forbidden grammar translator. Resolution: build and prove vNext only through package-private entry points in Phases 1–6, leave every installed route on unchanged legacy owners, then atomically switch all six routes and the CLI in Phase 7 while deleting every legacy engine in the same gate.

### A19 — Inspection sink attachment and drain semantics have no public owner

`API-017` named `attachInspectionSink`, but the runtime handle exposed no attachment point or delivery law. Resolution: attach only to a live runtime, return an idempotent disposable attachment with an ordered drain barrier, admit records after state publication without delaying actor acknowledgement, detach a failing sink while preserving committed runtime truth, and use the exact bounded-buffer shapes in `WIRE-018`.

### A20 — CLI artifact and filesystem laws stop short of implementable detail

The CLI requires atomic sibling replacement and deterministic diagnostics but did not settle several hostile filesystem and gateway cases. Resolution: never follow an output symlink, require `--force` to replace the link itself, create `0600` sibling temporaries, emit stable-key UTF-8 JSON plus one newline, preserve execution as the primary Cause while retaining write/cleanup failures, reject realpath escapes and undeclared bare imports before evaluation, bound decoded and compressed input, and define named diagnostics even where categories share exit 2.

### A21 — Several confirmed issues are assigned to the wrong implementation owner

The task index said every issue had exactly one phase, but I16 canonical-ref validation was assigned to Phase 7, I10 mixed Phase 4 runtime identity with Phase 6 model identity, and I5 mixed Phase 3 resource ownership with Phase 5 React deletion. Resolution: I16 belongs to Phase 1, and I10 and I5 are split into dotted sub-IDs with exactly one implementation phase each.

### A22 — Root authority cleanup both keeps and deletes `TASK.md`

Phase 8 first replaced root `TASK.md` with a short pointer, then listed the file for deletion, while `CUT-P06` kept the pointer. Resolution: retain `TASK.md` as the exact short pointer, delete its superseded contents and root `tasks/**`, and prove that one outcome in the deletion manifest.

### A23 — Phase 7's required CLI gate still asserts the grammar it deletes

`pnpm check:example-cli` currently requires grammar that Phase 7 replaces. Resolution: migrate the acceptance script inside Phase 7 against a minimal packed vNext behavior/story gateway before running the gate; Phase 8 may move that fixture into the final applications but cannot own the first vNext CLI proof.

### A24 — Stream pressure is public but has no semantic contract

The descriptor exposed `pressure?` and the proof/phase files required pressure behavior, but no strategy union, capacity, overflow, coalescing, terminal, or persistence rule existed. Resolution: remove Flow's `pressure` option and its runtime proof claim; Effect Stream or explicit application operators own backpressure, dropping, and coalescing.

### A25 — Callback defects after a canonical commit have no outcome matrix

The contained-defect rule covered callbacks that fail before StoreState commit, but several callbacks can fail after another owner committed truth. Resolution: the callback matrix in `SEMANTICS.md` owns mutation boundaries, retained facts, cursor/outcome disposition, public issues, TurnRecord Causes, and continuation; no callback defect rolls back committed store truth or leaves a half-materialized event.

### A26 — Public issue identity and clearing rules are undefined

Snapshots said resolved issues disappeared but did not define issue identity or clearing. Resolution: give each occurrence a generation-bearing ID, use a separate generation-free actor/source/binding clearing-owner key, clear older operational occurrences when a later generation of that owner succeeds or releases, and retain unrelated plus fatal/cleanup issues through their required lifetime.

### A27 — Transaction concurrency keys and stale `allow` completion are underspecified

Transactions exposed `key`, `scope`, and four concurrency policies, while the runtime required a Queue per canonical concurrency key without defining the tuple or cross-actor scope. The `allow` policy also did not say what an older completion may project after a newer generation exists. Resolution: remove transaction `scope`, key concurrency by actor ID plus exact transaction ref, and allow every generation to settle overlays/evidence while only the latest admitted generation may project or route.

### A28 — Managed-child non-success terminals have no routing contract

Successful child completion was defined, while other terminals lacked one routing contract. Resolution: children have no typed failure lane; success, defect, and interruption route only explicitly authored mappings, planned stop never routes, the final projection remains until binding replacement/release, and child Scope releases exactly once.

### A29 — `FlowStoryExecutionError` lacks an exact public declaration

The testing contract described fields but did not fix the exact public error. Resolution: `API-013A` publishes the readonly `FlowStoryExecutionError` class/tag, prepare versus command phase, mutually exclusive evidence, cleanup settlement, command context, and Cause preservation across packed boundaries.

### A30 — Observer structural sharing says both shallow and recursive

The semantic and Phase 5 contracts required recursive reuse for acyclic arrays/plain records, while the host contract called the behavior shallow. Resolution: use recursive structural sharing with cycle detection, preserve functions/classes/cycles by identity, and make `HOST-009` own that algorithm and the selector-exception cache.

### A31 — Focus refresh and StoreFanout hint cardinality are inconsistent

Reconnect had an eligibility matrix but focus appeared only in proofs, and StoreFanout had conflicting cardinality. Resolution: focus uses the reconnect eligibility rule—active observe ownership, missing/stale data, no current generation—and each revision carries an ordered deduplicated immutable vector of changed refs; any revision gap forces a whole-state reread.

### A32 — Zero-time freshness/GC and consumed finite leases need ordering

The contracts allowed zero stale/GC time and consumed finite bindings without fixing ordering or release. Resolution: publish success as fresh first, schedule zero-deadline stale/GC work as later deterministic StoreState turns, and retain a consumed binding's lease until its containing configuration activation releases.

### A33 — Disposed readiness, sequence overflow, and fixture Clock exclusion need enforcement

Provider behavior omitted disposed state, safe-integer outcome sequences lacked an overflow rule, and fixture Layers forbade Clock replacement without enforceable ownership. Resolution: a disposed provider throws one stable host diagnostic, sequence overflow fails the actor invariant before mutation or reuse, fixture output excludes Clock/TestClock, and the runner installs and verifies its private TestClock at the final composition boundary.

## Second adversarial pass

### A34 — Canonical Unicode and ordering drifted from the proven package law

The first pass selected NFC plus UTF-8 ordering, while the live package deliberately proves raw JavaScript UTF-16 ordering and distinct composed/decomposed identities. Resolution: retain exact source spelling, raw UTF-16 key order, no `localeCompare` or normalization, length-prefixed composite segments, and compact canonical JSON; malformed strings and negative zero still reject.

### A35 — Initialization, redirect, `can`, and timer microsteps lacked exact boundaries

Fresh redirects, hydration behavior, callback arguments, fallback redirects, the 100-step cutoff, guard defects in `can`, fixed-delay conversion, guard-false timer consumption, equal-deadline ordering, and overdue boot timers were incomplete or contradictory. Resolution: fresh actors stabilize before first publication, hydration never restabilizes, redirects receive no event, `can` rethrows the original guard defect without mutation, microstep 101 is never invoked, durations become checked safe-integer milliseconds, and one-shot timers persist/restore absolute deadlines under stable actor/slot ordering.

### A36 — Outcome mappers and direct activity overloads were not implementable types

Resource, transaction, stream, and child outcomes named lanes without fixing their parameters, Cause absence, `never` channels, or direct-ref options. Resolution: success/value/failure receive only their exact typed value, complete/defect/interrupt receive no input except child complete receives the exact final child snapshot, Cause never enters a mapper, direct resource options contain only outcomes, and zero-arity transaction/stream/child overloads are explicit.

### A37 — Transaction concurrency was unreachable through retained binding semantics

An `activity.run` binding that started once per configuration could never admit two equal-ref attempts, making reject/cancel/allow/serialize mostly unusable. Resolution: transaction run is edge-triggered on activation plus accepted domain-event/timer turns, every non-null selection is a distinct admission, internal/store null-cause turns neither admit nor release, and state exit/disposal owns all active or queued attempts. Preview and invalidation plans materialize atomically at admission before any external commit.

### A38 — Boot validation still exposed mutation and compatibility holes

A two-argument decoder could neither validate private opaque slots nor reject reordered declaration slots, and callback traversal could observe caller mutation. Resolution: the exact-version decoder defensively copies Flow structure, checks app plus AppPlan fingerprint before callbacks, visits a closed opaque-slot union once in canonical order, freezes inputs, revalidates/copies outputs, rejects Promises, preserves callback throws, records `capturedAt`, and discards boot on persistence-version change.

### A39 — Staggered public routes violated the atomic compatibility boundary

Root/React in Phase 5 and testing in Phase 6 could not coexist with legacy secondary routes without a forbidden grammar translator. Resolution: vNext remains package-private through Phase 6 and Phase 7 switches root, React, testing, server, inspect, and CLI together, with no installed package exposing both engines.

### A40 — Pending Layer disposal and post-publication sequencing could hang or half-commit

ManagedRuntime does not start a consumer until Context acquisition, so an ordinary queued dispose could hang forever; TurnRecord overflow was also discovered only after actor/store mutation. Resolution: the shell owns an out-of-band pre-ready terminalization path, ready cleanup closes actor scopes before ManagedRuntime/Layer scope, the hub preflights a globally serialized commit permit before StoreState mutation, commit-to-hub acceptance is uninterruptible, and sinks wait on an acknowledgment-release gate.

### A41 — Store-global lookup execution had the wrong Scope owner

A shared exact-ref lookup could not belong to the first actor Scope because another registered actor might still need it after the first leaves. Resolution: StoreKernel's runtime Scope owns the lookup FiberMap generation and in-flight lease; actor Scopes own registrations and RcMap leases, and an unregistered generation may still settle/warm canonical data until exact-ref replacement or runtime disposal cancels it.

### A42 — Inspection could overclaim truth and completeness

Pure snapshots omit binding cursors and pending outcomes, late sinks could look complete, and repeated attachment could mix runtime-local sequences. Resolution: `inspectActivities` reports desired authored bindings from one planner pass while actual facts come only from TurnRecords; buffer sinks are one-runtime/one-attachment values, mark the missing pre-attachment prefix, expose exact snapshot/clear shapes, and use prefix-bounded drain/dispose with failure isolation.

### A43 — Story progress and model discovery depended on unavailable or ambiguous state

Pinned TestClock does not expose arbitrary sleeps, settle could call blocked work complete, and boot model paths cannot predict restored pending outcomes. Resolution: progress sees only registered Flow deadlines, treats arbitrary sleeps/external waits as unknown finite work, defines one exact sweep and post-time flush, restricts model bases to fresh starts, requires a canonical application state key, fixes BFS/DFS/candidate order/bounds, and returns explicit truncation metadata.

### A44 — Opaque immutability, counter origins, and diagnostics were implicit

Without an ownership rule, mutating an application value could bypass revisions; counters and synchronous failures also lacked stable origins or codes. Resolution: Flow freezes/copies its own containers and durable carriers but treats opaque domain graphs as application-owned immutable identity values, every counter has a fixed zero/one origin and pre-mutation overflow rule, and synchronous misuse has one frozen structural `FlowUsageError` tag/code/details shape.

### A45 — Binding equality confused semantic keys with incarnations

Activation generation was inside binding identity, stream/child replacement compared opaque input as well as key, and issue clearing required the failed generation itself to succeed. Resolution: `BindingKey` excludes generation, stream/child canonical key is the sole replacement projection and retains original materialized input for equal key, and issue occurrence ID is separate from its generation-free clearing-owner key.

### A46 — Boot activation could be overtaken by an early host event

Appending ordinary post-commit reconciliation while the boot mailbox already contained early events placed activation behind those events. Resolution: the restored-activity barrier enacts its nonblocking ownership continuation before taking the next Queue item; ordinary turns retain tail-enqueued reconciliation and the explicit story flush boundary.

### A47 — Terminal evidence could become impossible at counter exhaustion

Preflighting only the initiating turn still allowed ordinary work or hostile boot to consume the final actor/store/TurnRecord counter values, leaving no revision for required disposed snapshots and cleanup facts. Resolution: keep one actor-revision and TurnRecord credit per live actor plus one StoreState cleanup credit outside ordinary admission, reject boot or dynamic creation that cannot fund the enlarged reserve, and spend terminal credits in raw actor-ID order.

### A48 — Disposal and request failure surfaces could lose Cause truth

Actor finalizers, StoreKernel cleanup, and Layer finalizers complete at different ownership boundaries, while request code could deduplicate equal error objects. Resolution: internal owners return `Exit`, runtime composes full Causes in stable actor/store/Layer order and exposes one cached `FlowDisposeError`, and request helpers use ordered `AggregateError([primary, cleanup])` even when both entries are reference-equal.

### A49 — Artifact envelopes, Cause bytes, and CLI results remained open records

Kind/version alone did not define behavior/trace compatibility, `data: unknown` permitted renderer drift, and arbitrary Error stacks could not produce stable bytes. Resolution: Phase 0 freezes exact private Schemas plus canonical byte goldens for every envelope/member, artifacts use a structural stack-free Cause projection or reject `NonCanonicalTraceCause`, CLI result data and diagnostic codes are closed per command, and gzip rejects extra members/trailing bytes under independent streaming caps.

### A50 — Gateway containment and output failure claims exceeded implementable guarantees

Checking only the entry realpath allowed imported-file escape, ancestor manifest lookup changed authority, no-force rename could clobber a race, and EPIPE cannot promise a rendered error on the failed stream. Resolution: use only the selected root manifest, require regular inputs, preflight every relative dependency and reject computed loading before evaluation, publish absent outputs with hard-link commit, and make a single buffered stream write whose EPIPE chooses exit 2 without recursive rendering.

### A51 — React-major and server-snapshot proof was compile-only

The existing packed loop typechecked React 18/19 without rendering, and a hook-local server cache could reset on every invocation. Resolution: MachineObserver owns one immutable prepared server selection outside render, and both React majors execute the readiness, failure, disposal, Strict Mode, selector, SSR/hydration, and subscription-race matrix in packed consumers.

### A52 — Three adversarial boundaries were covered only by neighboring tests

Pending-Layer disposal did not explicitly account for buffered public commands and shell inventory,
same-instant resource expiry/invalidation/refresh/reacquisition had no integrated ordering oracle,
and signal tests did not pin the artifact link/rename boundary. Resolution: pre-ready disposal
discards public work without callbacks and proves zero shell inventory, resource facts serialize
through ordinary StoreKernel permit order with generation/epoch rejection, and signal behavior is
tested on both gated sides of the exact filesystem commit.

## Assumptions safe to carry into coding

- The implementation folder is the only normative target; old tasks, docs, current examples, and live APIs are migration evidence rather than compatibility requirements.
- There is one semantic owner per executable runtime for compilation, actor publication, canonical store state, activity lifetime, history, story execution, and host disposal; an unreachable package-private vNext migration tree may coexist with public legacy code only until the atomic Phase 7 cutover.
- The code may break the alpha API inside its owning phase, but the replacement and deletion proof must land together and packed consumers must fail closed for removed imports.
- Effect failures, defects, interruptions, and cleanup Causes remain distinct until the final JavaScript host boundary; no `try/catch` inside `Effect.gen`, `Effect.result` for operation completion, or `Cause.squash` inside the runtime.
- Effect-native primitives are mechanics, not product semantics: `ManagedRuntime`, `Queue`, `SubscriptionRef`, `FiberMap`, `FiberSet`, `RcMap`, `Scope`, `Schema`, and `TestClock` may own execution, but Flow generations, identities, atomic publication, and artifact laws remain explicit.
- React receives an already-created runtime and only resolves command handles or subscribes through a machine view; component mount count never owns work, cache policy, actors, or disposal.
- TestClock and controlled boundaries replace wall-clock sleeps and implementation-private mutation; source-text tests are inventory hints until replaced by behavioral or declaration proof.
- No phase advances on a green subset, an unrecorded skip, a missing deletion, or a broad gate whose focused hostile proof is absent.

## Resources and owner map

| Area                                 | Current evidence and target owner                                                                                                                                                    | First phase allowed to change it |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Public descriptors and type carriers | `src/core/api/**`, `src/descriptors/**`, `src/index.ts`, packed/type fixtures; target is pure definition values plus immutable AppPlan                                               | 1                                |
| Runtime and actor lifecycle          | `src/runtime/contract-runtime.ts`, `src/core/orchestrator/**`, runtime lifecycle/tests; target is one shell plus one ManagedRuntime and Queue actor engines                          | 2                                |
| Canonical resource state             | `src/core/store/**`, `resource-store.test.ts`; target is one revisioned `SubscriptionRef<StoreState>` with Flow generations and leases                                               | 3                                |
| Transactions and activities          | `src/core/transactions/**`, transaction orchestrator files, stream/child/timer owners and race oracles; target is exact refs, ordered overlays, and scoped reconciliation            | 4                                |
| React and request hosts              | `src/react/**`, `react-entry.ts`, `src/runtime/request-runtime.ts`, React 18/19 packed consumers; target is provider readiness, command-only actor lookup, and MachineObserver views | 5                                |
| Stories and models                   | `src/testing/**`, `src/core/machines/flow-paths.ts`, current flow-test/story/model suites; target is one immutable plan and scoped runner                                            | 6                                |
| Boot, artifacts, inspection, CLI     | rehydration, inspection, behavior and CLI files/tests; target is shared v2 codecs, one TurnRecord hub, explicit bounded sink, shared story runner                                    | 7                                |
| Proving applications and deletion    | six current examples, package scripts, docs, source-text architecture tests; target is three showcase apps plus package/type fixtures                                                | 8                                |

Implementation work should use the installed Effect v4 source, the pinned lockfile, existing deterministic race fixtures where their oracle is still valid, and the package-local Chromium harness. Browser commands require local port access; the acceptance supervisor is the no-skip browser closeout command.

### Required harnesses and fixtures

- Add a package-private actor proof kit using Deferred Layer acquisition, gated Effects, finalizer counters, TurnRecord sinks, and pending-outcome capture cuts; it must drive production owners and never fabricate snapshots.
- Add a StoreKernel race kit with exact-ref collision inputs, controllable generations, lease epochs, revision gaps, overlay-order oracles, and one TestClock; production normalization helpers cannot be their own oracle.
- Add real React 18 and 19 runtime fixtures for readiness, Strict Mode, subscription races, structural sharing, and SSR rather than relying on the current install-and-typecheck loop, and create the missing `src/runtime/request-runtime.test.ts` named by Phase 5.
- Add the four Phase 6 story-plan/control/runner/model proof files, a `check:type-performance` command, pinned small/medium/large fixtures, and parsed TypeScript extended-diagnostic baselines before those names become exact gates.
- Define the private boot-v2 schema and normalizer extension seam in Phase 2, then extend it with StoreState in Phase 3 and activities in Phase 4; Phase 7 should expose and reuse a proven codec rather than discover that earlier state is not encodable.
- Add hostile raw artifact bytes and byte goldens, read-only and escaping gateway/import projects, duplicate Effect/Flow installations, and deterministic filesystem/signal fault injection at encode, drain, write, flush, close, link/rename, EPIPE, and cleanup boundaries.
- Add a browser lifecycle driver that counts runtimes, actors, subscriptions, resource leases, sinks, listeners, and fibers across mount, discard, hydration, identity replacement, and final disposal.

## Coding plan

### Reviewable internal shapes

These are architecture constraints, not public exports. They keep the implementation seams small
enough to review before code exists:

```ts
type RuntimeShell = Readonly<{
  lifetime: "accepting" | "disposing" | "disposed";
  readiness: Promise<void>; // one cached acquisition settlement
  actors: ReadonlyMap<ActorId, ActorShell>;
  dispose: Promise<void>; // one cached terminal settlement
}>;

type CommitReservation = Readonly<{
  sequence: number; // reserved under the global commit permit before mutation
  releaseToSinks: Deferred.Deferred<void>;
}>;

type BindingInstance = Readonly<{
  key: BindingKey; // semantic equality excludes incarnation
  activationGeneration: number;
  materialized: unknown; // application-owned immutable value
}>;

type IssueEntry = Readonly<{
  id: string; // occurrence identity includes generation
  clearingOwnerKey: string; // retry owner excludes generation
  issue: FlowIssue;
}>;
```

The actor commit path is exactly reserve sequence and terminal credits, derive immutable store and
actor candidates, enter the uninterruptible nonblocking publication section, publish StoreState,
publish ActorState, accept the gated TurnRecord, complete acknowledgment, open the sink gate, release
StoreFanout, and only then process interruption or staged work. No callback, sink, finalizer, or
blocking Queue operation belongs inside that section.

```ts
type TransactionSupervisor = Readonly<{
  owner: StateActivationId;
  policy: "reject" | "cancel" | "allow" | "serialize";
  attempts: ReadonlyMap<number, MaterializedAttempt>;
}>;

// Activation may admit once. Later domain-event/timer turns may admit again.
// Every event:null reconciliation preserves the supervisor and admits nothing.
```

Artifact coding starts from the reviewed Schema values, not handwritten casts: decode raw bytes and
bounds, decode the closed Flow envelope, resolve AppPlan identity, defensively copy, invoke each
frozen domain locator once, revalidate/copy callback results, then brand `PreparedBoot`. Encoding
runs the reverse closed Schema and canonical JSON path; no step has an `unknown` extension bag or
fallback `String(error)` branch.

### Phase 0 — Establish executable truth without product changes

Create a generated export inventory for all six package routes, a contract-ID index, a proof-case ownership index, a live issue-to-test map, a deletion inventory, and one standardized receipt. Classify every existing proof as retain, rewrite, replace, or delete; source-text and filename assertions may locate debt but cannot close behavior. Reconcile A1–A52 in the normative files and check in reviewed artifact/result Schemas plus byte goldens before promoting Phase 1, including the all-route cutover schedule, then rerun the exact baseline and record sandbox/environment retries separately from semantic failures.

### Phase 1 — Replace the authoring grammar and compile one closed AppPlan

Start with negative and positive declaration fixtures for definition tokens, exact event constructors, memory/input, machine grammar, descriptors, refs, requirements, roots, dynamic admission, and collisions. Implement immutable definitions and canonical refs behind a private vNext boundary, then the acyclic compiler and normalized type carriers; no callback may run during app compilation. Keep every public route unchanged until the Phase 7 atomic cutover.

### Phase 2 — Install the managed runtime shell and actor turn engine

First prove atomic multi-root construction, boot-before-handle ordering, the real pre-ready Queue, memory-factory counts, FIFO/reentrancy, exactly one publication per command, post-publication TurnRecord admission, durable pending outcomes, Cause classification, and complete disposal. Implement shell cells synchronously with the documented Effect v4 construction/terminalization exceptions, fork consumers only through the one ManagedRuntime, and keep TurnPlan, CommitPlan, ActorState, StoreFanout, and acknowledgment private. Remove replaced owners only inside the private vNext tree and record public legacy owners for Phase 7 deletion.

### Phase 3 — Make StoreState the single resource authority

Prove exact ref identity and hostile canonical inputs before moving data. Implement immutable StoreState commands, revision-local fanout, lookup generations, FiberMap replacement, RcMap lease epochs, TestClock freshness/GC, placeholder projection, finite/observe outcome cursors, and resource boot normalization. Delete descriptor-ID storage, projected resource keys, subscriber-owned fetching, custom waiter maps, wall clock, global registry, and indefinite Map retention only after old-generation, exact-deadline reacquire, collection, and capture-cut races are green.

### Phase 4 — Rebuild transactions and every activity on actor/store owners

Prove the four concurrency policies, exact-ref generations, ordered global overlays, success invalidation without preview promotion, full terminal Cause matrix, queued cancellation, staged start-after-publication, durable pending outcomes, keyed stream/timer/child replacement, final child completion, and closed dehydration. Implement actor-local activities under ManagedRuntime and store-global lookups under StoreKernel Scope with FiberMap, FiberSet, or Queue according to semantics; persist materialized durable facts rather than Effects or selectors. Keep vNext private and record legacy owners for Phase 7 deletion.

### Phase 5 — Build React and host ownership privately

Prove root versus reachable authority, stable dynamic lookup, early send, readiness failure, SSR first-render consistency under the resolved A3 protocol, React 18/19 overloads, Strict Mode, selector exception memoization, and request isolation. Implement provider's private readiness store and MachineObserver over atomic actor snapshots; `useActor` performs command-only root lookup and `useView` is the only React read path. Prove through private packed fixtures and record every legacy React/host owner for Phase 7 deletion.

### Phase 6 — Build one private story runner and model

Resolve A2 before writing start codecs. Prove plan laziness and immutability, exact starts, fixture/control collision validation, per-run ordinal isolation, acknowledged send boundaries, immediate frozen checkpoints, progress semantics, cancellation plus cleanup Causes, no-live-owner results, pure model exploration, prefix/live state-key parity, and bounded type cost. Implement one scoped runner over private vNext and one TestClock; record legacy testing/model families for Phase 7 deletion.

### Phase 7 — Unify persistence, TurnRecord evidence, behavior, server, and CLI

Consume Phase 2's TurnRecord hub and the proven boot codec. Implement bounded v2 trace/behavior projections, FlowDehydrateError classification, exact pending-outcome and stream restart round trips, explicit attach/dispose/drain semantics for the bounded inspection sink, request helper integration, inert branded behavior gateway, and the exact CLI grammar/result/exit/file/signal laws. Migrate `check:example-cli` against a minimal packed vNext gateway, then atomically switch all six routes and the CLI and delete v1 guessing, mutable histories, legacy engines/facades, CLI-only runners/models, arbitrary `--event`, and `story paths` together.

### Phase 8 — Prove ordinary use, migrate recipes, and remove every replaced owner

Build Todo Essentials, Incident Console, and Hydrated Offline Notes against shipped APIs, move bounded-feed behavior with application-authored Stream operators into package fixtures, and prove the seven SP-N003 host recipes. Run the scoped runbook lease exit matrix without a new primitive. Migrate packed React/TypeScript fixtures, scripts, docs, and browser ownership, then delete obsolete examples, superseded root authorities, old docs, dependencies, source-text assertions, and compatibility files only after exact inbound-link, export, filesystem, and replacement-proof checks; preserve root `TASK.md` as the agreed short pointer. Close with the no-skip acceptance suite and `pnpm verify`.

## Proof readiness map

| Proof     | Live starting point                                              | Required disposition                                                                  |
| --------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| PROOF-001 | Strong legacy type and packed coverage                           | Rewrite around the vNext grammar and keep packed modes                                |
| PROOF-002 | Partial app, graph, canonical-key, and inventory tests           | Replace registry/legacy-grammar assumptions with pure AppPlan tests                   |
| PROOF-003 | Runtime parity and transition tests                              | Rebase on Queue turns, acknowledgment, atomic publication, and pending outcomes       |
| PROOF-004 | Extensive lifecycle/finalizer tests                              | Retain hostile exits but replace custom owner assumptions                             |
| PROOF-005 | Many exact-generation transaction/resource oracles               | Preserve independent interleavings and migrate to exact refs                          |
| PROOF-006 | Large resource-store suite                                       | Rewrite around StoreState, leases, TestClock freshness, and passive React             |
| PROOF-007 | Strong overlap and serialize oracles                             | Replace current one-waiter/descriptor identity behavior with the contracted matrix    |
| PROOF-008 | Existing controlled harness tests                                | Rebuild around fixture-local endpoint definitions and ordinals                        |
| PROOF-009 | Existing settle/timer/stream tests                               | Replace custom progress controls with one TestClock inventory                         |
| PROOF-010 | Existing story evidence and inspection tests                     | Remove status wrappers and capture only immutable three-root observations             |
| PROOF-011 | Existing model suite currently executes production Effects       | Replace implementation, keep live parity scenarios only after structural purity       |
| PROOF-012 | React tests cover the legacy shell and direct resource hook      | Replace rather than adapt; keep React-major packaging harness                         |
| PROOF-013 | Inspection/trace tests have multiple history owners              | Rebase on one TurnRecord hub and explicit bounded sink                                |
| PROOF-014 | Broad rehydration, server, CLI, and artifact coverage            | Replace v1, mutable boot, arbitrary events, and stale dist assumptions with v2 parity |
| PROOF-015 | Stream finalizer and runbook browser evidence exist              | Move behavioral lease to child ownership and add the full exit/Cause matrix           |
| PROOF-016 | Six examples cover many ingredients but overclaim some workflows | Consolidate into exactly three proved applications                                    |
| PROOF-017 | Package hygiene and source-text architecture checks exist        | Replace textual assertions with export/filesystem/packed/runtime deletion evidence    |

## Resolved owner decisions

1. Public snapshot story starts are removed; stories start fresh or from a complete branded boot.
2. SSR preloads in one request runtime, dehydrates/disposes it, and renders from a second immutable runtime constructed from that boot.
3. Root `decodeRuntimeBoot(app, unknown, { decodeDomain })` is the sole public path from same-version, domain-validated unknown data to `RuntimeBootPayload<App>`.
4. Durable activity identity uses a compiled machine/state/kind/ordinal slot; source reordering requires a persistence-version migration.
5. Explicit IDs preserve exact Unicode spelling, use raw UTF-16 ordering, named resolver namespaces, and length-prefixed composite segments rather than normalization, locale ordering, a flat namespace, or raw delimiters.
6. Negative zero is rejected everywhere in the canonical identity and wire domain.
7. Stable-ID dynamic lookup accepts any live durable incarnation, whether freshly created or hydrated.
8. No quiescent snapshot exception exists because public snapshots are observation only.
9. Story time is non-negative safe-integer milliseconds; backward time is rejected and equal time is allowed.
10. Phase 0 uses `PHASE_<N>.md` receipts and assigns every atomic proof subcase exactly one closing phase.
11. Callback-produced refs must resolve to descriptors already admitted in AppPlan; callbacks never expand reachability.
12. One-argument `useView(view)` resolves through provider AppPlan and diagnoses zero or multiple public-root matches at runtime.
13. Descriptor types retain raw Effect `R`, while `RequirementsOf` removes Flow-owned `Scope.Scope`.
14. Event payload constructors return readonly plain records and cannot own `type`.
15. Activity source order is the accepted persistence boundary; vNext adds no authored activity ID.
16. VNext stays package-private through Phase 6; Phase 7 atomically cuts all six routes and the CLI over and deletes every legacy execution owner.
17. Sink delivery is asynchronous to actor acknowledgment and exposes ordered drain plus idempotent disposal.
18. CLI atomic output uses a `0600` sibling temp, POSIX link publication without force and rename replacement with force, and never follows an output symlink.
19. I16 moves to Phase 1; I5 and I10 split into resource/React and runtime/model obligations with one owner each.
20. Root `TASK.md` survives as the exact short pointer required by CUT-P06.
21. Flow's stream `pressure` option is removed; Effect Stream or application-authored operators own backpressure/coalescing.
22. Transaction `scope` is removed; concurrency is actor-local per exact transaction ref.
23. Older `allow` generations settle overlays and evidence but cannot project or route after a newer admission.
24. Planned child stop never routes; complete, defect, and interrupt route only through explicitly authored mappings, and child machines have no typed failure lane.
25. Operational occurrences include generation but clear through a generation-free owner key; invariant and cleanup issues survive disposal.
26. Focus uses reconnect eligibility, and StoreFanout carries an ordered deduplicated changed-ref vector for one revision.
27. Zero-time success publishes fresh first, schedules stale/GC as later turns, and consumed finite bindings retain leases until configuration release.
28. Canonical identity and artifacts use the one compact canonical JSON encoder in WIRE-001A.
29. Transaction run is edge-triggered; resource/invalidation finite work and stream/child desired ownership retain binding semantics.
30. Stream/child key alone controls replacement, and equal key retains originally materialized opaque input.
31. TurnRecord commit permit preflights sequence before mutation; sink release gates open after acknowledgment.
32. StoreKernel runtime Scope, not an actor Scope, owns shared resource lookup execution.
33. Model traversal is fresh-only, requires canonical `stateKey`, and returns bounded deterministic BFS/DFS results with truncation truth.
34. Flow-owned containers are frozen/copied; opaque domain values are application-owned immutable identities.
35. The boot barrier activates restored ownership before any early host event, while ordinary turns keep tail reconciliation.
36. Terminal actor/store/TurnRecord credits are reserved before ordinary admission and validated during boot.
37. Disposal preserves full Cause through one cached FlowDisposeError; request dual failure is ordered AggregateError without deduplication.
38. Behavior, trace, Cause, and CLI result artifacts use reviewed closed Schemas and canonical byte goldens.
39. Gateway containment includes every relative dependency, while trusted evaluated code is explicitly outside any sandbox promise.
40. React 18/19 acceptance executes renderer behavior, and MachineObserver owns the immutable server-render cut.
41. Pending-Layer disposal drains all shell inventory, same-instant resource races use ordinary permit order plus stale-token rejection, and signals cannot blur the artifact commit boundary.
