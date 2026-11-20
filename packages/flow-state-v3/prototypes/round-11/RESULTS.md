# Round 11: the suite on typed output

Status: **everything here is proposed.** Decisions D194-D212 are in `../convergence-11.md`, with the findings F1-F11, the `Compiled` changes made and owed, and what was done with the mid-session review (`review-mid.md`). Where the fixture front end bends the public API: `api-changes.md`. Builder-run; the review that follows is the independent measure. Marks: [ran], [read], [reasoning].

Commits: checkpoint `62b9b290`, then `5c401525`, `7865d00d`, `bcf7a646`, `0698538e`, `af90246e`, `8b3537b2`, and this file's commit.

## The question, and the answer

Round 10's suite was green on hand-written `Compiled`: 368 fixture objects, bare functions in all but five machines, 14 duplicate Slot paths, an `Infinity` in data [ran: `typed/census.ts` at the start]. So a green said the runtime runs hand data, not what a compiler hands it.

**Now 691 of 742 cases boot only typed output, 30 more boot typed output that the case itself edits (Pay plus `AbortPay`, a tampered memory), and 21 boot a hand machine** [ran: `typed/census.ts`]. Every typed machine went through `machine()` and nothing else touched it; the suite, the whole output and RECIPIENTS are what they were on hand data, but for one case's output, logged (F8).

| | Start of round | End |
| --- | --- | --- |
| Cases booting only typed output | 54 by `--swap` (Pay), 0 in the plain pass | **691** plain, plus 30 typed and edited by the case |
| Fixture objects with bare functions | almost all (1,396 bare functions over 368 objects) | the 21 cases' hand machines only; the Runtime's seal refuses a bare function (D207) and the suite slots hand data before boot (`conformance/legacy.ts`) |
| Duplicate Slot paths | 14 distinct | 0; the seal refuses one (`SealDuplicatePath`) |
| Hand machines still booted, by cases | | V 5, KeyRelease 4, Kept 3, Odd/All 2, Edge 2, M 2, Doors 1, R 1, M/x 1, N 1, S 1: F2's key shapes and F11's open-record memory, both shapes no compiler emits |

## The codec (D194) [ran: `codec/measure.ts`, `codec/measure-cold.ts`, `codec/browser.ts`; outputs beside them]

**Chosen: no runtime codec. In-process:** the app imports the typed module, `machine()` is the compile, and its output is what the Runtime boots; a Slot's `run` is the author's closure. `toData` (`codec/codec.ts`) is the data view for tools and snapshots, with `CompiledData` (an Effect Schema of it) as the contract, run by `checks/front-check.ts` on every typed machine. Persisted records stay a JSON string.

| Pay, warm, median | ms |
| --- | --- |
| in-process: `machine()` | 0.035 |
| data: `JSON.parse` + rebind (and the table still comes from `machine()`) | 0.037 |
| Schema as a contract on the data | 0.115 |
| Schema as the codec, data to `Compiled` | 0.178 |
| 50 machines: in-process / data rebind / contract | 1.7 / 1.96 / 4.65 |

| Cold, a fresh process, import + build + seal of Pay | median ms |
| --- | --- |
| hand fixture (slotted by `legacy.ts`) | 1.59 |
| in-process | 2.56 |
| data | 3.75 |
| generated module | 3.76 |

Bundle, minified, gzip, `effect` excluded: hand Pay 3.1 KB; typed Pay with the fixture front end 8.7 KB (the front end alone 4.7 KB); the data form adds 1.9 KB of JSON, the module form 2.4 KB.

Fidelity (`toData`'s probe): JSON turns `Infinity` into `null` and drops a bigint, a Date, an `undefined` key, a stray closure and shared identity, each named by `toData` as a loss; in-process keeps all of them. The Schema contract refuses `Infinity` (`Finite`) and the stray closure (`onExcessProperty`); the seal refuses the stray closure.

**Why, honestly (review M2).** The data and module forms, as built, both start from the evaluated definition, because a Slot is a closure over the author's module; so their costing more is by construction here, not a measured loss to a fair rival. A fair rival is a source-transform compiler that hoists every closure into a module of real imports (Qwik's optimizer is prior art); rejected for its cost in complexity and capture rules, not as impossible. The choice rests on two things: only in-process makes the suite's object the production object (no drift), and the compile is cheap (1.7 ms for 50 machines warm, about 1 ms cold over the hand fixture). The front end's memory codecs were made lazy this round when the remeasure showed them at compile time (50 machines 3.2 ms before, 1.7 after).

**What tools read.** `flow check` and `explain` read the evaluated definition with every Slot poisoned (`cli/check.ts` `poison`); evaluating it runs `machine()`, the body and `operations` callbacks and the module's top level, but no Slot. The earlier claim that they read `toData` is dropped (review M3); `measure.ts`'s "check on data = check in-process" line is true trivially.

**Persisted records, Chrome 146 headless, 10,000 messages (1.7 MB):** `structuredClone` of the object 3.3 ms against `JSON.stringify` 0.7 ms (4.7 times; the Bun guess holds); an IndexedDB put to complete: string 2.4 ms, object 3.1 ms; at 6x CPU 11.4 against 16.2; a read: equal (2.0, 2.0). Without cross-origin isolation the timer is 100 µs, so only the 10,000 rows decide. **Safari: not run** (the brief's Safari list stays with Arpit's run).

## The port

Typed fixtures are in `conformance/typed/`, under the lock (review H2), exporting the hand modules' names; scenarios changed their import paths (D195). Every pair is compared as data by `typed/compare-all.ts` (73 pairs, 4 differences stated, 0 unexplained) and Pay, ThreeDS and Countdown by `typed/compare.ts` (52, all stated) [ran].

The front end grew for it (D199-D212, `api-changes.md`): fragment operations, guard ports, `whenAbandoned`, `.each`, `resetOn`, keyed raises, `disarmOn`, unknown by reason, local identity, `places`, computed and optional memory, key-less `idle`, exits behind a guard, module members, activities, and `domain` and `streams` blocks in `Compiled`'s shape (D209). Bugs the port and the review found in it: a bare state token compiled as a history target; the same as an object's target (H3); guard paths among closures (M1); `places` breaking event inference (H1). Each is fixed and pinned in `checks/front-check.ts`, which a revert of the H3 fix and a dropped `disarmOn` each turn red [ran].

### What the port changed in the suite, each logged

- **Import paths** in 16 scenario files and 9 search files (D195).
- **D206: a Slot's path is its place.** Ten fault addresses `operations.X.NotSent` became `operations.X.failure.NotSent`; the hand spelling collides with `success`, `unknown`, `key`, `commit` for a tag of that name.
- **F2: six variants boot the hand machine** (Doors `readKey`, Kept `oddKey`, Kept's two bigint keys, Edge's two), and KeyRelease stays hand: keys no compiler emits (review M4).
- **REV4-L2** carries its edited Deep's services (D211).
- **PAY-12/shuffle's output** (F8): typed Pay's commit starts its request when its Effect runs, so a seeded shuffle sends `pi2` first. Its named oracles hold.
- **Harness:** `startThrows` now reaches a Slot commit (F9: before, DRV-02's fault never fired on typed output); services merged at start and given at boot (D211); hand data slotted before boot (D207).

### Seams, counted apart

`labFollowUps` (D203: Ring, Notes, Kept, serial Bare), `labHostOp` (D212: Edge, pay-full, Let), `index` (typed Pay and pay-full, for the pinned hand Pay's fault paths under `--swap`). These cases boot typed output that is not public API in those places.

## `Compiled`, changed once (D207, D211)

Made: every closure a Slot and one per path, refused at the seal otherwise; services given to the Runtime at boot. Owed, each with its reason in `../convergence-11.md`: the `key` closure (F2's hand cases need it), memory fields as data, `events` required, `idleMs` absent for unbounded (D210), `followUps` out of `Compiled`, `commit`'s type `Slot` only.

## Gates

On `8b3537b2` and the falsify runs after it, one tree at a time, each under `watch.ts` or `perl alarm`. Bun 1.4.2, this Mac.

| Gate | Result |
| --- | --- |
| Suite, `--round 11` with catalog | **742/742**; by output alone 0; unlogged none; removed none; stale lock 0; catalog disagreements none; RECIPIENTS unchanged from `expected-recipients.txt` [ran] |
| `--swap` (the pinned hand Pay and pay-full under every case) | 742/742 [ran] |
| `mutate-one.ts` control (suite, `--swap`, compare, date check, CLI pins, every `checks/` file, 5 s gate) | not killed, 189 s [ran] |
| CLI pins, targets from typed definitions | all pass [ran] |
| `checks/types-check.ts` | `TYPES PASS  tsc clean, 8 directives` over every typed fixture [ran] |
| `checks/front-check.ts` | `FRONT PASS  14 pins, 71 typed machines through CompiledData and the structure check, 3 corruptions seen` [ran] |
| `checks/` mailq, score, search-vacuity; `typed/date-check.ts` | pass [ran] |
| `falsify --part suite1/2/3` | null 0/742; constant hash 61; lying fatal 0; no evidence 32 (was 36); no waits 179; injected issue 5; lying replay 2; junk key 255; D130 checks ok [ran] |
| `--part tamper` | 13 ok, the new typed-fixture tamper among them [ran] |
| `--part mutants` | 4 killed by named oracles; `h.restore-absent-lost` in 5 cases (91 in round 10: typed machines always have a restore, so only hand ones take the branch with none) [ran] |
| `--part search` | 42 checks ok [ran] |
| `--part watch` | ok [ran] |
| `--part lies`, 32 slices | **75 of 75 lies ok, every one red by its named oracle**, none vacuous; all 32 slices `FALSIFY  every gate fails on what it should`, each under 290 s [ran] |

Not run: real-browser modes other than `codec/browser.ts` (bfcache, s3, atom, crash, tabs, desk, run7, h3, spin), Safari, the 18 builder mutants through `mutate.ts`, `nub run verify`, `vp fmt` and the linter.

## Not done, and stated

- The design's entity and stream APIs have no front end; D209's blocks are `Compiled`-shaped (F5). Placement lives in the machine body, not the definition (`api-changes.md`).
- `CompiledData` types `domain` and `streams` as `Unknown`, and nothing ties `Schema.Type<CompiledData>` to the `Compiled` type.
- A selector reads its event's fields as `unknown`; a handle typed by its handler's event is a compile-prototype question.
- Review L1 (input not decoded by its Schema at creation; a release-added computed field restores as `undefined`), L5 (fault paths without a definition; no check that an armed fault fired), L6, L7: open.
- `pay.fixed.ts` (the search runner's fixed Pay) stays derived from the hand Pay.
