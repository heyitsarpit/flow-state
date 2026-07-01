# Inspect Expansion Plan

This file is the de-sloppified backlog for `@flow-state/inspect` and the
runtime inspection surface around it.

It is intentionally grounded in what Flow State does today, what receipts we
can already produce, and what the local XState codebase proves is useful.

## Scope

Today the public inspect entrypoint is small:

- `graphOf(machine)`
- `captureTrace(snapshot, options?)`
- `replayTrace(machine, trace)`
- `flowStories(machine, stories)`

Meanwhile the runtime already emits richer live inspection events through
`runtime.inspection.entries()` and `runtime.inspection.subscribe(...)`.

The goal of this plan is not to copy XState wholesale. The goal is to turn
Flow's real runtime facts into a sharper, smaller, more useful inspect story.

Decision locks for this backlog:

- Phase 1 is the hard foundation for all later inspect work.
- The public inspection union should be limited to real runtime facts we already
  emit or can promote with low risk.
- Common event metadata is non-negotiable:
  `actorId`, `rootActorId`, optional `moduleId`/`appId`, optional
  `correlationId`, `timestamp`, and `sequence`.
- Observer-style and filterable subscriptions should be thin layers on top of
  the stabilized event model, not parallel redesign projects.
- Leave transport/tooling work until after Phases 1-5 settle the core inspect
  contracts.

## Guardrails

- Every new inspect feature must produce a concrete receipt, test, or script
  output.
- Prefer pure data outputs over UI-coupled APIs.
- Do not add ceremonial wrappers that only restate inputs.
- Keep product state and debug state separate.
- If a capability already exists in runtime receipts, prefer lifting it into a
  better public API rather than inventing parallel machinery.

## Baseline We Already Have

- [x] Live runtime inspection stream via `runtime.inspection.entries()` and
      `runtime.inspection.subscribe(...)`.
      Why it matters: this is already the richest inspect surface in Flow State.
      Current output from `packages/flow-state/scripts/inspect-feature-receipts.mjs`:

  ```json
  [
    { "type": "actor:start", "id": "inspect.demo.machine" },
    { "type": "actor:snapshot", "id": "inspect.demo.machine", "state": "idle" },
    {
      "type": "machine:event",
      "id": "inspect.demo.machine",
      "eventType": "START",
      "correlationId": "inspect.demo.machine:event:1"
    },
    {
      "type": "machine:microstep",
      "id": "inspect.demo.machine",
      "eventType": "START",
      "correlationId": "inspect.demo.machine:event:1"
    }
  ]
  ```

- [x] Trace capture from receipts via `captureTrace(snapshot, options?)`.
      Why it matters: it already groups receipts by correlation id and bucket.
      Current output:

  ```json
  {
    "receiptTypes": [
      "machine:event",
      "machine:transition",
      "resource:patch",
      "transaction:success"
    ],
    "bucketCounts": {
      "events": 1,
      "transitions": 1,
      "resources": 1,
      "transactions": 1
    }
  }
  ```

- [x] Passive graph descriptor via `graphOf(machine)`.
      Why it matters: barely useful today; it mainly hands tooling the original
      machine.
      Current output:

  ```json
  {
    "kind": "graph",
    "machineId": "inspect.demo.machine",
    "initial": "idle",
    "states": ["idle", "running", "done"]
  }
  ```

- [x] Passive story descriptor via `flowStories(machine, stories)`.
      Why it matters: useful for docs curation, but not executable.

- [x] Passive replay descriptor via `replayTrace(machine, trace)`.
      Why it matters: useful as a trace packaging step, but it is not behavioral
      replay or time travel.

- [x] Runtime already emits richer machine facts than the public inspect API
      suggests.
      Current runtime event types observed in tests and receipts include:
      `actor:start`, `actor:snapshot`, `machine:event`, `machine:transition`,
      `machine:update`, and `machine:microstep`.

## XState Features Worth Learning From

- [x] Typed system-level inspection events.
      XState defines explicit event families in
      `docs/codebases/xstate/packages/core/src/inspection.ts`:
      `@xstate.actor`, `@xstate.event`, `@xstate.snapshot`,
      `@xstate.transition`, `@xstate.microstep`, and `@xstate.action`.
      Why it matters: tools can reason over stable event categories instead of
      loosely-shaped logs.

- [x] Observer-style inspection subscriptions.
      XState supports function or observer subscriptions and returns a removable
      subscription. See
      `docs/codebases/xstate/packages/core/src/system.ts` and
      `docs/codebases/xstate/packages/core/test/inspect.test.ts`.
      Why it matters: this scales better into transports, devtools, and filters.

- [x] Real graph helpers.
      XState already ships directed graph and traversal helpers in
      `docs/codebases/xstate/packages/core/src/graph/index.ts`, including
      `toDirectedGraph`, `getShortestPaths`, `getSimplePaths`,
      `getPathsFromEvents`, and adjacency maps.
      Why it matters: graph APIs become useful when they can answer questions, not
      when they only wrap the machine.

- [x] Transport-aware browser inspector.
      XState's inspect package includes browser/server transport ideas, receiver
      hooks, target windows, and serializer hooks. See
      `docs/codebases/xstate/packages/xstate-inspect/README.md`,
      `browser.ts`, `server.ts`, and `serialize.ts`.
      Why it matters: inspect becomes shareable and safe once data can be filtered,
      redacted, and forwarded.

## Phase 1. Make Live Inspection First-Class

- [x] Replace the loose `FlowInspectionEvent = FlowReceipt | actor:snapshot`
      surface with a discriminated public union for the events we already emit.
      Include at least `actor:start`, `actor:snapshot`, `machine:event`,
      `machine:transition`, `machine:update`, `machine:microstep`, resource facts,
      transaction facts, stream facts, timer facts, and child lifecycle facts.
      Why: today the runtime is richer than the type surface, so tools have to guess.
      Payoff: better devtools, better autocomplete, less stringly-typed logging.
      XState inspiration: `packages/core/src/inspection.ts`, but do not invent
      speculative categories just because XState has them.

- [x] Add metadata common to every inspection event.
      Include stable fields such as `actorId`, `rootActorId`, `moduleId?`,
      `appId?`, `eventType?`, `correlationId?`, `timestamp`, and `sequence`.
      Why: this makes sorting, filtering, merging, and UI timelines much easier.
      Payoff: inspection panes stop re-deriving identity from ad hoc keys.

- [x] Promote existing runtime facts into first-class inspection event types
      instead of leaving them as loosely-typed receipts.
      The runtime already emits richer categories such as `machine:guard`,
      `machine:action`, and `machine:no-transition`, but the public inspection
      contract still collapses them back into `FlowReceipt`.
      Why: tools should not have to reverse-engineer semantic event families.
      Payoff: sharper typing, easier rendering, and less wrapper slop.

- [x] Add sequence and timestamp assignment inside the inspection log layer
      rather than making callers infer order from append timing.
      Why: currently inspection order is implicit.
      Payoff: trace merging and timeline UIs become much simpler.

- [x] Add observer-style subscriptions in addition to callback subscriptions.
      Support `{ next, error?, complete? }` and return a small subscription object.
      Why: transports and adapters become cleaner.
      Payoff: easier bridges to devtools, browser receivers, test taps, and logs.
      XState inspiration: `actor.system.inspect(...)`.

- [x] Add filterable subscriptions.
      Example targets: only actor `Project/editor`, only `machine:*` events, only a
      given `correlationId`, only failures, only events after sequence `N`.
      Why: raw logs get noisy fast.
      Payoff: devtools can show signal instead of everything.

- [x] Add redaction and serialization hooks for inspection export.
      Why: resource values and transaction payloads may contain sensitive or very
      large data.
      Payoff: safer remote debugging and sharable receipts.
      XState inspiration: serializer hook in `@xstate/inspect`.

- [x] Add bounded retention policies.
      Support ring-buffer size, time-window retention, and explicit snapshotting.
      Why: unbounded logs are sloppy in long-lived runtimes.
      Payoff: inspection can stay on in development without accidental memory leaks.

- [x] Expose resource-store inspection on the public runtime.
      `ResourceStore` already has an internal `inspect()` surface, but
      `runtime.resources` only exposes `get`, `patch`, `subscribe`, `hydrate`, and
      `dehydrate`.
      Why: resource inspection is half-built today but hidden from users.
      Payoff: inspect UIs can show all resource state without manual per-ref wiring.

- [x] Add richer app/module ownership metadata to inspection events.
      Today app ownership mainly names machines. Expand it so resources,
      transactions, streams, views, and timers can carry app/module ownership paths.
      Why: `flow.app(...)` should improve inspection with more than actor ids alone.
      Payoff: traces become app-aware instead of just actor-aware.

- [x] Promote descriptor metadata into inspection context where useful.
      Use module/app inventory metadata such as `screens`, `tags`, `dependencies`,
      and `permissions` as optional inspection labels rather than leaving them
      inventory-only.
      Why: this helps inspection answer "what part of the app is this?" instead of
      only "what id is this?"

## Phase 2. Turn `graphOf(...)` Into A Real Graph API

- [x] Change `graphOf(machine)` from a passive wrapper into a real graph
      descriptor with explicit nodes, edges, event labels, targets, and initial
      state.
      Why: right now the caller still has to inspect `machine.config` by hand.
      Payoff: graph exports, diagrams, and tooling stop depending on internals.
      XState inspiration: `toDirectedGraph(...)`.

- [x] Include machine facts that are useful for visualization.
      Add state metadata such as tags, descriptions, terminal status, child specs,
      timed transitions, and eventless transitions.
      Why: a graph should answer "what is this machine?" without opening source.

- [x] Add graph queries.
      Start with `reachableStates`, `outgoingEvents(state)`, `incomingEdges(state)`,
      and `findState(id)`.
      Why: most docs tools and editors want answers, not raw blobs.

- [x] Add path utilities on top of the graph.
      Support shortest paths, simple paths with bounds, and "path from events".
      Why: this is where graph data starts improving productivity in tests and docs.
      Payoff: scenario discovery, regression reproduction, and example generation.
      XState inspiration: `getShortestPaths`, `getSimplePaths`,
      `getPathsFromEvents`, and adjacency helpers.

- [x] Reuse the existing `flowTest.model(...)` traversal machinery instead of
      reimplementing path logic separately inside inspect.
      Why: the test/model layer already knows how to compute shortest and simple
      paths over machine snapshots.
      Payoff: less duplicate logic and a more honest graph API.

- [x] Add graph JSON exports that are stable and UI-independent.
      Why: browser tools, docs pages, CLIs, and snapshot tests should all consume
      the same serialized graph.

- [x] Add graph ownership and inventory overlays.
      Let graph exports optionally include app/module ownership paths and machine
      tags/screens when the machine came from a module or app.
      Why: app-scale graph views are much more useful when they can be grouped and
      filtered semantically.

## Phase 3. Add Pure Transition Inspection

- [x] Add `inspectTransition(machine, snapshot, event)` that returns a pure
      explanation of what would happen before the event is sent through a live
      runtime.
      Include candidate transitions, chosen target, guard results, updates, and
      emitted receipts.
      Why: this closes the gap between "I know the machine changed" and "why did it
      choose this path?"

- [x] Add `inspectMicrosteps(machine, snapshot, event)` that exposes each
      microstep, including always/eventless transitions and raised internal events.
      Why: Flow already emits `machine:microstep`, but there is no first-class API
      for examining the step sequence.
      Payoff: easier debugging of non-obvious transition cascades.
      XState inspiration: `@xstate.microstep` inspection events and related tests.

- [x] Add `inspectActions(...)` or equivalent action/update facts.
      Why: a transition is often only half the story; the real work is in updates,
      resource ops, child ops, and emitted events.
      Payoff: docs and tools can explain behavior instead of just state changes.
      XState inspiration: `@xstate.action`.

- [x] Include richer action and guard payloads in machine planning receipts.
      Capture enough data to explain which guard index was evaluated, which action
      phase ran, and what state transition or reentry context surrounded it.
      Why: the raw receipt types exist today, but the explanation layer is still thin.

- [x] Add `whyNoTransition(machine, snapshot, event)`.
      Return whether the event was unknown, blocked by guard, ignored in state, or
      stopped by microstep limits.
      Why: "nothing happened" is currently expensive to explain.

- [x] Make these APIs pure and runtime-free.
      Why: they should work in tests, docs generation, and editors without a full
      app runtime.

- [x] Add pure inspection of resource, transaction, stream, timer, and child
      side-effects planned by a machine event.
      Why: right now transition inspection is still too machine-centric, while many
      real-world effects live in the orchestration subsystems.
      Payoff: a single event explanation can cover more than just state changes.

## Phase 4. Make Trace Capture And Replay Actually Powerful

- [x] Keep `captureTrace(...)`, but enrich the trace with more structure.
      Add event timeline, actor hierarchy, state-before/state-after, issue summaries,
      and per-correlation outcomes.
      Why: current bucketed receipts are useful, but still low-level.

- [x] Enrich trace correlation with better subsystem-specific details.
      Add resource freshness changes, transaction queue/dequeue causes, stream
      emission counts, timer durations, and child supervision outcomes where
      available.
      Why: current correlation groups are useful, but many receipt families are
      still too flat to explain behavior well.

- [x] Add explicit rehydration and restore facts to traces.
      Emit and capture first-class inspection/trace events for actor restore,
      resource hydration, resumed timers, resumed streams, and interrupted work on
      rehydrate.
      Why: persisted boot and restore are real runtime features, but inspect does
      not tell that story clearly yet.

- [x] Add trace facts for resource lifecycle, not just patches and invalidation.
      Good candidates include ensure/refresh start, fetch success/failure,
      placeholder usage, freshness changes, and invalidation reason summaries.
      Why: resources are one of Flow State's main runtime surfaces, and traces
      currently under-explain them.

- [x] Add richer transaction receipts for inspection.
      Good candidates include queue key, overlap cause, attempt duration, preview
      summary, rollback summary, and routed success/failure event info.
      Why: transactions already emit many receipts, but they still do not explain
      "why this transaction behaved this way?" very well.

- [x] Add richer stream and timer receipts for inspection.
      Good candidates include last emission summary, emitted count, completion
      reason, interrupt reason, restored-vs-fresh timer info, and elapsed duration.
      Why: the current start/done/fire receipts are real but still quite shallow.

- [x] Add richer child lifecycle receipts for inspection.
      Include ownership path, supervision mode, spawn reason, stop reason, retry
      cause, and completion route when known.
      Why: child orchestration is one of the harder parts to debug from raw receipts.

- [x] Make `replayTrace(...)` honest and useful.
      Either:
  1. keep it as analysis-only and rename it to something like `analyzeTrace`, or
  2. implement real deterministic replay over captured event sequences.
     Why: the current name oversells the feature.

- [ ] If real replay is implemented, scope it narrowly.
      Start with machine-only deterministic replay from event sequences and known
      snapshots before attempting resource/transaction re-execution.
      Why: fake time travel is worse than no time travel.

- [x] Add trace diffing.
      Compare two traces by event sequence, transitions, issues, resource patches,
      and transaction outcomes.
      Why: this would be immediately useful for regression debugging.

- [x] Add durable export/import helpers.
      Example targets: JSON artifact, compressed JSON artifact, and stable schema
      versioning.
      Why: traces are most useful when they can move between CI, local repro, and
      docs.

- [x] Add shareable summary builders.
      Output should support a concise incident report, not just raw receipts.
      Why: most users want "what happened?" more than they want a raw log.

- [x] Add trace diffing that understands subsystems semantically.
      Compare not only receipt order, but also state changes, resource freshness,
      transaction outcomes, stream outcomes, child outcomes, and timer behavior.
      Why: regression debugging often needs a semantic diff, not a textual one.

## Phase 5. Make `flowStories(...)` Executable

- [x] Add a typed story schema instead of `ReadonlyArray<Record<string, unknown>>`.
      Include story id, title, description, start snapshot or setup, event sequence,
      expected state, expected facts, and tags.
      Why: today `flowStories(...)` is too loose to power anything reliably.

- [x] Add story execution helpers.
      Example: run a story against a machine or harness and return final snapshot,
      receipts, issues, and trace.
      Why: stories become useful once they can prove behavior.

- [x] Add story-to-doc and story-to-test helpers.
      Why: the same scenario should not be rewritten for docs, examples, and tests.

- [x] Add story coverage views on top of the graph utilities.
      Show which states, transitions, and failure lanes are covered by curated
      stories.
      Why: this turns stories into a planning tool instead of a docs ornament.

- [ ] Let stories declare resource seeds, fixture names, or boot payloads.
      Why: realistic scenarios often depend on resource or app setup, not only event
      sequences.
      Payoff: stories become a bridge between docs, tests, and runtime repro.

## Phase 6. Build Inspect Transports And Tooling

This phase stays deferred until Phases 1-5 stabilize the core inspect
contracts.

- [ ] Add a transport-neutral inspection sink.
      Example targets: in-memory sink, console sink, file sink, browser postMessage
      sink, websocket sink.
      Why: inspection should not assume one UI.
      XState inspiration: browser/server inspector transport split.

- [ ] Keep structured data as the canonical inspect output, but add optional
      pretty-print layers on top.
      Examples: `formatInspectionEventPretty(...)`, `formatTracePretty(...)`,
      compact-vs-pretty output modes, and stable terminal renderers for timelines,
      actor trees, correlation groups, and failure summaries.
      Why: raw structured output is still the right contract for tools and tests,
      but humans should not have to read giant JSON blobs by default.
      Payoff: inspect becomes much more useful in terminals, docs, and debugging
      sessions without giving up machine-readable receipts.

- [ ] Add semantic summary renderers above the raw and pretty layers.
      Examples: "why no transition?", "resource freshness report",
      "transaction overlap summary", and "rehydration incident summary".
      Why: even pretty JSON is still too low-level for many debugging tasks.
      Payoff: users get explanations, not just formatted data dumps.

- [ ] Add a small browser receiver/devtools adapter in a separate package or
      subpath.
      Why: the core package should stay runtime-first, but local tooling should be
      easy to build.

- [ ] Add a first-party local inspector proof surface.
      The first version can be minimal: actor tree, event timeline, correlation
      detail, and trace export.
      Why: Flow already has enough runtime facts to make this valuable.

- [ ] Add CLI inspection helpers.
      Example: pretty-print current inspection buffer, dump trace by actor id,
      summarize failures by correlation id.
      Why: a lot of real debugging starts in the terminal, not in a browser.

## Phase 7. Tighten Docs, Naming, And De-Sloppify Cuts

- [ ] Decide whether `@flow-state/inspect` is one coherent surface or two
      surfaces mashed together.
      Likely split:
  1. pure machine analysis helpers
  2. live runtime inspection helpers
     Why: right now the name suggests more cohesion than the implementation has.

- [ ] Rename thin or misleading APIs where needed.
      Strong candidate: `replayTrace(...)`.
      Possible candidate: keep `graphOf(...)` only if it becomes a real graph API.

- [ ] Document "what exists today" separately from "what we want next".
      Why: inspect is currently easy to oversell.

- [ ] Keep inspect out of the root package entrypoint if the surface grows.
      Why: heavy diagnostics and UI adapters should remain behind a dedicated
      boundary.

- [ ] Audit the cross-package split so inspect does not stay wrapper-thin while
      the real capabilities remain stranded in `runtime`, `testing`, `store`, and
      `descriptors`.
      Why: a lot of the current sloppiness is architectural, not just naming-level.

- [ ] Prefer promoting existing subsystem capabilities over inventing parallel
      inspect-only abstractions.
      Examples: resource store inspection, flow-model path traversal, boot/restore
      facts, and app ownership metadata.
      Why: this reduces duplication and keeps inspect grounded in the real runtime.

- [ ] Require a receipt script or snapshot test for every phase slice.
      Suggested proof surface: extend
      `packages/flow-state/scripts/inspect-feature-receipts.mjs`.

## Suggested Implementation Order

- [ ] Start with Phase 1.
      Reason: the runtime already emits useful facts, so typing and structuring them
      is the fastest productivity win.

- [ ] Then Phase 2.
      Reason: `graphOf(...)` is currently the thinnest public API and the easiest
      place to remove ceremony.

- [ ] Then Phase 3.
      Reason: pure transition inspection gives the biggest debugging payoff without
      requiring a UI.

- [ ] Then Phase 4 and Phase 5 in whichever order matches active docs/test work.
      Reason: both become much more valuable after phases 1 through 3 exist.

- [ ] Leave Phase 6 for after the data contracts are stable.
      Reason: building a UI or transport layer first would lock in sloppy shapes.

## Exit Criteria

- [ ] A new user can answer "what happened, why did it happen, and how do I
      reproduce it?" from inspect outputs alone.

- [ ] The public inspect APIs are smaller in count or sharper in responsibility,
      not larger-and-vaguer.

- [ ] At least one docs page, one receipt script, and one test suite demonstrate
      each major inspect capability.

- [ ] We can point to at least one concrete productivity win per phase:
      faster debugging, easier docs generation, simpler tests, or better incident
      artifacts.
