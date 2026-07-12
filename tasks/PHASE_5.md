# Phase 5 — Deletion, packed proof, documentation, and correctness closeout

[Back to the plan tracker](../TASK.md) · [Previous: Phase 4](./PHASE_4.md)

Manifest only; packet readiness is tracked in [TASK.md](../TASK.md).

Closeout reviews every packet against the
[binding Effect architecture blueprint](./EFFECT_ARCHITECTURE.md)
and its P0.6 service/layer/scope receipt. Passing behavior with erased `A/E/R`,
unscoped work, a bespoke Effect clone, or host-owned semantic logic is not done.

## Phase 5 execution packets

### `P5.1` Deletion and deprecation

- [ ] Re-run export/import/dynamic/CLI/generated/example/test caller inventory.
- [ ] Delete unreachable internal files, duplicate owners, obsolete registries,
      shadow snapshots, and redundant evidence builders after parity.
- [ ] Keep localized justified internal assertions; delete only assertions that
      hide public/semantic erasure or invalid ownership.
- [ ] Preserve public aliases until `API_CONTRACT.md` approves a migration.
- [ ] Add stable low-cost no-new-duplicate/dead-export checks where maintainable.

Packet details:

- Start from P0.5 `OWNER_MAP.md`; rerun every recorded caller command at current
  HEAD and append results before deleting anything.
- Candidate files are deleted only when their semantic responsibility is owned
  elsewhere and direct, dynamic, CLI, generated, public, example, and test
  callers are zero. Public aliases are not deletion candidates.
- Delete in family-sized packets: testing interpreters; shadow registries/cache/
  snapshots; duplicate evidence walkers/builders; obsolete formatters; then dead
  helpers/exports. Each deletion packet names the replacement owner and parity tests.
- Tests: public export snapshot unchanged except separately approved additive
  names; CLI still resolves; generated package contains required entry points;
  examples use no private path; no duplicate-owner architecture check regresses.
- Commands per deletion: focused replacement-owner tests, `T`, `P`, `E`, `D` if
  docs/CLI affected, `C`; finish 5A with `V`.

### `P5.2` Packed clients and layouts

- [ ] Build/test Launch Workspace against built/packed entry points, never private source.
- [ ] Emit exported Launch Workspace declarations without private leaks or TS7056 expansion.
- [ ] Verify small, normal, and large client layouts have identical API and semantics.
- [ ] Test root, React, testing, inspection, and server entry points from an
      external packed consumer.
- [ ] Prove root/testing/inspect/server do not import React and core has no
      Node-only runtime dependency; keep `sideEffects: false` truthful.
- [ ] Run a duplicate-package/duplicate-Effect ownership fixture and prove it
      fails explicitly rather than aliasing refs, actors, or Context services.

Packet details:

- Reuse the P0.1c packed-consumer fixture matrix, excluding the retired
  measurement command. Install the produced tarball or packed directory;
  workspace source aliases do not count.
- Small layout: one machine/resource and root import. Normal layout: Launch
  Workspace-shaped modules/runtime/testing/React. Large layout: repeated modules
  and definitions large enough to expose TS7056, private-name leakage, or
  excessive-depth failures.
- Tests: identical public calls and runtime semantics across layouts; exact
  declarations for every entry point; React 18/19; ESM import; CLI binary if
  exported; no source/private import; declarations have no unnameable/private
  type; emitted app declarations retain exact maps without annotation restatement.
- Test package metadata/peer behavior for a core-only consumer and React 18/19.
  Mark React as an optional peer for core-only consumers; importing the React
  subpath without React must fail clearly. Document ESM-only support explicitly.
- Commands: `P`, every packed compatibility fixture from P0.1c, `E`, package
  hygiene and public type tests, `C`.

### `P5.3` Documentation and truth

- [ ] Update API inventory so every row is executable, partial, deferred,
      deprecated, or removed truthfully.
- [ ] Provide one minimal example for every surviving public function.
- [ ] Show Schema-free local authoring first and boundary Schema second.
- [ ] Document Effect results/errors/requirements/interruption and client unwrapping.
- [ ] Remove rejected API-design vocabulary from active docs and fixtures.
- [ ] Document the library-code/client-code responsibility boundary: client
      callbacks are pure, external work is Effect/Stream, services are scoped,
      remote operations own idempotency, refs are typed capabilities, receipts
      are evidence, runtimes are host/request-owned, and foreign JSON is unknown.
- [ ] Document the Effect construction map with concise examples of
      `Context.Tag`/`Effect.Service`, live/test `Layer`, `Layer.scoped`, exact `A/E/R`,
      Effect.fn operations, Scope/finalizers, Exit/Cause, Stream, Schedule/Clock,
      Option/Either, Schema/Redacted boundaries, and host-only ManagedRuntime.
- [ ] Document crash/durability nonclaims, cooperative cancellation and host
      shutdown deadlines, strict wire fields/versioning, and the React bootstrap
      fallback/runtime ownership contract.

Packet details:

- Sources of truth: current public declarations, production owner tests, packet
  receipts, and Launch Workspace runtime proofs. Documentation does not promote
  a partial descriptor to executable behavior.
- Update `API_INVENTORY.md`, package reference/status/recipes/getting-started,
  server/testing/inspection docs, and Launch Workspace README/checklist together.
- For each surviving public function include one smallest valid example using
  public package imports, its owner/lifetime, Effect success/error/requirements,
  interruption/finalization where relevant, and whether Schema is needed.
- Show local Schema-free authoring first; show Schema only at encoded/foreign
  boundaries. Mark every deferral explicitly.
- Show a client service contract separately from live/test Layer construction;
  show scoped acquisition only for retained resources. Never teach `Layer.Any`,
  service bags, semantic-owner `Effect.run*`, or Flow aliases for native Effect.
- Tests: all cited paths/exports exist; examples typecheck against built package;
  status terms are exclusive; no primary query/mutation/cache vocabulary;
  Story/Scenario and `useActor`/`use` migration wording matches CV decisions.
- Commands: documentation/status/recipe/getting-started architecture tests, `T`,
  `P`, `E`, `D`, `C`.

### `P5.4` Final correctness and truth review

- [ ] Reconcile public exports, exact declarations, owner maps, duplicate/dead
      code, compatibility fixtures, and every open BUG/BT/TI/CV row.
- [ ] Prefer library-side type simplification; reject annotations that erase
      exact types, leak private names, or merely silence compiler failures.
- [ ] Run focused/full behavior tests, exact type/declaration proof, builds,
      packed clients, docs, and final workspace verification once in the order
      below.
- [ ] Run an independent whole-diff API/correctness/truth review, fix every
      blocker, rerun only affected failed proof, and record explicit deferrals.

Packet details:

- Independent review checks public compatibility, identity, ownership, Effect
  channels, stale generations, atomicity, finalization, adapter thinness,
  type erasure, diagnostics, and documentation truth across the complete diff.
- Fix all correctness/type-safety blockers before closure. Explicit feature
  deferrals require an existing contract allowance and a named future owner;
  “follow up later” is not a receipt.
- Command cadence: iterate with focused tests and `T`; after green, run the
  packed compatibility matrix and literal `E` once; run `V` once for the final
  workspace closure; write the receipt/status; run `C` once; inspect the staged
  allowlist and commit. Do not separately rerun commands already covered by `V`
  unless the failed command or a relevant file changed.

## Final definition of done

- [ ] Launch Workspace preserves its recognizable API through public packages.
- [ ] One ResourceStore and one actor runtime own semantics.
- [ ] Tests and adapters control/observe production owners.
- [ ] Keyed data, writes, workflows, streams, timers, children, restore, and
      boundaries pass success/failure/defect/interruption/stale/cleanup matrices.
- [ ] Input-first inference and packed declarations meet the ten type gates.
- [ ] Schema is optional locally and enforced at genuine encoded boundaries.
- [ ] Duplicate/dead internal code is removed after parity.
- [ ] Every public adjustment is compatible or separately approved.
- [ ] Docs and API inventory describe executable truth.
- [ ] `TASK.md` marks P5.4 done and links every immutable packet/closure receipt;
      phase manifests remain static acceptance specifications.

Final evidence required beside these checkboxes:

- One receipt per packet with no unnamed open correctness blocker.
- A final owner map showing one owner for resource, actor, transition,
  transaction, stream, timer, child, pending work, and evidence facts.
- The complete BUG-1–BUG-50 ledger, including BUG-18T/18M/18S,
  BUG-41R/41T/41S, and BUG-50T/50S, marked closed or
  explicitly deferred only where this plan already authorizes deferral;
  correctness bugs may not be deferred.
- Final public exports, exact declarations, compatibility corpus, owner map,
  duplicate-owner inventory, and dead-code inventory.
- Exact final command outputs/exit status and the commit(s) containing each phase.
