# Round 12: final independent review

Status: advice. **Everything here is proposed.** Reviewer: Opus, did not build round 12. Commit `a1e47467`. Marks: **[ran]**, **[read]**, **[reasoning]**.

Ages of code:

| Age | Commits |
| --- | --- |
| r6-r11 | earlier rounds |
| r12-checkpoint | to `95bdc962`, which the mid review saw (D213-D216, memory as fields, the seal's new refusals) |
| r12-compile | `8042188f`, `44a68715`: the compile prototypes, every typed fixture ported, round 11's front end deleted. **Not reviewed until now** |
| r12-post-mid | `9989eb89` to `9f000431`: D217-D220, `R12-DOORS`, `R12-BOOT`, D218's types, `legacy.ts`'s stream branch. **Not reviewed until now** |

Setup: Bun 1.4.2. A detached worktree at `scratchpad/r12-final`, with `node_modules` linked to the main checkout's. Every command ran under `watch.ts` or `perl alarm`, one tree at a time.

## Verdict

**The compile is real, and the compile output and `Compiled` can be built on.** The one High is in the runtime, not in the compile: D217's new block.

- The three compilers build `Compiled` from the design's spelling. They do not reproduce the old fixtures:
  - the 71 machines are written fresh, and compared as data against the hand twins, which the compiler never sees;
  - 742 old cases print byte for byte what they printed in round 11 [ran].
- `Compiled` is coherent for `flow graph` and `flow trace` as it stands. For `flow story`, it lacks what a fragment declares (M3).
- 27 of my 35 mutants die. Every survivor is a missing pin, not a behaviour hole in the compile.

**The High:**

**H1. D217 decides by a lane's shape, not by its release.** Its one case passes, but:

- it declines a legitimate commit **with no release at all**, for any key with an optional field, and only in one order;
- when the new key field is required, the older hold can be reached by no typed member, and every later commit for that key declines, across reloads. **The lane is stranded for good** [ran].

**Answers in short:**

- Q1: real. The seams and deviations are logged honestly. Two small differences are not logged (L7). No fixture is faked. 289 cases boot D209's `Compiled`-shaped module blocks, which `api-changes.md` marks as a deviation.
- Q2: true and meaningful. One gate got weaker: `compare-all` now skips `key` at every depth. The suite still kills what it hides [ran].
- Q3: correct for the one case it pins. It strands a lane when the added field is required (H1).
- Q4: consistent in principle. Creation checks an in-process value by the type side, and restore decodes stored JSON by the codec. The exception: an absent input takes the *decoding* default, and its constructor default is ignored (M2).
- Q5: coherent for `graph` and `trace`. `story` and entities still need these as data:
  - fragment declarations (M3);
  - event payload Schemas;
  - services on module Effects;
  - the record and id fields.

**What I'd read first:**

- `round-12/lane.ts:536-548` (`olderKeyLane`) and `:563-572` (H1);
- `conformance/compile/operations.ts:98` (`KeyOf`, M1);
- `conformance/compile/memory.ts:30-37, 65` (M2).

## Reproduced

| Item | Claimed | I got |
| --- | --- | --- |
| Suite `--round 12 --no-search` | 751/751 | **751/751**. Output alone 0, unlogged none, removed none, stale lock 0, RECIPIENTS as written. 61.8 s, 912 MB [ran] |
| `mutate-one` control | `{"killedBy":null}`, 192 s | **`{"killedBy":null}`**, 191.2 s, peak 1,581 MB [ran] |
| `checks/types-check.ts` | `TYPES PASS`, 13 directives | Same [ran] |
| `checks/front-check.ts` | 45 pins, 71 machines, 6 corruptions | Same [ran] |
| mailq, score, search-vacuity, CLI pins | pass | pass [ran] |
| `compare-all` / `compare` / `date-check` | 73 pairs, 4 stated / 52 stated / pass | Same [ran] |
| Census | 701 typed-only, 289 with module blocks, 21 hand | Same [ran] |

**The builder's slip** (an unbounded background `falsify`, killed by pid):

- No `falsify`, `main.ts` or `mutate` process was alive when I started [ran].
- The main checkout is clean apart from the two untracked paths HANDOFF names [ran].
- No `flow-falsify-*` scratch copy is dated today. 31 older ones from 3 November (round 10's runs, about 6.5 MB each) sit in `$TMPDIR` (L9) [ran].

## My mutants

**Written before I opened `RESULTS.md` or `STATUS.md`.** By then I had read:

- `AGENTS.md`, `HANDOFF.md`, `review-mid.md`, `convergence-12.md`, `api-changes.md`, and the frame of `round-11/review.md`;
- all of `conformance/compile/`;
- the seal in `gate.ts`, the rekey and restore in `durable.ts`, and D217 in `lane.ts`;
- the `git diff 468915a2 a1e47467` of the code, scenarios and checks, plus `drive.ts` and `main.ts` since round 11;
- `typed/lab.ts`, `typed/round6.ts`, the pin list of `front-check.ts`, and `compare-all.ts`.

Two of the mutants (`body.member-key-dropped`, `body.guard-key-dropped`) were added after I read `compare-all.ts`, still before RESULTS.

**How they ran:**

- Each mutant was applied in place in the worktree; each edit matched exactly once; the files were restored after each run.
- Each ran the suite as `mutate-one` runs it (`--round 99 --no-catalog`).
- A survivor also ran every `checks/*.ts`, `compare`, `compare-all`, `date-check` and the CLI pins.

| Part | Killed | Survivors |
| --- | --- | --- |
| Operations compiler | 4/7 | `op.inputfields-are-keyfields`, `op.services-first`, `op.notcarried-union-first` |
| Memory compiler (creation, restore, fields) | **7/7** | |
| Body compiler (tree, defaults, schedules, raises, member and guard keys, `resetOn`) | 8/8 | |
| Fragment compiler | 3/4 | `type.frag-children-R-dropped` |
| Machine compiler | 2/3 | `type.node-traits-R-dropped` |
| Seal | 2/3 | `seal.fields-optional` |
| D217 | 1/3 | `d217.any-value`, `d217.any-actor` |
| **All** | **27/35** | |

**Killed only outside the suite:**

- by `front-check`: `op.uncertain-unchecked`, `mem.restore-recompute-present`, `mem.source-computed-lost`, `body.unknown-state-ok`, `mach.dup-op-ok`, `seal.keyfield-ok`;
- by `compare`/`compare-all`: `body.armOn-none` (equivalent at run time, as in round 11);
- by the CLI pins: `mach.internal-events-none`.

**The mid review's M3 is fixed.** These now die by a case through the Runtime:

- `mem.create-unchecked` and `mem.create-missing-ok` (`R12-DOORS`);
- `mem.restore-missing-input-ok` (`R12-DOORS`);
- `seal.no-services-ok` (`R12-BOOT`).

**What the survivors mean:**

| Survivor | Meaning |
| --- | --- |
| `d217.any-value`, `d217.any-actor` | D217's match is unpinned. A commit for another key value, or another actor's commit, declined beside the older lane would pass every gate (H1) |
| `type.frag-children-R-dropped`, `type.node-traits-R-dropped` | D218 is pinned at a root trait only. It does work nested, on a node and for a subroutine (T1-T3, below) (L1) |
| `op.inputfields-are-keyfields` | `inputFields` is unpinned. `front-check`'s pin uses an op whose input is its key (L2) |
| `op.services-first` | No case or pin has an op that names two services (L3) |
| `seal.fields-optional` | The seal's `fields` requirement is unpinned (mid review L8, open) (L4) |
| `op.notcarried-union-first` | D124's union branch is unpinned (Low) |

---

## The questions

### Q1. Is the compile real?

**Yes** [read][ran].

- `transaction`/`resource` → `compileOp`, `trait`/`subroutine` → `make`, and `definition` + `machine` each build `Compiled` from the declaration and the body:
  - the key from `key: [...]`;
  - `inputFields` from `input`;
  - `services` from the service values;
  - memory `fields` and the three Slots from `Flow.*`;
  - nodes from the ordered state list;
  - placements from the definition, and fillings from the body.
- The compile refuses things the hand data never could: `UnknownState` and `UnknownTrait`, `DuplicateState`, `DuplicateOperation`, `UnknownNotUncertain`.
- No fixture builds `Compiled` by hand or imports a hand twin's machine. The four imports of hand files (`lab-machines`, `pay-full`, `real`, `stores`) take only the hand fixture's `server` model and id [read].
- **Is the parity a fake?** No.
  - `compare-all` compares the output with hand twins that the compiler does not read, by shape, with closures by position.
  - The suite compares behaviour. Mutants on the compilers die by many named cases each: 156 for an ending's `.from`, 114 for a fragment op's owner, 68 for a member's key [ran].

**`api-changes.md`:**

- Every row I checked has a before and an after.
- The seams are marked in the code too: `index`, a subroutine's `name`, `labFollowUps`, `labHostOp`, `moduleMember`, `activities` by name, D209's `domain` and `streams`.
- **Not logged** (L7):
  - a notify's Slot path is `….notify` for one and `….notify[i]` for several (`body.ts:221`), a parity knob like `index`;
  - `servicesFor`'s comment still says "taken from the machine alone", which D218 changed.
- **The ports are loosely typed, as logged:**
  - a host's `exits` and `callbacks` fillings see the event as `AnyEvent`, so the ported fixtures cast an exit's payload (`real.ts`, AddressStep's `Done`);
  - the "required-port types" row covers this, but the cast is in every exit filling.

### Q2. "The 742 old cases print exactly what they did in round 11"

**True** [ran][read]:

- `git diff bc934edb a1e47467 -- expected-output.txt` only adds lines: 10 new R12 rows, one of them stale (L6).
- The lock log relogs no old case's output; its round-12 entries are files and R12 outputs.
- Scenario bodies are unchanged since round 11, except one line in `round8.scenario.ts` (the D46 case spreads `bareFixture()` for its services) and the R12 file.

**Meaningful:** yes.

- The output is each case's whole fingerprint: requests, issues, disk, state and memory hash, evidence counts, frames, waits and truth.
- The fixtures that produce it were rewritten in a new spelling over a new compiler.
- The hand twins `compare-all` checks against are independent of that compiler.

**Did a case get weaker?**

- No case's assertions changed.
- One gate did: `compare-all.ts:11`'s `SKIP` now names `key`, `fields`, `services` and `inputFields` at every depth. So a raise's, a member's or a token guard's key is no longer compared as data (L5).
  - I mutated all three: each dies in the suite, by 3, 68 and 31 named cases [ran].
- `R12-KEYS`'s second variant was replaced on purpose by D217's case.

**Spot-checks against the round 11 versions** [read]:

- `real.ts` AddressStep: F6's `{ guard, exit: ….exit }` became `{ guard, target: exits.Done.from(f) }`, with the same guard and payload. `front-check` pins that the guard is kept.
- `ConfirmDiscard`: `fragment` became `subroutine`; the exits and `whenAbandoned` are unchanged.
- `typed/round6.ts` KeyReleaseTyped: release 3 now gives `region`, which is the intended change.

### Q3. D217

**Correct for the one case it pins; wrong in general.** → **H1**.

| Probe (worktree, `round-12/zz-review-probe.ts`) | Result [ran] |
| --- | --- |
| **P1a.** No release. Key `["k", "region"]`, region optional. `{k:a}` in flight, then `{k:a, region:eu}` | **declined**, `BesideOlderKey` 1, one request |
| P1b. The same, with the first held unsure | **declined** |
| P1c. The other order: `{k:a, region:eu}` in flight, then `{k:a}` | **both sent**, 2 requests |
| **P2.** Release 1 key `["k"]`; release 2 `["k", "region"]`, region **required**. One unsure hold, then `retry(k)`, `cancel(k)`, key-less `retry`, key-less `cancel`, a commit, a reload, a commit | No member reaches the hold. The hold is still on disk and in `waits` after both boots. **Every commit declines** (`beside` 1, then 2) |
| P3. The same as P2 with region optional, behind `O.charge.idle(k)` | the guard says `lane.idle.Idle` and passes; the commit then declines |

**Can it strand a lane for good?** Yes, by P2:

- `turn.ts:747-755`: a keyed member looks up `laneKey(actor, op, newKey)`, which is not the old lane. A key-less one names only an ending's own Attempt, or (cancel) lets go of kept endings.
- `lane.ts:100`: restore of a held lane delivers nothing.
- So nothing the app can write settles the hold. D217 then declines every commit whose key projects onto it.
- **Rule 46 already answers this case:** "a lane whose operation is gone, or whose key no longer decodes, goes to `orphaned` (P19)". D217 stands in for that branch, with no exit.

### Q4. D219 against D214 and the doors table

Through `compileMemory` (`round-12/zzr/doors.ts`) [ran]:

| Probe | Result |
| --- | --- |
| D1. `NumberFromString` input given `3` | accepted |
| D2. Given `"3"` | `InputRefused` (D219, as stated) |
| **D3.** Input with only `withConstructorDefault`, absent | **`InputMissing`** |
| D4. Input with `withDecodingDefaultKey`, absent | takes the default |
| D5. A refinement (`isMinLength(1)`) given `""` | `InputRefused`: the type side keeps checks |
| D6, D7. Encode, then restore | `{ n: "3" }` on disk, `3` back |
| D8. Restore, a release-added input with only a constructor default | `RestoreMissingInput` |
| D9. Restore of `""` for the refined field | a bare Schema message, no name (mid review L5, open) |

**Consistent in principle:**

- creation's door takes an in-process value (the type side);
- restore's door takes stored JSON (the codec).

**Two exceptions:**

1. **An absent input takes the encoded side's default.**
   - D219's own reason ("the creator hands a value, not its JSON") points to the constructor default.
   - The design defines `Flow.initial` as `withConstructorDefault`.
   - So creation mixes sides (D3 against D4) → **M2**.
2. **The doors table's creation row says "What decodes: the input".** It should say "checks", per D219, and name the default rule.

### Q5. `Compiled` for `graph`, `trace`, `story`; what entities need

**`flow graph`:** the data is there [read]:

- nodes with `parent`, `default` and `history`;
- every alternative with its target, its exit, its raises and its `at`;
- tokens apart from closures, so an edge can be marked guard-dependent;
- schedules' `send`s, every ending's event, and placements with the fragments' own tables.

Three things can make the graph smaller than behaviour, and must be marked, not guessed:

1. `labFollowUps` (a closure makes the tag; 4 fixtures, a seam);
2. D209's module blocks;
3. a fragment's event directions, which `Compiled` lacks (M3).

The Runtime's own endings are edges already, through `outcomes.failure.NotSent`: D217's decline and D88's quarantined lane.

**`flow trace`:** D207's unique Slot paths and the evidence (`lane` cells, `turn`, `BesideOlderKey`, `LaneRekeyed`) are enough to name each step [read].

**`flow story` and Stories, still owed:**

1. **What a fragment declares (M3).** `CompiledFragment` has nodes, memory and `whenAbandoned` only. It lacks:
   - its `events`, `hostEvents` and `internalEvents`;
   - its ports (exits, callbacks, guard ports), and which are optional;
   - its kind.

   `Compiled.events` lists the machine's own events, and `flow check`'s `UnknownEvent` reads the machine's bodies only (`cli/check.ts:289`).
2. **Event payload Schemas** in `events`, so that a Story can make and check a send, and the admission door has data.
3. **The contract's `output` and failure Schemas as data**, if `flow story` is to check a fake's answer without running it. `output` is unread today.
4. **Requirements on every Effect-returning Slot**, `domain.*` and `streams.*` (mid review M4, owed).

**Entities, beyond that:** as the mid review listed:

- record fields with the same restore rule as memory;
- id fields against the record's fields, as `keyFields ⊆ inputFields`;
- `version` and `versionOrder` as data.

Add one item: **D217's question for entities.** An entity's id fields changing across a release meets the same "lane under an older key" question. Answer it with H1's stamp, not by shape.

---

## High

### H1. D217 blocks by a lane's key shape, not by its release: it declines without any release, depends on order, and strands a hold for good when the new field is required. **r12-post-mid** (`9989eb89`) [ran]

```ts
// round-12/zz-review-probe.ts, P1 (worktree). user-defined: charge, P/Opt, GoA, GoEu   existing: transaction, definition, machine, Flow.uncertain
const charge = transaction({ id: "p/charge", input: { k: S.String, id: S.String, region: S.optionalKey(S.String) },
  key: ["k", "region"], concurrency: "reject", services: [FakeApi], commit: write("charge") });
// GoA commits { k: "a", id: "x" }; GoEu commits { k: "a", id: "y", region: "eu" }: two server things, by rule 39
// GoA, then GoEu  -> requests 1, BesideOlderKey 1, GoEu's ending NotSent { why: "Rejected" }     (no release anywhere)
// GoEu, then GoA  -> requests 2
```

- **Where:** `lane.ts:536-548`, `olderKeyLane`:
  - "an older key" is any non-idle lane of this actor and op whose key lacks a current key field;
  - nothing on a lane records which `keyFields` it was keyed under.
- **The order dependence:**
  - an optional field that is absent leaves the lane's key without it, so the lane looks "older";
  - a key with the field never does.
- **Harm:**
  1. **No release (P1):** two legitimate writes on distinct keys refuse each other in one order only.
  2. **A required added field (P2):** the hold cannot be named by any typed member (`turn.ts:747-755`), restore delivers nothing for it (`lane.ts:100`), and D217 declines every later commit for that key, across reloads. Before D217 the hold was just as unreachable, but a second charge could leave. Now nothing can.
  3. **The guard lies (P3):** `O.x.idle(k)` passes (`guardCell` sees no lane), and the commit it guards declines.
  4. **Pins:** `d217.any-value` and `d217.any-actor` survive every gate.
- **Proposed:**
  - **Stamp each lane at mint with the `keyFields` its key was made under** (in `SavedLane`). Rekey (D78) updates the stamp. D217 fires only when the stamp differs from the current op's fields.
  - **Give the hold an owner's way out:** a keyed `retry`/`cancel` whose key projects onto a stamped older lane names it, by the same match. Or, per rule 46, route a lane whose stored input cannot make the new key to `orphaned`, with an issue naming it (2.7.14's `UnresolvedHold` is the nearest existing one).
  - **Make `guardCell` see the same lane.**
  - **Cases:** P1's two orders (both send), P2 (a `retry(k)` resolves it, then a commit sends), another key value, another actor.
- **Cost:** small (one field on the lane record, one lookup shared by `cell` and `guardCell`). Do it before the story prototype writes a release Story, which would pin today's behaviour.

## Medium

### M1. A typed `retry(k)`, `cancel(k)`, `idle(k)` or `retryable(k)` cannot name a lane whose optional key field is absent. **r12-compile** (`8042188f`), a regression [ran]

- `operations.ts:98`: `KeyOf = { readonly [F in K]: I[F]["Type"] }` makes every key field required, and `optionalKey(String)["Type"]` is `string`.
- T5b: `O.charge.retry(() => ({ k: "a" }))` gives `TS2741: Property 'region' is missing`. Yet `commit(() => ({ k: "a" }))` type-checks, and mints exactly that lane.
- Round 11's spelling, `TypeOf<I>[F]`, admitted `region: undefined` at least [reasoning].
- **Harm:** an unsure hold on such a lane can be retried or cancelled only by a cast, or by a key-less member inside its own ending's handler. That is the H1 stranding again, from types, with no release.
- **Proposed:** `KeyOf = Pick<TypeOf<I>, K>`, which keeps each field's optionality, plus one `types-check` directive. Also decide whether rule 39 allows an optional key field at all. If it does not, refuse one at `transaction()` (a type error) and at the seal.

### M2. Creation reads the two sides of a field's Schema: a present input by its type side, an absent one by its decoding default. A constructor default is ignored. **r12-checkpoint (D214), carried into r12-compile** [ran]

- `memory.ts:30-37` (`missingDefault` decodes `{}`) and `:65`.
- D3: an input with only `withConstructorDefault`, left out, is `InputMissing`. D4: the same with `withDecodingDefaultKey` takes it.
- **Why it matters:**
  - D219's reason for the type-side check, "the creator hands a value, not its JSON", applies equally to an absent field, and the type side's default is the constructor default;
  - 2.2.2 defines `Flow.initial` as `withConstructorDefault`, so a developer will reach for it on an input too;
  - restore is right to use the decoding default (D8), since it reads stored JSON.
- **Options:**
  - (a) creation fills an absent input from its constructor default (the type side throughout); restore keeps the decoding default;
  - (b) state that inputs take decoding defaults at both doors, and refuse a constructor default on `Flow.input` at the compile.
- I lean to (a). **Arpit's call** with D219.
- Either way, fix the doors table's "What decodes" wording for creation.

### M3. `Compiled` holds nothing a fragment declares: its events by direction, its ports, its kind. **r12-checkpoint (`Compiled` settled)** [read]

- `fixtures/compiled.ts:77-87, 184`: `CompiledFragment` is nodes, root, default, memory and `whenAbandoned`.
  - `FragmentValue` has `events` and `hostEvents` in process; nothing carries them into `Compiled`.
  - `machine.ts:166`: `Compiled.events` lists the machine's own events only.
- **Harm, for exactly the next prototype:**
  - `flow graph` cannot tell a host's raise from a fragment's own event;
  - `Story.fragment(fragment, …)` (rule 58) cannot drive or check a fragment alone, since its ports and events are not data;
  - `flow check` checks `UnknownEvent` on machine bodies only (`cli/check.ts:289`);
  - 2.2.2's summary (each event's effects, totality, callbacks) has nothing to stand on.
- **Proposed:** `CompiledFragment` gets:
  - `events: { external, host, internal }`;
  - `ports: { exits, callbacks, guards }` with `optional`;
  - `kind`.

  Then `CompiledData` and `flow check` read them. Add event payload Schemas in the same change (owed, and the Story's `send` needs them).

## Low

- **L1. D218 is pinned at a root trait only.** It works nested, on a node and for a subroutine, and `servicesFor(…, Context.empty())` is refused (T1-T4) [ran]. But `type.frag-children-R-dropped` and `type.node-traits-R-dropped` survive. Add three directives.
- **L2. `inputFields` is unpinned.** Writing the key fields there survives, so `SealKeyField` could never fire on compiled output and nothing would notice. `front-check`'s op has `input` equal to its `key`; give it a non-key field.
- **L3. No op names two services** (`op.services-first` survives). One pin with two services, one missing.
- **L4. The seal's `fields` requirement is unpinned** (`seal.fields-optional` survives; mid review L8 open).
- **L5. `compare-all` skips `key`, `fields`, `services` and `inputFields` at every depth** (`compare-all.ts:11`).
  - Round 11 compared a raise's, a member's and a guard's key by position.
  - The suite kills all three today [ran]. Skip by path (`ops.*.key`, `memory.fields`), not by name.
- **L6. The renamed `R12-KEYS` variant's output and lock rows are still there** (`expected-output.txt:234`, `expected.lock:1263`). They are logged as removed, so the gate passes. Delete the rows.
- **L7. Unlogged in `api-changes.md`:**
  - the notify path's count-dependent spelling (`body.ts:221`);
  - the host's exit and callback fillings typed `AnyEvent`, so every exit payload is cast.

  Also `operations.ts:206`'s comment is stale after D218.
- **L8. The mid review's items, still open:**
  - `RecordQuarantined` names no cause (D9: a bare Schema message);
  - `explain` prints neither services nor memory fields;
  - `check.ts:305`'s "events inferred" branch is dead;
  - a computed initial may read another computed field (T6 accepted; 2.2.2 forbids it);
  - D124's union branch is unpinned.
- **L9. 31 `flow-falsify-*` copies from 3 November** in `$TMPDIR` (round 10's killed runs, about 200 MB). None from round 12. Not mine to delete.

| Age | High | All |
| --- | --- | --- |
| r12-checkpoint | 0 | 3 (M2, M3, L8) |
| r12-compile | 0 | 5 (M1, L1, L5, L7, part of L2) |
| r12-post-mid | **1** | 3 (H1, L6, L1's directives) |
| older | 0 | 1 (L9) |

## Assumptions: continued

| # | Assumption | State now | Note |
| --- | --- | --- | --- |
| 38 | A gate's exit code means something | **True at the committed tree**: types pass, control green [ran] | mid review M1 fixed |
| 68 | Every service a machine's commits need is given at boot | **True**, by the seal and by `tsc`, nested included [ran T1-T4] | module Effects still owed |
| 70 | `keyFields` and `key` agree | **True by construction** (D215) [ran] | `inputFields` unpinned (L2) |
| 71 | A field a release adds restores to a value its Schema accepts | **True** [ran: `R12-DOORS`, D7, D8] | |

**New:**

| # | Assumption | True? | Harm when false |
| --- | --- | --- | --- |
| 75 | A lane's key shape says which release keyed it | **False** [ran P1] | H1: declines with no release |
| 76 | Every hold can be named by some typed member | **False** [ran P2, T5b] | H1, M1: a hold stranded for good |
| 77 | A guard and the commit it guards see the same lane | **False** beside D217 [ran P3] | H1 |
| 78 | One door reads a field by one side of its Schema | **Partly**: present by type, absent by decoding default [ran D3, D4] | M2 |
| 79 | What a fragment declares reaches `Compiled` | **False** [read] | M3: graph, `Story.fragment`, `check` |
| 80 | `compare-all` compares every closure's position | **Narrowed** (L5); the suite covers it [ran] | |

## Tests

- **Do the compilers' features fail without their code?** For 27 of 35 mutants, yes, mostly by many named cases.
  - All seven memory mutants die, four of them through the Runtime now.
  - The survivors are pins: D217's match, D218 beyond the root, `inputFields`, two services, the seal's `fields`, D124's unions.
- **What the suite cannot see:**
  - D217 on an optional key field;
  - D217 against another key value or another actor;
  - the stranding;
  - a typed retry of a lane with an optional field absent.
- **Fake against real:** the fake's one `FakeApi` per machine still hides multi-service ops (L3).
- **Not rerun:** `--swap`, the 5 s gate and falsify, beyond the `mutate-one` control, which runs `--swap`, the 5 s gate and every check once, green.

## What the story prototype must do first

1. **Fix H1 before any Story writes a release.** Stamp lanes with their `keyFields`. Give an older-key hold a way out: keyed `retry`/`cancel` by projection, or `orphaned` per rule 46. Make `guardCell` agree. Pin P1's two orders, P2, another key value and another actor. Files: `round-12/lane.ts:536-572`, `durable.ts:380-402`, `turn.ts:747-755`.
2. **Fix `KeyOf` (M1)** and decide whether a key field may be optional (rule 39). Files: `conformance/compile/operations.ts:98-109`, `round-12/typed/type-tests.ts`.
3. **Put what a fragment declares into `Compiled` (M3), with event payload Schemas.**
   - `fixtures/compiled.ts` `CompiledFragment` and `events`, `compile/fragment.ts`, `codec.ts`'s `CompiledData`, `cli/check.ts:289`.
   - `Story.fragment` and `flow graph` both need it, so do it before writing either.
4. **Decide M2 with D219**, and fix the doors table in `convergence-12.md`.
5. **`flow graph`'s conformance check.** Mark `labFollowUps` and D209's blocks as edges it cannot see, rather than leaving them out. Count the Runtime's own endings (D217's and D88's `NotSent`) as edges of `outcomes.failure.NotSent`.
6. **Pins:** D218 nested, on a node and for a subroutine; a two-service op; the seal's `fields`; a non-key input field in `front-check`. Clear L6's stale rows.

## Not checked

- `--swap` and the 5 s gate per mutant; searches, plants, falsify's parts; real browsers; Safari.
- `nub run verify`, the formatter, the linter: I changed no repo code.
- The 52 stated differences in `compare.ts` and the 4 in `compare-all`, one by one.
- The builder's mutant list.
- Why an unsure Attempt's ending runs again at each reload (memory `unsure` +1 per boot in P2 and in `R12-KEYS`'s locked output). This is older behaviour, not round 12's. Worth a look in the story round's reload Story.

## Traces

All from `packages/flow-state-v3/prototypes` in the worktree.

- **Suite:** `bun conformance/watch.ts --rss-mb 1900 --seconds 280 -- bun conformance/main.ts --round 12 --runtime ../round-12/adapter.ts --no-search`.
- **Control:** `bun conformance/watch.ts --rss-mb 1900 --seconds 295 -- bun conformance/mutate-one.ts --runtime ../round-12/adapter.ts`.
- **Checks:** `bun round-12/checks/*.ts`, `round-12/typed/{compare-all,compare,date-check,census}.ts`, `round-12/cli/main.ts`, each under `perl alarm 240`.
- **Mutants:** list `scratchpad/r12f-mutants.ts`, runner `scratchpad/r12f-run.ts <id>` (in place; suite as `mutate-one`, then every check for a survivor), one per command under `perl alarm 280`.
- **Probes:**
  - P1-P3: `round-12/zz-review-probe.ts`;
  - D1-D9: `round-12/zzr/doors.ts`;
  - type probes T1-T6: `round-12/zzr/zz-review-types.ts`, with `tsc -p round-12/zzr/zz-review.json`.

  All live in the worktree only and are removed with it.
- No commits. Nothing written in the main checkout except this file. The worktree is removed by exact path.
