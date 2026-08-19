# Open Questions and Future Explorations

This file is a non-normative review register. It records future API/use-case work and
implementation proof prompts; it contains no open inherited contract blocker. It does not
override `revision-spec/accepted/`, change an accepted clause, or turn a proposal into
implementation authority.

## Locked decisions

- `phase-0/` and its proof index are outdated historical material, not current
  authority. All phase TODO files and manifests will be rewritten later; their
  current proof IDs and ownership mappings do not constrain the revised design.
- `BEH-027` is closed by `REV-OPS-016`: bounded JSON-like values, sorted
  record keys, normalized `-0`, hostile-structure rejection, defensive
  copying/freezing, compact UTF-8 bytes, and one trailing newline only at the
  artifact file boundary. The exact grammar and proof obligations now live in
  the revision authority and owning contracts.
- Historical superseded direction: every actor in the current vNext surface
  must have an explicitly authored stable ID. `REV-COMP-011` instead separates
  durable shared actors, which require authored stable IDs, from local actors,
  which may receive generated opaque runtime-local refs. Those generated refs
  remain an internal option: they are not durable or restorable and are not used
  for the current Story or hydration identity surface.
- Durable actor IDs use the accepted machine-qualified stable-ref rules; runtime session,
  correlation, and hydration facts do not create a second identity. Duplicate authored IDs
  reject AppPlan compilation, while concurrent `ensureActor` calls for one exact ref join the
  existing actor and lease.
- Runtime dehydration captures every registered durable actor with an authored
  ID and the transitive context-provider closure, including suspended stable
  actors. Disposed/runtime-only actors are excluded, and an included durable
  actor with an opaque provider fails closed. Story checkpoints use one
  `DehydrateBarrier` cut over the complete static Story-plan target closure;
  unrelated runtime actors are excluded.
- Runtime bootstrap owns every successfully restored actor through the runtime
  lease. Factory `ensureActor` calls join those actors; an actor absent from the
  receiving `AppPlan` fails boot before activation, and Flow never silently
  drops a captured actor or leaves it unowned.
- Lifecycle evidence remains separate from TurnRecords, but lifecycle events
  and TurnRecords share one runtime-global evidence sequence allocated under
  the publication barrier. Actor revisions remain separate from that evidence
  sequence.
- Passive operation reads in `useView` are dependency-reactive: exact
  descriptor/`K` reads are tracked, the view reacts to actor or matching store
  changes, dependencies are replaced after each evaluation, and actor/store
  reads use one tear-free snapshot boundary.
- Ordinary actor handles use a closed lifecycle capability matrix: snapshots
  remain readable in every lifecycle; prepared commands buffer; active commands
  admit; suspended and disposed commands reject; prepared subscriptions replay
  and become live on activation; suspended subscriptions replay once and
  complete; disposed subscriptions replay the terminal snapshot and complete.
  `can(event)` remains pure transition legality, separate from command admission.
- Any actor may passively read an admitted shared canonical entry another actor
  materialized. Missing reads remain passive; reads never acquire ownership,
  start work, refresh data, or change retention. Cross-actor visibility is
  bounded by the exact descriptor and canonical `K` identity.
- Public operation reads use the exact `REV-OPS-017` family-specific discriminated unions:
  resources distinguish `missing`, `pending`, `ready`, `refreshing`, typed
  `failure`, `defect`, and `interrupted`; transactions and streams retain their
  corresponding finite/continuing lanes. Retained data is allowed during
  refresh and terminal outcomes, collection returns resources to `missing`,
  and stream projections retain `hasValue`, latest value, emission count,
  generation, and terminal status. Emissions coalesce to the latest projection; a transaction
  crossing its external boundary is `unknown` with `reconcileRequired: true`, and `undefined`
  is reserved for missing resource data or updater decline.
- `cancel(K)` is actor-local bulk cancellation for every currently cancellable
  active or queued finite occurrence matching the exact descriptor and
  canonical `K`. Successful admissions receive monotonic internal occurrence
  ordinals, separate from execution generations; rejected attempts consume no
  ordinal. Targeted public occurrence cancellation is deferred.
- Every admitted finite occurrence settles exactly once. Success, typed
  failure, defect, cancellation, supersession, and disposal are terminal facts;
  queued cancellation settles without starting external work, and late adapter
  results are fenced. Terminal occurrence history uses bounded evidence or
  inspection retention and does not accumulate in the ordinary actor snapshot.
- Optimistic transaction previews are actor-incarnation scoped. Only the owner
  sees an uncommitted layer; promotion is a canonical compare-and-set followed
  by StoreFanout, while failure or pre-boundary interruption removes only the
  owner layer. Post-boundary cancellation publishes unknown/reconciliation truth
  and never claims remote rollback.

### API, type, and artifact decisions

- Stable actor identity is the machine-qualified pair of machine ID and
  authored actor ID. Authored IDs are non-empty bounded UTF-8 strings, and the
  durable composite wire form uses length-prefixed components. Opaque runtime
  refs never appear in dehydration, artifacts, or CLI selectors.
- The public actor selector is stable-ID-only: `actor:<machine-qualified-id>`.
  The current API does not expose a separate opaque or Story-local actor
  selector.
- Concurrent `ensureActor` calls join one logical actor and share one terminal
  owner lease. Disposing either joined owner disposes the shared actor; an
  independently scoped or ref-counted lease API is future work.
- Public operation reads use family-specific discriminated unions. Resources
  expose `missing`, `pending`, `ready`, `refreshing`, typed `failure`,
  `defect`, and `interrupted`; transactions and streams expose their finite or
  continuing lanes. Generation and occurrence metadata are exposed where it
  identifies the observed operation. Retained refresh data is supported, and
  streams expose a retained latest-value projection with `hasValue`, latest
  value when present, emission count, generation, and terminal status. This
  projection is distinct from resource status; the earlier direction that
  streams should not expose a retained latest emission is superseded by
  `REV-OPS-015`.
- Timer-owned finite actions are deferred. The current public action grammar
  remains event-driven; timers target events until a separate timer-action API
  is deliberately designed and accepted.
- Input-mode inference remains backward-compatible. Omitted initializers keep
  the existing void behavior; no explicit void/undefined/never carrier is
  added in this pass.
- Hook construction tuples compare machine, runtime, bindings, and input by
  identity. A tuple change requires keyed remount, and prepared command
  overflow throws synchronously after the 64-command bound is exceeded.
- Public `cancel(K)` remains bulk-only. Targeted cancellation is deferred to a
  future `cancel(K, { occurrence })` or `cancelOccurrence`/handle surface; the
  current inert `commit` operation does not return a cancellation handle.
- Family invalidation targets are already part of the accepted typed target type. `REV-OPS-018`
  fixes their bounded expansion and no-op behavior; no new family-target API is required.
- No general public post-start runtime cache writer is exposed. Boot, SSR, and fixture seeding
  are construction-owned; trusted post-start writes use the package-private capability-scoped
  `HostWriteLease` in `REV-HOST-008`.
- `REV-MIG-005`/`WIRE-020B` now freeze the Flow-owned private v2 behavior, trace, Story failure,
  CauseProjection, and CLI result schemas. Legacy `trace-artifact.v1`, `final`, and `children`
  vocabulary is rejected, not adopted.
- Story and CLI consume one decoded evidence model with exact `end`, cleanup, partial-failure,
  CauseProjection, and private-result fields; no public artifact or CLI result type is added.
- Stream completion is a public terminal `complete` state and is observable
  through `simulate` completion. It is not reduced to an inspection-only fact.
- Selector defects expose a stable summary issue object without raw Cause.
  The last coherent context and issue/turn are retained for retry, while
  dehydration fails closed when the selector result is not derivable.
- The public snapshot exposes one `snapshot.revision`. Machine-turn revision
  and runtime evidence sequence remain inspection-only ordering fields.
- External transaction rollback is split at the adapter's point of no return:
  queued or pre-effect work may be interrupted and its local preview discarded;
  after the boundary, cancellation stops local observation and fences late
  publication but never claims the remote effect was undone. The boundary and
  remote operation identity must be durably recorded before dispatch. An
  uncertain remote result is not automatically retried; reconciliation reuses
  the same remote idempotency identity, and compensation is a separate explicit
  domain operation.

### Newly surfaced API and type questions

These questions appeared in the deeper operation/API review. They do not reopen
the already locked semantic directions above; they concern exact public type
shapes, authoring syntax, and compatibility fields.

#### Authoring, compatibility, and diagnostics

- Promote the typed `invalidate`/`clear` target algebra and mixed-action
  conflict matrix, including the already accepted family target, into public
  signatures and compile proofs.
- Define the public context-selector source shape and exact `contextBindings`
  authoring path used by `Session.select`-style examples.
- The Cause boundary is closed by the package-owned `FlowDisposeError` and
  `FlowStoryExecutionError` envelopes carrying the complete public Effect Cause;
  `WIRE-020B` fixes the ordered serialized artifact CauseProjection and the
  package-private compiled-AppPlan fingerprint.
- Descriptor-ID collisions reject AppPlan compilation with `DuplicateDescriptorId`; the
  fingerprint is deterministic SHA-256 over the exact WIRE-020B plan preimage. Neither is public API.

### Autonomously resolved behavior

These closures came from the accepted contracts, prior non-normative solution
work, the current runtime implementation, and local XState, TanStack Query,
and Effect behavior. They add no public API names.

#### Runtime, identity, lifecycle, and React

- Runtime discovery is inert. Factory construction is synchronous through the
  registration boundary; boot validates boot data, the Layer, actor claims,
  and the context graph before activation or handle escape. Failure rolls back
  owners in reverse order. Post-bootstrap actor admission is one atomic
  transaction; concurrent ensures join the same logical actor and disposal is
  idempotent and owner-scoped.
- Stable actor identity is (machine ID, authored stable ID). Opaque local refs
  are runtime-only and never durable. Machine/module ownership is unique in one
  AppPlan; changing machine identity requires releasing the old actor and
  creating a new one, never in-place rekeying or memory reuse.
- Publication revision, machine-turn revision, and runtime evidence sequence
  remain separate. Lifecycle changes advance publication state but are not
  machine turns; lifecycle and turn facts share one ordered evidence stream.
  Bounded inspection attachments never block runtime publication.
- Context graphs are acyclic and retain logical edges while an owned actor is
  suspended. Suspension detaches subscriptions and live work but cannot allow
  provider disposal underneath a retained consumer. Prepared React graphs are
  inert; attachment rechecks provider identity and revisions before publishing
  a baseline. Construction-tuple changes require keyed remount; input is
  consumed only on first construction.
- Prepared commands buffer at most 64 entries; overflow rejects without
  mutation, and abandoned prepared handles remain inert. A context-selector
  defect retains the last coherent context, records one issue/turn, keeps the
  consumer dirty for retry, skips downstream propagation, and fails durable
  dehydration while the projection is not derivable.

#### Suspension, stories, and evidence

- Suspension is serialized per actor. It closes new command admission, removes
  queued finite work, interrupts unsettled finite work, closes continuing
  streams, detaches subscriptions, and publishes suspended after structural
  detach. Timers retain absolute deadlines; pending outcomes and occurrence
  cursors remain. Resume waits for finalizers, then reconciles continuing
  declarations and due timers; finite work is never replayed.
- If an adapter ignores interruption, Flow retains only the minimum pending
  outcome/occurrence fact needed for truthful settlement. After an irreversible
  external effect, local cancellation never claims reversal. Cleanup defects
  keep the actor suspended and make resume fail until owner/runtime disposal.
- Focused `story.machine` installs selected context as a silent baseline and
  sends later context changes through the production context coordinator; it
  proves consumer behavior only. `simulate` intercepts only external descriptor
  execution after production admission and status publication.
- Story occurrence identity is a one-based, non-reused ordinal allocated only
  after admission, scoped by actor, operation kind, descriptor, and canonical
  `K`; streams retain declaration occurrences while shared generations identify
  shared execution, and hydration never replays external work. Checkpoints use
  one `DehydrateBarrier` cut over the complete static Story-plan closure.
  Cleanup closes admission, captures end before cleanup, disposes Story leases
  in reverse dependency order, disposes the runtime, drains accepted evidence,
  and closes sinks and queues. Failures use one frozen package-owned envelope carrying the complete
  Effect `Cause.Cause<unknown>`; actor snapshots and serialized artifact/CLI projections remain
  Cause-free and use their declared diagnostic/CauseProjection shapes.

#### Operations, persistence, and store behavior

- key(P) computes executable-input identity; getData(K), getState(K), and
  cancel(K) are canonical-key actions; lookup, refetch, and commit retain
  executable P. Every named operation contributes to the static AppPlan;
  runtime admission remains limited to reachable accepted plans.
- Passive resource reads may address any admitted family. Missing reads return
  synthetic absent/idle state without materializing an entry. A second live
  stream declaration for one actor, descriptor, and K is rejected before the
  existing binding changes. Stream projections retain their latest value;
  mapped events are still required to make an emission durable machine state.
- Timer facts do not admit finite operation plans under the current API. No
  implementation may infer timer actions; timer admission remains deferred
  until an explicit surface is accepted.
- Reactivity is runtime-owned: external facts enter the actor mailbox,
  projection-only facts publish immutable actor state, and `useView` tracks
  exact descriptor/`K` passive reads internally. User subscriptions are not
  required for machine correctness. Polling uses an existing `after` timer and
  explicit refresh event rather than a new polling API.
- Candidate action batches expand targets before mutation. Identical
  invalidations, clears, and lane-wide cancellations deduplicate. Repeated
  lookups remain distinct occurrences but may join one generation. Writes
  conflict with other target-changing intents; clear conflicts with every
  non-clear; lookup/refetch and cancel/refetch conflicts reject the whole
  candidate before occurrence allocation, mutation, or external work.
  Completion validates its fence, commits shared writes and pending outcomes
  atomically, then delivers actor outcomes independently and idempotently.
- Canonical keys are Flow-owned immutable copies of bounded primitives, arrays,
  and plain records. Record keys are sorted, -0 becomes 0, hostile
  structures/cycles/accessors/symbols/non-finite values are rejected, and one
  tagged canonical UTF-8 encoding is used for equality, persistence,
  diagnostics, and size limits. The bounds are depth 16, 256 visited nodes,
  and 8 KiB of canonical UTF-8 bytes. Hashes accelerate lookup only;
  canonical bytes decide equality.
- An equal-key resource generation pins the first admitted executable P. Each
  live binding retains its own P and acquisition ordinal; a later generation
  selects the oldest eligible binding. Hydration never reconstructs `P` from `K`:
  pending outcomes drain first, then continuing declarations rematerialize
  current P; finite work and terminal streams do not restart.
- Tags derive solely from canonical K. Placeholders are separate from getData;
  effective values include ordered optimistic overlays, while authoritative
  updaters read the canonical base. Conflicting updaters are not rerun. Equal
  base writes may refresh freshness/store publication, but advance value
  revision and effective fanout only when the corresponding value changes.
- Invalidation and clear targets expand against one pre-mutation index snapshot.
  Missing exact targets and zero-match family/tag targets are successful no-ops
  with no store revision. Invalidation marks active lookup data stale; clear
  fences/interrupts cancellable work before deleting the entry. Expansion bounds
  reject the whole candidate before mutation.
- Hydration installs canonical store state and pending outcomes before
  reconciling continuing declarations. A declaration with no executable input
  stays inactive or fails boot with a precise input diagnostic; it does not
  invent restart input. Boot/SSR/fixture seeds are construction-owned,
  descriptor-plus-key writes, reject collisions even when values compare equal,
  and create no occurrence or generation.

#### Migration, proof, and artifact behavior

- Compound states are one actor: they do not create child mailboxes, memory,
  failure boundaries, persistence records, or lifetimes. Significant
  subordinate workflows use explicit actors; unsupported legacy examples are
  marked unsupported rather than gaining a hidden child capability.
- Active proof indexes use one owner per current proof and do not rely on
  outdated phase manifests. Historical deleted names may remain only in
  migration/deletion evidence and negative tests; active manifests contain no
  deleted authority names.
- Flow guarantees atomic artifact visibility through bounded encode, flush,
  close, and same-directory link/rename publication. It does not promise crash
  durability beyond the host filesystem's completed commit. Opaque application
  values are validated by application codecs before Flow construction; Flow
  applies envelope bounds without reinterpreting domain semantics.

## Quick fixes applied

The following changes were safe because they corrected stale metadata or
removed an obsolete authority pointer without choosing runtime behavior:

- `revision-spec/TRACEABILITY.md` now reports zero open and 33 closed inherited
  behavior entries after the runtime, identity, operation, host, Story, artifact,
  CLI, and child-removal closures were accepted.
- `contracts/TYPE_SYSTEM.md` no longer delegates the Cause law to the missing
  `IMPLEMENTATION_BLOCKERS.md`; the rule and its required proof boundary are
  stated locally.
- `contracts/PERSISTENCE_AND_ARTIFACTS.md` now binds `WIRE-001A` to the exact
  canonical `KBytes` law in `REV-OPS-016`.

## Remaining non-blocking implementation follow-up

- Execute the named proof owners for the accepted operation, host-write, artifact,
  CLI, and child-removal clauses in their phase receipts; these are implementation
  gates, not unresolved contract decisions.
- Keep the closed Story checkpoint and cleanup evidence rules aligned with the
  artifact Cause projection and byte-based retention owners.
- Resolve the defect-turn distinction between discarding an unpublished
  candidate and publishing an issue-only actor revision; define its
  acknowledgment, evidence, and work-start rules.
- Do not reopen the locked bulk `cancel(K)` direction, automatic passive-read
  dependency tracking, typed family invalidation, public stream completion, or
  the Flow-owned vNext artifact boundary while promoting the clauses.
- Keep artifact and CLI implementation rebaselined to WIRE-020B; reject the legacy
  trace-artifact.v1 implementation and its final/children vocabulary.
- Keep external-transaction reconciliation inside the transaction kernel and
  adapter boundary. Do not add a generic outbox, saga, or compensation API in
  this slice; preserve full internal `Exit`/`Cause`, expose only classified
  snapshots, and retain pending outcomes across suspension, disposal, and
  process recovery.

## Newly discovered migration and proof questions

These questions come from the live implementation, package gates, and task and
receipt status. They are review prompts only: they do not add authority, close
an unresolved behavior entry, revive phase ownership, or choose a replacement
API.

- After `phase-0/` and all phase TODOs are treated as historical, what current
  manifest, receipt, or proof index replaces their status and ownership claims?
  How will the historical `Complete`, `Ready`, `Waiting`, and phase-assigned
  proof labels be marked so they cannot be mistaken for current migration
  status, while still preserving provenance for obligations that remain live?
- How will the source CLI, packed CLI, maintained examples, and root
  `check:example-cli` gate cut over as one proof slice to the accepted command
  grammar? The live gate still positively exercises `story paths`, arbitrary
  `--event` JSON, and `story run --save-trace`, while the source still routes
  those paths through Scenario execution and does not expose the accepted
  `behavior check` leaf.
- Which production trace owner and codec proof will replace the live
  `flow-state/trace-artifact.v1` path, its single-snapshot/`children` shape,
  `local-inspection-proof` and `story-run` wrappers, and the `child-outcomes`
  diff section? The migration proof still needs to account for bounded
  decoding, incomplete/truncated evidence, exact actor/run-end/lifecycle/
  module/operation identities, and the accepted atomic publication laws.
- How will direct `story.run()` and CLI `story run` be proven to share the same
  production executor and evidence semantics? The current CLI calls
  `runFlowScenarioWithDiagnostics`, builds a Scenario envelope, and mutates
  process exit state inside the leaf handler; the parity proof must distinguish
  partial failure, cleanup, optional trace sinks, exit/signal mapping, and
  trace publication from legacy Scenario behavior.
- Which current package and example checks must be retired, rewritten, or
  reclassified as historical so stale `evidence.ok`, legacy path, wrapper, and
  child-outcome assertions cannot remain positive migration evidence? How will
  each surviving proof obligation be tied to a production owner and a current
  accepted contract without turning this register into a new gate?

## CLI facts and source-provenance questions

These questions are non-normative. They are extracted from the CLI upgrade
investigation and require an explicit decision before adding new leaves or
freezing new result/artifact fields.

- Should source provenance start with one finite `code explain <selector>`
  command, or should it remain behind existing artifact commands until a
  compiled behavior artifact can correlate machine IDs to source symbols?
- Which `behavior render --section` values beyond `contract` and `coverage`
  provide enough decision value to justify a contract amendment? Candidate
  sections are machine state, context graph, operations, ownership, and Story
  declarations; they must not become overlapping result models.
- Which facts belong to the persisted bounded trace artifact versus an
  in-memory CLI projection? In particular, decide whether context turns,
  lifecycle records, operation generations/occurrences, StoreFanout evidence,
  and source locations are persisted or only summarized at runtime.
- What completeness and output budgets apply to recursive state nodes, context
  edges, reverse dependency edges, event call-sites, and combined static/runtime
  reports? Truncation must remain explicit and cannot support absence claims.
- Should the source analyzer accept only a TypeScript project/`tsconfig`, or
  must it define bounded behavior for generated code, JavaScript, monorepo
  project references, aliases, and dynamic imports? Unknown boundaries must be
  reported rather than treated as no callers.
- Should future `code impact`, `story health`, and reactivity fanout reports be
  separate finite commands, or should they remain projections over the same
  compiled/source/runtime fact model? Avoid a generic query language and avoid
  multiplying CLI-owned schemas.

## Future explorations

- Runtime or tenant partitioning is rejected for this pass: result-changing
  client, authorization, capability, account, network, permission, session, and
  tenant discriminators belong in `K` under `REV-OPS-016`.
- Consider per-occurrence operation handles for inspection and targeted
  cancellation when one canonical key has multiple live operations; this is
  not part of the current API pass.
- Explore first-class SSR seed/trusted-write APIs, stream reconnect after
  hydration, retained-value refresh states, and independent cross-actor
  workflows now that child capabilities are removed.
- Establish queue, fanout, canonicalization, deep-freeze, attachment-retention,
  and TypeScript-instantiation budgets with checked-in benchmark receipts.
- Build an identity-evolution matrix covering machine IDs, module IDs, actor
  refs, event IDs, state-token paths, descriptor IDs, App.M property names, and
  artifact selectors before committing to long-lived compatibility guarantees.
