# Rejected, superseded, and deferred directions

Status: non-normative record

This file preserves decisions that must not silently return during implementation. Its entries have no
normative force except to record that a direction was rejected, superseded, or deliberately deferred.
Each entry must cite its exact source and must not infer reasons or future acceptance criteria absent from
that source.

This file does not classify old contract clauses or define deletion scope. Removed and replaced old
surfaces are governed only by [`COMPATIBILITY_AND_DELETIONS.md`](../contracts/COMPATIBILITY_AND_DELETIONS.md)
and its `DEL-*` and `RET-*` entries.

## Rejected

- **Ambient or mutable actor composition:** Flow does not use React Context, prop drilling, mutable
  cross-actor context, actor refs inside selected context, or context as a command channel. State-changing
  coordination remains typed events. Provenance: `DESIGN_REVISIONS.md:15-20`, `:40-45`, and `:103-122`.
- **Automatic roots and dynamic app registration:** `App.M` admits reusable machines and creates no actor
  instances. `dynamicMachines`, automatic-root identity, `RootActor`, and `runtime.actor(machine)` are not
  part of the accepted app model. Provenance: `DESIGN_REVISIONS.md:187-215`.
- **Child machines:** Recursive substates replace nested child actors. Child input, lifecycle, completion,
  snapshot, addressing, Story commands, pending work, and model surfaces are removed. Provenance:
  `DESIGN_REVISIONS.md:238-241` and `:1169-1171`.
- **Late behavior provision:** Flow does not add XState-style `setup()` or `machine.provide()`. A behavior
  variant requires a distinct definition and durable machine identity. Provenance:
  `DESIGN_REVISIONS.md:243-247`.
- **A separate typed-identity replacement for input:** Input initializes each fresh actor once and does not
  classify locality or sharing; Flow does not replace it with another identity API. Provenance:
  `DESIGN_REVISIONS.md:224-236` and `:1202-1208`.
- **Final-node actor completion:** Flow has no `type: "final"`, parent `onDone`, automatic actor completion,
  final output, subscription closure, or mailbox shutdown from entering a terminal-looking state. Provenance:
  `DESIGN_REVISIONS.md:313-317`.
- **Relative or runtime state addressing:** Transitions use exact definition-derived state tokens, not
  relative strings, arbitrary child IDs, runtime path lookup, or implicit parent fallback. Provenance:
  `DESIGN_REVISIONS.md:254-278`.
- **Nested state-machine protocol variants:** Substates do not create nested event catalogues, implicit
  ancestor overrides, parent fallback after guard failure, XState-style nested state values, Boolean
  reentry, or a separate declaring-node callback field. Provenance: `DESIGN_REVISIONS.md:275-335`.
- **Custom selection comparators:** Context selection, `onMemory.select`, and `useView` use the accepted
  complete-value `Object.is` boundary for scalars and non-records and fixed-key field `Object.is` boundaries
  for named records; arbitrary comparator arguments remain excluded. The optional React-only
  `useShallow(selector)` memoization adapter remains accepted by `REV-HOST-006`.
  Provenance:
  `DESIGN_REVISIONS.md:47-52`, `:453-465`, and `:847-852`.
- **Generic operation registries and bound refs:** Public `ref`, `byKey`, bound-entry objects,
  `resources.get`, `transactions.get`, and public enumeration are removed in favor of exact named family
  methods. Provenance: `DESIGN_REVISIONS.md:401-409` and `:1424-1428`.
- **Registered React views:** Public `flow.view`, view IDs, module view registries, per-actor React Context,
  `MachineBindings`, ref providers, and prop-drilled actor state are excluded. Provenance:
  `DESIGN_REVISIONS.md:811-857`.
- **Shell swapping and guessed React cleanup:** Render must not expose a hollow handle that is later swapped
  for a live actor, and cleanup must not use a grace period or guess that React will reconnect. Provenance:
  `DESIGN_REVISIONS.md:567-583` and `:648-670`.
- **Refs as construction or ownership bundles:** Refs are not app-branded and do not contain input, context
  bindings, callbacks, ownership, or disposal. `createActor` does not accept a stable ID, lookup does not
  create, ordinary handles do not dispose, dropping a lease does not clean up implicitly, and a disposed
  stable ref cannot be resurrected within the same runtime. Provenance: `DESIGN_REVISIONS.md:692-809`.
- **Testing-specific runtime engines:** A Story/test runtime, actor, mailbox, scheduler, operation store,
  transition engine, cache, snapshot implementation, or cleanup engine is prohibited. Provenance:
  `DESIGN_REVISIONS.md:864-895` and `:1115-1128`.
- **Machine Story restoration overrides:** Focused Stories do not accept boot, extra actors, refs, raw
  memory, initial state, or actor snapshots. Provenance: `DESIGN_REVISIONS.md:952-988`.
- **Story targets and recipes outside their exact scope:** App commands do not target machine families;
  Story-local recipes are not accepted by React or ordinary runtime APIs; app Stories do not inject
  selected context; and app orchestration is not substituted by pure single-machine model discovery.
  Provenance: `DESIGN_REVISIONS.md:897-988` and `:1111-1113`.
- **Imperative or branching Story plans:** Story builders do not embed assertions, predicates, behavior
  branches, loops, arbitrary execution callbacks, or live actor handles. Provenance:
  `DESIGN_REVISIONS.md:886-895`.
- **Implicit Story progression:** `simulate`, clock movement, and checkpoints do not process unrelated work
  implicitly. Provenance: `DESIGN_REVISIONS.md:990-1035`.
- **Unbounded machine cache authority:** Machines receive no wildcard clearing or ordinary
  `runtime.cache.clear()`; full cache teardown belongs to `runtime.dispose()`. Provenance:
  `DESIGN_REVISIONS.md:523-528` and `:1462-1465`.
- **Latest-value stream storage:** Stream status does not retain the latest emission; durable observation
  requires mapped actor memory or an explicit authoritative resource write. Provenance:
  `DESIGN_REVISIONS.md:528-541` and `:1466-1468`.

## Superseded proposals and terminology

- Callable `story({ app, machine, start? })`, `.with(...)`, bare-app app Stories, and live-runtime Story
  inputs are superseded by the three explicit Story constructors. Provenance: `DESIGN_REVISIONS.md:1154-1157`.
- `perform`, `deliver`, and `receive` are superseded by `simulate`. `flush` and `settle` are superseded by
  `process`; `setTime` is superseded by `advanceTo`; result `final` is superseded by `run.end`. Provenance:
  `DESIGN_REVISIONS.md:1161-1166`.
- App checkpoint machine-ID maps are superseded by exact
  `checkpoint.actor(storyActor | actorRef)` evidence lookup. Provenance: `DESIGN_REVISIONS.md:1164-1166`.
- `lane` terminology for transaction identity is superseded by the shared `key` vocabulary. Provenance:
  `DESIGN_REVISIONS.md:1427-1428`.
- The candidate-memory action proposal is superseded by one pre-turn snapshot for guard,
  `updateMemory`, and `actions`. Provenance: `DESIGN_REVISIONS.md:430-445`.

## Deliberately deferred

- **Singleton, toggle, and debounce shorthand:** Explicit state and timer syntax remains the accepted
  baseline. These helpers require a later separately accepted proposal with equivalent lifecycle semantics.
  Provenance: `DESIGN_REVISIONS.md:249-252` and `:1248-1250`.
- **Runtime-sized continuing-operation collections:** `subscribeMany`, `subscribeEach`, arrays of plans,
  and implicit array-to-many interpretation are deferred. Known finite sets use separate declarations;
  dynamic membership uses an aggregate resource or separately owned actors until its bounds, duplicate
  policy, outcomes, persistence, and release evidence are designed. Provenance:
  `DESIGN_REVISIONS.md:467-479` and `:1448-1450`.

## Unaccepted supporting proposals

`DESIGN_BEHAVIOR_SOLUTIONS.md` and `DESIGN_BEHAVIOR_DISPOSITIONS.md` contain proposed internal solutions
and migration mappings. Their status remains non-normative. They MUST NOT be copied into accepted `REV-*`
rules until the user explicitly accepts the relevant behavior. The open problem statements remain indexed
separately in [`UNRESOLVED_BEHAVIOR.md`](./UNRESOLVED_BEHAVIOR.md).
