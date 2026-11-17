# Bench code-quality review (proposed, 2026-11-18)

**Bottom line (proposed):** the bench (about 3,240 lines under `packages/flow-state-v3/bench/`) can lose roughly
330 to 390 lines, about 11%, with no behaviour change and no new Effect services in the hot path. Four changes
give most of it: one tier table, one place that groups series, one process helper, and deleting fields nothing
reads. Nothing here is decided. Read-only review: no code was changed and no bench was run.

Why now: tiers, dev, timeouts, battery and stress were each added as a branch on the last, so the same idea now
lives in several places (the tier name in five, series grouping in five, `spawnSync` in five).

Read first: `AGENTS.md` "Code style (v3 production)", `tools/lint-bomb/STYLE.md`, `tools/lint-bomb/FLOW-STATE.md`.

Note on evidence: another agent has uncommitted edits in `run.ts`, `workers.ts`, `options.ts`, `worker.ts`,
`declare.ts` and `benches/tooling.ts`, and a new `list.ts`. Lines are from the working tree on HEAD `e4bf4927`.
Sidecar review: 4 Haiku sidecars (duplicated code, overlapping concepts, Effect-provided pieces, blind); each
cited line below was read by me. Verdicts on their findings are at the end.

## Ranked proposals (lines deleted per unit of risk)

### P1. One `seriesOf(benches)` grouping (-16, risk low)

The rule "bucket by `series.name`, take min or max `size.n`" is written five times:
`select.ts:52-56`, `compare.ts:101-106`, `benches/index.ts:50-55`, `tests/bench/declare.test.ts:62-66`,
`tests/bench/limits.test.ts:75-79`.

```ts
// NEW in declare.ts
export const seriesOf = (all: ReadonlyArray<Bench>) =>
  Map.groupBy(
    all.filter((b) => Option.isSome(b.series)),
    (b) => Option.getOrThrow(b.series).name,
  );
// existing: smallest = Math.min(...members.map((b) => b.size.n)); ends = min and max
// select.ts: sized() reads seriesOf(all).get(name); compare.ts seriesLines maps seriesOf(results);
// index.ts endsOf reads it; the two tests call the same function.
```

Risk: tests that re-derive the rule would now share the code under test. Keep one test with literal expected
sizes so the rule is still checked independently.

### P2. Delete what nothing reads (-45, risk low)

- `Report` `TimedOut.samples` is written (`worker.ts` catch, `workers.ts` timed-out report) and never read:
  `gather` uses only `problem` (`workers.ts` `gather`). Drop the field, the `samples` on `TimedOut`, and
  `sample.ts` `slice(1)` bookkeeping for it (-12).
- `Bench.headline` is dead: no bench sets `[]`, so `compare.ts:173` (`length > 0`) filters nothing, and `line()` in
  `run.ts` prints median, p99, min whatever it says. "Headline" also names quick-tier membership in three doc
  comments. Drop `Headline`, the field, its default, the test at `declare.test.ts:23` (-14).
- `time.ts`: `timeStory(story, times)` is called with 1 in `benches/story.ts:30,44`; only `run.test.ts:8` passes 3.
  Reduce to `timeRun(story)` returning one `Timed`, drop the loop and `Timed.ms` (never read) (-10).
- `repoRoot` (`worktree.ts:22`), `Tier`, `Selection`, `Samples` are exported and used only in their own file (-4
  `export`s, no lines; do with the rest).
- Doc comments on private items (`stats.ts:63-66`, `machine.ts:82-85`).

### P3. One tier table, one `tier` option (-45, risk medium)

The tier is stored five ways: `options.ts` booleans `full`, `stress`, `dev` (resolved by `tierOf`, so `--full
--dev` silently runs dev; `run.ts` refuses only `--stress --full` and `--dev --record`), `select.ts:8` `TierName`,
`compare.ts:19-22` `Tier.name`, `history.ts:45` `Schema.Literals`, `options.ts` `TIERS` keys. `Bench` also holds
`quick` and `stress` booleans, so `quick && stress` is representable (`select.ts:38` guards it; `index.ts:71`
derives one from the other). The quick and stress `TIERS` rows are identical. `batchesOf` (`workers.ts:24-46`)
has three branches on tier and `--separate`.

```ts
// declare.ts: NEW one fact per bench, existing fields quick/stress removed
export type Place = "headline" | "stress" | "other"; // which tiers run it
// options.ts: one table drives everything (ALL = ["headline", "stress", "other"])
export const TIERS = {
  quick:  { runs: ["headline"],                  workers: 2, budgetMs: 300, warmMs: 500, minEffect: 0.1, shared: true },
  stress: { runs: ["stress"],                    workers: 2, budgetMs: 300, warmMs: 500, minEffect: 0.1, shared: true },
  full:   { runs: ALL, workers: 5, budgetMs: undefined, warmMs: undefined, minEffect: 0.05, shared: false },
  dev:    { runs: ALL, workers: 1, budgetMs: 200, warmMs: 300, minEffect: 0.1, shared: true },
} as const;
export const Tier = Schema.Literals(Object.keys(TIERS)); // history.ts, compare.ts, select.ts import this
// CLI: --tier <name> replaces --full --stress --dev; an unknown or doubled tier is a decode error.
// select.ts: inTier = TIERS[tier].runs.includes(b.place); batchesOf: shared ? one batch : one per bench.
```

Removes `tierOf`, `scopeOf`, three type copies, one `TIERS` row, the `inTier` branches, the two conflict checks
and the three-way `batchesOf`. Risk: `--full`, `--stress`, `--dev` are used in docs, HELP and `FLOW-STATE`
instructions; keep them as parsed aliases of `--tier` for one release if wanted. Public flag change, so the
user's call.

### P4. One process helper, scoped (-45, risk medium)

Five hand-written `spawnSync` wrappers with the same cwd, encoding, stdio and timeout options:
`machine.ts:6-15`, `worktree.ts:11-17`, `workers.ts` `spawnWorker`, `benches/tooling.ts:17-23`,
`backfill.ts:49-60`. Timeouts are literals in each (30 s, 120 s, 30 min twice, 60 min).

Step A (-15, low): one sync `exec(command, args, { cwd, timeoutMs, ... })` in `bench/process.ts` that the five call.
Step B (-30, medium): use the installed Effect process API (`effect/process`: `ChildProcess.make` with
`killSignal`, `ChildProcessSpawner` `string`/`lines`, handle `exitCode`; found at
`node_modules/effect/src/process/ChildProcess.ts:258,632` and `ChildProcessSpawner.ts:96,250-251`) with
`Effect.timeoutOption` for the kill, and `Effect.acquireRelease` for the worktree.

```ts
// before (workers.ts, worktree.ts): spawnSync, then killed = done.signal === "SIGKILL"; worktree removed on the
// normal path only, so an exception in measure() leaks it (run.ts runAll end, backfill.ts:62)
// after
const exec = Effect.fn("exec")(function* (command: string, args: ReadonlyArray<string>, o: Exec) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const child = yield* spawner.spawn(ChildProcess.make(command, args, { cwd: o.cwd, killSignal: "SIGKILL" }));
  const out = yield* child.stdout.pipe(Stream.decodeText(), Stream.mkString, Effect.timeoutOption(o.timeoutMs));
  return { out, exit: yield* child.exitCode }; // Option.none out = killed; the child dies with the Scope
});
const worktree = (commit: string) => Effect.acquireRelease(addWorktree(commit), (w) => removeWorktree(w));
```

Gotchas: `ChildProcessSpawner.string` ignores the exit code (a failed `git` would read as empty), so use `spawn`
and `exitCode`. `ChildProcess` has no `timeout` option. `machine.ts` is synchronous and called from three places in
`run.ts`; Step B makes it Effect-typed, which touches `run.ts` and `compare.ts`. Do Step A first. Needs a spike to
confirm a killed worker keeps its stdout lines (the timed-out path depends on the lines printed before the kill).
Not proposed: `FileSystem`/`Path` for `history.ts` (low value) and Clock in `sample.ts` (see verdicts).

### P5. One flag declaration (-45, risk medium)

Each flag is declared in `options.ts` (parseArgs spec, Schema struct, HELP), re-emitted as argv in
`workers.ts` `workerArgs`, hand-parsed in `worker.ts:6-10,85-93` (`Number(args[at+1])`: `--runs abc` loops until the
timeout), and re-declared in `backfill.ts:16-35`.

```ts
// NEW: the worker takes its Settings as one JSON argument, decoded with the Schema the run encodes with
// workers.ts:  args = [workerFile, JSON.stringify(Schema.encodeSync(WorkerArgs)({ ids, settings }))]
// worker.ts:   const { ids, settings } = Schema.decodeUnknownSync(WorkerArgs)(JSON.parse(process.argv[2]))
// backfill.ts: pass everything after `--` straight to run.ts; drop its parseArgs and its three re-push blocks
```

Removes `flag()`, the `flags` set and `ids` filter in `worker.ts`, five `args.push` in `workerArgs`, and most of
`backfill.ts`'s parsing. Option: `effect/cli` `Flag`/`Command` could replace `parseArgs` in `options.ts` (about
-30 more); it is tagged unstable and I did not spike it, so it is a later step. Also fixes `backfill.ts` never
passing the tier (rows are always quick) by forwarding `--tier`.

### P6. One concern record (-30 net, risk low)

`benches/index.ts` has six per-concern functions with repeated shape: `size: { n: 1, unit: "run" }` at `:34,85,103,134`,
the cold preset `workers: 10, warm: false` at `:126-127,135-136`, the Story bench literal at `:30-37,:62-74,:130-138`,
and `idOf` at `:18`. The special cases for concerns sit in other files: tooling's 30-minute timeout
(`workers.ts:17` and `tooling.ts:9,81`), tooling "only when named" (`select.ts:34`), fault counters
(`result.ts:84-90`).

```ts
// declare.ts: NEW concern table; CONCERNS = Object.keys(CONCERNS_TABLE)
export const concerns = {
  turn:    { benchesOf: turnBenches },
  scale:   { benchesOf: scaleBenches },
  tooling: { benchesOf: () => toolingBenches, onlyWhenNamed: true, timeoutMs: 30 * 60_000 },
  // ...each concern's file exports benchesOf(manifest); a new concern is one file and one entry
} satisfies Record<string, Concern>;
// NEW helper used by turn, scale, startup (three call sites):
const storyBench = (m: Manifest, story: Story<string>, o: StoryBench) =>
  bench({
    concern: o.concern, tags: ["story", ...o.tags], size: o.size ?? RUN,
    load: () => storySubject(story), ...o.rest,
  });
// preset: const COLD = { workers: 10, warm: false } as const
```

Bench already got a `timeoutMs` in the working tree, so the tooling literal can go. Also add `bootSync` and
`disposeSync` helpers: the `Effect.runSync` boot and dispose with a lint-disable comment repeat at
`memory.ts:35-41,59,80,105` and `startup.ts:13-21,26,38` (-15, one directive in place of seven).

### P7. Name one phase of a worker's life (-20, risk medium)

`workers.ts` `workerRun` and `run.ts` encode a lifecycle in booleans: `left.capped`, `capped.any`, `refused.any`,
`run.killed`, `run.atCap`, plus `exited` text; `exitCodeOf` re-reads them. `backfill.ts:39,67,77` repeats
`refused = { any: false }`. `notRun` builds a `Failed` report carrying `NOT_RUN` text and `workerRun` makes three
other inline `Failed`/`TimedOut` literals (`workers.ts` 77,143,155-160 in the pre-edit lines).

```ts
// NEW in report.ts: one closed outcome per spawn, all four report literals become constructors
type Ended = { _tag: "Exited"; got: Reports } | { _tag: "Killed"; got: Reports } | { _tag: "Capped"; got: Reports };
// workerRun is a fold over Ended; exit code derives from the reports: Report gains a "NotRun" tag
// (reports.some(NotRun) -> 3; refusal -> 2; any Failed/TimedOut -> 1)
```

Risk: touches exit codes that tests pin (`tests/bench/limits.test.ts:61-62` read the strings). Do after P4 since
P4 rewrites the same function. `sample.ts` also throws `class WorkChanged extends Error` and `TimedOut extends
Error` for expected failures (`sample.ts:30,35,59,61,102`); STYLE says expected failures are values, and
`worker.ts` already has `Data.TaggedError` classes for this. Convert at the same time.

### P8. Timing as data, not strings (-12, risk low)

`Report.timing` is `Record<string, number>` (`report.ts:19`); keys are written in `worker.ts` and `sample.ts` and
read by string in `timing.ts:45-59` with `?? 0`, so a typo reads zero. Make it a `Schema.Struct` of the eight
fields. In the same file: `timing.ts:72` takes the upper middle where `stats.ts` `medianOf` averages (use
`medianOf`); `Done` is declared in `result.ts:11` and `timing.ts:43`; `timing.ts:65` `ms` and `run.ts:28-34`
`number` are one formatter; the `replaceAll(/[-:.]/gu, "")` date stamp is in `run.ts` twice.

### P9. Smaller names and derived fields (-15 to -25, risk low to medium)

- `Confidence` is two types: `history.ts:17` (`recorded | backfill`) and `compare.ts:14` (`interleaved | stored`);
  `run.ts` passes the literal "interleaved" and `compare.ts` only tests `=== "stored"`. Make the argument a
  `stored: boolean` and rename the other (-6). `tree` and `confidence` both come from `options.backfill`
  (`run.ts` `record`); derive one.
- `measure` names three functions (`sample.ts`, `workers.ts`, `memory.ts:88`); `Measure` names two types
  (`declare.ts`, `memory.ts:31`). Rename: `sampleBench`, `runBatch`, `MemoryKind`.
- `busyReason` calls `environmentOf`, which runs `pmset` on darwin, once per batch and once in `refusalOf`; it needs
  only load and cores. `commitOf` runs two `git` processes at three call sites in `run.ts`. Compute once in `runAll`.
- Stored but derivable (needs the user: it changes the history CSV): `budget_state` is a function of `budget`,
  `median` and `max` of the same row; `concern` is the prefix of `bench`. Dropping them is -4 and a column
  migration, so I do not recommend it now.
- `values.ts` carries six `FLOW_STATE_ALLOW_UNKNOWN` lines; one `type Field = unknown` alias with one reason cuts
  five.

### P10. Readability pass (-60 lines of comments, risk none)

Doc comments over 120 characters: `declare.ts:45,74`, `report.ts:6`, `select.ts:6,46`. Over 120 in directives or
strings: `run.ts:338`, `worker.ts:111`, `memory.ts:37`, `startup.ts:16`. Restating comments, for example
`worktree.ts:6-8`, `declare.ts:16-18`, `report.ts:31-33`, `time.ts:4-6`, `result.ts:8-10`, `memory.ts:86-87`;
about 100 `//` lines in total, keep the why-lines (`sample.ts:5`, `run.ts` tree comment). The `compare.ts:65-66`
doc comment is wrapped mid-phrase.

## Likely bugs found on the way (not part of the line count)

1. `benches/index.ts:42` `turnBench(m.savedStress.story, false)` leaves `stress` false, so the saved stress Story
   runs only in the full tier, never in `--stress`. The manifest calls it a stress Story. Confirm intent; with P3 it
   becomes one `place` value on the line.
2. `--full --dev` runs dev with no message (P3 removes this).
3. `worker.ts:6-10` accepts `--runs abc` (P5 removes this).
4. Worktree leak on an exception (P4).
5. `workers.ts` comment says gc benches keep their own process; only `!b.warm` benches do, and `--expose-gc`
   applies to the whole batch.

## Estimated reduction

| Proposal | Lines | Risk |
| --- | --- | --- |
| P1 series helper | -16 | low |
| P2 dead fields | -45 | low |
| P8 timing as data | -12 | low |
| P10 comments and widths | -60 | none |
| P6 concern record and boot helpers | -45 | low |
| P4 process helper (A -15, B -30) | -45 | medium |
| P3 tier table | -45 | medium |
| P5 flag declaration | -45 | medium |
| P7 outcome as data | -20 | medium |
| P9 names and derived | -20 | low to medium |

Total about 350 lines (range 330 to 390), overlaps removed. Suggested order: P1, P2, P8, P10, P6, P9, then P3, P4A,
P5, P4B, P7. Land them after the in-flight edits to `workers.ts` and `run.ts` settle: P3, P4, P5 and P7 all touch
those two files.

## Sidecar findings, with verdicts

Accepted (verified against the file): series grouping copies; five `spawnSync` sites; boot and dispose repeats;
flags in four places; `timing` string keys; tier name in four copies and identical quick/stress rows; two
`Confidence` types; dead `headline`; write-only `TimedOut.samples`; `timeStory` always called with 1 outside one test;
`timing.ts` median disagreeing with `medianOf`; doc comments over 120; `busyReason` spawning `pmset`; worktree leak
on the exception path; saved-stress `stress=false` (flagged as "confirm", not as a bug).

Changed: "inline `time.ts` into `story.ts`" (-35) became P2's smaller `timeRun`, because `tests/bench/run.test.ts`
imports it to prove the bench does the tested run's turns. "Move per-concern builders beside subjects" was kept
but expressed as the concern record (P6). "Use `Effect.timeoutOption` for the bench's late() checks" changed to
"only for process kills" (P4).

Rejected: replacing `late()` in `sample.ts` with `Effect.timeout` (an Effect per sample distorts the timed loop;
AGENTS.md puts 20-25x on Effect calls, and the samples taken so far would be lost); `Clock` in hot loops
(same reason; `Clock.monotonicTimeNanos` at the edges is not worth the change); `Random.withSeed` for the xorshift
in `stats.ts` (values differ, so recorded intervals would change); `FileSystem`/`Path` for `history.ts` and
`timing.ts` (more code than it removes); an Effect CSV codec (none installed; the 16-line parser stays);
`NodeRuntime.runMain` (not verified it can return codes 0 to 3); JSONL history instead of CSV (-25 lines, but it
changes the stored format: the user's call, not proposed); dropping `budget_state` now (column migration).
Sidecar claim "`--small`": no such flag exists; the real overlap is `--max-n` against dev's smallest-point rule,
which P1 puts in one function. Sidecar claim about `Done` and `Confidence` "doc lists a third value": the doc at
`history.ts:14` does say "measured in this run beside its comparison", which the schema lacks; folded into P9.

Unverified: the `effect/cli` `Flag` API (P5 option) and that a killed child's partial stdout survives the Effect
spawner (P4 spike).
