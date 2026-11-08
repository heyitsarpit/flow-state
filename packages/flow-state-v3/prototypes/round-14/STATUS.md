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

`--rss-mb` for mutate.ts: 2600 at 93005ef6, now 2000. mutate.ts runs each mutate-one `--serial`, so its tree is one suite at a time:
measured after step 3 at 1354-1397 MB (control, twice); 2000 is about 45% over that, and stops a mutant that balloons (11.9 GB in
round 1) long before the machine is short.

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

End gates (2026-11-08, after c4acf0dc; one `gates.ts` run, 22 jobs, up to 8 slots; wall and peak are under that load):

| Gate | Exit | Wall | Peak |
| --- | --- | --- | --- |
| suite `--no-search` | 1, the lock only (834/834, by output 0, removed none, catalog none) | 32.4 s (18.1-18.5 s alone) | 1301 MB (1.0-1.3 GB alone) |
| suite, `FLOW_CANON_CHECK=1` | 1, the lock only; 205650 steps, 0 differ | 30.7 s | 1393 MB |
| suite, `FLOW_COPIES_CHECK=1` | 1, the lock only; 186075 hits, 0 differ | 43.9 s | 1205 MB |
| mutate-one (alone, after) | 0, `killedBy` null | 21.3 s | 3393 MB |
| graph-gate | 0, GRAPH PASS | 26.9 s | 1068 MB |
| falsify suite1 / suite2 / suite3 | 0 / 0 / 0 | 41 / 89 / 32 s | 1237 / 1366 / 955 MB |
| falsify tamper | 1, control red on the lock only | 6.5 s | 329 MB |
| falsify mutants | 0 | 94 s | 1267 MB |
| falsify lies, 4 slices | 0 each (77 lies) | 38-56 s | 1036-1181 MB |
| falsify search | 1, `chain` (known) | 59 s | 320 MB |
| lifetime-falsify `--parallel 3` | 0, 57 of 57 red | 14.3 s | 1832 MB |
| checks (6), typed tsc, CLI pins | 0 each | 0.1-4.1 s | under 300 MB |
| all, by `gates.ts` | 1 (the three known reds) | 115 s | |

0d diff: falsify suite1, suite2, suite3, mutants: ok/BAD lines identical; lies: identical but the two new lies (both ok); lifetime-falsify:
identical but the copy's temp-folder name in four FAIL texts (each wrong runtime now has its own folder); the 18 broken-runtime suite
outputs identical (source positions and the lock's id list normalised); the suite's SUMMARY and RECIPIENTS identical but the unlogged
`file:`/`round:` ids.

Targets: suite 15 s in one process: missed, 18.1-18.5 s alone (17.2 s at CP1; the guard costs about 2 s, measured 19.2 against 17.3).
Peak RSS 600 MB per suite process: missed, 1.0-1.3 GB (1.82 GB at CP1); limiters above (DRV-01's 2160 live harnesses; R10-RUNTIME's
110k-step log; JavaScriptCore keeping RSS at 3-4 times the live heap); 630 MB is reachable at 45 s. Fast loop 30 s: met (checks, typed
tsc and CLI pins under 6 s together). Every final-commit gate within 10 min at up to 8 in parallel: met, 115 s for all.

Left for the runner: one relock covering CP1 and CP2 (`bun main.ts ... --no-search --hashes`); FRAG-15's and SEARCH-ODD-SMALL's wall-clock
deadlines (an expected-result change, the user's).

## Verdicts (CP3, 2026-11-08)

The build of `conformance/VERDICTS-PROPOSAL-2.md`: one reading of a child's run (`conformance/verdicts/`), every gate and the scheduler
on it. Baselines at c73ad862, before any change, in the session scratchpad `cp3-baseline/` (gates.ts, the 18 suite runs, an exported
tree of the old commit for black-box runs, and mutate.ts over `mutants.ts` slices 1-11).

| Step | State | Commit | Evidence |
| --- | --- | --- | --- |
| 0 baselines | done | (before c73ad862 changed) | `gates.ts` 115 s, 19/22 exit 0 (the three known reds); 18 suite runs; old mutate.ts over 196 mutants in 13 slices of 16: 157 killed, 16 survived, 3 invalid; slices 12-13 stop up front, list rot (`drain-not-waited`, `h2-json-only` no longer apply) |
| 1 module | done | (this) | `verdicts/verdict.ts`, `read.ts`, `spawn.ts`, `runner.ts`, `snapshot.ts`, `state.ts`, `limits.ts`; smoke runs of every ending (pass, fail, threw, EMFILE, 1 MB stderr, 20 MB stdout, time, memory bound and near) read as section 2 says, alone attempts never overlapped (`events()`) |
| 2 consumers | done | (this) | main.ts (entry) over suite.ts (library), the six checks, typed compare and date check, CLI pins (`program`), gate5s, graph-gate, mutate-one, mutate, lifetime-falsify, falsify, search/run.ts, gates.ts, watch.ts (a person's CLI now); `gates.ts` minus plants: 126 s, 19/24 ok, BAD only the suite, canon and copies on the lock, tamper's control on the lock, search `chain`; falsify and lifetime ok/BAD lines identical to the baseline but the rows below |
| 3 landing measurements | done | 2d103851 | below, "Landing measurements" |
| 4 plants | done | 2d103851, 5614feda | `plants/plants.ts` (69 standing items, the `verdict plants` job, 14-21 s); `plants/blackbox.ts` (the old/new driver); below, "Plants" |
| 5 standing checks | done | 2d103851 | S1 `plants/reader-check.ts` (a child of the plants job): green on the new tree, 179 findings on c73ad862's; S2 and S3 below |

Differences from the baseline so far, each a named row:
- E6/E3: `lifetime-falsify` `life.no-grace` was "6 red" from a run killed at 1500 MB (the partial lines were scored); now the work bound
  stops LIFE-22's spin as a FAIL in 0.8 s and the whole run states 9 red (LIFE-27 and LIFE-30 newly reached). With the provisional 10M bound
  the same run grew past 2.7 GB and read "red by memory, by no named oracle" (BAD), which is E6 as written.
- E13: `suite canon` and `suite copies` are jobs, red on the lock as the suite is.
- Detail text only: falsify search's `dead:` list prints names without quotes; tamper's control prints the reading, not the stdout tail.

Deviations from the design (minimal, each for a reason):
- `suite.ts` holds what main.ts was; main.ts is the entry (`stated`, then a dynamic import), so a throw while loading the suite is `threw`
  (the entry rule). graph-gate, census and the plannedCases readers import suite.ts.
- `Runner.program(job)`: runs a `program` contract (the `flow` CLI, tsc in types-check) and returns the raw run, never `read` (which refuses
  programs) and never rerun; a run that did not end by itself makes the pins unknown.
- The parent kill-limit rule waits for room rather than refusing a launch that only fails to fit beside running siblings; a launch that
  cannot fit even alone is the thrown defect. Budgets beside the design's: `SCRIPT` (1200 MB, checks and scripts), `PROGRAM` (600 MB, the
  `flow` CLI, tsc), `SUITE_PARENT` (3200 MB, gate5s, whose child is a suite).
- Snapshots copy the trees under their common ancestor, with read-only context files (`CATALOG_CONTEXT`: SCENARIOS.md, convergence-1..8,
  machine-design.md), so the gates' suite jobs, which read the catalog, run in copies too.
- The canon and copies checks print their counts on stderr at exit (stdout's last line is the VERDICT); a difference already throws.
- `--hashes` puts the hashes into the lock item's detail, which falsify's pasted-hash tamper reads (it parsed `HASH` lines before).

### The review of 76328de4 (Opus PASS with findings, four sidecars): what was done, row by row

| # | Done | How |
| --- | --- | --- |
| 1 | yes | The budget abort calls `pump`, which starts every queued first attempt (each ends `unstarted: no budget left`) and settles every queued alone attempt as skipped, also while another top holds the lock (lock waits are wall time, so they count). After an alone attempt a top waits two lock polls (400 ms) before taking the lock again, so another top's poll gets it. Plants: `budget: every queued attempt ends …` (free and blocked). |
| 2 | yes | After the child ends, the drain gets `DRAIN_GRACE_MS` (2 s); then the readers are cancelled and `Stream.abandoned` is set, shown in `describe`. Plant: a pipe held by a process that left the tree. |
| 3 | yes | `.then(f).catch(reject)` throughout runner.ts. |
| 4 | yes | `Size.limitMb` (the kill limit); a top admits by kill limits, nested pools by peaks (their parent's kill limit is checked by `parentLimitHolds`). `MACHINE_MB` 16 000; gates.ts `--mb` 16 000; mutate.ts, falsify and lifetime-falsify cap their pools there. mutate-one's row is 2 slots / 3500 MB (kill 7000), lifetime-falsify's 2 slots / 3000 (kill 6000, `--parallel 2`); checks, tsc and CLI pins take `SCRIPT` (400 MB peak, 1200 kill). |
| 5 | yes | The skipped path drops the lock. Ordering: a top registers its intent (`running + 1`) before it reads the lock; a top taking the lock reads the registry after it holds it, so one of the two always sees the other. Residual: a top that registered intent and then sees the lock backs off for one poll. |
| 6 | yes | `stated` exports `FLOW_SCRATCH` (its first snapshot's root); a nested process makes its snapshots inside it, so the top's drop removes them, and a SIGKILLed child's scratch goes with its parent's. SIGHUP joins SIGINT and SIGTERM. |
| 7 | yes | Decision `closed` (from the abort reason) is its own cause, `unknown: closed, its parent ended`. |
| 8 | yes | `killed(decided, sentToLive, signal)`: the watchdog records whether the child was still running when it sent SIGKILL; a signal status from anything else is `signal`, unknown. |
| 9 | kept, by the design | gates.ts keeps `max(2 × peakMb, 3000)` (design 4.4, "existing"), so a job's memory kill is a fail with cause memory, as finding 11 kept. The near band exists where the reference is the control's peak or null (mutants, controls). |
| 10 | yes | `resourceErrno` looks through `cause` and `AggregateError.errors`. A case that throws one is a `machine` item (unknown), not a case FAIL, so an EMFILE inside a case is unknown at every level. |
| 11 | yes | `ps` failures are contained (`table()` returns null, the poll skips the memory reading; time still bounds the run). |
| 12 | yes | The collector counts `VERDICT ` line starts as bytes pass (`Stream.marks`), so a second line in the dropped middle reads `duplicate`; `describe` shows dropped bytes. Plant: duplicate in the dropped middle. |
| 13 | yes | `stated` writes `"\n"` before the VERDICT line. |
| 14 | yes | `verdicts/core.ts` (no dependencies): `MARK`, `EXIT`, `ALWAYS_JUDGED`, `MACHINE_ERRNOS`, `outcomeOfCore`, `resourceErrno`; verdict.ts and state.ts import it. |
| 15 | superseded by R1 | Nothing of the judged kinds scored is **unknown** (the runner's ruling R1, below); it was a fail here at 2d103851. |
| 16 | yes | falsify pins what `odd` and `session` reach on the real runtime: 4000 states, perDepth [1,22,200,1260] and [1,16,133,818] (measured alone, workmax run). |
| 17 | yes | mutate-one: a search item passes on its pinned verdict, fails (a kill) only on `failed` or `vacuous`; any other mismatch is a noted `search-budget` item. Measured in process, alone: `--search-only` store 3000 states inconclusive (15 s with queue), queue **fails on the real runtime** (`(j) a late turn … rule 15`, the same on c73ad862: pre-existing, not a gate), bare inconclusive 7.0 s; `--search` directed completed at 5969 states 33.6 s, chain failed (the known `chain` red), whole `--serial --search` 89 s alone, so `MUTANT_SEARCH.seconds` 270. |
| 18 | yes | E16 (below). |
| 19 | partly | `read.replay` is wrapped (`call`), but replay re-runs the runtime's own log and spends no fake work, so a loop inside it is U1 (time, unknown). `WORK_PER_CALL` was measured on the real runtime only; a mutant needing more work per call than 100 000 reads red (FAIL by the bound), never silent. |
| 20 | yes | One place: `SCRIPT` and `PROGRAM` in limits.ts, measured alone (checks 36-330 MB, tsc 264-275 MB, CLI pins 106-137 MB, flow CLI children under 100 MB); gates.ts reads them. |
| S1 leftovers | stated | `checks/types-check.ts` and `cli/main.ts` read tsc's and `flow`'s output only through `programOutput` (programs under test; reader-check allows a file that uses it). `round-14/j-named.ts` (a round-9 measurement, not runnable on round 14) and `bench/*` (benchmarks) are not gates and not scanned. falsify's watchdog part tests `spawnRun` itself (`decided`, `killed`, `pgrep` exit status). gates.ts, mutate.ts and lifetime-falsify read `run.kind`, `ms` and `peakMb` only for evidence and files, never for an outcome. |

Undocumented deviations, now stated: `FLOW_LIMIT_MB` (a child's own kill limit, so its runner can check `parentLimitHolds`) and `OWN_MB` 300 (a parent's own share); an alone attempt is started only when `max(30, 3 × aloneS)` seconds of budget are left (an upper bound of its limit, since the spec is known only after `open`); `programOutput` returns stderr too (the pins read `flow`'s stderr JSON); two search expectation tables (falsify's `SEARCH_EXPECT`/`SEARCH_REACH` for search/run.ts children, mutate-one's `SEARCH_EXPECT` for its in-process searches), each measured on the real runtime.

E16 (new, a correction class): a child that ends with no answer and no throw (a `process.exit` inside the code under test, a crash by signal) is unknown, not "killed by crash". A throw at load or in a case is still `threw`, a kill (D132 kept for throws).

### The review of 2d103851 and 5614feda: rulings (decided by the runner, for the user) and fixes

Rulings, recorded as decided by the runner:
- R1. Nothing scored is **unknown** everywhere (`outcomeOfCore`, `expect`, every row), not fail. A deviation from the design ("a verdict
  with no scored item is fail"): a run that judged nothing answered nothing. Replaces my row 15 above.
- R2. Memory: kill limits at 2× the measured reference (`MEMORY_MARGIN` 2), so a memory kill is the program's fail. One reference each,
  in limits.ts: `SUITE` peak 1400 (measured 1.0-1.33 GB alone), kill 2800; gates.ts reads it (no second copy), `--mb` defaults to
  `MACHINE_MB`, the script rows' alone time is `SCRIPT.size.aloneS`. The near band survives only where no reference exists (a control,
  peak 0), which reads unknown and is red.
- R3. FRAG-15 and SEARCH-ODD-SMALL assert `[verdict, depthCompleted]` on their state bounds: decided by the runner. Changed lock ids:
  the two case ids; no `output:` id moved.
- R4. Stated limits of the watchdog, accepted: (a) a process in uninterruptible sleep is never reaped: the reap waits `REAP_GRACE_MS`
  (10 s), then the run is read as killed and `unreaped` shows in the reading; (b) a `setsid` grandchild born and reparented to launchd
  between two 40 ms polls is never in the tree: its memory is not counted and it is not killed; its pipes are bounded by the drain grace;
  (c) on macOS a foreign SIGKILL in the same tick as our decision reads as ours, since the status carries no sender. Each is accepted
  because closing it needs kernel help (a process-tree cgroup or `kqueue` NOTE_EXIT tracking) that the harness has no seam for; each can
  only make a run unknown or a kill attributed to us, never a pass. `leftovers` (and `unreaped`, and polls with no `ps` table) now show
  first in `describe`.

Fixes:

| # | Done | How |
| --- | --- | --- |
| 1 | yes | `endTree` reads the table first, then kills every pid of the tree and the group (the root is no longer killed before the read). |
| 2 | yes | `plants/blackbox.ts` is a `stated` gate: each plant carries its Old and New patterns (`expect.old`, `expect.new`, `not` for absences); an edit that does not apply, or any pattern that does not hold, is a fail item; exit nonzero on any. |
| 3 | yes | `--commit` (resolved to a full sha), `--side old\|new` and `--tree` are required; the export lives at `<tree>/<sha>/pristine` with a `.commit` file checked on every run; old or new edits and commands come from `--side`; each plant gets its own `TMPDIR` and `FLOW_VERDICTS_DIR` under its work dir, and after each plant every process whose command names that work dir, or that descends from the plant's child, is killed by exact pid. |
| 4 | mostly | Added black-box B2 (new side only: the old needs 240 + 240 s of watchdog), B7, B8b, B16, B29 (SIGINT, SIGTERM, SIGALRM), B30 (a garbled VERDICT); standing forms of B1, B5, B17 in plants.ts; B27 is the measurement section below; B28's alarm is 295 s, past the check's own 200 s limit plus its 30 s alone rerun. Not built: B9 (a lie that fails only past state 600 at depth 5; the deadline it tested is gone and B3/B4 show load-independence), B14 (two reruns overlapping inside an old mutate-one; the new runner never reruns nested, shown by the standing two-top and alone plants). B3 and B4 run on `main.ts --only PAY-01` and on `gate5s.ts` rather than `mutate-one --serial --search`: the clock trip lives in drive.ts's settle, reached the same way by every gate, and the shorter command fits one 5-minute run per side. B26 has an explicit command per side (no edit: the plant is the budget, not the code). |
| 5 | yes | One handler for SIGINT, SIGTERM, SIGHUP, SIGALRM: the first starts a tidy bounded by `TIDY_MS` (15 s) and a backstop timer that writes a minimal VERDICT and exits; a second signal does that at once. |
| 6 | yes | The lock holds `pid\|start` (ps `lstart`); a holder is alive only with the same start, so a reused pid holds nothing; `openSync("wx")` failing with anything but EEXIST, or a lock that cannot be read, is never removed; registry entries carry the start too. A top with no budget waits at most `LOCK_WAIT_MS` (600 s) for the lock, then the rerun is skipped with that reason. |
| 7 | yes | The reap after a kill is bounded (`REAP_GRACE_MS`, `unreaped` in the reading); `ps` runs with a 5 s timeout and a failed table counts in `blindTicks`. |
| 8 | yes | `read` returns `none: abandoned` for an abandoned stdout; notices come first in a row's text. |
| 9 | yes | `stated` installs `uncaughtException` and `unhandledRejection` handlers that end the process with a VERDICT (`defect`, threw); every runner chain ends in `.catch(reject)`. |
| 10 | yes | falsify: `odd` and `session` run at depth 3, where they complete within 4000 states (measured alone: 1483 states, perDepth [1,22,200,1260], 2.2 s; 968 states, [1,16,133,818], 0.7 s); pinned `completed` plus states and perDepth. mutate-one: store at depth 9 (completed, 1810 states, 8.2 s), bare at depth 5 (completed, 2491 states, 5.4 s), directed pinned at 5969 states; only `inconclusive` is a `search-budget` note, any other mismatch is scored. |
| 11 | yes | A case that hits the work bound is a `work-bound` item (always judged, so still a kill; not a named-oracle catch: lifetime-falsify, falsify's lies and mutants count `case` items only). `do`/`send`/`release`/`start`/`raw`/`subscribe`/`stored` are wrapped as the 4809 measurement was. Replay marks the work per replayed step (the runtime's replay spends no fake work, so a loop inside one replayed step stays U1). |
| 12 | yes, and it is now red | Coverage is keyed on the full case name. LIFE-19, 20, 25 and 26 do not exist (numbers never used). With full names, 34 cases are never red on any wrong runtime: 32 are variants of the wider families the list includes (PAY-16's 12, REV8-PINS's 18, FRAG-08 1, REV5-H5H6 1) and two are lifetime variants, `LIFE-04/detach-then-ensure-in-one-task-ends-nothing` and `LIFE-24/ensure-then-subscribe-in-one-task-keeps`. lifetime-falsify is BAD on that item until the wrong-runtime list covers them or the list is narrowed: not my call (an expected result outside the E rows), reported. |
| 13 | yes | Added ENOBUFS, EADDRNOTAVAIL, ETXTBSY, EDQUOT, ERR_OUT_OF_MEMORY and RangeError "out of memory". The scenario rewraps (round5 :183, round7 :305, round8 :782, round12 :151) are in-process only and lose the code: a resource errno inside one of those reads as that case's FAIL, stated here, not changed (each rewrap is under the lock). |
| 14 | yes | reader-check exempts plants.ts and types-check.ts by line patterns (planted sources, the plant's own `pgrep`/`ps`, tsc read through `programOutput`), each with its reason; whole files only for blackbox.ts, watch.ts and reader-check.ts. |
| 15 | yes | The parent-limit wait checks the abort (unstarted); `FLOW_RUN` empty reads as `top` in both state.ts and spawn.ts. |
| 16 | recorded | `queue` (mutate-one `--search-only`, `(j) a late turn … rule 15`) is a known red of round 14, with `chain`, to diagnose; it blocks `mutate.ts --search-only` controls as `chain` blocks `--search`; the searches are unchanged. |

### Landing measurements (each alone, nothing else running, 12 cores / 24 GB)

- `WORK_PER_CALL` = 100 000. An instrumented copy (max of `spentInCall` at every depth-0 harness call) over the suite, its 5 s pass, its swap
  pass and the 14 searches of falsify at depth 4 / 4000 states: largest 4809 (ORDER-04/a-legitimate-hour-of-polling, the same in all three
  suite passes); searches at most 111 (chain). 20 × 4809 = 96 180, next power of ten 100 000. A no-task spin and a re-armed timer reach it in
  6-8 ms (plants), a slow settle on the planted runtime in 0.2 s.
- Search budgets (each at most a third of its watchdog): falsify's 14 searches (`SEARCH` 120 s): largest odd 17.3 s, session 7.2 s, the rest
  0.3-5.5 s, peak 292 MB; mutate-one in process (`MUTANT_SEARCH`, 270 s = 3 × the 89 s whole `--serial --search` run): directed 33.6 s (5969
  states, completed), chain 0.8 s (failed: the known `chain` red), `--search-only` store 15 s (3000 states, inconclusive, pinned), bare 7.0 s
  (inconclusive, pinned), queue fails on the real runtime (pre-existing, same on c73ad862); FRAG-15 5.8 s under load / 3.4 s alone (`SUITE`
  240 s), SEARCH-ODD-SMALL 0.7 s; search-vacuity's 6/30 search 0.3 s in its check.
- Each gates.ts job alone, in alone mode (`FLOW_ALONE=1`, serial inside), seconds and tree peak MB: suite 18.7 / 1332; canon 29.3 / 1304;
  copies 42.3 / 1294; mutate-one 55.2 / 1439; graph-gate 15.1 / 1278; falsify suite1 22.8 / 1270, suite2 54.7 / 1423, suite3 17.8 / 975, tamper
  4.8 / 397, mutants 59.6 / 1271, search 29.8 / 358, lies 31.6, 28.5, 23.1, 21.2 / 1084-1224; lifetime-falsify 22.3 / 489; checks 0.1-0.5 /
  36-319; typed tsc 0.2 / 264; CLI pins 4.8 / 106; verdict plants 14-21 / 745-886. The rows' `s` are these, rounded up; their `mb` stay the
  declared peaks (all at or above the measured ones), and the kill limits follow `max(2 × mb, 3000)` or the row's budget.
- Reference peaks (final, limits.ts): `SUITE` 1700 MB with a 3400 MB kill, over the largest measured suite process (1360 MB alone, 1423 MB
  for a falsify tree under load) with about 25% margin; `SUITE_PARENT` 3800, `MUTANT` 4200 (each at least its children's kill plus 300 and 2×
  the control's measured peak, 1396-1438 MB, checked at launch); every gates.ts row's reference is `GATE_ROWS` in limits.ts.

### Plants (black-box, asserting: `plants/blackbox.ts --commit … --side …`; Old c73ad862, New 817fead9)

Every row below is now an item of the driver, which checks the side's patterns: **Old 28 of 28 ok, New 31 of 31 ok** (B2 new only), each
run with its own `TMPDIR` and lock directory, strays killed by pid after each plant (B28 old left its check running; B29 old left 2
processes per signal; both counted, then killed). Rows added in the second round: B2 (new: `UNKNOWN plant.hang: budget`, exit 2, at the
280 s budget), B7 (old: `ok plant: 6 red` from a run killed at 1500 MB, the partial lines scored; new: `UNKN plant`, budget, exit 2), B8b (a
timer re-armed at `now`, LIFE-02: old no answer before alarm 120 s; new FAIL by the work bound in 0.2 s), B16 (an edit to the runtime after
the control line: old both wrong runtimes "0 red", the edit reached their copies; new both red as usual, no trace of the edit), B29 SIGINT,
SIGTERM, SIGALRM to `gates.ts` after 20 s (old: 2 processes left each; new: none left, VERDICT `interrupted by …`, exit 2), B30 (a garbled
VERDICT: old ok; new `UNKN: garbled`).

| Plant | Old (observed) | New (observed) |
| --- | --- | --- |
| B1 swap fixture wrong, `gates.ts --only mutate-one` | `ok mutate-one`, exit 0, `killedBy` swap ignored (**wrong**) | `BAD mutate-one`, killed by swap, exit 1 |
| B3 slow settle (pending true for 10^9 checks), the suite on PAY-01 | alone PASS in 12.3 s; loaded (`taskpolicy -c background`) FAIL by `CLOCK_TRIP` (**wrong**: load decides) | alone and loaded the same FAIL, `did not quiesce in 100000 work units`, 0.2 / 0.6 s |
| B4 the same edit, gate5s | alone exit 0; loaded exit 1, PAY-01 unexpected (**wrong**) | alone and loaded the same, red by the work bound |
| B5 4 GB inside LIFE-10, lifetime-falsify | `ok control: 60 pass` of 119, "every lifetime mutant goes red" (**wrong**: a partial control) | `UNKN control`, memory near the limit with no reference, exit 2; coverage follows the control |
| B6 4 GB at the mutant's adapter boot | KILLED, watchdog rss at 2811 MB | KILLED (by the suite gate, whose child was killed by memory: a bound; the same verdict) |
| B8 pending always true, PAY-01 | FAIL `CLOCK_TRIP` after 20.2 s (**wrong**) | FAIL by the work bound in 0.2 s |
| B10 1 MB to stderr in mailq-check | ok (not reproduced: Bun drops pending stderr at exit, nothing blocked) | ok |
| B11 4 GB in mailq-check | BAD exit 137 | BAD, killed by memory (bound) |
| B12a a rotted lifetime edit | no final line before alarm 120 s (**wrong**: a hang) | `BAD life.no-grace: does not apply`, exit 1, at once |
| B12b a job whose binary does not exist | crash, no GATES line, exit 1 (**wrong**) | `UNKN plant: unstarted ENOENT` (again, alone), the other job ok |
| B13 a commutative `+` swapped, claiming PAY-01 and claiming nothing | both SURVIVED, exit 0 (**wrong** for the claiming one) | claiming: fail, exit 1; claim-less: noted |
| B15 `sh -c 'sleep 0.99'` under 1 s, 50 times | 21 of 50 "killed time" with exit 0 (**wrong**) | 48 not killed; 2 killed with a SIGKILL status; never killed without one |
| B17 the canon check always differs, `--only "suite canon"` | `GATES 0/0`, exit 0 (**wrong**: no such job) | `BAD suite canon` (834 cases red by S11) |
| B18 score-check `process.exit(0)` first | ok (**wrong**) | `UNKN`: silent, after an alone rerun |
| B19 old: `FAIL x`, exit 0; new: a pass VERDICT, exit 1 | ok (**wrong**) | `UNKN`: disagree |
| B20 a mutate-one that prints a forged answer after its own | SURVIVED (**wrong**: the forged line won) | UNKNOWN: duplicate VERDICT lines (2), after an alone rerun |
| B21 the answer on stderr only | ok | `UNKN`: silent |
| B22 SIGTERM to itself | BAD, exit 143 | `UNKN`: signal SIGTERM |
| B23 a throw at the adapter's top level | KILLED, crash | KILLED (`threw`, D132 kept) |
| B25 20 MB to stdout, then finish | ok | ok, `[stdout: 11534348 bytes dropped]` in the reading |
| B26 frag search, depth 9, 50 states | exit 0 on inconclusive (**wrong**) | fail: inconclusive, completed expected |
| B28 front-check `while (true) {}`, `mutate-one.ts` by hand | no answer before the 290 s alarm, and the check left running (`spawnSync` unbounded; killed here by pid) (**wrong**) | VERDICT in 280 s: `checks/front-check.ts` unknown: time, every other gate pass, exit 2 |

Not built: B2 old (240 + 240 s of watchdog, past a 5-minute command), B9, B14 (reasons in the fix table, row 4), B24 (`ulimit -n 40`
gave no EMFILE on either commit; the errno mapping stands white-box). In the first round, eight drivers sharing one lock directory made
each other's alone reruns wait (as designed); since the second round every plant has its own.

Standing (plants.ts, 74 items, every one green on the new tree, in the plants job nested and as a top): the standing forms of B1, B5 and B17;
`read` on built runs for every ending (20 rows, including the race, `sh` exit 137, a tool exiting 2, a duplicate in the dropped middle, a
kill at close, an abandoned stdout, an empty VERDICT), `killed`,
`outcomeOf`, `expect` (none, bound, failed names, nothing judged, a short control), `aloneLimit`, the parent limit, `mutantItem` (5),
snapshots and list rot (4), the work bound (2), live children (14: 1 MB stderr, 20 MB stdout, silent, disagree, forged, foreign, stderr-only,
SIGTERM, a throw at load, EMFILE, a time kill, memory far and near, unstarted and a throwing `open`), every started attempt ended, the
search expectation, S1, the budget (free and while another top holds the lock), pipes held after the child ends, two tops alone one after
the other, and SIGINT.

### End gates (2026-11-08, at 5614feda; exit, wall, peak)

Final, at 817fead9. `bun gates.ts` (default budget 600 s): exit 1, 143 s wall, 19/25 ok; BAD: the suite, suite canon and suite copies on
the lock (E13), tamper's control on the lock, falsify search on `chain` (known), and lifetime-falsify on the full-name coverage (fix 12,
new, reported). No unknown, no alone rerun. Tree peaks per job: suites 1193-1337 MB, mutate-one 2374, graph 1064, falsify parts 309-1377,
lies 1086-1189, lifetime 660, plants 1407. (At 5614feda, before the second review: 142 s, 20/25, the same reds but lifetime.)

Serially, alone, at 817fead9 (wall; peak of the largest process, `time -l`):

| Gate | Exit | Wall | Peak |
| --- | --- | --- | --- |
| suite `--no-search` | 1, the lock only (834/834, by output 0, removed none, catalog none) | 18.4 s | 1360 MB |
| suite, `FLOW_CANON_CHECK=1` | 1, the lock only; 205650 steps, 0 differ | 28.9 s | 1299 MB |
| suite, `FLOW_COPIES_CHECK=1` | 1, the lock only; 186075 hits, 0 differ | 42.5 s | 1309 MB |
| mutate-one | 0, 13 gates pass | 49.6 s | 1337 MB |
| graph-gate | 0, GRAPH PASS | 14.8 s | 1173 MB |
| falsify suite1 / suite2 / suite3 | 0 / 0 / 0 | 22.3 / 53.0 / 17.5 s | 1214 / 1305 / 911 MB |
| falsify tamper | 1, control red on the lock only | 4.7 s | 279 MB |
| falsify mutants | 0 | 58.7 s | 1179 MB |
| falsify lies `--parallel 4` | 0, 77 lies | 34.3 s | 1076 MB |
| falsify search | 1, `chain` (known) | 19.2 s | 231 MB |
| lifetime-falsify `--parallel 2` | 1, control 119, 57 of 57 red; coverage BAD (34 never-red full names) | 12.9 s | 381 MB |
| checks (6), typed tsc, CLI pins, plants | 0 each | 0.05-0.5 s, 0.17 s, 4.6 s, 23.9 s | 51-274, 274, 80, 1330 MB |

`mutate-one` and `--search`: see the measurements; mutate.ts: below.

### S2 parity against the baseline (cp3-baseline)

- The 18 suite runs (real, null and seven broken runtimes, plain and `--no-output`): the same PASS/FAIL set and the same RECIPIENTS line in
  all 18. Text differences only: stack frames name `suite.ts` and drive.ts's call wrapper where they named `main.ts`; the stale-lock count;
  on `constantHash`, FRAG-15 and SEARCH-ODD-SMALL fail with the new assertion's words (`["vacuous",1]`, E7), red before and after.
- falsify suite1-3, mutants, lies, tamper: identical ok/BAD lines but tamper's control detail (the reading, not the stdout tail). falsify
  search: identical but the `dead:` list format, and `odd` and `session` now `completed` at depth 3 (were `inconclusive` at the 4000-state
  budget, E7 / fix 10). lifetime-falsify: identical ok/BAD lines but `life.no-grace` 6 red → 8 named red plus LIFE-22 as a `work-bound`
  item (E3, E6), and the new coverage item (fix 12).
- gates.ts: the same three known reds; plus suite canon and copies, now jobs (E13), red on the lock; plus lifetime-falsify's coverage.
- The 18 suite runs repeated at 817fead9: the same PASS/FAIL sets and RECIPIENTS lines in all 18.
- mutate.ts: below (L1).

### S3 determinism

The VERDICT items of every gate in the loaded `gates.ts` run (8 slots, copies) and in the serial alone runs (in the tree) are byte-identical:
20 gates compared (typed tsc has no VERDICT line), 0 differ; at 5614feda and again at 817fead9.

### Changed lock ids, for the runner's log

- Case ids: `FRAG-15`, `SEARCH-ODD-SMALL` (E7, R3 decided by the runner: each asserts the verdict and depth its search reaches on its
  state budget, `completed` at 5 and 2; the deadline is gone). Their outputs (`output:` ids) are unchanged: 834/834, "by output alone: 0".
- No `output:` id and no RECIPIENTS line changed.
- File ids changed or new (harness code; one reason each): `file:main.ts`, `file:suite.ts` (new), `file:limits.ts` (new), `file:verdicts/*.ts`
  (new: core, read, runner, snapshot, spawn, state, verdict), `file:plants/*.ts` (new: plants, blackbox, reader-check), `file:drive.ts`,
  `file:fake-world.ts`, `file:falsify.ts`, `file:gate5s.ts`, `file:gates.ts`, `file:graph-gate.ts`, `file:mutate.ts`, `file:mutate-one.ts`,
  `file:watch.ts`, `file:search/*.ts`, `file:scenarios/frag.scenario.ts`, `file:scenarios/round4.scenario.ts`; round ids `round:adapter.ts`
  (the canon count on stderr), `round:checks/*.ts`, `round:cli/main.ts`, `round:typed/compare.ts`, `round:typed/date-check.ts`,
  `round:typed/census.ts`, `round:run-plants.sh`. `--hashes` prints them.

### Cut short (the user's word): the lock removed, the last runs

- C2 done, a deviation: the cross-process alone lock and its registry are gone from `verdicts/runner.ts`. Alone reruns are serialised
  inside one top process only; two top-level runs at once are no longer supported (they can overlap their alone reruns). Rows 1, 5 and
  fix 6 above that mention the lock, the two-top plant and the budget's "blocked" variant no longer apply; plants.ts has 73 items, all
  green. A budget-gone attempt reads `unstarted: no budget left`; other unstarted throws read through `classify` in `verdicts/core.ts`.
- The suite (`main.ts --round 14 --no-search`), once: 834/834, by output 0; the same PASS/FAIL set and RECIPIENTS line as
  `cp3-baseline`; exit 1 on the lock only (unlogged FRAG-15, SEARCH-ODD-SMALL, REV7-M2, REV8-PINS, R12-BOOT and file ids).
- `bun gates.ts`, once: exit 1, 151 s, 19/25 ok, 0 unknown. BAD: suite, suite canon, suite copies and tamper's control on the lock
  (E13); falsify search on `chain` (known); lifetime-falsify coverage (34 never-red full names). No case verdict or output changed
  beyond the named E/N rows.

## Round 14 finish (2026-11-08)

Lead (Opus) plans, decides, fixes the runtime, reviews every sidecar diff and alone commits; up to 4 Haiku sidecars.

Plan:

| Task | Who |
| --- | --- |
| 1 `chain` red: decide runtime or oracle from the design, fix | lead |
| 2 `queue` red (mutate-one in process): same | lead |
| 3 `fragstore.row` depth 7 (rule 17): run, trace, diagnose | runner sidecar runs and traces; lead decides |
| 4 `listen.load`: same | runner sidecar runs and traces; lead decides |
| 5 the 34 never-red lifetime cases: one-edit wrong runtimes, or a reason why not | 4 coder sidecars, one file each: `mutants-lifetime-pay16.ts` (PAY-16 ×12), `-pins-a.ts` and `-pins-b.ts` (REV8-PINS 9 + 9), `-misc.ts` (FRAG-08, REV5-H5H6, LIFE-04, LIFE-24); spread into `mutants-lifetime.ts` |
| 6 gates, STATUS, commits | lead |

Log (start-end, who, redo):

| Task | Start | End | Who | Redo |
| --- | --- | --- | --- | --- |
| plan, group files wired | 08:40 | 08:50 | lead | |
| 1 chain: trace, cause, oracle fix, budgets pinned | 08:42 | 09:03 | lead | |
| 5 PAY-16 ×12 mutants | 08:51 | 08:54 | coder (Haiku) | none |
| 5 REV8-PINS ×9 (a) mutants | 08:51 | 08:53 | coder (Haiku) | none |
| 5 REV8-PINS ×9 (b) mutants | 08:51 | 08:55 | coder (Haiku) | none (it broke the Write/Edit rule once and said so) |
| 5 FRAG-08, REV5-H5H6, LIFE-04, LIFE-24 mutants | 08:51 | 08:54 | coder (Haiku) | none |
| 5 review of the four mutant files, full lifetime-falsify | 08:54 | 08:57 | lead | |
| 3 fragstore.row depth 7 run and replay | 08:57 | 09:00 | runner (Haiku) | none |
| 4 listen.load run, replay, history | 08:57 | 08:59 | runner (Haiku) | none |
| 3 diagnosis, oracle fix, case, wrong runtime | 09:00 | 09:06 | lead | |
| 2 queue: trace, rule 15, option A measured, stopped | 09:03 | 09:06 | lead | |
| 4 listen: shape fix, falsify list | 09:06 | 09:07 | lead | |
| locks: log, outputs, RECIPIENTS, relock | 09:07 | 09:13 | lead | |
| review of the drive.ts rule-17 change | 09:14 | 09:15 | reviewer (Haiku) | its finding was right; lead rewrote the line (a park clears the delivery only after a new ending) |
| gates, STATUS, commit | 09:13 | 09:20 | lead | |
| 2 rule 15 ruling applied: case first, runtime, pin, wrong runtime, locks | 09:22 | 09:40 | lead | |

Gates on the final tree: `bun gates.ts` exit 0, **25/25 ok**, 0 BAD, 0 unknown, 166 s (the first all-green run of round 14: chain, the lock and lifetime coverage were the old reds). Suite 835/835, locked, RECIPIENTS moved by the new variant only (bisected). lifetime-falsify 94 items pass.

Items:

| Item | Cause | State | Evidence |
| --- | --- | --- | --- |
| 1 `chain` | the search's oracle (n). `Writes Dispose KILL`: the dispose's record removal and the commit's acknowledge batch were unacked at the kill (D80), so the disk's first record (n 0) is a record; the drain's `Stop` restores it (2.7.17 send table: ended, persisted, record decodes) and with no use it ends after the grace; (n) read its absent memory as a spin | fixed in `search/chain.search.ts` (gone is not spinning); falsify and mutate-one pin `completed` at depth 4: 6573 states, [1,10,84,711,5767], budget 8000 (4000 stopped at depth 3) | chain completed on the real runtime, 21.8 s alone |
| 2 `queue` | the runtime, once ruled: rule 15's "pending call" includes queued commits (runner ruling, Option A, under the user's delegation); `leavesWork` counted only an InFlight head | fixed: `leavesWork` (turn.ts) also counts a queued commit owned by an exited activation; the queue alphabet drops `refuseOk`/`refuseNo` (an armed fault is not in the state hash, so their subtrees were pruned: same perDepth with and without them, and they made the search vacuous); mutate-one pins queue `completed` at depth 8, 4345 states, budget 6000 (11.5 s alone) | R14-FIX-01/`a-late-ending-may-not-leave-a-queued-commit`: red before by the rule 15 oracle, green after (denied `LateMayNotLeave`, stays in W); wrong runtime `misc.late-leaves-queued` red on it; `mutate-one --search-only`: store, queue, bare pass; `gates.ts` 25/25 ok |
| 3 `fragstore.row` | the oracle. drive.ts keyed rule 17's "delivered once" by Attempt, for good; 2.7.11's storage-refused row delivers a re-send's `unknown { StorageRefused }` again for the same Attempt; parked while away (rule 44), it is owed across the kill (2.7.13), so "delivered once, still parked / restored again" was a false red | fixed: an ending of an already delivered Attempt marks it, and a park of that new ending (outside a boot) clears the delivery; a park with no new ending still counts as delivered (the review's case) | R14-FIX-01/`a-refused-resend-parked-before-a-kill-is-heard-once-after`: red on the old oracle by exactly the search's message, green now; wrong runtime `misc.refused-resend-unheard` (refused re-send not delivered) red on it and PAY-16/resend-refused-capture. The depth-7 search itself now completes at 43508 states either way (see findings) |
| 4 `listen.load` | the harness. `run.ts` passed the shape `"load"` (cast `as never`) to `searchListen`, which ran the no-version fixture without D67's stated-limit excuse (round 5: an unversioned entity can take a late frame; "with versions, the version decides", 2.8 E7). Red since round 7, and falsify asserted it stays red | fixed: `listen.<shape>` takes `version` or `none` only (else throws); falsify and work-peak run `listen.version` (completed, 1184 states) and `listen.none` (completed, 1755) | the walk `hello other frame.now frame.was` passes on `none` (excused) and `version` (frame refused) |
| 5 34 never-red lifetime cases | no wrong runtime targeted them | done: 35 new wrong runtimes in four group files spread into `mutants-lifetime.ts` | `lifetime-falsify` (92 wrong runtimes then; 93 with `misc.refused-resend-unheard`): control green, every one red, "every case is red on some wrong runtime"; no vacuous case |

Item 2, as stopped (kept as the record; ruled after: Option A, applied). Walk: `Go` (W#1, att-1-1 head), `Go` (W→W re-entry, W#2, att-1-2 queued), `Forget` (to A; cancel of the head), `Go` (W#3, att-1-3 queued), `ack`: att-1-1 ends `NotSent { Cancelled }`, late (W#1 gone), routed from the root; `No: A` exits W#3, which owns the queued att-1-3. The oracle (drive.ts, rule 15) counts any unended attempt as pending; the runtime's `leavesWork` (turn.ts) counts only an InFlight head.
- Rule 15 / 1.6: "a state that owns another pending call" and "a late ending never leaves live work". The row vocabulary (2.7.3, line 735) says `pending` is `InFlight` and `waiting` is `W` not empty, so the words support both readings.
- Option A (recommended): queued commits count; one condition in `leavesWork`. Measured in place and reverted: the suite stays 835/835 with no output change, the queue search passes every oracle (it then reads `vacuous` at 12000 states for `refuseOk`/`refuseNo`, a budget pin to set).
- Option B: only InFlight heads count; the oracle drops queued attempts and the design states that a late turn may leave queued work, which ends late later.
- Not decided here (it fixes the meaning of a guarantee).

Findings for the design:
1. Rule 15's "pending call" was undefined for queued commits (W) under `serialize`. **Ruled (runner, under the user's delegation): Option A.** "Pending" in rule 15's late-ending clause includes queued commits, so "a late ending never leaves live work" (1.6) holds as written. The design text should say so (the row vocabulary's `pending` means InFlight only).
6. A search fault arm (`throwIn`) is not in the state hash, so a search action that only arms a fault is pruned as a seen state: its effect is never searched (the queue search's `refuseOk`/`refuseNo`). Carried to phase 3: armed faults belong in the search key.
2. 2.7.11's storage-refused re-send row means one Attempt can deliver two endings (the first send's unknown, then `unknown { StorageRefused }`), while rule 17's headline says "every commit ends once". Rule 17's "every retry that sends delivers exactly one ending" covers a sending retry, not a refused one; the refused re-send's second delivery should be named in rule 17's text.
3. A re-entering self-transition (`Go` from W to W) gives a new activation, and the queue's earlier commit becomes late: whether `target: self-state` re-enters is load-bearing for rules 14 and 15 and should be stated with them.
4. The send table's "ended, persisted, record decodes: restored ... ends after the grace" applies after a dispose whose removal never landed (D80): a disposed identity can come back by a plain send after a crash. Consistent with the table, but worth a sentence where `disposeActor` is said to make "no record".
5. Oracles that keep history outside the state hash (drive.ts's `deliveredOnce`) make a search's verdict depend on which path reaches a hash first: the depth-7 walk fails by replay but the search completes, because another script reached the same hash first. Search oracles should read only what the hash carries, or the history must join the key (phase 3).

Delegation (the trial): 7 sidecars (4 coders, 2 runners, 1 reviewer), all Haiku, each 1.5-3.5 minutes; 0 diffs redone; one review finding acted on. What worked: one file per coder, spread into the main list, so four ran at once with no clash; runners' replay scripts saved the tracing. What I would change: give runners the oracle code to read up front (the fragstore runner reported the search passing, which needed the lead to see that the oracle is path-dependent); ask coders for the failure text per case in a table (they did); a reviewer on every harness oracle change, since that is where a fix can hide a bug.

### Close-out fix batch (2026-11-08, after the PASS-with-findings review)

Plan: lead does the oracle and runtime parts (items 1-5, 7); three Haiku coders retarget and rework the wrong runtimes (item 6), one file
group each; one Haiku runner measures every search under the new key. Log:

| Task | Start | End | Who | Redo |
| --- | --- | --- | --- | --- |
| 1 armed faults in the state hash | 09:45 | 09:47 | lead | |
| 1 every search under the new key | 09:47 | 09:50 | runner (Haiku) | none |
| 2a keptNames (KeptLetGo; stranded reads asked again, ended, disposed, booted) | 09:50 | 09:54 | lead | |
| 2b refuseNo walk diagnosed, oracle fixed, case | 09:54 | 10:06 | lead | |
| 6 kills name target cases (main list) | 09:56 | 09:59 | coder (Haiku) | none; one target left red only by a throw (case fixed by lead) |
| 6 pay16 + misc rework | 09:56 | 09:59 | coder (Haiku) | kept the two-edit FRAG-08 mutant (no honest one-edit fault) |
| 6 pins rework, closure split | 09:56 | 09:59 | coder (Haiku) | the two single-edit halves were green alone; lead removed them (finding 9) |
| 4 rule 15 refinement, controls, wrong runtimes | 09:59 | 10:03 | lead | |
| 5, 7, 3, locks, gates | 10:03 | 10:15 | lead | |

| Item | Result |
| --- | --- |
| 1 | `stateHash` appends the armed `throwIn` counts (n > 0) only, so fault-free states keep their hashes: every pinned falsify search reached the same states and perDepth. 25 outputs moved by one distinct state each (the armed state), each logged. `refuseOk`/`refuseNo` back in the queue search. chain now completes at 9700 states [1,12,111,995,8581] (falsify and mutate-one repinned, budget 12000); burst completes at depth 4 (253 states; in no gate) |
| 2a | harness false red, as the review said. Also a stranded read: rule 8 says a read's answer is stranded "until that life asks again, ends, or a boot", and the runtime emits no evidence when it goes, so keptNames drops a read's entry on `invoked` of the same read, `ended`/`disposed` of its actor, or a boot |
| 2b | the oracle, not the runtime. Rule 8 (OD38): a refused turn's ending is delivered once more after the mail already queued; the runtime does that when the outcome mapper throws at admission. Three oracle gaps: no handler ear runs on a refusal at admission, so the retry's run was "unaccounted"; `tryAgain` was paid only by an `on.<event>[` Slot (a target-only `No: A` runs none; the retry re-runs the mapper Slot); a kept ending's one try per boot emits `kept` with no `refused`. Fixed all three; case R14-FIX-01/`a-mapper-refused-at-the-boot-is-tried-once-more-after-queued-mail`, red on the old drive.ts by the search's messages; wrong runtime `misc.refused-once-dropped`. The queue search then found a fourth: oracle (e) took a lane record holding only parked endings as no lane (rows come from kept endings); fixed |
| 3 | queue pinned at depth 12, budget 6000: `inconclusive`, 6000 states, [1,5,12,28,79,235,700,2036], depth 7 complete, 15 s alone |
| 4 | `ownedByExited` (turn.ts) shared by the head and queue checks; live work = an InFlight head plus every queued commit of the exited activation, behind a Held head too; a Held head excluded; a key-less cancel of that op in the late transition exempts its queue. Five variants on a new `typed/latequeue.ts` fixture plus the serial-bare walk: two denied, three allowed. Wrong runtimes `misc.late-leaves-queued`, `misc.late-always-leaves`, `misc.late-cancel-ignored`, each red on its targets |
| 5 | chain (n) reads the persisted record when the actor is gone. The chain machine has no schedule, so the "schedule fires in the grace" wrong runtime cannot reach this search; that class stays covered by LIFE-14/15/29 via `life.schedule-fires-unused`. fragstore: `endedAgain` cleared at boot; a delivery counts per ending through `endedAgain` (an ending after a delivery), not a send-keyed set, since a refused re-send's ending has no send id. Wrong runtime `misc.adopted-ending-twice` (an adopted parked ending delivered twice) red on the refused-re-send variant and six others |
| 6 | `kills` names target cases; a wrong runtime passes only if a target fails by assertion (not `threw`). LIFE-24 asserts presence before the grace; R14-ID-01 reads memory with `?.`. Reworked: pay16 schedule mutant (stale valid memory, red at 499 ms), pinsb NaN only, pinsa D84 (a batch inside the drain), pinsa hide (red by its `eq`); closure: the two halves are each green alone, kept as one two-edit mutant (finding 9); `misc.ended-actor-unheard-by-store` kept as two edits (an import and one condition; no honest one-edit fault, the coder showed one candidate at 0 red). lifetime-falsify: 98 ok, every case red on a target |
| 7 | `listen.version.noload` (976 states) and `listen.none.noload` (1326) join falsify's searches and work-peak |

More findings for the design:
6. (above) armed faults: done here.
7. Rule 8's "an ending whose turn is refused (InvalidTurn)" covers a refusal at admission (the outcome mapper throws). The design should say so in 2.5 step 1; the runtime does it.
8. A stranded read, and a kept ending's one try per boot, leave no evidence when they go or are retried; an oracle must infer them. Inspection or evidence should name "stranded read released (asked again / ended / boot)" and a refused kept try.
9. D77 is checked twice (`sealOp`'s `known` and `checkSlots`' walk): either alone refuses the unknown closure, so no single-edit fault is visible to REV8-PINS/D77. Keep both (defence in depth) or drop one; the case cannot tell.
10. `flow check`'s static rule 15 must treat queued commits under `serialize` as pending (the runtime now does); a commit queued behind a Held head too.
11. A head promoted at settlement is the new head before the late turn runs, so the cancel exemption (queued only, as ruled) does not cover it: a late transition that cancels the lane still cannot leave a just-promoted, never-sent head. Whether the exemption covers that head is open.

### Carried to the phase 3 conformance rewrite

- C1, the errno rule: catch sites that rewrap lose the code; reader-check needs recursive rules for them.
- C3, plant reasons and preconditions: B12a, B17 on old, the B15 race, the B11/B4/B9 reasons, the B5 119 and K numbers.
- bare's depth-12 search budget (still pinned inconclusive at 3000 states).
- work-peak re-measured for the current search configurations.
- Done in the round 14 finish (158cb5db): the 34 never-red lifetime cases, `chain`. `queue` done after the rule 15 ruling. Armed faults outside the search key (finding 6).
- Search oracles that keep history outside the state hash (`deliveredOnce`, `keptNames`, `endedAgain`): verdicts depend on path order (finding 5 above).
- Stated OS limits: uninterruptible sleep, `setsid` between polls, a foreign SIGKILL, ResolveMessage EMFILE; and two top-level runs at
  once, unsupported since C2.
- From the last review: partly-blind evidence and leftovers when `ps` fails; the reach pin applies to the control only (not `isTop`);
  the `search-budget`/`search-reach` notes listed in mutate.ts's output.

## Round 15 (2026-11-08)

Round 15 continues in round-14's folder (the runtime is the same one, evolved; a new folder would copy 11k lines for no gain). New: the case
`R15-01` in `conformance/scenarios/round15.scenario.ts`, its fixtures in `conformance/typed/round15.ts`, the wrong runtimes in
`mutants-r15.ts` (spread into `mutants-lifetime.ts`, run by `lifetime-falsify`, which now lists `R15-01`).

| Ruling | State | Commit | Failing first | Wrong runtime |
| --- | --- | --- | --- | --- |
| Rule 15 cancel exemption over a head promoted at settlement (runner) | built at 3703c8cb, then **reverted by R1** (below) | 3703c8cb | `R15-01/a-late-exit-that-cancels-the-lane-may-leave-its-promoted-head`: `no denial: expected [], got [["LateMayNotLeave","LateMayNotLeave"]]` | `r15.late-cancel-keeps-promoted-head`; control `r15.late-promoted-head-not-live` (only a wire head is live) red on the denied control |
| U13 `unknown { Disposed }` past the disposal bound | done: `finishDisposal` (step.ts) calls `endPastDisposal` (lane.ts): the head's ending `unknown { Disposed }` is noted and parked, the head kept Held on disk (mayHaveApplied), W parked after it as `NotSent { Disposed }`; the restore delivers both from the parked list, head first, and the hold stays | 2nd | `R15-01/past-the-disposal-bound-the-attempt-ends-unknown-disposed`: `expected [["unknown","Disposed"],["failure","Disposed"]], got [["failure","Disposed"]]` | `r15.past-bound-captured-inflight` (red: the reload hears W, then Restored) |
| U14 `disposeActor` flushes at once | already true: `flush` (durable.ts) writes a dropped identity's removal `now` (D93) | - | `REV7-D80/D93-a-dispose-is-not-lost-to-a-kill` passes before and after | none new (no one-edit target in the lifetime list; REV7-D80 is not in it) |
| U14 unbound lane listed and reported until adopted or forgotten | partly done: Inspection (`inspect`, adapter.ts) lists an identity's lanes as `unbound` while no record or incarnation binds them; the restore (durable.ts) notes `UnboundLane` per lane record with no actor record, each boot; an ensure adopts (already true, rule 44). **`forget` not built** (see findings) | 3rd | `R15-01/an-unbound-lane-left-by-dispose-is-listed-and-reported-until-adopted`: `listed as unbound under the identity: expected 1, got 0` | `r15.unbound-lane-unreported`, `r15.unbound-lane-unlisted` |
| U2 key-less names only the ending's own Attempt | already true (turn.ts `laneOfAttempt`, D22): FRAG-14 (`[cancel, cancel]`), and new `R15-02/a-key-less-cancel-in-a-keyed-success-handler-does-nothing`, `R15-02/a-key-less-cancel-in-a-not-sent-handler-does-nothing`, green on arrival | 4th | none (green first) | `r15b.keyless-success-names-key-lane`, `r15b.keyless-notsent-acts-live-lane` |
| U3 W's `NotSent { Restored }` before the head's unknown | already true (durable.ts, D107): fixpass `a-dispose-of-that-record-keeps-its-endings-on-the-lane`, R14-FIX-02, new `R15-02/on-a-reload-each-queued-commit-is-heard-before-the-held-head` (two queued) | 4th | none | `r15b.reload-head-before-w` (one edit, so the head is heard twice: red on 9 cases, an artifact; no honest one-edit reorder exists) |
| U5 no `allow` | already true: `Op["concurrency"]` is `reject \| latest \| serialize` (fixtures/compiled.ts), the codec's literals the same (codec/codec.ts); never built | - | - | none (a type-level absence; no case can name it) |
| U8 sends queue until boot | already true (driver.ts, D87): REV7-M2 (queue runs after boot; a read that never answers: `StorageFailure`, runs unpersisted; the queue's bound) | - | - | none new |
| U9 creation checks the type side | already true (compile/memory.ts, D219): new `R15-03/creation-checks-an-input-by-its-type-side-and-refuses-a-transforming-decode` | 4th | none | none possible: the check lives in the typed front end (conformance/compile), outside the runtime tree a wrong runtime edits (so R15-03 is not in lifetime-falsify) |
| U17 versions compare type and encoded side | done. Actor: `identityVersionOf` (compile/ref.ts) hashes `schemaVersion` = structure of the type side and the encoded side, no annotations. Op key: the compiler writes `keyVersion` (each key field with its `schemaVersion`); the runtime stamps and compares lanes by `stampFields` (lane.ts: `keyVersion ?? keyFields`), in `stampOf`, `oldVersionLane` and the restore's `OldVersionLane`. Before, an op key compared field **names** only (D221), so even Q1 A's encoded side was not built | 5th | `R14-ID-02/a-type-change-over-the-same-encoded-side-is-a-new-version`: `listed at ready: expected 1, got 0`; `R15-01/a-key-fields-type-side-change-is-a-new-version-of-the-op`: `an old-version hold, said at the boot: expected 1, got 0` | `r15.key-version-by-names`, `r15.key-version-any-release`, `r15.actor-version-encoded-only`, `r15.actor-version-any-release`, `r15.schema-version-encoded-only` (compile side); `l1.version-by-type-side` dropped (U17 reverses it) |
| Completion audit (5132591c): `Rejected` mapped for kept endings and quarantined lanes | already true: both arise only for a persisted identity, and `flow check`'s Rule20NotSent requires `NotSent` for every persisted write (cli/check.ts); one `NotSent` map covers every `why`. Gap found and closed: U6's agent call (`Unencodable` must be mapped where an input admits a value with no form) was a warning only; now Rule20NotSent | 6th | CLI pin `unencodable-no-notsent`: `CLI pins: 1 failed` | none in a gate (the CLI is outside lifetime-falsify; the pin is the check) |
| Completion audit: `Disposed` a reserved reason | done: rule 13's reserved failure tags were not enforced at all; compileOp now refuses a write's failure tag that is a Flow reason (`ReservedReason`, a proposed name); a read keeps `Defect` and `Interrupted` (rule 37) | 6th | front-check: `rule 13: a failure tag Disposed is refused: got "", want "ReservedReason"` (seven such) | none (front-check is a checks/ gate) |

Findings for the design:
1. (Settled by R1: the exemption is dropped.) Rule 15's exemption and U2 pull apart. A key-less `cancel` in a success or failure handler does nothing (U2: the ending's Attempt is
   resolved), so the "cancel" that exempts the promoted head does not cancel it: the head is sent after the late turn, and its ending is late
   again. The same holds for the queued exemption under an unknown (the cancel releases the hold, which promotes the queue). So the exemption
   is "the transition declares it lets the op go", not "the work is gone"; 1.6's "a late ending never leaves live work" is false under it as
   written. The design should say which: (a) the exemption stands and 1.6 says "except work of an op the late transition cancels"; or (b) a
   late key-less cancel also cancels the never-sent work it exempts (a new meaning for a key-less member, against U2).
2. U13 contradicts the 2.7.13 table's own text. Row "Runtime disposal" (InFlight column) says past the bound the Attempt "ends
   `unknown { Disposed }`", and in the same sentence that "an Attempt still on the wire at the final capture is captured as an acknowledged
   `InFlight` lane record, so a reload uses this table's restore cell (`unknown { Restored }`)". The final capture follows the bound, so
   both cannot hold. Built: the ending is `unknown { Disposed }`, parked as a pending mapped outcome, and the head stays on disk Held. The
   head must stay on disk: with only a parked unknown and no head, the key the server may hold has no record to re-send it by (the suite's
   D112 oracle (h) went red on the first try, which parked the ending and dropped the head, as a within-bound unknown is parked today).
   The design should drop the "captured as InFlight ... Restored" clause, and say the head stays Held on disk with its ending parked.
3. Same root, a latent gap: an unknown that settles within the bound (`settleSend` while disposing) parks its ending and drops its head,
   so it has the same "no head on disk" exposure for a persisted write. Not built here (no ruling); the design's row should say the head
   stays Held there too.
4. The entity store and `unknown { Disposed }`: telling the store (`ended`) makes it start a repair read after disposal, against "from its
   start nothing is invoked" (SURV-08 showed a `repair` request). Built: the store is not told past the bound; it hears the Attempt at the
   restore (`restored`). The store's reaction to an unknown during disposal is phase 1's (U10, U11); the design should say no module
   starts work once disposal starts.
5. `forget` does not exist in the prototype (no runtime input, no Story step, no harness step), though three rulings end things by it: U14's
   unbound lane record, U4's lane whose operation is gone, and rule 74's old-version record. Stopped here rather than built: the suite's
   oracles (rule 17's ledgers in drive.ts: `due`, `told`, `parkedOwed`) would need a rule for what `forget` does to an ending owed to the
   identity, and the design does not say. Decision needed: does `forget` deliver nothing and leave evidence for each parked ending and
   held lane it removes (the 2.9.3 "evidence only" shape), and is a held lane's hold dropped by it (a key the server may hold then has no
   record, as in finding 2)? The second is a guarantee: today nothing drops a hold except its owner's `cancel`.
6. "Unbound" needed a definition to build. Built: a lane is unbound when its identity has no decoded actor record (live or retired) and no
   incarnation; an undecodable record's lanes are not reported (a fresh incarnation adopts them, 2.7.13), an old-version record's lanes are
   (rule 74: "stay unbound and listed"). The design should say which identities' lanes count.
7. (Settled by R2: on an unkeyed op the key-less member names its one lane, in a NotSent ending too.) Rule 43 has two readings for an unkeyed operation's `NotSent` handler: "On an unkeyed operation a key-less member names its one lane",
   and "in a `NotSent` ending they do nothing". The runtime does nothing (no Attempt). The design should say the NotSent clause wins for
   unkeyed operations too (R15-02 tests the keyed case only, which is unambiguous).
8. U9's check lives only in the typed front end (`compile/memory.ts`); a hand-compiled machine gets no creation check from the runtime.
   Consistent with "the public API compiles to Compiled", but the guarantee is the compiler's, not the Runtime's; Stories and `check()`
   must go through the same door.
9. The review of U13 noted the store hears `unknown { Restored }` at the restore (`restoredHook`), while the machine hears the parked
   `unknown { Disposed }`: two reasons for one Attempt. Harmless now (the store reads only "unknown"), but rule 30/32's store wording
   should name which reason it sees (phase 1).
10. Harness: oracle (h) (drive.ts `writeAheadLies`, `cancelSeen`) does not count an unknown handler's own key-less cancel as a cause for
   releasing that hold, so a fixture whose restored unknown cancels its own persisted hold is red by (h). Avoided in R15Late (its Unsure
   keeps the hold); not changed, since it gives no wrong verdict on the runtime's behaviour so far.
11. U17 "ignoring annotations" cannot be built as written for checks: in Effect 4 a check's parameters live in its annotations and closures, so
   `minLength(1)`, `minLength(2)` and `NonEmptyString` compare equal (structure sees `Filter`); and `toType`/`toEncoded` strip the
   encoding chain, so a transformation whose two sides stay the same (`String` decoded through an upper-casing transform to `String`) is
   no new version, against "a transformation change is a new version". Both are reviewer findings, confirmed against the installed effect.
   Decision needed: name what is compared (a check's identity and parameters? a transformation's identity?) or state these as limits.
12. (Settled by R3 for the prototype: a bare stamp compares by names. For phase 1's migration area: a change to Flow's own stamp format is a migration Flow owes.) U17 changes what a lane's stamp holds (names, now names with Schema versions). A lane saved by a release before the change restores as an
   old-version hold, and every commit of its op declines beside it until it ends, though no key changed. The design needs a stamp format
   that is stable across Flow versions, or a rule that a names-only stamp compares by names (a migration). Not built.
13. The prototype's D221 (round 13) compared op key fields by name only; Q1 A (encoded side) had never been built, so U17 is the first time
   an op key's Schema joins its version. The codec's `Op` schema (codec/codec.ts) has no `keyVersion`; it is not on the runtime's path.

Log (start-end, who, redone):

| Task | Start | End | Who | Redone |
| --- | --- | --- | --- | --- |
| rule 15 promoted head: case, runtime, mutants, locks | 10:05 | 10:30 | lead | |
| U13: case, runtime (two tries: (h) caught the first), mutant, locks | 10:30 | 10:45 | lead | yes, once (head kept on disk) |
| gates at the U13 commit | 10:40 | 10:43 | lead | 25/25 ok |
| U14: case, runtime, two mutants, locks | 10:45 | 11:00 | lead | |
| review of the three runtime diffs (rule 15, U13, U14) | 11:00 | 11:02 | reviewer (Haiku) | its U14 bug acted on (inspect skipped undecodable); others recorded as findings 1, 9 |
| map U2-U9 to proving cases and code | 11:02 | 11:05 | runner (Haiku) | none; gaps it found became R15-02, R15-03 |
| R15-02/R15-03 variants | 11:05 | 11:07 | coder (Haiku) | lead made the NotSent variant keyed (finding 7), split U9 into R15-03 |
| R15-02 wrong runtimes | 11:07 | 11:09 | coder (Haiku) | none; the reload one is an artifact, kept and said so |
| completion audit: does `flow check` require NotSent where Rejected can decline | 11:09 | 11:10 | runner (Haiku) | none; result in the audit row |
| U17: cases, compile and runtime, four mutants, locks | 11:10 | 11:30 | lead | |
| review of the U17 diff (Haiku, effort high from here on) | 11:25 | 11:28 | reviewer (Haiku) | its cycle bug in `structure` fixed; check and transformation limits, stamp upgrade, recorded as findings 11-13 |
| completion audit: reserved tags, Rule20NotSent for Unencodable; gates (U17's codec, compare and the old l1 mutant were red, fixed) | 11:30 | 11:50 | lead | |
| review of the audit diff | 11:45 | 11:48 | reviewer (Haiku) | accepted; unknown byReason keys and streams outside the check recorded (finding 15) |
| coder A: clean U3 reorder, U9 and U8 wrong runtimes | 11:55 | 11:58 | coder (Haiku) | changed: lead added two U8-area mutants so REV7-M2 can join the lifetime list (failed read, duplicate machine); each run by the lead and red by the expected line |
| coder B: R15-02/R15-03 strengthened and new variants | 11:55 | 11:58 | coder (Haiku) | accepted after reading each line against rule 43, 44 and 2.2.2 and rerunning them; its `ServerError`-is-unknown catch was right (lab.ts) |
| R4 research and U5 type pins | 11:55 | 11:58 | runner/coder (Haiku) | changed: the type-test label said round 14; R4 quotes checked against the design (finding 16) |
| R1, R2, R3, fixes 5, 11, 13, oracle (h); mutants; locks | 11:58 | 12:40 | lead | |
| review of R1-R3, the U13 shape and the oracle change | 12:30 | 12:33 | reviewer (Haiku) | acted on: R3 compares by names when either side is bare (its bug, verified); the parked-ending drive skips edited bytes; module starts beyond the store recorded (finding 17); its oracle (a) risk accepted as the intended meaning, said below |
| U15: compile, ref, runtime, harness, cases, mutants | 12:40 | 13:15 | lead | |
| coder: respell 35 definitions `persisted` to `persist` | 12:42 | 12:45 | coder (Haiku) | accepted: every changed line read (only `persisted` to `persist`, helpers mapped, two ref arguments dropped) |
| review of the U15 diff | 12:55 | 12:57 | reviewer (Haiku) | acted on: two stale mutants and stale output lines, SCENARIOS row; local-persisted and the default recorded (findings 20-22) |
| gates: types-check pins, the retargeted o6 mutant, stale persist mutants | 12:50 | 13:20 | lead | yes: three gate runs to clear stale mutant anchors |

### The runner's review rulings and fixes (after 3703c8cb..b35fe3d2)

Rulings are the runner's, under the user's delegation:

| Item | Result | Evidence | Wrong runtime |
| --- | --- | --- | --- |
| R1 rule 15: no cancel exemption | done: `leavesWork` counts an InFlight head and every queued commit of the exited activation, behind a Held head too; a Held head is not live work; nothing is exempt. R14-FIX-01's cancel control is now `...-is-denied`; R15-01's promoted-head case is denied; the stay-put pattern `R15-01/a-stay-put-alternative-gives-up-the-work-and-the-current-ending-moves` (late `Unsure` stays and cancels twice: its own hold released, the promoted head ends `NotSent { Cancelled }` as a current ending, its `No` moves to A) | the denied variants were red on the exemption runtime (`no denial: expected 0, got 1` before the rewrite) | `r15.late-cancel-exempts-queue`, `r15.late-cancel-exempts-promoted-head` |
| R2 rule 43 on unkeyed ops | done: a key-less member on an op with `keyFields: []` names its one lane, `laneKey(actor, op, {})`, in an ending or not; D22's own-Attempt rule is the keyed one | `R15-01/a-key-less-cancel-on-an-unkeyed-op-outside-an-ending-names-its-one-lane` (written with the change; red on the undo, which leaves the head and sends) | `r15.unkeyed-keyless-names-the-attempt` (red on it and the stay-put case) |
| R3 U17 stamps across a Flow upgrade | done: `sameFields` compares by names when either stamp is bare | `R15-01/a-names-only-stamp-from-before-the-upgrade-is-the-current-version` (release 0 compiles without `keyVersion`) | `r15.names-only-stamp-is-old` |
| R4 a late ending whose every alternative is denied | written up, not decided (finding 16) | - | - |
| 5 U13 shape | done: one shape for an ending during disposal (`parkAtDisposal`): parked, W after it; an unknown keeps its head Held on disk (the key may be re-sent), a definite ending drops it; `settleSend`'s disposing branch uses it too. `tellEnded` past the bound; the store starts no repair once disposal starts (`cx.live`). The restore's `restoredHook` gets the parked ending, not `Restored`. `delivered` evidence names the reason, and U13 asserts on deliveries: `Unsure`/`Disposed`, `No`/`Disposed`; the restored Unsure cancels its own hold. Kill inside the window: `R15-01/a-kill-inside-the-disposal-window-restores-the-wire-head-unknown-restored`. Oracle (h) fixed, not the fixture | DRV-01's output moved (a `disposing:job` wait: a within-bound unknown now keeps its head) | `r15.past-bound-captured-inflight` (now the exact undo), `r15.disposal-ends-the-wire-at-once` |
| 6 U5 | type pins: `concurrency: "allow"` and `"cancel"` refused (typed/type-tests.ts) | `typed tsc` gate | - |
| 7 U9 | `R15-03/creation-checks-a-present-input-by-its-type-side-and-keeps-its-refinements` | - | `r15c.creation-stores-raw-input-on-refusal` (the raw input differs from the checked one only on refusal, since the type side runs no transformation), `r15.creation-decodes-input` |
| 8 U2 | NotSent variant asserts no Released, Superseded or `lane.cancel.InFlight`; new failure-handler variant (a definite `Declined`); new NotSent beside a Held head and W | - | `r15b.keyless-success-names-key-lane`, `r15b.keyless-notsent-acts-live-lane` |
| 9 U3 | reasons asserted by `endings()`; a clean one-span reorder replaces the double-delivery mutant | - | `r15b.reload-head-before-w` |
| 10 U8 | REV7-M2 joins the lifetime list | - | `r15c.boot-queue-drops-pre-boot-sends`, `r15c.failed-read-keeps-persistence`, `r15c.duplicate-machine-allowed`. Not done: the bound at more than two points (one `bootQueue: 3` point, one `bootMs` point stay) |
| 11 U14 | two boots before adoption, two reports; the adoption hears `Unsure`/`Restored`; `Object.hasOwn` for `retired`, `undecodable`; Inspection lists quarantined lanes (`quarantined`), asserted in REV7-M8 (which joins the lifetime list); the boot reports them as `RecordQuarantined`, not `UnboundLane`, and Inspection keeps them out of `unbound`: the two agree | - | `r15.quarantine-unlisted`, `r15.quarantine-commit-sends` |
| 12 exact mutants | the U13 and rule 15 mutants are now exact undos. Not done: a mutant for `structure`'s `seen.delete` (no fixture has a Schema with a shared node inside one field, so no case can see it; recorded) | - | - |
| 13 key name not in input | `SealKeyField` at compile, before its Schema version is read | front-check unchanged (no fixture had it) | - |
| U15 B, U19 A `persist` on the definition | done: `definition({ persist })` (compile/machine.ts; the compiled `persisted` stays internal); `actorRef` takes no options, `ActorRefOf`/`ensureArgs` carry no `persist`; the runtime's `refPersist` and its `ConflictingActorRef` for persist are gone; the harness ensure/attach pass no persist. 35 definitions respelled (a Haiku coder; every changed line read by the lead). R14-ID-03's three conflict variants become `two-refs-of-one-identity-agree-on-persistence-by-construction`; a ref with `{ persist }` is a pinned type error | 9th | the old variants could not be kept: their calls no longer type-check (`TS2554 Expected 2 arguments, but got 3`) | `r15.definition-persist-ignored`; the stale `id.no-conflict`, `m3.persist-survives-dispose` dropped |
| U4 rest | Inspection lists quarantined lanes (above, fix 11); `orphaned` is not built; key-equality adoption is not done for typed ops (every typed lane is stamped, D221); `placeLanes`'s D78 rename stays for hand key closures only (a suite seam) | - | REV7-M8 | `r15.quarantine-unlisted`, `r15.quarantine-commit-sends` |
| U6 | already true (round 8-12's D89, D100, D108, D114, D139): REV8-M9 (guard key denies, lookup ends `Defect`, member key does nothing, module value dropped and named), HIGH-02 (memory that cannot encode), round 8's commit `Unencodable`; gap closed by the audit row (Rule20NotSent) and R15-02's Held-plus-W variant (a commit declines `Unencodable` and its mapper runs) | - | existing | existing (mutants-r8, r9) |

More findings:
20. U15 keeps the compile default `persist ?? true` (a suite convenience: 35 of 70 typed definitions omit it). The design spells `persist: true` and before U15 persistence was opt-in per ref, so the default should be false. Flipping it touches those 35 definitions and the hand/typed pairs. Decision needed (the design does not state a default).
21. Persistence O2 says "a local actor of a persisted machine is not persisted"; the runtime gates records on `persisted` only, never on `local` (step.ts, durable.ts), so a local identity of a persisted machine writes its record. Pre-existing, found by the U15 review; not fixed here (no ruling asks, and the pairs fixture builds that combination).
22. `ConflictingActorRef` now has nothing to fire on in the prototype: there is no `context` on a definition. Its remaining case (two refs with different `context`) is untested.

Gates on the final tree: `bun gates.ts` exit 0, **25/25 ok**, 182 s. Suite 856/856, locked, every log line its own reason. lifetime-falsify
lists R15-01, R15-02, R15-03, REV7-M2, REV7-M8 and every case is red on some wrong runtime.

The method (lead plus Haiku sidecars, from 11:00): 11 sidecar tasks (4 reviewers, 4 coders, 3 runners), each 1-3 minutes; 2 accepted as is
after reading every line and rerunning, 5 changed by the lead (a keyed NotSent variant, U9 split out, two extra U8 mutants, a label, the
U14 inspection bug a reviewer found), none rejected. Reviewers found four real bugs (Inspection and undecodable records; `structure`'s
shared-node cycle; R3's one-sided names check; the parked-ending drive over edited bytes) and most of the stale artifacts. The cost was
gate churn: each runtime change moved anchors in older mutant lists (o6, l1, id, m3, misc), found only by a full gate run; three runs
were spent on that alone. Next time: grep every mutants file for an edited line before the gate.

More findings for the design:
14. R1's consequence: a late ending's author has two ways to give work up, both explicit (a stay-put cancel, or a keyed `cancel(k)`), and `[cancel, cancel]` is needed under `serialize` when the late ending's own hold sits in front of the queue: the first releases the hold (which promotes), the second cancels the promoted never-sent head. `flow check` could say so when a late unknown's handler cancels once on a serialize op with a queue.
15. Rule 13's reserved names are enforced for a write's `failure:` keys only; an `unknown:` byReason key is meant to name Flow's reasons (`Cancelled: E.Gone`, `Restored: Flow.ignore`), and streams compile elsewhere. `NotSent` on a read's failure record is not refused. `ReservedReason` is a proposed name.
16. R4, a late ending whose every alternative is denied. The design says (2.5 step 2, the lane table) that an admitted ending in a `Denied` or `Unhandled` turn counts as delivered, keeps its lane effect and is not delivered again; the runtime does that (an unknown's head becomes Held, a success promotes). Silent: what then owns a hold whose only delivering turn was denied (rule 45's `UnresolvedHold` reasons over branches, and an alternative `LateMayNotLeave` denies may still count as reaching `retry`/`cancel`); and rule 15's "(`flow check`)" names a static check no rule lists. Options: (a) as now, the hold stays until some later turn's keyed `cancel(k)`, with `flow check` warning when every late alternative leaves; (b) a late turn denied by rule 15 alone is redelivered once after the current activation's next turn; (c) rule 15 makes a late handler with no stay-put alternative a `flow check` error. Recommendation: (c) with (a)'s runtime, since R1 already says a late handler gives up by staying put; it keeps the runtime simple and puts the rule where the author reads it.
17. Runtime O6 says nothing starts once disposal starts; the store's repair now respects it (`cx.live`), but other module commands (the store's `gap` fetch, sessions' starts) have no such gate. The design should say the rule binds modules, and the Module seam should carry it.
18. "Final capture" for U13: the capture `finishDisposal` writes, after Runtime O6's bound or after the last wire ending. A kill before it leaves the last capture taken during the window, in which an acknowledged head on the wire is an InFlight lane record, so the boot restores it `unknown { Restored }` (the new kill-inside-the-window case). After it, the head is Held with its `Disposed` ending parked. The design's 2.7.13 row should say both.
19. Oracle (h) now accepts a hold released by its own ending's handler as caused (for (h) only; (j)'s rule against an ending excusing itself stands). A runtime that releases a may-have-applied key with no cancel in any handler still fails (h): the reviewer checked that, and its remaining risk is that "a cancel alternative exists on that event" is taken as "it ran". (Round 15b: closed, item 11 below.)

Round 15b updates to the findings above: 3 is closed by fix 5 (`parkAtDisposal`: an unknown that settles within the bound keeps its head Held on disk too). 4 is superseded: the store is told past the bound (`tellEnded`) and starts no repair once disposal starts (`cx.live`); round 15b gates its `gap` refetch and the sessions' connects the same way (item 9). 9 is closed by fix 5: `restoredHook` gets the parked ending's own reason. 13 is stale: the codec's `Op` has `keyVersion` (codec.ts, `S.optionalKey`). The U9 row's "none possible" is stale too: `r15.creation-decodes-input` and `r15c.creation-stores-raw-input-on-refusal` edit `../conformance/compile/memory.ts`, and R15-03 is in the lifetime list.

## Round 15b (2026-11-08)

The user's answers Q1-Q5 (all A) and the runner's calls from the round 15 close-out. Same runtime and suite; wrong runtimes in `mutants-r15d.ts` (spread into `mutants-lifetime.ts`). Cases in R15-01 unless named.

| Item | State | Commit | Failing first | Wrong runtime |
| --- | --- | --- | --- | --- |
| 1 Q3 `cancelAll` | done: `O.x.cancelAll` / `cancelAll(k)` (compile handles, `Member.verb`, codec); `cancelAll` (lane.ts) runs the head's `cancel` cell with W emptied first, so nothing is promoted, then ends each queued commit `NotSent { Cancelled }` as mail, in lane order; `flow check` counts it as a cancel (UnresolvedHold, KeyRequired); the reference model too | 1st | `a-stay-put-cancel-all-gives-up-every-queued-commit` (two queued): red on `cancelAll` as `cancel`: `both queued commits end NotSent { Cancelled }, never sent: expected [...Cancelled, Cancelled], 1` | `r15d.cancel-all-is-cancel`, `r15d.cancel-all-queued-as-evidence` ((j) an ending reached nobody) |
| 2 Q5 `persist` opt-in | done: `persisted: d.persist ?? false`; 46 definitions that relied on the default now say `persist: true` (Haiku coder; every line is `persist: true,` only, checked by a diff count), each file logged with its own reason | 1st | `a-definition-with-no-persist-is-not-persisted`: `sent with no write-ahead: expected 1, got 0` on the old default | `r15d.persist-default-true`; `r15.definition-persist-ignored` re-anchored |
| 3 Q2 check representations | done: `structure` (compile/ref.ts) adds a check's `representation: { id, payload }`; other annotations still ignored. KeyStamp releases 6-9 | 1st | `a-key-fields-check-parameter-change-is-a-new-version-of-the-op` (`isMinLength(1)` to `(2)`): `an old-version hold, said at the boot: expected 1, got 0` | `r15d.check-representation-ignored`; the limit is the case `a-custom-filter-change-is-no-new-version-a-stated-limit` |
| 4 Q1 `forget` | see below | | | |
| 5 Q4 late handler | done: `flow check` rule `Rule15LateLeaves` (error) on a `serialize` or `latest` write owned below the root when every late alternative of a mapped event leaves (none has `target: "self"`) | 1st | CLI pins `check: rule 15, every late alternative of R15Late leaves` and `R15Stay's late Unsure stays put` (no such rule before) | none (the CLI is outside lifetime-falsify; the pins are the check) |
| 6 format tag | done: Flow's version entries are `name#2:hash` (`VERSION_FORMAT`, `versioned`, compile/ref.ts), for op key stamps and actor versions; untagged `name#hash` is format 1, a bare name format 0. `sameVersion` (lane.ts) compares whole within one format and by the name part across formats; used by `sameFields` and the restore's actor check (durable.ts). Replaces R3's "#" test | 1st | R14-ID-02 `a-record-saved-by-an-earlier-version-format-restores-when-its-schema-did-not-change`: on the exact compare, `not listed: expected 0, got 1` | `r15d.version-format-ignored`; four older mutants re-anchored |
| 7 `cancel` concurrency | done from 2.7.13's cancel table: `replaceHead` (lane.ts) for commit on the wire (interrupt; `w.interrupted` makes its ending evidence by Attempt id, in `onSent` and at admission), settled-not-admitted (evidence), held or waiting re-send (released); a never-sent head is superseded as under `latest`; `endHeldThisTurn` releases an unknown's hold after its turn (also after an unmapped ending and for an evidence-only one with no actor). The type pin refusing `cancel` is gone | 1st | `under-cancel-a-commit-interrupts-the-attempt-on-the-wire`, `-a-never-sent-attempt-is-superseded`, `-an-unknown-is-held-only-for-its-own-turn`, `-a-retry-in-the-unknowns-turn-re-sends-the-same-id`; type pin `cancel` type-checks | `r15d.cancel-queues`, `-no-interrupt`, `-holds-past-its-turn`, `-replaced-ending-delivered`, `-never-sent-kept` |
| 8 O2 local not persisted | done: the seal (gate.ts) makes `persisted` false for a `local` machine; `flow check` and oracle (h) read it the same way | 1st | `a-local-identity-of-a-persisted-machine-is-not-persisted`: `sent with no write-ahead: expected 1, got 0` | `r15d.local-persisted` |
| 9 O6 modules | done: `cx.live` (the Module seam already carried it) now gates the store's `onGap` and the sessions' `connect` | 1st | `no-module-starts-work-once-disposal-starts` passes before and after: no path today publishes a gap after disposal starts (modules are disposed first) | `r15d.module-starts-in-disposal` (two edits: sessions' dispose publishes a gap and the gate is removed); the gap alone, gate kept, stays green, so the gate is what holds |
| 10 reserved reasons | done: a read's `failure: { NotSent }` refused; an `unknown:` key naming a never-unknown Flow reason (`NotSent`, `Rejected`, `Overloaded`, `Unencodable`, `NoPersistence`) refused; a stream's `failureBy` tag that is a Flow or Feed reason, or `Feed`, refused; all `ReservedReason` | 1st | front-check: `rule 13 (a): unknown: Rejected ... is refused: got "", want "ReservedReason"` and `(b)` (seen red by the coder with the refusal removed) | none (front-check is a checks/ gate) |
| 11 oracle (h) guards | done: the self-release cause needs the cancel's own cell (`lane.cancel.Held`, that attempt) in the step | 1st | lie `lie.held-released-unguarded` stayed green on the old oracle (`0 of 1`), red by (h) on two cases now | the lie |
| 12 stale and weak | done: PAY-16's bound variant renamed `...-ends-unknown-disposed`, asserts the Disposed ending and no Restored; `typed/round15.ts` header; U3's case has a Held head (lost answer first, asserted); the NotSent variant asserts its Held head; R14-ID-03's vacuous count replaced by "one actor kept by two uses" (red on a second identity); findings 3, 4, 9, 13 and the U9 row updated above | 1st | | |

Sidecar log (all Haiku, effort high; the lead read every changed line and reran every check):

| Task | Who | Result | Why |
| --- | --- | --- | --- |
| A: PAY-16 rename, R14-ID-03 assertion, R15-02 held-head claim | coder | changed | its three edits accepted (its sabotage red line verified); it checked the NotSent variant, but the stale "held" claim was U3's reload case (head on the wire): the lead made that head Held and sliced the endings |
| B: rule 13 refusals at compile, front-check pins | coder | changed | (b) and (c) accepted; (a) rejected as built: it allowed `NoResponse` and `ServerError` by name (a fixture's tags hard-coded in the compiler). A contract's unknown tags live only in its commit's type, so the lead rebuilt (a) as "refuse a never-unknown Flow reason" (finding 1 below) |
| C: `persist: true` on 46 definitions | coder | accepted | diff is only `persist: true,` lines (counted); suite back to green but outputs; it left `cli/main.ts`'s T/Attachments alone (outside its scope; no case needs it persisted) |
| R1: review of `cancelAll`, the seal, oracle edits | reviewer | changed | acted on: `flow check` read the raw `persisted` (Rule20NotSent on a local machine; fixed), queued endings now carry `machine`; recorded: queued endings are heard before an interrupted head's later ending (finding 2), a releasing lane makes them evidence (finding 3); its "oracle (j) no longer catches evidence-only queued endings" was wrong (the mutant is red by (j)) |
| R2: review of `cancel` concurrency against the table | reviewer | changed | acted on: no release after a refused turn (`ran`), release after an unmapped ending, oracle `replacedUnderCancel` narrowed to a newer mint before the Attempt's ending and `turnEnd` to a delivered unknown; recorded: a refused ack of a deferred replacement (finding 4, shared with `latest`), parked entries kept across a replace (pre-existing) |

Findings for the design (round 15b):
1. Q2/rule 13 cannot be checked at compile for an op's own unknown tags: they live only in the commit's Effect error type (`OutcomeUnknown<Tag<...>>`). Built: a key naming a never-unknown Flow reason is refused; the exhaustive check "Flow's reasons plus the contract's unknown tags" is a type-level check the prototype's `outcomes()` does not make. The design's "type error" needs the contract to carry its unknown tags in its type (it does) and the record's key type to be `U | FlowReasons`.
2. `cancelAll` on a lane whose head is on the wire: the queued commits' `NotSent { Cancelled }` are delivered at once, and the head's ending (`unknown { Cancelled }`) when it lands, so the queue is heard before the head. The design's lane order (rule 44) is for parked and restored endings; it should say whether a live `cancelAll` keeps lane order (it would have to hold the queued endings until the head's lands).
3. `cancelAll` on a lane rule 60 is releasing: its queued commits end as evidence, not delivered, as rule 60 says for a release. The two rules meet only when a transition both releases on leave and cancels the lane; the design should say which wins.
4. Under `cancel` (and today under `latest`), a commit over a head whose acknowledgement is out waits (D48) and replaces it when storage answers; if storage refuses instead, the old head ends `NotSent { StorageRefused }` and is delivered, though the table says it ends `Superseded`. Pre-existing for `latest`.
5. `cancel` and a refused turn (a throwing handler): the hold is kept across the retry of the turn (D123), so "held only for its own ending's turn" means the turn that runs; after a second refusal the ending is kept (Kept column) and the hold stays until a cancel or a boot. The design's `HeldThisTurn` should say what a refused turn does.
6. The `flow check` rule for rule 15 (Q4 A) is built for `serialize` and `latest` writes only, where later commits of the left state can still be queued when a late ending lands. Other live work (another op's commit owned by the left state) is not read statically; under `reject` and `cancel` the late ending's own lane holds nothing after it. The design should say whether the error is that narrow. It is strict: R15Stay's late `Ok` and `No` (which leave) are errors too.
7. The format tag (runner's call) makes a cross-format compare read only the part every format writes alike (the name; for actors `field:encoded`), so a type-side change made in the same release as a Flow upgrade is not seen. A migration that re-hashes old records under the old format would see it; the design should say which Flow owes.
8. Runtime O6 for modules: today no path publishes a gap or a session start after disposal starts, because modules are disposed first and the mail is cleared; the `live` gates are defence for module code that publishes during its own dispose. The design should say modules must not start work in `dispose`, or that the Runtime ignores what they start.
9. `concurrency: "cancel"` on a predicting write (rule 29's `flow check` error) is not built: no prototype fixture predicts under `cancel`.
