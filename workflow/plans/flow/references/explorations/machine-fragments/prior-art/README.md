# Prior art: what established systems teach proposal v3

Four research notes compare [proposal-v3.md](../proposal-v3.md) with systems that solved similar
problems. Each note has sources, failure scenarios in Flow State terms, and ranked recommendations.

| Note | Systems |
| --- | --- |
| [synchronous-languages.md](synchronous-languages.md) | Esterel, SyncCharts, SCCharts (SC semantics), Lustre, SCADE 6, Céu |
| [statechart-languages.md](statechart-languages.md) | Harel / Statemate, UML state machines, SCXML, itemis CREATE, Rhapsody, XState |
| [durable-workflows.md](durable-workflows.md) | Temporal, Azure Durable Functions, AWS Step Functions, Restate, sagas |
| [modal-models-p-behavior-trees.md](modal-models-p-behavior-trees.md) | Ptolemy II modal models, P and Coyote, behavior trees, Elm / Redux |

## What prior art confirms

- **The turn.** Pre-turn guard reads, an acyclic raise graph checked syntactically, disjoint memory
  keys and whole-turn refusal are the Lustre / SCADE / Statemate choice, safer than Esterel's
  constructive causality for TypeScript guards written by agents.
- **Fragments.** Exits are Esterel traps; abandonment is strong abort; fresh-on-entry is SCADE's
  reset entry; traits and subroutines match Unreal StateTree's tasks and linked subtrees;
  contracts match BehaviorTree.CPP ports and itemis interface scopes; keyed lists match Céu pools
  and Redux normalised entities.
- **Operations.** Retries resend the admitted input; `retry.on` is an allowlist; the Attempt is
  saved before sending; `notSent` is separate from uncertain outcomes; late results are fenced;
  restore uses snapshots. Stories already inject faults better than the engines' test kits.

## Findings more than one note reached independently

| Finding | Notes | Recommendation |
| --- | --- | --- |
| **The turn needs one written algorithm**, especially for instances created, entered or reset in the same turn (v3's own `lockouts.Add` then `Start` works by luck) | synchronous (R3 "schizophrenia"), statechart (R1) | one normative turn algorithm, shared by the runtime and `check()`, with an incarnation rule |
| **Fragments need a leave hook** that cannot refuse or move, so a draft survives abandonment (D7) | synchronous (R6), statechart (R2), behavior trees (R6) | an `onLeave` / `abandon` port, fused into the leaving turn |
| **Deliveries into a removed or replaced list row** | modal models (R1), synchronous (incarnations) | incarnation ids for list instances; a delivery into a dead incarnation is dropped with evidence |
| **Node memory across visits** | modal models (R2), synchronous (history resets fragments, R7) | a `keep` option on `.at`, or history that also resumes data |

## The rest, by layer

**Turn and fragments**

- `resetOn` order is likely backwards: reset first, then react (synchronous R1); and its runtime
  fixed point should be rejected statically or read only the pre-turn snapshot (R2).
- `flow check` should check hosts against fragment *contracts*, not bodies, so swapping a fragment
  with the same contract cannot break its host (synchronous R4).
- A lint for a mapper that reads a key its own transition writes (synchronous R5).
- A child's refusal never makes the host fall through to its next alternative (synchronous R8).
- Named entries for subroutines (start at PAYMENT; skip a satisfied step) (statechart R3).
- Deep history, a history default, and clearing history (statechart R4).
- Typed pure read ports for live host values (statechart R5); this partly revisits the live-props cut.
- Stateful traits without host parallel regions: "at most one state change per component" (modal R5).

**Operations**

- Mark each failure tag definite or uncertain; only definite tags retry (durable R1).
- Retries share one Attempt id and are saved before sending (R2).
- A commit `timeout`: `notSent` before sending, `unknown` after (R3).
- Cancel after sending sends the real result to `abandoned` (R4).
- Attempts carry a creation time; descriptors declare the server's dedup window (G5).
- In-flight Attempts survive a persistence version bump, via an `orphaned` handler (R5).
- `abandoned` may start a compensating commit, fenced to the actor; document sagas (R6).

**Verification and runtime**

- Systematic exploration: outstanding outcomes and armed timers as candidate events in `model()`,
  invariants, P-style hot states, delay-bounded schedule search (modal R3).
- More `flow check` findings: dead exits, unused `hostEvents`, subroutines that never exit; Story
  coverage reports (statechart R6).
- State the mailbox order (FIFO with user sends) in Runtime and Machines (statechart R7).
- Warn on unhandled cross-actor `send`, with an explicit `ignore` (modal R4).

## Not recommended by any note

Esterel's constructive causality, parallel regions in the host, deferred events, queued
microsteps, statechart inheritance, general eventless transitions, and multiform time as the only
notion of time.
