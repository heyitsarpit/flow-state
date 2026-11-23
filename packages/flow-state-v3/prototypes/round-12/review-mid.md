# Round 12: mid-session review

Status: advice. **Everything here is proposed.** Reviewer: Opus, did not build round 12. Checkpoint `95bdc962`, in a detached worktree at `scratchpad/r12-mid`, with `node_modules` linked to the main checkout's. Bun 1.4.2. Marks: **[ran]**, **[read]**, **[reasoning]**.

Read: `AGENTS.md`, `round-11/review.md`, `round-12/STATUS.md`, `convergence-12.md`, `git diff bc934edb 95bdc962` (and `diff -r round-11 round-12` for the runtime files, since the copy shows as new files), rules 57 and 2.2.2 of `machine-design.md`.

## Verdict

**Round 11's findings are fixed for machines, and half fixed for fragments.** The `Compiled` change is one change in intent and safe at run time. One High, four Mediums.

- The run-time half of H1 is real. A missing service is refused at the seal, by machine, operation and key, before anything runs. A Defect now carries its cause [ran].
- The compile-time half covers a machine's own operations only. **A fragment's operation that needs a service the boot lacks still type-checks.** Rule 57 names exactly that case [ran]. That is the High.
- M2, M3 and M5 hold where the review asked [ran]. Most of the new behaviour is pinned by one unit pin each in `front-check.ts`, not by a case through the Runtime.
- **The types gate is red at the checkpoint.** STATUS says `TYPES PASS`. So `mutate-one`'s control would fail [ran].
- **The runtime's no-restore branch is gone, and no test was weakened** (Q3) [ran][read].

## Reproduced

| Gate | Claimed | I got |
| --- | --- | --- |
| Suite `--round 12 --no-search` | 746/746 | **746/746**, output alone 0, unlogged none, stale lock 0, RECIPIENTS as written. 60 s, 893 MB [ran] |
| `checks/types-check.ts` | `TYPES PASS`, 10 directives | **`TYPES FAIL`**: `conformance/typed/round6.ts(58,45): TS2741 Property 'region' is missing` [ran] |
| `checks/front-check.ts` | 38 pins, 71 machines, 6 corruptions | Same [ran] |
| mailq, score, search-vacuity, `compare-all` (73 pairs, 4 stated), `compare` (52 stated), `date-check`, CLI pins | pass | pass [ran] |
| `--swap`, `mutate-one`, 5 s gate, falsify | | not run. `mutate-one` would stop at its control on `checks/types-check.ts` [reasoning] |

---

## Q1. Are round 11's findings truly fixed?

### H1, D213: services

| Door | Machine's own op | Fragment's op | Contract with a widened `services` list |
| --- | --- | --- | --- |
| Compile (`tsc`) | **refused**: no `outcomes` (builder's directive), and `fixture(own)` gives TS2345 (T5) [ran] | **accepted**: `servicesFor(Host, Context.empty())` and `fixture(Host)` both type-check (T1, T2) [ran] | **accepted**: `services: shared` typed `readonly Context.Key<any, any>[]`, empty, keeps `outcomes` (T3) [ran] |
| Seal | `SealMissingService: … needs Probe/Clock, which the boot does not give` [ran] | the same, by the host's name: `P/Host operations.tick needs Probe/Clock` [ran] | not refused: the data says `[]` [reasoning] |
| Run time | the boot throws that same error. Nothing runs [ran] | same [ran] | `Defect`, `cause: "Service not found: Probe/Clock"`; the row stays **uncertain** for a write that never left (P1b) [ran] |

So:

- The seal is the real guarantee, and it works by name.
- The type contract ends at the machine. `machine()` returns `Typed<RequirementsOf<O>>` over `d.ops` only (`conformance/typed/flow.ts:908`). `fragment()` returns a value with no `R`, and `fragOps` joins `ops` untyped (`:918`).
- Rule 57 says "the fragment's type carries the union of its contracts' Effect requirements (`R`), so a host or Story missing `DocsApi` is a type error". That is not yet true. → **H1** below.
- The cause is on the issue (`step.ts:84-96`) but nothing pins it: `svc.cause-dropped` survives every gate (Tests).

### M2, D214: memory as fields, and the restore rule

Through the compiled Slots and the Runtime (P2, P3) [ran]:

| Probe | Result |
| --- | --- |
| `ensure` with `{ who: 5 }` | `InvalidTurn`, origin `P/Mem memory.initial`, cause `InputRefused: P/Mem input who: Expected string`; no actor |
| `ensure` with no input | `InvalidTurn`, cause `InputMissing: P/Mem input who` |
| `{ who: "a", opt: undefined }`, `opt: optionalKey(String)` | `InputRefused` (exact optional). Right |
| extra input field | dropped silently. Right for a Struct decode |
| release adds a required `Flow.input` | `RecordQuarantined: memory this release cannot decode`; the old bytes kept. The name `RestoreMissingInput` is lost from the issue |
| computed reads another computed (`late: ({ twice }) => twice + 1`) | at creation `late` is `NaN`; at restore of a record holding `twice: 0`, `late` is `1` |
| restore adds `twice: ({ n }) => n * 2`, record has `n: 3` | `twice: 6`. It is computed from **current** values, not from the actor's start. That is what D214 says |

- Fixed as asked.
- What remains is Low:
  - a computed initial's `start` is `Record<string, unknown>` (`flow.ts:53`), so "reads only input and constant fields" is unchecked;
  - the quarantine drops the refusal's name (`durable.ts:273`).
- **The input check is the Schema's type side, not a decode** (`flow.ts:110`): "the creator hands a value, not its JSON".
  - 2.2.2 says "decode the input with the derived `Input` schema".
  - For a transforming Schema (`NumberFromString`, `DateFromString`), these differ. A route param `"3"` for a `NumberFromString` input is refused.
  - That is a reasonable call, but it is a design call. It should be in the convergence as one (L2).

### M3, D215: `keyFields` against `inputFields`

- **Fixed:**
  - `SealKeyField`, `SealKeyTwice`, `SealNoKey` [ran, front-check];
  - `keyFields: []` seals as one lane, which is right [ran, P4];
  - the structure check now does what the convergence said [read].
- **Not one source at the Runtime.** The seal accepts an op with a `key` closure and no `keyFields` or `inputFields`, from anyone (P4) [ran].
  - Only `CompiledOutput`'s type and `CompiledData` say that a compiler never writes `key`.
  - `flow check`'s `KeyField` skips such an op (`cli/check.ts:309`), and `explain` prints "key: opaque closure".
  - So "one source" means two exclusive sources, and the seal cannot tell them apart. That is acceptable while F2 lives, if it is said that way (L3).
- `keyFields: ["id", "id"]` seals; only the structure check refuses it [ran]. Low.
- **`KeyField` in `flow check` has no pin** (grep: no hit outside `check.ts:311`) [read]. Low.

### M5: rekey on a typed machine

- Variant 1 is real. `key.recompile-skipped` (drop the recompile after a release, `drive.ts:1162`) dies by `R12-KEYS/…-rekeys-and-does-not-mint` [ran]. One case, but it is the pin.
- **Variant 2, "a release adds a key field the stored input lacks, keeps the lane", is weaker than it reads** → **M2** below:
  - at the checkpoint its fixture is a type error (`region` required, the commit omits it). That is what turns the types gate red [ran];
  - the builder's uncommitted `round6.ts` makes `region` `optionalKey` [read, main checkout, not reviewed];
  - in both forms, the release-3 commit **also** omits `region`. So stored and new keys agree by construction.

---

## Q2. The `Compiled` change (D213-D216)

**One change?** Yes in intent: root cause 1, facts the compiler knows become data the seal requires. In form, it lives in four places that must agree:

1. `Compiled`, all optional, for hand data;
2. `CompiledOutput`, all required, for a compiler;
3. `CompiledData`, the codec Schema;
4. the seal, which requires `services`, memory `fields`, `restore` and `encode`, but **accepts the hand forms**: a `key` closure, `fields: {}` and `services: []`.

`legacy.ts` makes hand data pass by filling these vacuously:

- `fields: {}` for a memory that has fields;
- `services: []` for a commit that closes over the fake;
- `events` inferred.

So a table can satisfy the seal and still tell tools nothing true. This is acceptable for the suite. But the Runtime's contract should be `CompiledOutput`, with the F2 key and F11's open memory as named seams that a tool can see (L3).

**Static analysis, `check`, `explain`:**

- Data now exists for rule 57's requirements, the input field list, and rule 12's fields. **No tool reads them yet** [read]:
  - `explain` prints neither services nor memory fields;
  - `check` does not use `fields` (no rule 12 over them);
  - `check`'s "events inferred" branch (`cli/check.ts:305`) is now dead, since the seal requires `events`.
- That is fine for a checkpoint, but the claim "rule 57 says Inspection prints them" is not yet met.
- `KeyField` is unpinned.

**Stories:**

- STR12, "a missing fake is a type error", holds for a machine's own ops only.
- `Story.fragment(fragment, { fixtures })` has nothing to check against, since a fragment value carries no `R` (H1).

**What a failed decode means at each door:** the table is right where it speaks [ran for creation and restore]. Gaps:

- Restore: "quarantined" is right, but the issue says "memory this release cannot decode" whatever the cause (`RestoreMissingInput`, a Schema failure, a computed initial that throws).
- Event admission: stated as a gap, correctly. It is the largest one. Without payload Schemas in `events`:
  - `flow check` cannot check a mapper's payload against its event;
  - a Story cannot generate an event;
  - 2.2.1's "refused before guards" has no data to stand on.
- No row for a stream frame's value, or for a lookup's result reaching a mapper. Both go through `plain` today, like an ending's payload. Say so.

**What entities will need that this shape lacks** [read][reasoning]:

1. **`services` beyond ops.**
   - `domain.repair`, `streams.*.subscribe` and `catchUp` return Effects, but have no `services` field, and the seal checks only `ops`.
   - The typed fixtures dodge this by closing over `api` and casting to `Effect<…, never>` (`typed/cart.ts:33`, `issues.ts:58`, `desk.ts:76`; round 11's L6).
   - Entities' sync seam (Zero, TanStack DB) will ask for a client service. Give every Effect-returning Slot a `services` list, and the module's `R` a place in the boot's type.
2. **Event and record payload Schemas as data:** `events` as names, with no Schemas, cannot check a `predicts` or `confirms` against a record shape.
3. **Entity record fields, with the same source and restore rule as memory:** a cached row from an older release meets the same "a release added a field" question. Choose the same answer on purpose, or a different one.
4. **An id field list, like `keyFields ⊆ inputFields`:** an entity's id fields against its record fields.
5. **`version` and `versionOrder` as data where possible:** they are closures today, so `check` cannot see an entity with no order.

---

## Q3. Did memory as fields, or the required restore, change behaviour or weaken a test?

**No weakening that I can find** [ran][read]:

- **The lock log adds only:**
  - the four new cases;
  - file hashes;
  - REV8-PINS' hash, whose fixture now spreads its services and whose output is unchanged.
- No old case's output changed. The 742 old cases all pass with their round 11 outputs.
- So creation's new refusals (`InputRefused`, `InputMissing`) are reached by no old case. Round 11 created such an actor with `undefined` fields, and no case relied on that.
- **The runtime's no-restore branch is deleted.** `mem.restore!.run` (`durable.ts:413`) and the seal's `SealIncomplete` make it unreachable.
  - The class it guarded (round 10's T1, round 11's `h.restore-absent-lost`) is still pinned. It sits on `legacy.ts`'s identity restore for hand data: `legacy.identity-restore-empty` dies by 4 named cases plus 3 by output (REV6-H5 ×2, R10-RUNTIME ×2) [ran].
  - The typed restore is pinned by `R12-MEMORY` (Date, NaN, bigint) and by `date-check.ts`.
- **The one branch left, `: i.memory` for a fragment this release lacks, is dead.**
  - `validInc` returns false when `m.fragments?.[frag]` is missing (`gate.ts:484-486`), so the record is quarantined before `restoredMemory` (`durable.ts:271-273`).
  - `rs.frag-missing-dropped` survives as an equivalent mutant [ran].
  - The comment at `durable.ts:408` ("keeps what it stored") describes a path that never runs. Cut the branch, or say it is unreachable (L4).
- **`drive.ts` now compiles again at every boot after any `release`.** That is closer to production, not further: a release really is a new compile.
  - For hand fixtures it re-runs `make(api)` over the same `rel`, which is the same thing.
  - Not T1's class [reasoning].

---

## Q4. Mutants (17)

Applied in place in the worktree, each edit matched exactly once (one edit replaced both of its occurrences), then restored. Each ran:

- the suite as `mutate-one` does (`--round 99 --no-catalog`);
- for a survivor, also `types-check`, `front-check`, `date-check`, the CLI, `compare` and `compare-all`.

Runner: `scratchpad/r12mid-run.ts`. Written before I opened RESULTS (there is none yet) and before reading the builder's mutant lists.

| Mutant | Edit | Suite (named / output) | Killed by |
| --- | --- | --- | --- |
| `svc.seal-skip` | `checkServices` never throws | 0 / 0 | `front-check` (one pin) |
| `svc.compile-drops` | `compileOp` writes `services: []` | 0 / 0 | `front-check` (two pins) |
| `svc.cause-dropped` | Defect's `cause: ""` (both sites) | 0 / 0 | **nothing** |
| `drive.services-last-only` | boot gives the last machine's services | 1 / 0 | `R12-SERVICES` |
| `type.covered-always` | `Covered` always passes | 0 / 0 | `types-check` (unused directive) |
| `type.boot-unchecked` | `servicesFor` takes `Context<any>` | 0 / 0 | `types-check` (unused directive) |
| `key.field-unchecked` | `SealKeyField` never thrown | 0 / 0 | `front-check` (one pin) |
| `key.first-field-only` | the seal's key picks the first field | 7 / 2 | suite (CART-01, CART-02, REAL-04 ×4) |
| `key.recompile-skipped` | no recompile after a release | 1 / 0 | `R12-KEYS` variant 1 |
| `in.no-type-check` | creation copies the input unchecked | 0 / 0 | `front-check` (one pin) |
| `in.missing-undefined` | no `InputMissing` | 0 / 0 | `front-check` (one pin) |
| `rs.computed-undefined` | a release-added computed field restores `undefined` (round 11) | 0 / 0 | `front-check` (one pin) |
| `rs.missing-input-undefined` | no `RestoreMissingInput` | 0 / 0 | `front-check` (one pin) |
| `rs.recompute-present` | a computed field the record has is recomputed | 0 / 0 | `front-check` (one pin) |
| `rs.frag-missing-dropped` | an unknown fragment's memory restores `{}` | 0 / 0 | nothing: **equivalent** (dead branch, Q3) |
| `legacy.identity-restore-empty` | hand identity restore returns `{}` | 4 / 3 | suite |
| `legacy.events-none` | hand `events` inferred as empty | 0 / 0 | **nothing**: the front-check pin's hand machine has no handlers, so `{ external: [], internal: [] }` is also the right answer there |

**14 of 17 killed, 1 equivalent, 2 survivors. Only 4 die in the suite.**

- Every seal refusal, the creation decode and the restore rule die by exactly one `front-check` unit pin, which calls the Slot or `seal` directly.
- No case goes through the Runtime with:
  - a refused or missing input;
  - a release that adds a computed or required input field;
  - a boot missing a service.
- `mutate-one` runs `checks/*.ts`, so these count. But a change in how the Runtime reacts to these throws (the `InvalidTurn` origin, quarantine on restore) has no pin → **M3**.

---

## High

### H1. A fragment's operation can need a service the boot lacks, and `tsc` accepts it. Rule 57 names this case. **r12** [ran]

```ts
// round-12/typed/zz-review-types.ts (worktree, removed). user-defined: Clock, Ticker, P/Host   existing: transaction, fragment, machine, servicesFor, fixture
class Clock extends Context.Service<Clock, { readonly now: () => number }>()("Probe/Clock") {}
const tick = transaction({ id: "p/tick", input: {}, key: [], concurrency: "reject", services: [Clock],
  commit: () => Effect.map(Effect.service(Clock), (c) => c.now()) });
const Ticker = fragment({ id: "Ticker", /* … */ operations: ({ E }) => ({ tick: tick.outcomes({ /* … */ }) }) }, /* … */);
const Host = machine(definition({ id: "P/Host", /* … */ places: { ticker: Ticker }, operations: () => ({}) }), /* … */);
servicesFor(Host, Context.empty()); // type-checks: Host is Typed<never>
fixture(Host);                      // type-checks: R = never extends FakeApi
// boot -> SealMissingService: P/Host operations.tick needs Probe/Clock, which the boot does not give
```

- **Where:**
  - `conformance/typed/flow.ts:908`: `Typed<RequirementsOf<O>>` over the machine's own `O`;
  - `:1052-1063`: `fragment()` returns `FragmentValue` with no `R`;
  - `:918`: `fragOps` joins `ops` untyped.
- **Harm:**
  - none at run time, since the seal refuses by name before anything runs;
  - but the type contract the review asked for ("a host or Story missing `DocsApi` is a type error", rule 57) fails in exactly the case the design names;
  - `Story.fragment` has no `R` to check fixtures against.
- **Proposed:**
  - `fragment()` returns `FragmentValue & { _R?: (r: R) => R }` with `R = RequirementsOf<O> | RequirementsOf<placed fragments>`;
  - `machine()` takes the union over `P` and the trait placements;
  - one `types-check` directive for a fragment's service.
- **Cost:** small, but do it before the compile prototypes fix `fragment()`'s signature (placement into the definition, step 3).

## Medium

### M1. The types gate is red at the checkpoint, and STATUS says it passes. **r12** [ran]

- `bun round-12/checks/types-check.ts` → `TYPES FAIL: conformance/typed/round6.ts(58,45): error TS2741: Property 'region' is missing in type '{ k: string; id: string; }'`.
- Every other gate passes.
- `mutate-one` runs every `checks/*.ts`, so its control is killed and `mutate.ts` stops with `CONTROL FAILED`. Round 11's assumption 38, "a gate's exit code means something", is broken at this commit.
- The builder's uncommitted `round6.ts` changes `region` to `S.optionalKey(S.Unknown)` [read, main checkout]. That likely fixes it.
- **Proposed:** state gate results from the committed tree, or commit with the fix. Rerun `types-check` at the next checkpoint.

### M2. A release that adds a key field mints a second Attempt beside an unsure hold, and `R12-KEYS` cannot see it. **r12 (case), r6 (D78)** [ran]

```text
P5: key ["k"], then release 3 with key ["k", "region"], region optional; the release-3 commit gives region "eu"
  held: { unsure: 1 }            the first charge's answer lost
  requests: att-1-1 {"k":"a","id":"x"}, att-1-2 {"k":"a","id":"x","region":"eu"}     LaneRekeyed 0
```

- The rekey makes `{ k: "a" }` from the stored input, since `canon` drops the absent `region`. A new commit names `{ k: "a", region: "eu" }`, a new lane.
- So under `concurrency: "reject"`, a second charge leaves beside an unsure one. That is the hazard D78 exists to stop.
- `R12-KEYS`'s variant 2 passes only because its release-3 commit also omits `region` (`typed/round6.ts:56`).
- Whether this is wrong is a design question: the developer changed what the key means. But the stored lane cannot be placed under the new key, so the Runtime knows that it does not know.
- **Options:**
  - (a) the seal or `flow check` flags a release whose `keyFields` gain a field, while lanes are held;
  - (b) a held lane whose stored input lacks a new key field blocks the whole op under `reject` until it settles;
  - (c) state it as the app's job.
- I lean to (b), since correctness comes first. **Arpit's call.**
- In every case, make variant 2 supply a value and say what it expects.

### M3. The new refusals are pinned at the Slot, not through the Runtime. **r12** [ran]

- 8 of my 17 mutants die by exactly one `front-check` pin each (table above).
- No scenario has:
  - an `ensure` with a refused or missing input (`InvalidTurn`, no actor);
  - a release that adds a computed field, or a required input (quarantine);
  - a boot missing a service (the boot throws).
- Round 11's review proposed cases for the first two ("a release adds a computed field; a required input is missing"). Only the Date, NaN and bigint reload became a scenario.
- P2 and P3 show the Runtime doing the right thing today. Nothing pins it.
- **Proposed:** three variants in `R12-MEMORY` and `R12-SERVICES`:
  - `ensure` with a bad input names `InputRefused` and makes no actor;
  - a release adding `Flow.input` with no default quarantines and keeps the bytes;
  - a release adding a computed field restores it computed.
  - Optionally, a boot missing a service is refused by name.

### M4. `services` covers ops only; entities' Effects have no requirements as data. **r11 (L6), r12** [read][reasoning]

- `domain.repair`, `streams.*.subscribe` and `catchUp` return Effects. The typed fixtures cast them to `Effect<…, never>` over a closed-over `api` (`typed/cart.ts:33`, `issues.ts:58`, `desk.ts:76`, `real.ts:220`).
- The seal checks `services` on `ops` only (`gate.ts:258`). So a module Slot that asks for a service dies as a Defect at run time, as H1 did in round 11.
- Entities are next, and they replace exactly these blocks (round 11's M4: about 340 cases).
- **Proposed:**
  - every Effect-returning Slot gets `services`;
  - the seal checks them all;
  - a module's `R` joins the boot's type.

## Low

- **L1. A widened `services` list erases the type check** (T3) [ran]. `services: shared` typed `readonly Context.Key<any, any>[]` makes `IdOf` `any`, so `Covered` passes with nothing listed. Refuse a non-tuple: `number extends Sv["length"] ? never : …`.
- **L2. Creation checks the type side, not a decode** (`flow.ts:110`). 2.2.2 says "decode". With transforming Schemas they differ. State it as a decision (D214 says "checked by its Schema's type side" in passing).
- **L3. "One key source" means two exclusive sources at the seal.** A `key` closure with no `keyFields` seals from any producer (P4). `fields: {}` and `services: []` from `legacy.ts` satisfy the seal vacuously. `CompiledOutput` is the honest contract. Make the seal take it, with F2 and F11 as named seams.
- **L4. Dead code and an untrue comment:**
  - the `: i.memory` branch at `durable.ts:413` (and `record.ts:14`'s twin) is unreachable, per Q3;
  - `cli/check.ts:305`'s "events inferred" branch is dead since D216;
  - `legacy.ts`'s `eventsOf` is reached only by hand machines, and its one pin is vacuous (`legacy.events-none` survives).
- **L5. Causes dropped:**
  - `RecordQuarantined` says "memory this release cannot decode" for `RestoreMissingInput`, for a Schema failure and for a throwing computed initial alike (`durable.ts:273`, `restoredMemory`'s bare `catch`);
  - `svc.cause-dropped` survives, so the Defect's new `cause` is unpinned.
- **L6. A lying contract still marks a write unknown that never left** (P1b: `cause: Service not found`, row `uncertain`). This is only reachable by a cast once `services` is checked. If H1 and M4 are fixed, a Defect whose cause is a missing service could end as `NotSent`. Optional.
- **L7. A computed initial's `start` is untyped** (`Record<string, unknown>`). One computed field reading another gets `NaN` at creation and a value at restore (P2).
- **L8. `flow check`'s `KeyField` and the seal's memory `SealIncomplete` are unpinned** [read]. The front-check corruption covers `CompiledData`, not the seal.

| Age | High | All |
| --- | --- | --- |
| r6 (D78) | 0 | 1 (shared, M2) |
| r11 | 0 | 1 (shared, M4) |
| r12 | **1** | 12 |

## Not checked

- `--swap`, the 5 s gate, falsify, searches, plants.
- `nub run verify`, the formatter and the linter: I changed no repo code.
- The builder's uncommitted work, beyond reading the `round6.ts` diff for M1.
- The `codec.ts` JSON Schema rendering of a field.
- Safari.

## Traces

All from `packages/flow-state-v3/prototypes` in the worktree.

- **Suite:** `bun conformance/watch.ts --rss-mb 1900 --seconds 280 -- bun conformance/main.ts --round 12 --runtime ../round-12/adapter.ts --no-search`.
- **Checks:** `bun round-12/checks/{types,front,mailq,score,search-vacuity}-check.ts`, `bun round-12/typed/{compare-all,compare,date-check}.ts` and `bun round-12/cli/main.ts`, each under `perl alarm`.
- **Probes P1-P5:** `round-12/review-mid-probe.ts`.
  - P1: services at seal and run time.
  - P2: memory at creation.
  - P3: `RestoreMissingInput` through a release.
  - P4: key sources.
  - P5: a release adding a key field with a value.
- **Type probes T1-T6:** `round-12/typed/zz-review-types.ts`, run with `tsc -p round-12/typed/zz-review.json`.
- **Mutants:** `bun scratchpad/r12mid-run.ts <id>`, one per command under `perl alarm 290`.
- Probe and type files live in the worktree only and are removed with it. No commits. Nothing was written to the main checkout.
- One slip against the shell rules: one `>>` append of an empty heredoc to the probe file in the worktree. It wrote nothing; I used Edit after that.
