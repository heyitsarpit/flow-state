# Convergence: how a gate reads a run

Status: requirements gathered by the runner, 2026-11-08, for a from-scratch design (`policy-convergence`). Nothing
here is a design. Trigger: roadmap amendment 4. Three reviews in a row (CP1's close-out, CP2's mid-task review of
`a84b1c2a`, CP2's close-out of `9724ef88`) found the same root-cause class in the same part.

## The part

How the conformance gates turn a child process's run into a verdict. That covers spawning, the watchdog,
time/memory/clock kills, reruns, reading stdout/stderr/exit/JSON, counting, tallies, exit codes, and wall-clock
deadlines that decide coverage. Today this is spread over `watch.ts`, `mutate.ts`, `mutate-one.ts`, `gate5s.ts`,
`falsify.ts`, `lifetime-falsify.ts`, `graph-gate.ts`, `gates.ts`, `search/engine.ts` and `search/run.ts`, the
search callers in `scenarios/` (FRAG-15, SEARCH-ODD-SMALL), and `drive.ts`'s settle bound. All paths are under
`packages/flow-state-v3/prototypes/conformance/`.

## Root-cause classes

- **R1. Each consumer reads a run its own way.** No single function decides what a run means. Every script parses
  exit codes, stdout lines, JSON fields and watchdog kinds by hand, so each fix closed one consumer while the next
  review found another.
- **R2. Wall-clock time decides correctness.** A watchdog time-out, the 20 s settle trip, and search `deadlineMs`
  all change a verdict depending on machine load, although the suite is meant to be deterministic.
- **R3. A partial run is read as a whole run.** A killed or truncated child keeps the lines it printed, and
  consumers score them (a partial control, PASS/FAIL lines of a killed run).
- **R4. Some evidence is never read.** stderr is piped but unread (and can block the child at about 64 KB). A
  verdict carried in JSON is ignored by a consumer that reads only the exit code.

## Findings, by class

| # | Class | Where | Finding | Found by |
| --- | --- | --- | --- | --- |
| 1 | R1 | `gates.ts:101-105`, `mutate-one.ts:84` | mutate-one always exits 0; its verdict is `killedBy`. gates.ts reads only the exit code, so a red swap suite, compare, date-check or gate5s reads ok (they run nowhere else in gates.ts). | CP2 close-out (Opus, sidecar) |
| 2 | R1, R2 | `mutate.ts:144-145`, `watch.ts:137-142` | A time kill that recurs on the alone rerun counts as killed, though the file's header says time kills are unknown. | CP1 close-out; CP2 close-out sidecar |
| 3 | R1, R2 | `mutate-one.ts:88,125-130`, `search/engine.ts:71,95,118,131-135,166` | In mutate-one's search paths, a CLOCK_TRIP inside an edge becomes an Oracle failure, so a false kill. A `deadlineMs: 100_000` gives inconclusive or vacuous under load, read as a kill or as a silent survival. | CP2 close-out sidecar |
| 4 | R1, R4 | `gate5s.ts`, `mutate-one.ts:49,121-122` | gate5s prints only its own line, so a child's CLOCK_TRIP text never reaches the reader, and a trip is a false kill. | CP2 close-out sidecar |
| 5 | R3 | `lifetime-falsify.ts:37,49-51,71` | The control runs at 1500 MB. An rss kill isn't flagged, and the control passes if `passed > 0 && failed == 0`. A partial control then shrinks the "every case red on some wrong runtime" check silently. | CP2 close-out sidecar (runner confirmed) |
| 6 | R1 | `mutate.ts` `one()` | An rss kill counts as a kill, not rerun alone, so a mutant at the memory limit counts killed with no oracle red. | CP2 close-out sidecar |
| 7 | R3 | `falsify.ts:468`, `lifetime-falsify.ts:~66` | A time-killed run's partial PASS/FAIL lines are still scored. The exit is 1, but per-line labels read as catches. | CP2 close-out sidecar |
| 8 | R2 | `drive.ts:1415-1416` | A spin that adds no tasks escapes the 5000-task bound and reaches the clock trip. That is unknown forever, never killed. A synchronous hang inside a step is a time kill instead. | CP2 close-out sidecar |
| 9 | R2 | `scenarios/frag.scenario.ts:835-840` (FRAG-15, 8 s), `scenarios/round4.scenario.ts:1202-1210` (SEARCH-ODD-SMALL, 6 s) | Searches with a wall-clock deadline assert only no failure and a state floor, never the verdict. inconclusive and vacuous pass. Under 8-slot load FRAG-15 took 6.6 s of its 8 s, and GC pauses fall inside the budget. | CP2 mid-task and close-out (Opus, sidecars) |
| 10 | R4 | `watch.ts:50,92` and every consumer | stderr is piped and never read. Over about 64 KB it blocks the child until a time kill, and traces never reach `--out` files. Trip detection is stdout-only. | CP2 mid-task and close-out |
| 11 | R1 | `gates.ts:54,56`, `falsify.ts:27` | gates.ts's `loadOf` omits rss kills, so they read BAD rather than as load. Caps differ per layer (job cap, nested suite 2000 MB). | CP2 close-out sidecar |
| 12 | R1 | `gates.ts:70-77`, `lifetime-falsify.ts` parallel loop | A rejected job or slot (spawn failure, "edit does not apply") has no catch or finally. It leaks slots and memory and can hang the run. | CP2 close-out sidecars |
| 13 | R1 | `mutate.ts:173` | Survivors exit 0; only unknowns set exit 1. | CP2 close-out sidecar |
| 14 | R1 | `mutate-one.ts:56` | Non-serial reruns can start together, so "alone" is not guaranteed. | CP2 close-out sidecar |
| 15 | R1 | `watch.ts:83` | A run that exits just inside the window can be recorded as a time kill. | CP2 close-out sidecar |
| 16 | R2 | `lifetime-falsify.ts` `runOne` | Copies the live folder at each run's start, not a snapshot (mutate.ts takes one since round 10). An edit made during a run reaches later wrong runtimes. | CP2 close-out sidecar |
| 17 | R1 | gates.ts job set | The `FLOW_COPIES_CHECK` and `FLOW_CANON_CHECK` suites are listed as end gates in STATUS.md but are not jobs. Lies run targeted, not `--full`; which is final is undecided. | CP2 close-out sidecar |

Related, outside the class (handled separately, not in this redesign): in-place array writes are unchecked in
searches and in other Ports' `version()` (the guard's coverage); `parentText` is taken lazily in `search/engine.ts`;
an ended harness still accepts `start` and `read`.

## Requirements a correct design must meet together

1. **One reading.** One module turns any child run into a typed result: `pass`, `fail` or `unknown`, plus the
   reason, the evidence (full stdout, full stderr, exit, signal, the watchdog's kind, peak memory, and any
   structured verdict the child printed) and whether the run was complete. Every gate and the scheduler use it.
   No consumer parses exits, lines or kills on its own.
2. **A child states its own verdict in one way.** Each gate script ends with one structured verdict that the reader
   checks against the exit code (they must agree). A child that ends without its verdict line is `unknown`, not
   pass. mutate-one's `killedBy` becomes that verdict.
3. **No clock decides correctness.** A time-out, a memory kill or a clock trip is never `pass` or `fail`. Each is
   `unknown` with its kind, rerun once alone (truly alone: nothing else running), and still `unknown` if it
   recurs. Deterministic bounds (task counts, state bounds, step counts) decide spins and hangs, including spins
   that add no tasks.
4. **Unknown is never green.** Any `unknown` left after the alone rerun makes the gate and the scheduler exit
   nonzero and is listed by name. It stays in every denominator. It never counts as a catch, a kill, a survivor or
   a pass.
5. **A partial run scores nothing.** Lines from an incomplete run are kept as evidence but never counted as PASS,
   FAIL, red or killed.
6. **Controls are pinned.** Every control (falsify suites, mutate.ts, mutate-one, lifetime-falsify) must be a
   complete run whose case count equals the known total. Any kill of a control is BAD.
7. **Searches end on state bounds, not clocks, wherever a verdict depends on them.** A case that runs a search
   asserts the verdict it reaches deterministically (completed, closed or a named class), not just "no failure".
   A changed expected output here is a logged expected-result change.
8. **All evidence is read.** stderr is drained concurrently and saved with stdout, so it cannot block, and trip
   detection reads both.
9. **Failures in the runner are not hangs.** A spawn failure, a rejected job or a bad edit becomes `unknown` or
   `fail` with its reason, frees its slot and its memory, and never hangs or exits 0.
10. **Copies are snapshots.** Every gate that runs children in copies takes one snapshot at its start.
11. **Same strength or stronger.** No check may get weaker. Every current gate's verdict on the real runtime, the
    null and broken runtimes, every lie, mutant and lifetime runtime must be the same, except where the old one was
    wrong by this list (each such change named).
12. **Fast.** It keeps CP1/CP2's speed: every final-commit gate within 10 min at up to 8 in parallel, with
    `gates.ts` packing as now.

## Conflicts to resolve in the design

- R3 against speed: rerunning every unknown alone costs time under load. How many reruns, and when the scheduler
  pauses other jobs.
- R7 against fixed expectations: searches asserting their verdict may change locked outputs.
- One verdict line per child against scripts that print many lines today, and the CLI pins and `--out` files that
  read them.

## Proof the design must come with (`policy-convergence` step 9)

A planted failure per row of the table above, each red on the old code where the old code was wrong, and each
handled correctly by the new one. For example: a mutate-one whose swap suite fails under gates.ts; a control killed
by memory halfway; a time kill that recurs alone; a clock trip inside a search edge and inside gate5s; a no-task
spin; a child writing 1 MB to stderr; a rejected job in gates.ts. Every old failing trace stays as a standing test.
