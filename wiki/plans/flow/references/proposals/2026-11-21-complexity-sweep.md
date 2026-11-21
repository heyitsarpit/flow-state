---
review complexity-sweep
status open 2026-11-21
---
# Costly operations over the graph (2026-11-21)

**Bottom line:** the world answers its per-step questions by scanning, not by index. Each step copies every world
map it touches (`core/tx.ts:165-170`), so an event costs O(actors) instead of O(what changed); a schedule firing
re-sorts every timer in the world; owed rows, reads and mailboxes are scanned app-wide. No cubic loop runs on a hot
path. Construction has quadratic walks that grow with state, sibling and reaction counts. Test tooling has the
steepest costs (O(S²) per generated or swept run), which matches the coverage timeouts. Each family below names the
cluster of @proposal.algorithm-round that owns its design.

Source: four read-only Haiku sweeps (effort medium), one per area. The orchestrator re-read every hot-path finding
in the code; one was rejected (`schedule-decision.ts:272-274` is not quadratic: `restartOn` is an `Option`). Nothing
was benchmarked; sizes come from reading. Paths are under `packages/flow-state-v3/src/`.

## Families

### F1. No index for per-step questions (cluster 2 owns the index layer; cluster 5 the compile-time half)

| Where                                    | Question asked by scanning              | Cost, when                                  |
| ---------------------------------------- | --------------------------------------- | ------------------------------------------- |
| `core/tx.ts:165-170` `draft`             | Copy-on-write by copying the whole map  | O(size of each touched map) per step        |
| `core/schedule-plan.ts:186-190, 240-244` | Timers due by now, in firing order      | O(T + D log D × S) per schedule firing      |
| `core/persist.ts:346-347` `markMailbox`  | Identities with a row in the mailbox    | O(all owed rows) per step while mail queued |
| `core/incarnations.ts:301-302` `retire`  | Reads held by this incarnation          | O(all reads) per ending                     |
| `core/lanes.ts:125-133` `interruptReads` | Reads of this incarnation and operation | O(all reads) per cancel or replaced commit  |
| `core/serve.ts:210` `pendingOwners`      | Lane owners of this actor               | O(queued commits) per turn, read only late  |
| `core/tx.ts:254-258` `consumersOf`       | Consumers of a provider, in start order | copy, flatMap and sort per call             |
| `host/owners/owners.ts:289-293` `cancel` | Which owner forked this key             | O(owners) per call, twice per capture batch |

### F2. Re-deriving per call what is fixed per machine (cluster 5, with each cluster's needs)

- `core/schedules.ts:335-341` `pass`: filters timers by name and issues by source per declared schedule; rebuilds
  `declaredOn` every pass. O(S·(T+I)) per turn, firing, lane move and context change. (cluster 1)
- `core/schedules.ts:80-84` `contextOf`: rebuilds the context object on every `read(key)`. (cluster 1)
- `core/schedule-plan.ts:151-155` via `core/persist.ts:105-111`: idle timers × states × schedules per actor record
  write. (cluster 1, 3)
- `core/identity.ts:45, 67` `inputFieldsOf`, `core/actor-record.ts:170-175` `memoryText`: filter and sort compiled
  fields per call. (cluster 3)
- `definition.ts:320` and `core/tree.ts:8-12` `chainOf`: rebuild a state's path chain per call, about four times a
  turn. (cluster 2)

### F3. Queues and lists copied per item (cluster 2; lanes cluster 4)

- `core/serve.ts:493-501` follow-up chain rebuilt by spread: O(k²) per drain, k ≤ 100.
- `core/tx.ts:383, 439, 456` mailbox `shift`, `filter` and copy: O(M) per dequeue, O(M²) to drain one mailbox.
- `core/context.ts:222-229` wave scans each consumer's mailbox: O(consumers × mailbox) per provider change.
- `core/tx.ts:213-222` consumer index Sets copied per bind: O(C²) per provider at boot or storms.
- `core/lane-moves.ts:189, 230` lane queue spread per enqueue or dequeue. (cluster 4)
- `core/ledger.ts:328-411` owed rows replaced once per row: O(R²) per identity at boot, start, end. (cluster 3, 4)
- `host/snapshot.ts:100-107` keyed timer views spread per key: O(K²) per snapshot and inspect. (cluster 1, 5)

### F4. Construction walks (cluster 5)

- `machine.ts:351` → `:177` `handled`: reactions × states.
- `compile-body.ts:266, 229`: body keys × siblings per compound.
- `definition.ts:456` and `machine.ts:329`: the state tree built twice; context reads built twice (`:468`, `:360`).
- `contract.ts:357, 422` `codecsOf` rerun per binding; `compile-names.ts:17-22` prefix rebuilt per segment.
- `core/boundary.ts:307` one AST walk per `Suspend` node.
- Minor: `compile-schedules.ts:70`, `operation-checks.ts:27-45`, `config.ts:440`.

### F5. Test tooling (cluster 5, test tooling)

- `host/testing/generate.ts:512` → `fake.ts:475`: call counts by filtering the whole log, per endpoint per pull:
  O(S²·E) per generated run.
- `host/testing/story.ts:274-283` `forkAt` at every step, each saving a full copy and replaying the suffix: O(S²).
- `host/testing/sweep.ts:80` and others call `view.lanes()`, which rebuilds the whole inspect cut, 1 to 3 times a
  step across 56 cells.
- `host/testing/run.ts:521-525` view fields built eagerly per pull; `fake.ts:576-657` batch scans; `clock.ts:27`
  cancel by three scans; `generate.ts:1117` subset search up to 2^k per drop.

### Edge cases, not hot

`core/same.ts:209` re-walks shared substructure under a cycle (worst case exponential); `core/data-view.ts:64-80`
has no memo (tooling); `core/disposal.ts:163-175` splice per release, computed twice; `core/well-formed.ts:125-150`
walks shared subtrees per path at construction.

## For the leads

A design removes a family, not a line: an index owned by the module that writes the indexed fact and updated in the
same transition (`AGENTS.md`: cache only when measured, update it in the same transition), or a value computed once
in `Compiled`. Each cluster's "cost" section lists its rows above with the replacement and its complexity.
