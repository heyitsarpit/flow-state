# Correctness-plan revalidation queue

[Back to the plan tracker](../TASK.md)

This is a temporary recovery queue for the regressions and invalid closeouts
found after P1C.3b. It outranks forward packet execution until R0.10 closes.
Existing packet manifests remain authoritative for their semantics; this file
only divides revalidation into session-sized proof slices.

## Session contract

Each `/goal` session executes exactly one row marked `Ready — next` and then
stops, even if its commit makes the successor ready. A session must:

1. Re-read `TASK.md`, this file, the one assigned row, its named packet
   contracts/receipts, and the live worktree.
2. Establish the row's exact baseline and preserve the three still-known P0.1a
   architecture failures unless the row owns them.
3. Run Red → Green → Inspect → Refactor → thermo review → fix → affected
   verification.
4. Treat every failure outside the recorded P0.1a failure IDs as blocking. A
   failure being old, deferred, or outside the preferred edit does not make it
   non-blocking.
5. Keep the row inside its named owner and tests. If it needs another owner or
   more than the named failure family, split the row in this file, commit only
   that planning correction, and stop.
6. Run the literal commands named by the row. `E` means the Launch Workspace
   test, `C` means `pnpm fmt && pnpm lint`, and neither may be replaced by
   `pnpm check` or a type-only proof.
7. Write `tasks/receipts/<row>.md`, update only this queue and the necessary
   `TASK.md` statuses, commit the verified row, make exactly one successor
   `Ready — next`, and stop the session.

Do not rewrite the historical receipts. A recovery receipt supplies the new
evidence and names the historical packet statuses it revalidates.

## Accepted baseline

P0.1a recorded 39 failures in five files. At recovery start, only these three
recorded architecture failures remained and may stay red until their owning
later documentation packets:

- `api-reference-generation-architecture.test.ts`
- `behavior-guidance-architecture.test.ts`
- `behavior-scaffold-architecture.test.ts`

The audited P1C.3b tree had 47 failures in 14 files: the three accepted failures
above plus 44 new failures in 11 files. R0.1 removes the stale tracker assertion,
so later rows begin from the refreshed count recorded in its receipt.

## Recovery packets

### R0.1 Recovery bootstrap and immutable failure ledger

Status: Done.

Scope: record the live failure delta, freeze affected forward packets, replace
the transient P0.6 tracker assertion with durable artifact wiring, resolve the
workspace formatter blocker, remove the generated pack tarball, and install
this one-row-per-session contract. No runtime semantics change.

Commands: focused `correctness-plan-architecture.test.ts`; `T`; full
`pnpm --filter flow-state test` for the refreshed ledger; `E` for the recovery
ledger; `C`; `pnpm check` as supplemental workspace evidence.

### R0.2 App identity presentation compatibility

Status: **Ready — next**.

Own only the three `behavior-coverage-render.test.ts` regressions introduced by
canonical app identity. Decide from the active API/compatibility contracts
whether presentation should retain a stable human-facing label or the tests
must intentionally consume canonical identity; do not change actor ownership.

Commands: `F(packages/flow-state/src/behavior-coverage-render.test.ts
packages/flow-state/src/app-inventory.test.ts)`; `T`; `P`; `C`.

### R0.3 Transaction callers under app-bound actor ownership

Status: Blocked on R0.2.

Own the 13 `transactions.test.ts` regressions. Inventory every failing start,
then either register the exact machine in its app or repair the ownership seam
if the public compatibility contract requires focused start behavior. Do not
change transaction policy to make ownership tests pass.

Commands: `F(packages/flow-state/src/transactions.test.ts
packages/flow-state/src/runtime.test.ts)`; `T`; `P`; `C`.

### R0.4 Stream callers under app-bound actor ownership

Status: Blocked on R0.3.

Own the 10 `runtime-streams.test.ts` regressions with the same exact-machine
registration versus compatibility decision proved in R0.3. Do not change
stream pressure, routes, generation, or interruption semantics.

Commands: `F(packages/flow-state/src/runtime-streams.test.ts
packages/flow-state/src/runtime.test.ts)`; `T`; `P`; `C`.

### R0.5 Rehydration and child ownership callers

Status: Blocked on R0.4.

Own `runtime-rehydration.test.ts`, `flow-test-rehydration.test.ts`, and
`flow-test-child-helpers.test.ts`. Preserve restored generations and child
ownership; do not use a synthetic empty app or bypass `OrchestratorSystem`.

Commands: `F(packages/flow-state/src/runtime-rehydration.test.ts
packages/flow-state/src/flow-test-rehydration.test.ts
packages/flow-state/src/flow-test-child-helpers.test.ts)`; `T`; `P`; `C`.

### R0.6 Inspection and Flow Test ownership callers

Status: Blocked on R0.5.

Own `runtime-inspection.test.ts`, `flow-test-settle.test.ts`, and
`flow-test-inspection.test.ts`. Restore registered owner facts without creating
an inspection/test actor engine or weakening pending/finalizer evidence.

Commands: `F(packages/flow-state/src/runtime-inspection.test.ts
packages/flow-state/src/flow-test-settle.test.ts
packages/flow-state/src/flow-test-inspection.test.ts)`; `T`; `P`; `C`.

### R0.7 Runtime architecture and owner-boundary proof

Status: Blocked on R0.6.

Own the two `runtime-architecture.test.ts` regressions. Keep one orchestrator
registry and one ResourceStore write owner; refactor file/module boundaries
instead of weakening structural assertions around duplicate ownership.

Commands: `F(packages/flow-state/src/runtime-architecture.test.ts
packages/flow-state/src/orchestrator-system.test.ts
packages/flow-state/src/resource-store.test.ts)`; `T`; `P`; `C`.

### R0.8 Launch Workspace executable compatibility

Status: Blocked on R0.7.

Own the eight Launch Workspace unregistered-machine failures. Use its registered
app definitions and canonical orchestrator surface; do not add an example-only
actor shell or relax core ownership for ad hoc fixtures.

Commands: rebuild `flow-state`; literal `E`; `T`; `P`; `C`.

### R0.9 Actor finalizer and lease completion proof

Status: Blocked on R0.8.

Revalidate P1C.3a and P1C.3b against every actor-owned work family. Prove which
finalizers actor disposal currently awaits, close or narrow the historical
"all actor finalizers" claim, remove test/production casts introduced by these
packets where the contract forbids them, and rerun their literal packet gates.

Commands: the exact P1C.3a and P1C.3b `F` commands; `T`; `P`; literal `E`;
`C`.

### R0.10 Recovery closeout and forward-DAG selection

Status: Blocked on R0.9.

Run the complete current suite and compare exact failure IDs with the accepted
P0.1a subset. Require zero new failures, verify all recovery receipts and full
base SHAs, return P1A.0/P1C.1/P1C.2/P1C.3a/P1C.3b to `Done` only with current
evidence, then select exactly one dependency-complete forward packet in
`TASK.md`. Do not implement that packet in the same session.

Commands: `pnpm --filter flow-state test`; `T`; `P`; literal `E`; `C`;
`pnpm check`; receipt/status/history validation.
