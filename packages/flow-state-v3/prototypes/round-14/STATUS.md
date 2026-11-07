# Round 14 status

Prototype, for evidence; never production code.

## Checkpoint 1: area 1, lifetime (OD31) done

- Suite `--round 14 --runtime ../round-14/adapter.ts --no-search`: 800/800, locked, nothing unlogged, exit 0.
- `lifetime-falsify.ts`: control 48/48; 27 wrong runtimes all red; every LIFE case red on at least one.
- Not built: LIFE-19, 20 (Hydrate, dehydrate), 25 (records cliff), 26 (context providers); the ending phase
  (`stopped` input) and `NotAdopted` (no lazy entries).

## Checkpoint 2: area 2, identity (OD30) done

- `compile/ref.ts`: `actorRef` from a value or a literal name, `ensureArgs`; type pins in `typed/type-tests.ts` (tsc clean).
- Runtime: a record keeps the fields a value ref named it by; `OldVersionActor` at boot; `ConflictingActorRef`.
- R14-ID-01..03; 805/805 locked; falsify: 32 wrong runtimes red, every case red on one.

## Checkpoint 3: area 3, `Flow.ignore` and P1 (OD28) done

- Compiler: `Flow.ignore` in any operation mapping, D220's check skips it, `IgnoreForbidden` on stream keys and listen entries (front-check, 7 pins).
- Runtime: an ignored ending is admitted with no turn; its cell applies; an unknown is released (cancel in Held); never parked.
- `flow check`: `IgnoredUnknown` info. R14-IGN-01..03; 815/815 locked; 35 wrong runtimes red, every case red on one.

## Checkpoint 4: areas 4 and 5 (OD29 F, E step 2, target, G) done

- F: an absent `resetOn` value places nothing; present, the filling reads `key`; R14-F-01 (M8 impossible, the "A, none, A" walk).
- E step 2 and the optional target: type pins (no `signal` in contexts was already so). G: `Effect.catchTag` in `typed/lab.ts`, `typed/pay.ts`.
- J: not built (the prototype has no typed entity API). 818/818 locked; 38 wrong runtimes red.

## Checkpoint 5: the independent review at 48d1dc46, fixed or stated

- H1 fixed: an ignored unknown counts as mapped; no `UnresolvedHold` for it (CLI pins: `IgnoredUnknown`, removeFile, ignore.ts's send and put).
- H3 fixed: the end encodes the record with `record.ts`'s codec; the test-only `codec` input is gone; LIFE-22 poisons memory with a bigint.
- M1 fixed: arming or disarming a schedule key drops its waiting deadline; an ended activation's waiting deadline goes; LIFE-14 re-arm variant.
- M2 fixed: a return after an end mints a new root id (an old ending is adopted, current from the active leaf: my call, rule 14's adopted row);
  a record kept at ready keeps its id, as a live restore does. The same-incarnation invariant covers kept reads and endings owed at ready.
- M3 fixed: identity fields encode by their Schemas to strings; the version is field set plus each field's Schema (type and encoded side).
- Item 7: LIFE-13 kept, with a comment naming the design hole.
- M5 and the rest, stated, not built:
  - `ScheduleLeadsToWrite` (flow check) is not built.
  - Story `detach` and `dispose` exist in the suite's harness steps only, not in `round-14/story/story.ts` (no app Story there).
  - `EndedWithWork` and the end's record list schedules and reads, never activities or sessions.
  - Inspection's `uses.busy` lists write lanes, kept reads and owed endings; not mailbox depth, waiting deadlines or the unencodable block.
  - `IdentityFieldOptional`, the read-only input pin (OD30 Q5), `InputIgnored`, and `ConflictingActorRef`'s persist and context half are not built.
  - G: `typed/lab.ts` and `typed/pay.ts` call `catchTag` through an `as never` each (a generic error type); the hand `fixtures/*.compiled.ts` are unchanged.
  - E step 2 is pinned for a commit's context only.
  - `soon` and `warned` are out of the state hash (diagnostics only).

## Checkpoint 6: the user's corrections D1-D7 done; final gates in RESULTS.md

- D1: an end parks `failure { Interrupted }` per stopped read; the return hears it after its restored deliveries; LIFE-13 flipped.
- D2, D3: as M1, M2 above. D4: the ref form is fixed per machine in the types; `ConflictingActorRef` only for persist mismatches.
- D5: a local remount within the grace reuses the actor (LIFE-27). D6: a disposed identity's ending waits on its lane (LIFE-23).
- D7: an undecodable identity reads "quarantined"; an ensure starts fresh and reports `RecordUndecodable` (evidence).

## Checkpoint 7: the fix pass after the independent final review (RESULTS.md has the table)

- H-A, fragstore.row, M1-M6, L1, L2 fixed, each with a case and a wrong runtime (57 in `mutants-lifetime.ts`). 834/834 locked.
- For the design, open (the user decides later):
  - **M4, call 2.** Built as rule 73 is merged: a `Held` lane, with or without waiting commits, keeps nothing, so a Held offline write is
    not woken at ready and its waiting commits' `NotSent { Restored }` are not owed (R14-FIX-02). The design may change this.
  - **M3, persist order.** The design does not say which `persist` wins across a `disposeActor`. The runtime forgets the first ref's
    `persist` at `disposeActor`, so the next ref to ensure the identity is the first again (R14-ID-03).
  - **L4.** `RestoreDiscarded` and `RecordUndecodable` name one event from two sides (a record this release cannot read, discarded at an
    ensure). The design should keep one name.
  - **L1, stated limit.** A check on the encoded side is seen only as there or not: its kind lives in annotations, so `minLength(1)` and
    `minLength(2)` read as one version.
  - **M1, stated limit.** The woken-at-ready D1 case edits the disk (LIFE-28's walk with the end landed): no step of the fixture reaches
    an ended record that is also owed a parked ending.
- Ledger changes (`drive.ts`): a park into a record kept at ready pays `told` into `parkedOwed` only at a boot that kept that record; the
  store's forced repair wait (`store: true`) is not the actor's work in flight.
- Not done: the fragstore.row search's remaining rule 17 failure (round 13's class).

## Hand-off (2026-11-08)

Items (commits on `worktree-agent-acee8f40b71d961fd`):

| Item | State | Commit | Case | Wrong runtime |
| --- | --- | --- | --- | --- |
| H-A Runtime disposal | done | 0dd9e9f3 | REV5-M1, LIFE-28, PAY-16 (+ bound variant), SURV-08 | `o6.dispose-interrupts-wire`, `o6.settled-in-bound-stays-held`, `o6.no-bound` |
| fragstore.row diagnosis | done (search still fails, at a later class) | 76e65e3e | R14-FIX-01 (named-at-ready; dispose-at-ready; ended-then-disposed) | `boot.mail-unsaid`, `boot.mail-lost-at-dispose` |
| M1 D1 on every return | done | 76e65e3e | LIFE-13 (after a reload; woken at ready, disk edited) | `d1.woken-drops-stopped`, `d1.reload-drops-stopped` |
| M2 D3 | done | 76e65e3e | R14-FIX-03 | `d3.return-keeps-old-id` |
| M4 call 2 | done, no earlier verdict changed | 76e65e3e | R14-FIX-02 | `m4.held-w-owed` |
| M3 persist order | done | 8b737bdc | R14-ID-03 (other order; after dispose) | `m3.persist-survives-dispose` |
| M5 templated reasons | done: the 12 were one regression (a return from ready captured), fixed, each logged | 8b737bdc | R14-FIX-01/a-return-from-ready-writes-nothing | `m5.return-from-ready-writes` |
| M6 k.ghost-life | done: lie restored, mark "not woken" | 8b737bdc | R14-FIX-01, R14-FIX-02 (`lie-cases/k.ghost-life.json`) | the lie |
| Low L1, L2, L4 | done (L4 noted above, for the design) | 8b737bdc | R14-ID-02 (L1) | `l1.version-by-type-side`, `l1.version-by-printed-name`; L2 none |

Gates:
- Ran on 8b737bdc: suite `--no-search` and `--lock` (834/834, nothing unlogged, removed none, stale 0, catalog none); suite with its searches
  through `watch.ts` (834/834, exit 0, peak 1744 MB); `lifetime-falsify.ts` (control 119 pass, all 57 wrong runtimes red, every case red on
  one); `bun ../round-14/checks/*.ts` (all pass); `bun ../round-14/cli/main.ts` (all pass); `tsc -p round-14/typed/tsconfig.json` (clean);
  `falsify.ts --part lies --lie k.ghost-life` (red, targeted); fragstore.row search (failed at depth 7, rule 17).
- Still to run, in this order (they were started and stopped at the hand-off, no result): `bun mutate-one.ts --runtime ../round-14/adapter.ts`;
  `bun graph-gate.ts --runtime ../round-14/adapter.ts`; `bun falsify.ts --runtime ../round-14/adapter.ts --part suite1`, then `suite2`,
  `suite3`, `mutants`; `bun falsify.ts --runtime ../round-14/adapter.ts --part lies --parallel 4`; the listen.load search. Then update
  RESULTS.md's gate table (it still shows the pre-fix numbers).

Uncommitted or experimental work: none. Scratch scripts only, outside the repo (the session's scratchpad: `trace.ts` replays a fragstore
walk, `cmp.py` diffs outputs against ed3e1a29).

For the next builder:
- The lock's log allows one reason on at most 3 lines; every output change needs its own reason.
- `lifetime-falsify.ts --mutants a,b` runs only the named wrong runtimes (a prefix matches); a mutant whose edit breaks the syntax shows as
  "0 red", not as an error.
- A record kept at ready (`fromBoot`) is not the same as a record that ended before the reload (`v.retired` on disk): only the first
  has boot mail; the second's restored endings park on the lane in the turn (`turn.ts`, `!a`).
- `git stash` in a worktree shares the main checkout's stash list. On a clean tree `git stash; git stash pop` pops the user's
  `stash@{0}` ("preserve pre-integration lint edits"); that happened once here, was undone in this worktree only, and the stash is
  still kept. Do not use stash.

## Speed pass (2026-11-08)

Baseline (serial, 12 cores / 24 GB): suite `--no-search` 67 s wall, 1745 MB peak, 834/834; REV9-BURST/300-rows 44.9 s of it.

| Fix | State | Commit | Before | After | Sameness shown by |
| --- | --- | --- | --- | --- | --- |
| 1 ledger memo, linear `viewOf`, placements hoisted; `bindingIn` stops at its first match | done | 0806c7de | suite 67 s; rows probe N=120 body 2284 ms; 300-rows case 44.9 s | suite 27.7 s; N=120 555 ms; 300-rows 5.9 s | 834/834, every output compared equal, RECIPIENTS line identical; a temporary differential run recomputed every memo hit (186075) and compared copies, resets and the Slot-path tape: 0 differences |
| 2 canon: ancestor `Set` with add/delete; replay compares pairs of plain subtrees, memoised; `ranked()` by a Map | done | 546634af | suite 27.7 s; DRV-01 2.6 s, FRAG-15 4.7 s, R10 listener 3.2 s, 300-sends 2.3 s | suite 19.7 s; 1.6 s, 3.7 s, 2.3 s, 1.2 s | 834/834, outputs and RECIPIENTS identical; `FLOW_CANON_CHECK=1` (kept) recomputes the old whole-text comparison on every replayed step: 205650 steps, 0 differ; `FLOW_DEEP_FREEZE=1` suite 834/834 |
| 3 no per-step `stateHash` unless output is compared or collected | done | 917b8ffb | `--no-output` suite about 17-19 s | `--no-output` 13.1 s; plain 17.0 s | `rec.hashes` is read only by `output.ts` (`hashes: t.hashes.size`); `stateHash` reads only (fake `stateText`, `mayHave`, `truth`, `edge.text`, `normalise`), so skipping it changes nothing else; 834/834, RECIPIENTS identical with and without `--no-output` |
| extra: `pathOfId` without a path array per node; per-case `Bun.gc(true)` when the JSC heap (not RSS) passes 500 MB; `stateText` keeps its last answer per (world, now, outside text) | done | 917b8ffb | 300-sends 1.25 s in the suite (0.9 s of it hashing), rows 4.2 s | 300-sends 1.25 s, rows 3.2 s; plain suite 18.1 s to 17.0 s | equal value and order (`pathOfId`); GC timing decides no result (nothing weak in the suite or runtime); `normalise` is a pure function of its three inputs and the world is never written in place; 834/834, outputs, RECIPIENTS identical |
| 4 gate concurrency: `mutate-one.ts` runs plain, swap, compare, date-check, CLI and gate5s at once (checks after, since `types-check.ts` writes into `typed/`), `--serial` for the old one-at-a-time; `mutate.ts --parallel N` (N <= 8), one copy and one watchdog per mutant, control first, reported in list order, `--serial` passed to each mutate-one; `--rss-mb` (default 1700) | done | b7d6239a | mutate-one control 46.4 s after fixes 1-3 (206 s at baseline) | 19.6 s (peak 4.8 GB, the tree); mutate.ts 3 mutants, parallel 3: 71 s against 89 s for 2 serial | the same precedence, read in the same order from the same outputs; planted kills in a scratch copy (date-check and CLI broken; then CLI only) give the same `killedBy` and killers in both modes; serial and parallel mutate.ts runs gave the same lines |

End gates (2026-11-08, after b7d6239a; wall, peak RSS of the watched tree):

| Gate | Exit | Wall | Peak | Baseline (f0771187) |
| --- | --- | --- | --- | --- |
| suite `--no-search` | 1, only for the unlogged file hashes; 834/834, outputs and RECIPIENTS identical | 17.1 s | 1790 MB | 67 s |
| `mutate-one.ts` | 0, `{"killedBy":null}` | 20.3 s | 4763 MB | 206 s |
| `graph-gate.ts` | 0, GRAPH PASS | 15.8 s | 1943 MB | 67 s |
| falsify suite1 / suite2 / suite3 | 0 / 0 / 0 | 25 / 57 / 20 s | 1716 / 1751 / 1013 MB | 85 / 223 / 115 s |
| falsify tamper | 1: "control: the copy is green untampered" (the lock, see above); every tamper red | 5.6 s | 333 MB | 4 s |
| falsify mutants | 0 | 59 s | 1835 MB | 279 s |
| falsify lies `--parallel 4` | 0 | 29 s | 3024 MB | 75 s |
| `lifetime-falsify.ts` | 0, control 119 pass, 57 of 57 red | 32 s | 1580 MB | 37 s |
| falsify search | 1, `chain` red on the real runtime (known) | 47 s | 342 MB | 47 s |
| checks, typed tsc, CLI pins | all 0 | fast loop 21 s serial, 17 s at once | | |

Run in three batches of up to 7 processes, the gates take about 3 minutes of wall. Every line the falsify parts, lies, search and
lifetime-falsify print (`ok`/`BAD` and their case lists) is identical to the same parts run on a copy of f0771187.

Left: the lock needs the user's log lines and `--lock` (the suite and tamper's control exit 1 until then); peak RSS per suite process
is about 1.75 GB against 600 MB; the plain suite is 17 s against 15 s (13 s with `--no-output`: per-step `normalise` for the hash
count is about 4 s, the runtime's own steps most of the rest); `mutate.ts` at its default 1700 MB limit fails its control (as before).

Findings:
- `mutate.ts`'s control fails at its 1700 MB tree limit, and did before this task: the suite alone peaked at 1745 MB at the baseline
  (1783 MB now under mutate-one). Its default is unchanged; `--rss-mb 6000` lets it run. Whether to raise the default is the user's.
- Peak RSS stays about 1.75 GB per suite process (target 600 MB). Not garbage alone: FRAG-15 keeps its 4059 search harnesses
  tracked to the case's end (D130's checks run on each), about 515 MB live; R10-RUNTIME's long `do` peaks at about 1.2 GB of garbage
  with an 18 MB live heap after a full GC. Neither is reachable by the four fixes.
- Fix 2 departs from "cache canonical text per subtree": a text cache still pays the root's concatenation every step (most of
  the text built was the root tuple and the world object). The replay instead walks the replayed and the logged step side by side
  over plain arrays and objects (what `FLOW_DEEP_FREEZE` freezes) and keeps each pair found equal, so an unchanged subtree costs one
  lookup. Equal exactly when the two `JSON.stringify(canon(...))` texts are: JSON texts are self-delimiting and an object's key order
  is a function of its key set; leaves, and anything not plain (MailQ, Map, Set, Date), are compared by their canon text. A cycle
  seen anywhere switches that replay to whole texts. canon itself keeps its lines (the `d141.date-collapses` and `d143.user-ranked`
  mutants still apply), and returns the same values.
- No logged world is written in place: the suite passes 834/834 under `FLOW_DEEP_FREEZE=1`, which freezes every logged step's input
  and output (plain objects and arrays) so an in-place write throws and is Fatal.
- `slotRuns` does count the reference model's `resetOn` runs: `compiled` is wrapped (`wrap` in drive.ts) before `new Reference(compiled)`,
  so `Reference.copies` runs the wrapped Slot, which pushes to `slotRuns` and spends an armed `throwIn` (frag.scenario.ts arms
  `traits.check.resetOn`). The memo keeps both: a miss records the Slot paths it ran; a hit pushes the same paths (when not replaying)
  and is skipped while any of them is armed; an entry whose run threw is not kept.
- The lock blocks a clean exit for this whole task. D113 hashes every harness file (`file:drive.ts`, `file:harness.ts`,
  `file:reference/model.ts`, `round:adapter.ts`, and later main.ts, mutate*.ts), so any edit shows as "unlogged expectation changes"
  and the suite exits 1 although 834/834 pass and no output or RECIPIENTS changes. Logging and `--lock` were not allowed in this task
  (the brief keeps `expected.lock` and `expected-changes.log` untouched; the permission check refused a `--lock` run). The user
  decides: log one line per changed file and relock, or not. `bun main.ts ... --no-search --hashes` prints the lines needed.

## Speed pass 2 (2026-11-08)

Baselines (0d), recorded at c391d008 before any change, in the session scratchpad `cp2-baseline/`: the ok/BAD lines of falsify suite1,
suite2, suite3, mutants, lies `--parallel 4`, lifetime-falsify, the suite's SUMMARY and RECIPIENTS, and the whole stdout of the suite on
`null-adapter.ts` and on each of the eight broken runtimes, plain and `--no-output` (18 runs; first-failure messages, in order).

| Step | State | Commit | Before | After | Sameness shown by |
| --- | --- | --- | --- | --- | --- |
| 0a in-place writes checked by default | done | (this) | guard only under `FLOW_DEEP_FREEZE=1`, which no gate set; suite 17.2-17.4 s, 1.79 GB; the old full freeze 23.3 s, 2.14 GB | `inPlaceGuard` (harness.ts) on every logged step (input and output), every published world (`version`), every replayed world, and the suite's own read of `version` in drive.ts; suite 19.2-20.6 s, 1.72-1.73 GB | 834/834, outputs and RECIPIENTS identical; the 18 broken-runtime outputs identical to 0d (source positions and the lock's id list normalised); lies `w.patch-in-place` (red in 162 cases by "Attempted to assign to readonly property") and `w.row-in-place` (red in 227 by `writtenInPlace`); `FLOW_COPIES_CHECK=1`: 186075 memo hits recomputed, 0 differ |
| 0b mutate.ts time kills | done | (this) | any watchdog kill counted as killed; `--rss-mb` 1700, control red by default | a time kill (or a clock trip) is rerun once alone (`judged`, watch.ts); only that answer counts; under `FLOW_DEFER_UNKNOWN=1` it is UNKNOWN, counted apart; default 2600 MB | control green at the default (peak 1846 MB, `--serial`); judged tested on a planted slow run and a planted trip |
| 0c settle's wall-clock trip | done | (this) | one message for the 5000-task bound and the 20 s clock | the task bound keeps its words (deterministic, a verdict); the clock trip says `CLOCK_TRIP` (watch.ts); mutate-one reruns a tripped gate after the others end, and reports `unknown` when it still trips or runs `--serial`; falsify, lifetime-falsify and mutate.ts read a trip as unknown and rerun alone | planted trip (clock at 1 ms in a scratch copy): 16 cases trip; mutate-one reran plain and said `unknown` |
| 1 finish harnesses early | done | (this) | FRAG-15 alone 3.5 s, peak 1797 MB (4058 harnesses kept to the case end) | a harness its maker ends (`Harness.end`, called by the search engine after a state's last edge) is checked and its output line made then, and let go, when no name the case can still add changes its verdict (names only grow; else it waits for the end as before); the end loop reads the kept results in the same order; FRAG-15 alone 3.4 s, 301 MB | 834/834, outputs and RECIPIENTS identical; the 18 broken-runtime outputs identical to 0d (first failures and their order) |
| 3 GC in long runs | done | 3348071d, then (this) | suite peak 1.82 GB (REV9-BURST, R10-RUNTIME, DRV-01 ratchet it) | a look every 64 steps (evidence batches), tasks and replayed steps: a full collection each time the resident size has grown 100 MB since the last (first: when the JS heap passed 250 MB, but `heapSize` cost 0.3 ms a call, 0.66 s a suite; `rss()` costs under 1 us); replay keeps no table of its own worlds (objects frozen only); suite 18.1-18.5 s, peak 1.0-1.2 GB (noisy run to run) | 834/834, outputs, RECIPIENTS, 18 broken outputs identical; nothing weak exists (no WeakRef or FinalizationRegistry in conformance, round-14, or the `effect` index they import) |
| 2 one parent per script | done | (this) | the 14 searches (depth 4, 4000 states, real runtime, 7 at once) 27.9 s | `engine.onePre`, set by search/run.ts: a state's script replayed once for all its actions, its hash once (`extra` still per action); guards and edge oracles only read the parent (each checked); off inside the suite (FRAG-15's harnesses are tracked and counted) and under `FLOW_TEST_FLUSH` (its probes hide the page) | 14.4 s | every search's JSON identical but `ms`, `peakRssMb`, `steps` (verdict, states, edges, perDepth, classes, failure, deadActions) |
| 5 one scheduler | done | (this) | final-commit gates about 3 min in hand-made batches | `conformance/gates.ts`: 22 jobs (suite, graph gate, falsify suite1-3, tamper, mutants, search, lies in 4 slices, lifetime-falsify `--parallel 3`, the 6 checks, typed tsc, CLI pins; mutate-one and types-check alone, after, since both write into this tree's `typed/`), longest first, at most 8 slots and 14 GB declared at once, each under its own watchdog, jobs run with `FLOW_DEFER_UNKNOWN=1` and any the load answered rerun alone; exit 1 when any job exits nonzero | 115 s wall, 19/22 exit 0: the three known reds only (search `chain`, tamper's control on the lock, the suite on the lock) | each job's stdout kept in `--out`; its ok/BAD lines diffed against 0d (below) |

How 0a works, and why not a plain freeze: JavaScriptCore takes a frozen array off its fast paths (`includes`, `map`, `every`, for-in over
frozen buckets): the old `FLOW_DEEP_FREEZE` cost 6 s and 350 MB on the suite. A weak table of every guarded value cost more in GC (23.8 s).
So a plain object is frozen (a write throws where it happens; in a step that is Fatal), and an array is fingerprinted by its length and
each element's identity (two 32-bit mixes; objects and strings by a per-guard id) and checked when the harness replays, at the start and
at the end of each replay (the logged worlds; a replay's own worlds are frozen, not fingerprinted, see below). A frozen object is taken as guarded with all it holds. Limits, stated: a
class instance or Map in a world (MailQ) is not guarded; an array's non-index properties are not; a moved array is found at the replay,
not at the write, so a case reads red as "S11 replay differs: writtenInPlace", never green. The two lies are red without the guard too
(by other oracles); with it they are red by the guard's own words. `FLOW_NO_FREEZE=1` turns the guard off, for measurement only.

`FLOW_COPIES_CHECK=1` (drive.ts): on every hit of the copies memo, the copies are recomputed with no side effect (no Slot run counted, no
armed throw spent) and compared with the hit (list, resets, Slot tape); a difference throws. Costs about 25 s on the suite, so it stays off
by default and in every gate; run once per pass.

`--rss-mb` 2600 for mutate.ts: mutate.ts runs each mutate-one `--serial`, so its tree is one suite at a time, measured at 1.80-1.85 GB;
2600 is about 40% over that, and still stops a mutant that balloons (11.9 GB in round 1) long before the machine is short.

Memory, what is left (step 3's measurements): with a 150 MB threshold the suite peaks at 745 MB in 31.7 s; adaptive (live + 100 MB)
629 MB in 45 s; minor collections do not help (1.3-1.5 GB). The limiters: DRV-01 makes 2160 harnesses its body may still read until it
returns, so none can be ended early without a scenario change (247 MB live at its end); R10-RUNTIME's listener variant logs about 110k
steps, kept for S11's replay (about 195 MB live during the replay), and JavaScriptCore's RSS stays at 3-4 times the live heap between
collections. 250 MB is kept: the time target is the tighter one.
The replay's own worlds are frozen (objects) but not fingerprinted: a table of them kept every replayed world alive to the end of the
replay. A deterministic step writes the same arrays in place at its run as at its replay, and the run's are fingerprinted (logged).

Corrections and boundaries after the review of a84b1c2a (stated, not hidden):
- An in-place write to a plain object throws where it happens (a step's throw is Fatal). An in-place write to an array is detected at
  the replay, which every tracked harness gets at its case's end (and at its early end), so such a case is red, never green; until then an
  identity-keyed memo (the copies memo, `stateText`'s last answer, the replay's pairs) may serve the old value. Arrays are not frozen
  because a frozen array costs the suite 6 s of 17 (measured, the old `FLOW_DEEP_FREEZE`). Not covered: harnesses no case tracks (SEARCH-*
  cases, search/run.ts), which are never replayed; their objects are still frozen.
- drive.ts's own guard of `version()` finds nothing for round-14 (its adapter has already frozen that world, and a frozen object is taken
  as guarded); it is there for a Port whose `version()` returns an unguarded world.
- The guard skips what is not a plain object or array: MailQ (which appends to its buffer in place, by design, mailq.ts), Map, Set, Date,
  class instances. Safe for the memos because none keys on them: the copies memo reads leaves and memories, the replay compares MailQ
  and other non-plain values by their canon text every time (never memoised). Fixtures that put a Map or Set in memory exist
  (typed/round8.ts `NoteMap`, `BadReset`; round9 `spinRead`'s Set; a Set-valued `resetOn`): a runtime writing into such a value in place is
  not caught by the guard.
- `FLOW_NO_FREEZE=1` now says on stderr that nothing is guarded.
- A load trip never counts as a catch: falsify, lifetime-falsify and mutate.ts drop CLOCK_TRIP FAIL lines, rerun alone, and if the alone
  run is still the load's (a clock trip, or for falsify and lifetime a time kill), the part fails as unknown and exits nonzero; mutate.ts
  keeps unknowns in the denominator, lists them and exits 1; mutate.ts reads mutate-one's `unknown` too. Planted in a scratch copy (clock at
  0 ms): a no-op lie whose only FAILs are trips reads "red by a named oracle: 0 of 0" (BAD) plus "unknown under load"; a lifetime wrong
  runtime that only trips reads "0 red" (BAD) plus unknown. lifetime-falsify takes `--parallel N`, each wrong runtime in its own copy.
- The search engine keeps the suite's work on an ended harness off the search's deadline (FRAG-15 asks 8 s for 1200 states; the search
  completes at 642 states in about 3.4 s idle). FRAG-15 and SEARCH-ODD-SMALL still stop on a wall-clock deadline at all, which a loaded
  machine can reach before their state bound, and a `--no-output` run would then pass with less coverage (a plain run is red by output).
  That predates this pass; making them deterministic changes the scenarios' text, an expected-result change for the user, so it is left.
- With `onePre`, the engine checks the shared parent's state hash after its actions and fails the search if a guard or an edge oracle
  wrote to it (`stored()`, for one, settles). No search does today.
- Serials (drive.ts `WHO`) advance when an early end replays mid-case. They are a symbol key, read only for equality (pairing a delivery
  with its incarnation); no text, hash, output or message holds their value (checked by grep), and outputs and RECIPIENTS are identical.
- Step 4 (`encodeRecord` memo) not done: profiled at 133 ms inclusive of a whole suite, no gain worth a cache.
- (Opus review of a84b1c2a) Each logged guard now decides "already walked" by its own set, not by `Object.isFrozen`, so an array in a
  shared constant (for one, `emptyWorld`) frozen by an earlier harness's guard is fingerprinted by every later harness's guard too. The
  world a step starts from is the last logged one, or `emptyWorld` and a boot's restored world, both published through `version()` and
  logged by the boot's step. drive.ts's guard of `version()` freezes only (objects), and its never-firing array check is removed.
  An ended harness also refuses `release` and `subscribe`. Lie marks checked without the guard (`FLOW_NO_FREEZE=1`): `w.patch-in-place`
  is "red by Attempted to assign to readonly property: 0 of 534" and `w.row-in-place` "red by writtenInPlace: 0 of 649" (both BAD): the
  marks come from the guard alone; both are red there by other oracles.
