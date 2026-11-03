# Over-assumptions in the v3 test suites (commit 3836abc4)

Question: what do the tests quietly assume about programs and hosts, and what happens when the assumption is varied?

**Verdict.** The runtime holds up under variation better than the suite does. Most of what I varied, the runtime survived: odd names, keys, ids, clocks, seeds, async load, slow stores. The suite has three narrow points:

1. Its every-step oracles parse the on-disk format. A correct runtime with another format fails 40-44% of cases.
2. Search's "closed" can be wrong for a program whose memory has a field called `pos`, `since`, `mint`, `boot`, `sentAt` or `doubt`.
3. Harness limits stop it hosting 10,000-scale runs or a native-Promise store.

I found three real runtime bugs and one quadratic cost. All are narrow.

Marks: [ran] measured, [read] from the code, [reasoning] inferred.
Classes: (a) real runtime bug; (b) a case or oracle over-fits and fails a correct variation; (c) a domain no case exercises.

Baseline [ran]: 703/703 cases on round 9.

**Reviewer scope.** The owner widened scope mid-run and then cut time. Sections 5 and 6 list what I only read and what I did not reach. No random machine generator was built, so variation is by metamorphic wrappers and directed probes.

## Reproducing

Everything is in the scratchpad. Nothing in it is part of the repo.

```sh
L=/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/audit-over/lab
export WT=$L/../wt
bun $L/meta.ts <variant> [seed]   # the whole suite through a wrapped Port or Host
bun $L/probes.ts names|keys|values|hash|scale|server
bun $L/hashbfs.ts
bun $L/burst.ts 100000
```

Run the commands from `$L`, under `conformance/watch.ts`.

## 1. Ranked findings

### F1 (b): every-step oracles pin the disk format, so a correct alternative runtime fails 40-44% of cases [ran]

| Variation (semantics unchanged) | Cases failing of 703 | First failure |
|---|---|---|
| `diskKeys`: `actor/` and `lane/` renamed | 312 | L3 "ack claim ... no write outside" |
| `diskEnvelope`: value wrapped in `{v,body}` | 279 | 213 on oracle (h), "no head on disk" |
| `diskBase64`: opaque bytes | 282 | 212 on (h), 68 on `stored()`'s `JSON.parse` |
| `diskFieldOrder`: same JSON, fields reversed | 17 | text compare, see F3 |

- These are not only the roughly 40 cases that read `actor/` and `lane/` directly. Three oracles run on every step and parse the format:
  - `scenarios/ctx.ts` L3, the `actor/${w.key.split("|")[0].slice(5)}` line
  - `drive.ts` `writeAheadLies` (`lane/`, `.head.id`)
  - `drive.ts` `owedAtBoot` (`.parked`)
- `Reads.stored()` also requires every value to be JSON.
- The failures above mask direct pins, so the direct-pin count is not measured.
- The header of `harness.ts` says "Internals stay invisible". For the disk format that is false.
- Fix direction: add `Instance.headsOnDisk()` and `parkedOnDisk()`, plus a write-claim read. The oracles then ask the runtime's codec for these, and the disk bytes stay the suite's to tear.
- This matters for your "conformance ports to prod" plan: a production format change breaks 300+ cases at once, for no semantic reason.

### F2 (b, soundness): `stateHash` merges different states when user memory uses names the normaliser ranks [ran]

`round-9/adapter.ts` `normalise` regex-ranks `mint`, `boot`, `sentAt`, `landedAt`, `pos`, `doubt`, `since` and `att-N-N` in the serialized world, including user memory.

- `probes.ts hash`: `{pos:1}` and `{pos:2}` hash the same. So do `since`, `mint`, `boot`, `sentAt`, `doubt`, and text `"att-1-1"` vs `"att-1-9"`. A control field stays distinct.
- End to end (`hashbfs.ts`), the same machine with a guard `field === 2` going to BAD:
  - field `cursor`: `failed`, 4 states, "reached BAD on set2 check"
  - field `pos`: **`closed`, 2 states, no failure**

  A "closed" verdict can be false.
- No fixture has these field names today (`grep` of `fixtures/` found none) [ran], so the published searches are not shown wrong. The assumption is about future machines, and `pos` and `since` are ordinary names.
- `idUuid`: search `like` depth 5 gives 12,173 states with UUID ids and 12,173 with `att-` ids [ran]. Id format costs nothing at this depth. The regex risk is only the false-merge side. Runtime-internal `g1.1` text did not collide in the probe.
- Fix direction: normalise structurally by path in the world, not by regex on text.

### F3 (b + blindness): `Ctx.eq` compares JSON text, so it is order-sensitive and type-blind [ran, read]

- Order-sensitive, failing correct variations:
  - memory read with fields reversed: 8 cases (the ninth is my wrapper's cycle)
  - records: 3
  - rows: 1
  - disk field order: 17
- The runtime itself reorders memory across a reload: `eqJSON=false` in `probes.ts values` even for plain strings. So field order is already not stable, and cases pass only because the fields they compare happen to be stable.
- Type-blind: `undefined` vs absent, `Date` vs ISO text, and `NaN` vs `null` compare equal or are lost. `Map` compares as `{}`. A runtime returning a string where a `Date` belongs passes `eq` if the text matches.
- The same text-compare shape is in `round-9/cli/main.ts` `eq`, so pins there are order-sensitive too [read].
- Fix direction: canonical deep compare with tagged types.

### F4 (a): a `Symbol` in an operation's input stops the whole runtime [ran]

`probes.ts keys`, case `symbol`: `Go` with `{k: Symbol("a")}` gives `fatal=true issues=Fatal`.

- SEARCH-ODD's oracle is "no value may name, shape or stop the core" (D57), but its alphabet has no Symbol, NaN, Date, Map or Set (`search/odd.search.ts` `ODD_LISTS`). Function, Map, Set and bigint all give `UnencodableValue` and the commit is refused. Symbol is the one hole.
- A symbol in plain memory is silently dropped across reload with no issue: `sym: hasV=false`, while `fn` gets `UnencodableValue`.
- On the untyped path `NaN` and `Infinity` come back from a reload as strings with no issue (`NaN: before=Number after=String`). The typed path is covered by exactly one machine (`typed/date-check.ts`, passes) [ran].

### F5 (a): a state named `self`, and actor key text that collides [ran]

- `target: "self"` is a reserved string in the data format. A state with id `self` can't be entered: hop stays in `A`, no issue. A state `__proto__` works live and is quarantined at reload (`RecordQuarantined`). It is named, but the actor is lost.
- Machines `M` id `x/y` and `M/x` id `y` share one actor: `a={"from":"a"} b={"from":"a"}`, no issue.
  - Half of this is `drive.ts`'s `actorKey` being `${actor}/${id}`, with no escaping.
  - The other half is that the runtime's `ensure` ignores a different machine named for a live key, and says nothing.
  - Machine ids contain `/` by convention (`Checkout/Pay`), so this is reachable.
- Whether the typed path refuses `self` is not checked [reasoning: `S.self` would compile to the same id].
- Oracle L3's `held` case splits at the last `/` and the `ack` case splits at the first `|`. They assume the shape of ids [read].

### F6 (b, harness): limits that make scale untestable [ran]

| Variation | Result | Cause |
|---|---|---|
| burst 6,000 sends, one step | passes, 466 ms | |
| burst 8,000, one step | **killed at 1.8 GB in 1.3 s** | adapter's `log` retains a world per step, with the mail array, so O(n²) memory |
| 10,000 actors ensured then sent, one step | **`settle: did not quiesce`** in 162 ms (3,000 pass) | the 5,000-task guard in `drive.ts` |
| 30,000 commits answered | 256, 391, 576 ms per 10k; 1.5 GB RSS | `fake.requests` scans, plus log and evidence retained |

- The largest burst in any scenario is 300 and the largest loop is 1,000. The suite never runs at the scale the design discusses. `bench/` has 10,000 actors but only measures, and asserts no behaviour.
- World text stays 1 KB over the 30,000 commits and disk stays small over 2,000 reloads. That is a good negative: no leak in the world [ran].

### F7 (a, cost): sends queued in one go are quadratic in the bare runtime [ran]

`burst.ts`, with no adapter log: 10,000 takes 986 ms, 100,000 takes 85,094 ms (86x for 10x). Immutable mail is copied per send. The suite cannot see this (F6). Whether 100,000 matters is your call; 10,000 is fine.

### F8 (b): the harness can't host a native-Promise store, and `start()` assumes a synchronous boot [ran]

- `promiseLoad`: 688/703 fail, because `settle()` is synchronous and real microtasks never run inside it. The harness cannot run the store shape every real browser has. Thenables are modelled instead, and only cases using `load: "hang"` take that path.
- `asyncLoad` (a thenable answering in a later task): 396 fail. With `start()` settled first, **1/703** (`REV8-PINS/D72`). So the runtime is fine, and the failures come from `start` not settling.
- Result: the async path is healthy, but only because of the thenable stand-in. Native promises are covered only by `reality/`.

### F9 (b): untyped evidence is the real contract [ran, read]

- Scenarios and searches read 35 distinct evidence kinds at 161 sites. 11 of the 35 names are nowhere in `machine-design.md`, and `harness.ts` types evidence as `Record<string, any>`.
- `evOracleOnly`, keeping only the kinds the ledger and oracles read: 39 fail.
- `evReverse`, order within one step reversed: 57 fail. The oracles assume ending-before-delivered inside a batch. That one is defensible, but it is not stated.
- `issueOrigin`, free-form origin text changed: 3 fail. One is `PAY-11`'s exact path string.
- `frameCause`: 2 fail (`PAY-08`, `PAY-14`), which parse `cause`.
- Good news: extra kinds, extra fields, and reordered waits all pass (0 fail).

### F10 (b, likely): three cases pin the no-yield order [ran; class is reasoning]

Turning on `schedulerShuffle` suite-wide fails the same 3 cases under 8 seeds:

- `SURV-04` ("expected success, got unknown")
- `REV6-H7/overflow-reaches-a-stopped-pull-out-of-band`
- `REV8-STORM/a-press-beside-a-spin-goes`

Identical across seeds suggests the cause is the 3-per-yield and yields-before-send that the fault also sets, not an order race. `SURV-04`'s premise is a sync answer settled before a cancel is admitted, which a yield legitimately removes. Not traced to the end, so I can't exclude a bug.

`laterTwice` (`REV9-LOOP/listeners-hear-a-spin-...`) and `storeAnswerSlow` (`PAY-12/shuffle`, its witness count only) each fail 1, and both look tied to task counts.

### F11 (c): domains no case exercises [ran census]

Across 75 fixtures compiled:

- max state depth 2, max 11 nodes per machine, max 8 ops, max 4 fragments, state names all `[A-Za-z0-9_]`
- 45 persisted
- 137 reject ops vs 22 latest and 9 serialize

`--swap` boots typed output in only **20/176 scenarios (54/703 cases)**, all Pay. Every other fixture is hand-written data, and none declares `events`. So "the compiled format" is tested mostly against what hand-writing produces. Typed-output differences off Pay are unexercised.

The gate at D80's interval covers one value: `FLOW_CAPTURE_MS` 1,000, 5,000 and 30,000 fail 73, 75 and 81 unclassified (without the gate's test flush). The set differs by 6 between 5 s and 30 s, so some cases are tied to the number. Not classified.

## 2. Varied and held (negative results, worth keeping) [ran]

- Host mint format, UUID or prefixed: 0 fail.
- Clock at epoch 1.7e12, through the fake's own clock: 0 fail. Seeds 2 and 7: 0 fail. No `workClock`: 0 fail.
- Removing `onHidden`/`isHidden`: 12 fail, all cases about hide.
- `stateText` opaque hash: 0 fail (search only).
- Keys: all correct, as distinct or the same:
  - number vs string, `-0`/`0`, `NaN`/`null`, `Infinity`/`null`
  - undefined field vs absent, field order, `Date`, class instances
  - NFC vs NFD, `|`, `""`, 1 MB long, composite arrays
- Actor ids: `a/b`, `a|b`, `""`, emoji, `__proto__`, `constructor`, 100 KB, `lane/x`, all survive reload.
- Event tags `constructor`, `__proto__`, `toString`: `Unhandled`, correct.
- State names with unicode, space, `/`, `|`, empty: fine. State depth 1,000: fine.
- Commits failing with a string, null, `Error`, no tag, unknown tag: `UnmappedEnding`. `die`, interrupt, sync throw: named. Generic oracles and replay clean.
- 5 answers forward vs reversed: same outcome.
- Memory 5 MB string: fine.

## 3. Priority

1. F1: move the disk knowledge behind `Instance` reads. Highest value for porting.
2. F2: path-based normalisation. It's a false "closed", even if none is published yet.
3. F4 and F5: small runtime fixes. Add Symbol, NaN and Date to `ODD_LISTS`, and have `ensure` refuse a machine mismatch.
4. F3: a canonical compare in `Ctx.eq`.
5. F6: raise or scale the guard, and add a 10,000 case. The adapter log needs a flag.

## 4. Wrapper caveats

- `epoch` as a wrapper around `host.now` gave 487 fails. That was my wrapper disagreeing with the fake's `claim`, not a finding. The clean run used `clockBack`.
- `memOrder`'s `REV4-H4` failure and `frameDedupe`'s BigInt failure are wrapper artefacts, and are excluded.

## 5. Added scope: read or lightly run only

- `round-9/typed/`: `--swap` 703/703 and `date-check.ts` pass [ran]. Type tests not varied. One machine for Date, NaN and BigInt.
- `round-9/cli/main.ts`: passes [ran]. Pins exact rule codes and counts through JSON text compare [read]. Not varied.
- `run-plants.sh`: each plant is judged by one pre-chosen search (`name:search`), so "found by search" assumes the pairing [read].
- `mutants-*`: the runner has a control pass [read]. Lists not audited for shape.
- `conformance/bench/`: uses the Ring fixture, 1, 1,000 and 10,000 actors, measures only [read header].
- `round-9/reality/`: Chrome only, over CDP, one IndexedDB adapter, one object store [read headers]. **Not run; result-scoring not audited.**
- `round-9/entity-model-2/`: a model with its own `Store`, 5 configurations plus trust list and mutants [read headers]. **Suites not run or varied.**

## 6. Not reached

- A seeded random generator of machines and programs (depth, fragments, nested parallel lanes under load).
- Nested parallel lanes at all. Many-fragment machines. Large records beyond one 5 MB string.
- Reversing every pair of steps. Interleavings outside the existing alphabets. Answers very late across reloads.
- Hosts: in-memory, torn-across-keys beyond the existing `tear`, a quota-failing store.
- Servers: non-idempotent, duplicate delivery beyond the existing fault.
- A real alternative runtime. The wrappers only approximate one.
- Classifying the capture sweep (F11) and tracing F10 to the end.
- I did not read any `review*.md` or `RESULTS.md`, so findings may overlap known items.
