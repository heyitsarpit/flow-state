# Open Questions and Future Explorations

This file is a non-normative review register. It records decisions the current
contract pack does not close and possible future API/use-case work. It does not
override `revision-spec/accepted/`, change an accepted clause, or turn a
proposal into implementation authority.

## Locked decisions

- `phase-0/` and its proof index are outdated historical material, not current
  authority. All phase TODO files and manifests will be rewritten later; their
  current proof IDs and ownership mappings do not constrain the revised design.
- `BEH-027` is resolved in principle as strict canonical JSON/JCS-style
  encoding for `K` identity and artifacts: bounded JSON-like values, sorted
  record keys, normalized `-0`, hostile-structure rejection, defensive
  copying/freezing, compact UTF-8 bytes, and one trailing newline only at the
  artifact file boundary. The exact normative clause and executable proof still
  need promotion from this decision.
- Historical superseded direction: every actor in the current vNext surface
  must have an explicitly authored stable ID. `REV-COMP-011` instead separates
  durable shared actors, which require authored stable IDs, from local actors,
  which may receive generated opaque runtime-local refs. Those generated refs
  remain an internal option: they are not durable or restorable and are not used
  for the current Story or hydration identity surface.
- For the current implementation pass, handcoded actor IDs per durable actor
  are the accepted interim unblocker. The final relationship between runtime
  session IDs, stable logical addresses, rerun correlation, and hydration
  identity is deliberately deferred for later design review.
- Duplicate authored-ID behavior is deferred as a documented footgun for the
  implementation pass. `ensureActor` is ref-based, and equivalent refs for the
  same machine-qualified identity are expected to resolve to the same logical
  actor; the final create-versus-join error policy remains open.
- Runtime dehydration captures every registered durable actor with an authored
  ID and the transitive context-provider closure, including suspended stable
  actors. Disposed/runtime-only actors are excluded, and an included durable
  actor with an opaque provider fails closed. The exact checkpoint capture rule
  remains a separate decision.
- Story checkpoints use revision-consistent, context-closed cuts with recorded
  per-actor and store revisions. They do not promise one global wall-clock
  instant and do not advance timers, process commands, or perform cleanup.
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
- Public operation reads use small family-specific discriminated unions:
  resources distinguish `missing`, `pending`, `ready`, `refreshing`, typed
  `failure`, `defect`, and `interrupted`; transactions and streams retain their
  corresponding finite/continuing lanes. Retained data is allowed during
  refresh and terminal outcomes, collection returns resources to `missing`,
  and stream projections retain `hasValue`, latest value, emission count,
  generation, and terminal status. Emissions coalesce to the latest projection.
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
- Family invalidation targets are part of the public target type. The API will
  add a typed family target such as `O.orders.family()` rather than relying on
  untyped escape hatches.
- No general public post-start runtime cache writer is exposed. Boot, SSR, and
  fixture seeding remain construction-owned; a future capability-scoped host
  surface may provide trusted writes.
- Behavior and trace artifacts remain Flow-owned vNext output until a stable
  external compatibility promise is made. Artifact/CLI v1 is rebaselined
  together; legacy `trace-artifact.v1`, `final`, and `children` vocabulary is
  not adopted as the new schema.
- Story and CLI consume one decoded evidence model. The model uses `end`, not
  legacy `final`; compatibility version, locator, Cause projection, cleanup,
  partial-failure, and private-result fields are owned by the rebaselined
  internal schema until an external versioned surface is explicitly accepted.
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

#### Operation surface

- Decide the exact exported `getState()` unions, including whether a lost
  external transaction is represented as public `unknown`/`reconcileRequired`
  or as `interrupted` with a reconciliation field. Resource, transaction, and
  stream state fields must be usable for type narrowing.
- Decide how `P` capability partitions are represented when equal descriptor/`K`
  values must not share data across tenants, clients, authorization scopes,
  endpoints, or locales. The runtime/tenant partition remains the preferred
  boundary if those discriminators intentionally stay out of `K`.
- Define the branded operation-plan type accepted by `simulate`. Matching must
  use descriptor, canonical `K`, actor target, and occurrence; it must never
  require reconstructing `P` from `K` or accept an unbranded descriptor object.
- Confirm that same-actor duplicate live stream declarations with equal
  descriptor/`K` are rejected before binding replacement, so passive stream
  reads do not need to expose declaration-slot identity.
- Decide whether resource values may be `undefined`. If they may, `getData()`
  needs an explicit missing/present result and `setData` needs a distinct
  decline sentinel; otherwise `undefined` is excluded from `A`.

#### Authoring, compatibility, and diagnostics

- Promote the typed `invalidate`/`clear` target algebra and mixed-action
  conflict matrix, including the already accepted family target, into public
  signatures and compile proofs.
- Define the public context-selector source shape and exact `contextBindings`
  authoring path used by `Session.select`-style examples.
- Resolve the Cause boundary: the root forbids public Cause types while
  `FlowDisposeError` currently exposes `Cause.Cause<unknown>`. Use either a
  deliberately public Cause projection or a package-owned diagnostic envelope.
- Define descriptor-ID collision handling during AppPlan compilation and the
  deterministic compiled-AppPlan fingerprint carried by boot/artifacts.

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
  `K`. Checkpoints capture every actor target in the complete Story plan plus its
  transitive context closure using revision-consistent context-closed cuts.
  Cleanup stops new work, captures atFailure or run.end, disposes Story leases
  in reverse order, disposes the runtime, drains sinks, and closes fixtures and
  clock; cleanup is attempted exactly once in fixed order.

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

- `revision-spec/TRACEABILITY.md` now reports 33 open behavior entries, matching
  the live unresolved register after `BEH-017` was accepted.
- `contracts/TYPE_SYSTEM.md` no longer delegates the Cause law to the missing
  `IMPLEMENTATION_BLOCKERS.md`; the rule and its required proof boundary are
  stated locally.
- `contracts/PERSISTENCE_AND_ARTIFACTS.md` now labels `WIRE-001A` as unresolved
  instead of naming a byte-exact law whose grammar remains deferred to
  `BEH-027`.

## Remaining internal follow-up

- Promote the autonomous behavior closures into the affected normative
  contracts and assign executable proof owners. This is contract maintenance,
  not a new behavior choice.
- Include suspension mailbox normalization, React final-teardown ownership,
  suspended-provider dependency retention, passive `useView` dependency
  tracking, generation lifetime epochs, hydration ordering, checkpoint cuts,
  cleanup/end evidence, and byte-based retention limits in that promotion pass.
- Resolve the defect-turn distinction between discarding an unpublished
  candidate and publishing an issue-only actor revision; define its
  acknowledgment, evidence, and work-start rules.
- Define lifecycle publication identity separately from machine-turn revision,
  include the immutable lifecycle publication in asynchronously delivered
  evidence, and state that disposal drains accepted records without creating a
  synthetic terminal `TurnRecord`.
- Add explicit runtime phases and post-bootstrap admission linearization,
  reverse-order bootstrap rollback, duplicate durable machine-ID rejection,
  and actor/app/plan provenance checks.
- Make occurrence identity include actor incarnation/lifetime, descriptor, `K`,
  and ordinal/generation as needed to fence shared-generation simulation and
  collection reuse.
- Do not reopen the locked bulk `cancel(K)` direction, automatic passive-read
  dependency tracking, typed family invalidation, public stream completion, or
  the Flow-owned vNext artifact boundary while promoting the clauses.
- Rebaseline artifact and CLI schemas together; do not adopt the legacy
  trace-artifact.v1 implementation or its final/children vocabulary.
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

- Consider an explicit runtime or tenant partition for resources whose
  executable input contains client, authorization, or capability context that
  is intentionally absent from `K`.
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
