# Round 11: final independent review

Status: advice. **Everything here is proposed.** Reviewer: Opus, did not build round 11. Commit `09497cd3`. Marks: **[ran]**, **[read]**, **[reasoning]**.

Ages of code:

| Age | Commits |
| --- | --- |
| r6, r7 | earlier rounds |
| r11-first | to the checkpoint `62b9b290`, which the mid review saw |
| r11-port | `5c401525` to `bcf7a646`: the port of the rest, after the checkpoint |
| r11-second | `0698538e` and `af90246e`: D207, D211, `legacy.ts`, `front-check.ts` and the mid review's fixes. **No review has seen these until now** |

Setup: Bun 1.4.2 on this Mac. I worked in a detached worktree at `scratchpad/r11-final`, with `node_modules` linked to the main checkout's. One tree at a time, and every command ran under `watch.ts` or `perl alarm`.

## Verdict

**`Compiled` and the typed path can be trusted for the compile prototypes, after three changes.** The suite really does boot `machine()` output for the machine part:

- `legacySlots` returns typed output unchanged, in its data and in every Slot's closure, on all 73 typed pairs [ran, P5].
- Apart from that, the suite only wraps each Slot.
- 742/742 on the plain suite and on `--swap`; the types check passes; the `mutate-one` control is green [ran].
- 40 of my 50 mutants die. No survivor is a behaviour hole in the runtime. Every survivor is a missing pin, a dead branch of the suite's shim, or a feature that no case exercises.

**The three changes:**

1. **D211 dropped the services' type. It is the one High.** The mechanism is right: one context at the root, no `Effect.provide` per commit.
   - But every `services` is cast to `Context.Context<never>`. So a typed machine whose commit needs a service the boot does not give type-checks.
   - At run time it ends as `Defect`: the write is marked **unknown** although it never left, and the issue names no cause [ran].
   - Before D211, `provide<R>(t, Context<R>)` checked this. Rule 57 promises it: "a host or Story missing `DocsApi` is a type error".
2. **Memory as fields in `Compiled`, with restore decided.** A field that a release adds restores as `undefined` when it is computed or an input. That value fails its own Schema [ran]. The input is also not decoded at creation [ran]. RESULTS states this as open L1. It belongs in the compile step, not after it.
3. **One source for a lane's key.**
   - `CompiledData`, the structure check and the seal all accept `keyFields: ["nope"]`. The key closure then projects `{}`, so every input names one lane [ran].
   - The convergence says the structure check covers `keyFields`; it checks only duplicates and empty names.
   - Root cause: an op in `Compiled` has no input field list, so nothing can check the key against the input.

**Answers in short:**

- Q1: the weakened kill is expected. It is not round 10's T1.
- Q2: 6 of the 21 hand cases are truly unreachable from the public API. The other 15 are fixtures that should change.
- Q3: D207 is correct but unpinned. D211 is correct in mechanism and wrong in type. Of the 4 owed items, memory as data and the key are needed first, `events` is cheap, and `idleMs` can wait for streams.
- Q4: every row of `api-changes.md` has a before and an after. `index` and `into.name` are fixture-parity knobs. Placement is the one big deviation the compile prototypes owe.
- Q5: the no-drift claim holds for machines. `CompiledData` now runs in a real gate, but it is shallow.
- Q6: F8 is scheduling granularity in the fake, not a runtime change. Acceptable.

**What I'd read first:**

- `conformance/typed/lab.ts:38` with `round-11/step.ts:86` (H1);
- `conformance/typed/flow.ts:122-129` (M2);
- `round-11/checks/front-check.ts:96-97` with `flow.ts:680-693` (M3).

## Reproduced

| Item | Claimed | I got |
| --- | --- | --- |
| Suite, `--round 11 --no-search` | 742/742, by output alone 0 | **742/742**, by output alone 0, unlogged none, stale lock 0, RECIPIENTS red 0. 61 s, 882 MB [ran] |
| `--swap` | 742/742 | **742/742**, 62 s, 1,378 MB [ran] |
| `checks/types-check.ts` | `TYPES PASS`, 8 directives | Same [ran] |
| `checks/front-check.ts` | 14 pins, 71 machines, 3 corruptions | Same [ran] |
| mailq, score, search-vacuity | pass | pass [ran] |
| `mutate-one` control | not killed, 189 s | `{"killedBy":null}`, 190.6 s, peak 1,541 MB [ran] |
| Census | 691 typed, 30 edited, 21 hand | Same, and the same hand list [ran] |
| `h.restore-absent-lost` | 5 cases | 5 named, plus 2 by output alone [ran] |

## My mutants

**Written before I opened `RESULTS.md` or `STATUS.md`.** By then I had read:

- `AGENTS.md`, `codec/BRIEF.md`, `review-mid.md`, `convergence-11.md`, `api-changes.md` and `round-8/review.md`;
- all of `conformance/typed/flow.ts`, `legacy.ts`, `typed/lab.ts` and `typed/cells.ts`, and part of `typed/issues.ts`;
- the seal in `gate.ts`, the restore in `durable.ts`, and `record.ts`;
- the fork and invoke in `driver.ts`, and the boot in `drive.ts`;
- `checks/front-check.ts`, `codec/codec.ts`, `mutate.ts` and `mutate-one.ts`;
- PAY-12/shuffle.

**One slip:** a grep printed one line of RESULTS, its row on duplicate Slot paths.

**Overlap with the builder's lists:** 2 mutants, checked afterwards. `op.notcarried-dropped` is close to `d124.front-none`, and `mem.restore-undecoded` to `typed.restore-ignores-codec`. I also reran `h.restore-absent-lost` on purpose.

**How they ran:** each mutant was applied in place in the worktree with `mutate.ts`'s matching rule, then restored. Each ran:

- the suite with `--round 99 --no-catalog`, as `mutate-one` runs it;
- for a survivor, also every `checks/*.ts`, `typed/compare.ts`, `typed/date-check.ts` and `cli/main.ts`.

One survivor, `legacy.commit-path`, went through the whole of `mutate-one` (`--swap` and the 5 s gate included). Every edit applied exactly once. The list is `scratchpad/r11f-mutants.ts`, runnable by the committed `mutate.ts`.

| Part | Killed |
| --- | --- |
| Memory on the typed path (restore, encode, initial) | 7/8 |
| Operations (timeout, concurrency, inputNotCarried, unknown by reason, failure mappers, rule 51) | 6/7 |
| Alternatives (exits, raises, notify, module values, member keys, `retryable`, follow-ups) | 9/10 |
| Nodes, placements, schedules, activities | 8/8; `sched.armOn-empty` is equivalent at run time (see Low) and dies only by `compare.ts` |
| Fragments, machine flags, domain, streams | 10/10 |
| `legacy.ts` | 1/5 |
| Seal (D207) | 0/2 |
| Services merge (D211, `drive.ts`) | 0/1 |
| Runtime restore branches | 2/2 |
| **All** | **40/50** |

**Killed only outside the suite:**

- `mem.restore-undecoded` (restore skips the decode) and `mem.encode-identity` (encode skips the codec): only `typed/date-check.ts` sees either;
- `op.notcarried-dropped` and `mach.events-dropped`: only the CLI pins see either.

**Killed by one case:** `place.each-max-plus`, `stream.failureBy-dropped`, `act.when-dropped`, `legacy.catch-all-ops`.

**Survivors that matter:**

| Survivor | What it means |
| --- | --- |
| `gate.dup-path-allowed`, `gate.walk-function-allowed` | D207's two new refusals have no case. They work [ran, P4]. M1 |
| `legacy.commit-path`, `legacy.reads-one-path`, `legacy.stream-path-raw`, `legacy.listens-left-bare` | Nothing reaches `legacy.ts`'s domain and stream branches, and nothing reads a hand commit's path, even through every gate. "Each under its own place's path" is unchecked. M1 |
| `mem.initial-computed-blind` | D200's computed initial: no typed fixture uses one that reads a field. M2 |
| `alt.exit-guard-lost` | F6's guarded exit compiles as a bare exit and loses its guard, and nothing notices. AddressStep's `BadPostcode` never denies in any case. Low |
| `op.dup-op-unchecked` | Rule 51 at the front end is unpinned. It works [ran, P6]. Low |
| `drive.services-last-only` | No case boots two machines whose services differ. Low |

---

## The questions

### Q1. `h.restore-absent-lost`: 91 kills down to 5

**Why: typed output always has a restore** [read][ran]:

- `machine()` and `fragment()` always emit `initial`, `restore` and `encode` (`flow.ts:900-904`, `:1019-1023`).
- So the runtime's branch `dec ? dec.run(i.memory) : i.memory` (`durable.ts:411`) is now taken only by the 21 hand cases.

**It is not T1's class.**

- T1: the suite changed what the runtime ran, and so took a branch that production takes out of the tests.
- Here: the suite moved to the production shape, and the production shape never takes this branch.
- Same symptom, opposite meaning.

**Is coverage enough?** For that branch, yes: production cannot reach it. The coverage moved to the production twin, `restoreOf` [ran]:

| Mutant of the typed path | Red |
| --- | --- |
| `mem.restore-forgets` (restore reads an empty record) | 31 named + 35 output |
| `mem.restore-absent-explicit` (an absent key comes back as `undefined`) | 24 + 15 |
| `mem.frag-restore-lost` (a fragment's restore has no fields) | 22 + 16 |
| `durable.frag-restore-host` (the runtime restores a fragment with its host's restore) | 20 + 16 |
| `mem.restore-no-default` | 2 |
| `mem.restore-undecoded` | **0 in the suite**; `date-check.ts` only |

**What is thin is fidelity.** No scenario reloads a value whose JSON form differs from its decoded form. That covers a Date, NaN and a bigint. Restore with no decode, or encode with no codec, passes all 742 cases.

**Proposed:**

- make `restore` and `encode` required in `Compiled`;
- give hand data an identity restore in `legacy.ts`;
- delete the runtime's branch;
- move one Date, NaN or bigint reload into a scenario.

### Q2. The 21 hand cases (F2, F11)

| Cases | Behaviour pinned | Reachable from the public API? | Which is wrong |
| --- | --- | --- | --- |
| Doors 1, Kept `oddKey` 1: a key that is a `Set` | a lookup whose key cannot encode ends as a failure | **No.** The key is a subset of the input, and the door refuses the input first | Neither: runtime robustness. Label it so |
| Kept 2, Edge 2: `BigInt(i.o)` off a string input | a bigint key survives a reload | **No**, unless Arpit takes F2's question (b) | Neither today. If (b) is taken, these need typed twins |
| **KeyRelease 4** (REV6-H5 ×2, REV6-CAPTURE, and the `{v:1}` case) | D78: a release that changes a key does not mint beside a hold; LaneRekeyed | **Yes.** Release 2 changes `key: [...]`, and `rekeyLane` runs the same `key.run`. Two of the four use release 1 only, which is plainly `key: ["k"]` | **The fixture.** D78 is now pinned only on a hand key closure |
| V 5, M 2, M/x 1, N 1, S 1, R 1 (round 10's `small`) | hash discrimination, actor-id separation, `ActorMachineMismatch`, `ReservedStateName`, a refused ensure, a Symbol or NaN in memory | **Yes,** with `Schema.Unknown` fields. R becomes a computed initial that throws | The fixture. One caveat: with a typed `Schema.Number`, NaN encodes ("NaN") and is not an issue [ran, `date-check.ts`]. So "NaN is named" pins hand-memory behaviour, which production does not have |
| Odd/All 2 | every closure kind returning odd values reaches its gate | Mostly: author closures can return anything at run time. Not `opKey` or `followUp` | Fine as hand. Typed Slots go through the same `gated` |

So **"shapes no compiler emits" (RESULTS, the table) is true for 6 of the 21.**

- For F11, the runtime properties are general; only the open-record memory is not.
- For KeyRelease, the coverage of a production path (rekey after a key change) now sits only on a hand machine.

### Q3. `Compiled`: D207, D211, and the four owed items

**D207 is correct** [ran, P4]:

- two Slots at one path: `SealDuplicatePath`;
- a bare guard inside an alternative: `SealUnknownClosure: Checkout/Pay nodes.root.on.PayRequested[0]…`.

It is good for every tool:

- every closure has an address;
- `flow check` and `explain` can poison all of them;
- a Story can name any closure by path.

Gaps:

- both refusals are unpinned (M1);
- `checkSlots` keys paths by definition, while fault injection keys them by path alone (L5 of the mid review, open).

**D211 is the right mechanism. F10 shows why:** a `provide` per commit is a step that a seeded scheduler sees. But as built:

- **Types:** `Fixture.services`, `BootArgs.services` and `driver.ts:64` are `Context.Context<never>`, made by casts (`lab.ts:38`, `pay.ts:467`, `pay-full.ts:305`, `harness.ts:17`). `fixture(m)` accepts a `Typed<Clock>` with only `FakeApi` given [ran].
- **Run time:** the fiber dies, `readExit` says `defect`, and `step.ts:86` issues `{ code: "Defect", origin: "P/Svc/a put" }`. The issue carries no cause, so "Service not found: Probe/Clock" is gone. The write's row is unknown: it may have applied, by rule 13. For Pay, that is UNSURE and a reconcile, whose lookup dies the same way [ran, P1].
- **Static analysis and the CLI:** requirements are type-only, and `Compiled` carries none. `flow explain` cannot say "this machine needs `ShopApi`".
- **Stories:** STR12's "a missing fake is a type error at the constructor" has nothing to check if the boot takes `Context<never>`.

**Proposed:** type the Runtime's boot by the union of its machines' `R`. That is the standard Effect form: `ManagedRuntime` over a `Layer<R>`. Better still if each op also carries its service keys as data, so the boot can refuse a missing one by name.

**The four owed items:**

| Item | Needed before the compile prototypes? | Why |
| --- | --- | --- |
| `key` closure dropped for `keyFields` | **Yes, or a check that they agree** | M3: they agree by construction only. A compiler bug, or a cast, makes a key that names nothing, and every request shares one lane. Put the op's input field names in `Compiled`. The runtime derives the key from `keyFields`. F2's closures become a `legacy.ts` seam |
| `memory` as fields with Schemas, as data | **Yes, first** | Rule 12 needs fields. M2's restore rule and L1's decode are decisions about those fields |
| `events` required | Cheap; do it in the compile | `mach.events-dropped` passes the suite and fails the CLI pins, so `flow check`'s verdict depends on the field. The compiler always emits it; give hand data its events in `legacy.ts` |
| No unbounded `idleMs` | No, with streams | Only Lab/Engine. In-process it is a number; only the data view loses it |

### Q4. `api-changes.md`

| Row | Verdict |
| --- | --- |
| `unknown` by reason, optional key, history as target, guard paths, the selector's event | **Justified.** A before, an after and the design's spelling. The selector's event as `unknown` weakens typing in the body. It is stated as a compile-prototype question, which it is |
| An exit behind a guard (F6) | Justified as a small deviation, but **unpinned**: `alt.exit-guard-lost` survives |
| A subroutine's `into.name` | A fixture-parity knob for Desk/Ticket's `["wizard"]`. Fine as a deviation marked "retire with that fixture". It is not API |
| Placement in the body | **The one big deviation.** Correctly flagged. It changes what `S` and `E` can see, so it belongs at the start of the compile prototype |
| `lookup` as `commit`; `unknown:` targets unchecked | Trivial and stated |
| `index` (seam) | A hack, and it says so: typed Pay's Slot paths are the hand Pay's, against D206. It holds only while the hand Pay is the pinned twin under `--swap` |
| `labFollowUps`, `labHostOp` (seams) | Justified as named, counted seams over fixtures that are wrong by the design |
| `moduleMember`, `activities`, `domain`, `streams` | Not public API. They are `Compiled` literals with a slot helper. Stated (F5) |
| Services | H1 below |
| **Missing:** `fixture((api) => machine)` | Issues, Cart, Chat, Desk and Feed close over the fake in `repair` or `subscribe`, instead of asking for a service. Every effect is forked through `driver.ts`'s `fork`, so services would reach them. Not an API bend, but production compiles once (L6) |

### Q5. The codec (D194): no drift, and `CompiledData` in a gate

**No drift holds for the machine part** [ran]:

- The suite boots `listen(wrap(legacySlots(make(api))))` (`drive.ts:1524`).
- `legacySlots` is the identity on every typed pair (P5).
- `wrap` and `listen` only instrument.

The caveats are stated but not in the headline (M4):

- `index` paths;
- 30 cases that edit typed output;
- machines compiled per world;
- `domain` and `streams` blocks in `Compiled`'s shape (about 342 cases, per the convergence).

**`CompiledData` is in a real gate now.** `front-check.ts` decodes 71 typed machines strictly, and `mutate-one` runs every `checks/*.ts` [ran]. It is still shallow:

- `domain` and `streams` are `Unknown`;
- no type ties `Schema.Type<…>` to `Compiled` (stated);
- `keyFields` membership cannot be expressed (M3);
- it decodes `pairs`' typed side, not every machine the suite boots;
- none of my 50 mutants was caught by it.

Restate it as a shape contract. Shape does not cover meaning.

### Q6. PAY-12/shuffle (F8)

**Not a runtime change, and acceptable** [read][reasoning]:

- The fake's `call` is suspended (`fake-world.ts:495`), so the request is pushed when the fiber runs in both forms.
- The typed commit adds `Effect.service` and a `flatMap` before `api.call`.
- `at` and `process` are taken at the call (`:489-491`): at invoke for the hand form, at the fiber's first step for the typed one.
- Under a shuffling scheduler (`fake-world.ts:83-85`), the extra steps change the pick order, so `pi2` leaves first.
- A real client (`fetch` inside `tryPromise`) behaves like the typed form.
- The named oracles hold: one ending per send, replay, injections live.

One thing to know: `--swap` compares no output (`main.ts:388`), so the hand Pay's old order is now pinned by nothing. That is fine.

---

## High

### H1. D211 dropped the services' type: a missing service is a `Defect`, the write unknown, the cause lost. **r11-second** [ran]

```ts
// round-11/review-final-probe.ts (P1), removed with the worktree.
// user-defined: Clock, P/Svc   existing: transaction, machine, fixture
class Clock extends Context.Service<Clock, { readonly now: () => number }>()("Probe/Clock") {}
const put = transaction({ id: "p/put", input: { id: S.String }, key: ["id"], concurrency: "reject",
  commit: () => Effect.flatMap(Effect.service(Clock), (c) => Effect.succeed(c.now())) });
const f1: Fixture = fixture(m1); // type-checks: `services` gives FakeApi only, cast to Context<never> (lab.ts:38)
// send Go, ack:
// -> state UN (unknown), issues [{"code":"Defect","origin":"P/Svc/a put"}]   no cause, no service name
```

- **Where:**
  - `conformance/typed/lab.ts:38`, `typed/pay.ts:467`, `typed/pay-full.ts:305`, `conformance/harness.ts:17,249`, `round-11/driver.ts:64` (the casts);
  - `round-11/step.ts:86` (the issue without the cause, older code that D211 now routes a wiring error into).
- **Before D211:** `provide = <R>(t: Typed<R>, services: Context.Context<R>)` (`flow.ts:716`) checked it.
- **Who hits it:**
  - every app whose Layer misses one service;
  - every Story with a fixture missing (rule 57, STR12);
  - Pay goes UNSURE for a charge that never left.
- **Proposed:**
  - `BootArgs.services: Layer<RequirementsOf<machines>>`, or `Context` of that union, with no cast;
  - a `types-check` directive for a missing service;
  - `step.ts:86` carries `String(cause)`;
  - optionally, each op's service keys as data, so the boot refuses a missing one by name.
- **Cost:** small. It must come before the compile prototypes freeze the boot's signature.

## Medium

### M1. D207's refusals and `legacy.ts`'s branches are unpinned. **r11-second** [ran]

- **The seal works:**
  - two Slots at path `x`: `SealDuplicatePath: Checkout/Pay Checkout/Pay x`;
  - a bare guard: `SealUnknownClosure … PayRequested[0]…` (P4).
- **But no case pins either.** `gate.dup-path-allowed` (`gate.ts:323` made `if (false)`) and `gate.walk-function-allowed` (`gate.ts:314` returns) pass every gate I ran. Only `known` at op level is pinned (`REV8-PINS/D77-…`, which killed `legacy.catch-all-ops`).
- **No booted hand machine reaches `legacy.ts`'s domain and stream branches.** The census shows no hand machine with streams, and Odd/All's domain has no listens. Every gate passes:
  - a hand commit slotted at `operations.X` instead of `operations.X.commit`;
  - every read at the one path `domain.read`, which D207 says it removed;
  - stream paths unmapped;
  - hand listens left bare.
- **Proposed:** two cases in `conformance/scenarios/` (a duplicate path, a bare function below `ops`), and one hand fixture with two reads and a stream through `legacy.ts`. Or say these branches are unreached and cut them.

### M2. Memory: a field a release adds restores as `undefined`, the input is not decoded, and fidelity is one check. **r7 (fallback), r11-second (rewrite)** [ran]

```text
memory: { who: Flow.input(S.String), n: Flow.initial(S.Number, 0), twice: Flow.initial(S.Number, ({ n }) => n + 1) }
initial(undefined)           -> {"n":0,"twice":1}        who required, absent: no refusal
initial({ who: 5 })          -> {"who":5,"n":0,"twice":1} a number for a String: no refusal
restore({ who: "a", n: 3 })  -> {"who":"a","n":3}         twice added by the release: undefined
restore({ n: 3, twice: 4 })  -> {"n":3,"twice":4}         who added by the release: undefined
the restored memory against its own Schema -> refused ("Expected number")
```

- **Where:** `flow.ts:122-129`: `: f.value` is `undefined` for a computed or input field. `flow.ts:96-100` copies the input with no decode. The design says "decode the input with the derived `Input` schema" (2.2.2) and "never on restore" for computed initials.
- **So the design has no answer for a computed field a release adds.** Options:
  - quarantine the record;
  - require a decoding default;
  - run the computed initial from restored fields once, and say so.
- **Also:**
  - `mem.initial-computed-blind` survives: no typed fixture has a computed initial that reads a field;
  - `mem.restore-undecoded` and `mem.encode-identity` pass all 742 cases (Q1).
- RESULTS states L1 as open. I rank it Medium because it is a production path (a release adds a field) and the compile prototype defines it.

### M3. A key field that names nothing passes every check, and the key closure follows it to `{}`. **r7 (D91), r11-second (the check)** [ran]

```text
transaction({ ..., input: { id: S.String }, key: ["nope" as never] })
-> seal: accepted; ops.bad.key.run({ id: "a" }) = {}      every input, one lane
CompiledData on Pay with ops[0].keyFields = ["nope"] -> accepted
```

- **Where:**
  - `checks/front-check.ts:96-97` checks duplicates and empty names only. The convergence's "structure check (… keyFields)" overstates it.
  - `flow.ts:680-693` builds `key` from `keyFields` and ends in `as unknown as Op`.
- **Root:** an op's input field names are not in `Compiled` (only `inputNotCarried`), so no tool can check `keyFields ⊆ input`.
- **Today only `K extends keyof I` stops it,** and a cast passes it. Under a hold this would collapse lanes, so two orders share one `reject` lane.
- **Proposed:** `inputFields` on `Op`; the seal and `flow check` refuse a key field outside it; the runtime derives the key from `keyFields` (the owed item), with F2's closures as a suite seam.

### M4. "691 of 742 boot only typed output" is true for the machine part; about 342 of those carry `Compiled`-shaped module blocks. **r11-port** [read][ran]

- The census counts Issues/List, Desk/Tickets, DeskFeed, Lab/Chat, Refunds, Cart and the rest as typed. Their `domain` and `streams` go through `definition({ domain, streams })` (D209), which is `Compiled`'s shape with a slot helper.
- The convergence says 342 cases boot such a machine. RESULTS states F5 under "Not done", but neither the headline nor STATUS splits the number.
- **Proposed:** report 691 as "≈350 machine-only typed, ≈340 typed machine plus `Compiled`-shaped modules". That matters for entities next, which will replace those blocks.

### M5. KeyRelease's 4 cases are a production path on a hand machine. **r6 (fixture), r11-port (label)** [read]

See Q2.

- D78's rekey (no second mint beside a hold after a release changes the key) is reachable by a release changing `key: [...]`. Today only `keyReleaseFixture`'s hand closure (`fixtures/round6.compiled.ts:38`) pins it.
- One edge only a typed fixture can show: a release adds a key field that stored inputs lack. `canon` drops `undefined`, so `{k:"a", r: undefined}` and `{k:"a"}` name one lane (`gate.ts:51`) [read]. Probably right, but unpinned.
- **Proposed:** two typed releases of KeyRelease, `key: ["k"]` and then `["k", "region"]`. Relabel the remaining 6 F2 cases "runtime robustness, unreachable".

## Low

- **L1. F6's guarded exit is unpinned.** `alt.exit-guard-lost` (`flow.ts:409`, `=== 1` dropped) compiles `{ guard, exit }` as a bare exit with no guard. Nothing notices, because `BadPostcode` (`typed/real.ts:43`) never denies in a case. **r11-port** [ran]
- **L2. Rule 51 at the front end and the services merge are unpinned.** `op.dup-op-unchecked`; `drive.services-last-only` (`drive.ts:1527`). Both work by hand [ran, P6]. **r11-first, r11-second**
- **L3. `armOn: []` means entry** (`turn.ts:776`, `step.ts:290`). The front end writes `["entry"]`, so `sched.armOn-empty` is equivalent at run time and dies only by `compare.ts`. A tool reading `toData` must know that `[]` means entry. Say it in `Compiled`, or require `["entry"]`. **r3-era** [ran]
- **L4. Inherited front-end mutants point at a file D205 moved.** `mutants-r8.ts:81` and `mutants-r9b.ts:50-57` edit `round-11/typed/flow.ts`, which does not exist. `mutate.ts` would throw on the first of them: loud, but not run this round (RESULTS: "the 18 builder mutants" not run). Retarget them to `../conformance/typed/flow.ts`. **r11-first** [read]
- **L5. Thin kills.** `place.each-max-plus` (`.each.max` + 1: only `FRAG-01/repair-never-refuses`), `stream.failureBy-dropped`, `act.when-dropped` and `legacy.catch-all-ops` each die by one named case. [ran]
- **L6. Machines compiled per world.** `typed/issues.ts:58`, `cart.ts:41`, `chat.ts:17`, `desk.ts:39` and `feed.ts:53` close over the fake in module closures. Services would reach those effects (`driver.ts:104`). That is the production shape, and it would remove the per-world compile. **r11-port** [read]
- **L7. `provide()` is still exported and used.** `typed/form.ts:19` calls it with `undefined as never`, the per-commit `Effect.provide` that D211 retired. It is used by the CLI targets only. Cut it, or route form through `services`. **r11** [read]
- **L8. The mid review's L1, L5, L6 and L7 are open**, as RESULTS says. M2 above is L1 with a probe.

| Age | High | All |
| --- | --- | --- |
| r3-era | 0 | 1 |
| r6, r7 | 0 | 2 (shared with later ages) |
| r11-first | 0 | 2 |
| r11-port | 0 | 4 |
| r11-second | **1** | 5 |

**The High and most Mediums are in r11-second,** which no review saw. As in round 8, each passes every case written with it.

## Assumptions: continued

| # | Assumption | State now | Note |
| --- | --- | --- | --- |
| 5 | Encode and decode one format | **Yes on the typed path, per field** (`toCodecJson`) | Fidelity pinned by `date-check.ts` alone (Q1) |
| 37 | Unencodable values are rare | Unchanged: a typed bigint key still declines (F2 (b) open) | |
| 38 | A gate's exit code means something | Better: the lock covers `typed/` and `legacy.ts` (mid H2 fixed) [ran: mutants show `unlogged expectation changes: file:typed/flow.ts`] | |
| Others | | Unchanged by this review | |

**New:**

| # | Assumption | True? | Harm when false |
| --- | --- | --- | --- |
| 68 | Every service a machine's commits need is given at boot | **Unchecked** [ran] | H1: an unknown write, cause lost |
| 69 | Every closure in `Compiled` is a Slot at a unique path | **True at the seal** [ran]; unpinned | M1 |
| 70 | `keyFields` and `key` agree | **By construction only** [ran] | M3: lanes collapse |
| 71 | A field a release adds restores to a value its Schema accepts | **False** for computed and input fields [ran] | M2 |
| 72 | The object the suite boots is the object production boots | **True for machines** [ran, P5]; `Compiled`-shaped for modules | M4 |
| 73 | The hand machines still booted test shapes no compiler emits | **6 of 21** [read] | M5 |
| 74 | A `Defect` issue says what died | **False** (`step.ts:86`) [ran] | H1 |

## Tests

- **Do the typed fixtures' features fail without their code?** For 40 of 50, yes, mostly by many named cases. For the grown surface the mid review worried about (M6), this round's pins and ports reach it. `disarmOn`, `byReason`, `places`, `labFollowUps`, `retryable` and the module members all die now.
- **What the suite can't see:**
  - a lost decode or encode on reload;
  - D207's refusals;
  - a computed initial;
  - rule 51;
  - two machines' services;
  - F6's guard.
- **Fake against real:** the services path is the first place where the fake's shape (one `FakeApi` for everything) hides a real failure: two services, one missing.
- **Searches, plants, the 5 s gate on mutants, falsify:** not rerun beyond the control.

## The rest of the system

- **Static analysis:**
  - D207 makes every closure addressable: good for `check`, `explain`, Stories and fault injection.
  - Requirements and input fields are the two facts the design treats as data that `Compiled` still lacks. Rule 57 names both: "key fields" and "requirements".
- **CLI:**
  - `flow check`'s verdict depends on `events` (`mach.events-dropped`).
  - Make `events` required, so `check` never infers.
- **Stories:** STR12 depends on H1's fix.
- **Entities next:** M4's ≈340 cases are the ones the entity front end replaces. Each one is a cheap test that the design's API compiles to what those blocks hold now: compare by `toData`, as `compare-all.ts` does.

## What the compile prototypes must do first, in order

1. **Type the boot.** `round-11/driver.ts:64`, `conformance/harness.ts:17,249`, `typed/lab.ts:38`, `typed/pay.ts:467`, `typed/pay-full.ts:305`:
   - services typed by the union of the machines' `R`, with no cast;
   - a `types-check` directive for a missing service;
   - `round-11/step.ts:86` carries the cause.
2. **Memory as fields in `Compiled`.** For each field: its Schema, its source, private or not.
   - Decide restore for a field a release adds (computed, input).
   - Decode the input at creation (`flow.ts:89-133`).
   - Cases: a release adds a computed field; a required input is missing; a Date or NaN reload in a scenario.
3. **One source for the key.** `inputFields` on `Op`; the seal and `flow check` refuse a key field outside them; the runtime derives the key from `keyFields`; F2's closures go behind `legacy.ts`.
4. **Pins** in `conformance/scenarios/`:
   - `SealDuplicatePath`, and a bare function below `ops`;
   - rule 51 at the front end;
   - F6's deny;
   - a computed initial that reads a field;
   - two machines with different services.

   Also retarget `mutants-r8.ts:81` and `mutants-r9b.ts:50-57`.
5. **Placement into the definition, and the selector's event type** (`api-changes.md`). These are the two front-end shapes the design differs on, and both change what the body can see.
6. **Move KeyRelease and F11's cases to typed output.** Keep F2's six as labelled robustness. Arpit's call on F2 (b).
7. **Then entities:** the D209 blocks go to the design's API, compared by `toData` against today's. Streams with `idleMs` after that.

**Reorder, proposed:** items 1-3 are each small, and each changes `Compiled` or the boot's signature. Do them before anything emits `Compiled` from the public API, so nothing gets written twice.

## Not checked

- `--swap` and the 5 s gate per mutant, except for `legacy.commit-path`. The searches, falsify's parts, plants and real browsers. `nub run verify`, `vp fmt` and the linter: I changed no repo code.
- The codec numbers. I took the mid review's reruns and RESULTS' remeasure as they are.
- Safari.
- Whether every row of `compare-all.ts` is stated for the right reason.
- The 18 builder mutants, and the old lists.
- **Time:** about 2 hours, mostly suite runs at about 61 s per mutant.

## Traces

All from `packages/flow-state-v3/prototypes` in the worktree.

- `bun conformance/watch.ts --rss-mb 1900 --seconds 280 -- bun conformance/main.ts --round 11 --runtime ../round-11/adapter.ts --no-search`, and the same with `--no-catalog --swap ../round-11/typed/swaps.ts`.
- `bun round-11/checks/{types,front,mailq,score,search-vacuity}-check.ts`.
- `bun conformance/watch.ts --seconds 290 -- bun conformance/mutate-one.ts --runtime ../round-11/adapter.ts`.
- `bun round-11/typed/census.ts`.
- Mutants:
  - list: `scratchpad/r11f-mutants.ts`;
  - in-place runner: `scratchpad/r11f-run.ts` (suite as `mutate-one`, then the checks, compare, date check and CLI for a survivor; `--full` runs `mutate-one`).
- Probes P1-P6: `round-11/review-final-probe.ts` in the worktree, removed with it.
  - P1: a missing service.
  - P2: memory at creation and restore.
  - P3: `keyFields` naming nothing.
  - P4: the seal's two refusals.
  - P5: `legacySlots` against typed output on 73 pairs.
  - P6: rule 51.
- Nothing was written in the repository except this file. No commits. The worktree is removed by exact path.
