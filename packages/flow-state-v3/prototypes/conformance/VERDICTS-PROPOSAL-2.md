# Proposal 2: one reading of a run

Status: **proposed**, 2026-11-08. This is the convergence pass's single revision. It takes `VERDICTS-PROPOSAL.md` (proposal 1,
kept as prior art) and all 27 rows of `VERDICTS-REVIEW-1.md` together. Nothing here is decided, and no code was changed. All paths
are under `packages/flow-state-v3/prototypes/conformance/` unless they say otherwise. In the code, "existing", "renamed" and
"dropped" refer to today's code, and "NEW" means not in today's code.

## 0. What changed from proposal 1

The 27 rows come down to four gaps. Proposal 1 fixed the reading but left four questions open. Each is now answered once.

| Gap | The question proposal 1 left open | Rows |
| --- | --- | --- |
| **G1. Whose answer** | Which ways a run can end are the program's answer, and which are the machine's? Proposal 1 called every non-stated end the machine's. That hid a throw at load (#3), a memory blow-up (#10), a timer loop (#1) and a budget hit (#11), and it called an errno a program failure (#22). It also treated a tool's exit (#7), overflow (#9) and the kill race (#17) as contract questions. | 1, 3, 5, 7, 9, 10, 11, 17, 22, 26 |
| **G2. What was answered** | What does a verdict say, typed at its source? Proposal 1's items had no kind, no structured killers, no "not scored" state and no run identity. So consumers still had to guess: which items are oracles, who printed this line, what pass means. | 2, 6, 8, 12, 18, 19, 20, 21, 25 |
| **G3. What it may cost** | What may a run cost, and who bounds it? Proposal 1 sized nothing from measurements, had no global bound, let nested pools declare their own size, and let "alone" mean alone in one process. | 4, 5, 13, 14, 23, 24 |
| **G4. Proof on both commits** | How do the plants run against the old commit? Proposal 1's plants imported modules the old commit lacks, and the child's own contract had no plants. | 13, 15, 16 |

Row 27 is the complete E list (section 10).

What survives unchanged from proposal 1, as the review asked ("Resolved well"):
- C1, top-only alone reruns, with the `events()` proof;
- C3, one VERDICT line after every human line, with `--out` and the CLI pins untouched;
- `read`'s order: unstarted, killed, signal, verdict, exit agreement. Overflow leaves that order (it becomes evidence, #9), and an identity check joins it (#18);
- slot release in `finally`, `Unstarted` for a throw from `open`, and a single top-level rerun;
- U5, the allow list of known reds, deferred to the user.

## 1. The one rule, restated

> **A run means only the program's own answer: the verdict it finished stating, or a bound it crossed that depends on the
> program alone. Anything the machine decided, and anything the child did not finish stating, is `unknown`. Unknown is red,
> scores nothing, and gets one rerun alone, from the top, inside the run's budget.**

What changed from proposal 1: "a bound it crossed that depends on the program alone." Proposal 1 had no place for a run the
program ended by being wrong in a measurable, repeatable way, other than by stating it. Section 2's table is that place. It is the
only list of endings, and every consumer gets it through `read`.

## 2. Every way a run ends (G1)

This table is the design's core. Each row is decided by the program or by the machine, and each says how `read` and `stated`
treat it. Nothing else may decide.

| # | Ending | Whose | Reading | Outcome |
| --- | --- | --- | --- | --- |
| 1 | A `VERDICT` line that decodes, is the only one, is the last, names the expected gate and run, and agrees with the exit | program | `stated` | from its items |
| 2 | A throw inside `stated`'s body, **including while loading the code under test** (#3) | program | `stated`, one `fail` item of kind `threw` | fail |
| 3 | A throw whose `code` is a resource errno: `EMFILE`, `ENFILE`, `ENOSPC`, `EAGAIN`, `ENOMEM`, `EBUSY` (#22) | machine | `stated`, one `unknown` item of kind `machine` | unknown |
| 4 | A deterministic bound inside the program: tasks per settle (existing), **work per harness call** (NEW, #1), a search's state budget (#5, #11) | program | inside a `stated` verdict, as a case FAIL or a search item | from its items |
| 5 | A watchdog memory kill where the kill limit is at least `MEMORY_MARGIN` (1.5) times the program's measured reference peak (#10) | program | `bound`, `{ kind: "memory" }` | fail |
| 6 | A watchdog memory kill with no reference, or with a tighter limit | machine | `none`, `{ kind: "memory-near" }` | unknown |
| 7 | A watchdog time kill | machine | `none`, `{ kind: "time" }` | unknown |
| 8 | The top's global budget ran out (#4) | machine | `none`, `{ kind: "budget" }` | unknown |
| 9 | Ended by a signal the watchdog did not send | machine | `none`, `{ kind: "signal" }` | unknown |
| 10 | Spawn or `open` threw | machine | `none`, `{ kind: "unstarted" }` | unknown |
| 11 | Exit without a `VERDICT` line; a garbled line; two `VERDICT` lines; a `VERDICT` naming another gate or run; an exit that disagrees | nobody: the contract broke | `none`, with that cause | unknown |
| 12 | A **tool** (tsc) ends by itself (#7) | program | `stated`, synthesized: exit 0 is `pass`, any other is `fail`. No agreement check. | from the exit |
| 13 | A **program under test** (the `flow` CLI, pinned by `cli/main.ts`) ends by itself (#19) | program | not `read`: `programOutput(run)` gives its stdout and exit to the pin that tests it | the pin's item |

The kill race (#17) is decided by this rule. The watchdog records its decision, then kills. A run is "killed" only if the
decision came **before** the child exited. `exitedBeforeKill` is read from the child's own exit status:

- a child the watchdog SIGKILLed always ends with a signal status (`signalCode` set);
- a normal exit status (`exitCode` set, `signalCode` null) proves the child ended on its own first, whatever its code;
- `sh -c` exiting 137 by itself is therefore a normal exit 137, read through its verdict or its missing verdict. It is never
  mistaken for our kill.

Overflow is evidence, not an ending (#9). Each stream keeps its first 8 MB and its last 1 MB. The last line is always kept whole,
up to 64 MB, so a long `VERDICT` survives. The dropped byte count is recorded. A child that writes 16 MB of warnings and then
states is read normally.

Why memory is the program's answer and time is not. Load stretches time. Peak RSS of a single-threaded Bun child barely moves
with load: the samples are noisier under load, but they only ever read lower. The margin absorbs GC noise. STATUS.md's alone
range for the suite is 1.0-1.3 GB, about 30%, so 1.5 times a measured maximum is "well above". The reference is measured, not
guessed. For a mutant it is the control's peak in the same mutate.ts run. For a gates.ts job it is the row's declared peak. For a
nested suite it is `SUITE.size.peakMb`. Where no reference exists, a memory kill is the machine's.

U1, a synchronous CPU loop inside one runtime step, is still a time kill, so it is the machine's ending. A mutant known to do that
is moved into a reviewed `unscored` section of its list, with the reason (#26). It is listed in every run's verdict as a noted
item, and never dropped.

## 3. What a verdict says (G2)

### 3.1 Items are typed at their source

- Every item has a `kind`, chosen by the child that states it. For main.ts the kinds are `case` (named oracles), `output`
  (whole output, D134), `lock`, `recipients`, `catalog`, `only`, and `threw` or `machine` (section 2).
- A consumer says which kinds it judges. Items of kind `threw` and `machine` are always judged, whatever filter is given.
- So mutate-one's `suite` item judges `case`, and its `output` item judges `output`. Neither judges `lock`, `recipients` or
  `catalog`, which differ by design in a mutant's copy (D134, `main.ts:497-504`). Controls judge `case`. gates.ts judges
  everything, so the suite job is still red on the lock, as today (#2).
- An item is **scored** (`outcome`, `why`) or **noted** (`note`): listed in the verdict, never counted (#20).
  - D113's invalid mutants are noted.
  - A survivor whose `kills` is empty is noted, as "claims nothing" (#12).
  - Unscored hang mutants are noted (#26).
  - A verdict with no scored item is `fail` ("nothing was scored").

### 3.2 Outcome and attribution (#8)

- **Outcome:** `fail` if any judged scored item failed, otherwise `unknown` if any is unknown, otherwise `pass`. Order never
  changes an outcome.
- **Attribution** (mutate-one's `killedBy`): the first `fail` in the gate's stated order. When an earlier gate is `unknown`, the
  item's `detail.before` lists it. The kill stands, because a finished gate stated it, and the doubt about attribution is shown.

### 3.3 Structured evidence (#6)

`expect` copies the names of the child's failing judged items into its own item's `detail.failed`. mutate-one's `suite` item
carries the failing case names there, so `mutants.json`'s `killers` stay case names. `report.ts:210` (`proven`) keeps its D33
coverage.

### 3.4 Identity (#18)

The runner mints each launch a run id from its parent's id and a counter: `top`, `top.3`, `top.3.1`, and `top.3.alone` for the
alone attempt. That is deterministic, because ids are assigned in submission order. Every launch also says which gate it expects.
`read` accepts a stdout only if:

- exactly one line starts with `VERDICT ` (matched at line start only);
- that line is the last non-empty line;
- its `gate` and `run` equal the launch's.

A grandchild's verdict leaked into a child's stdout has the wrong run id, so it reads `foreign`. A second line reads `duplicate`.
A `VERDICT` on stderr is never looked for, so that child reads `silent`.

### 3.5 Determinism of the line (#25)

No item's `why` or `detail` holds a time, a memory figure, a temp path or a pid. PASS lines keep their `ms` for people, and the
case item's `why` is `""`. Search reports lose `ms` and `peakRssMb` (section 4.2). Temp copy paths in failure texts are replaced
with `<copy>` by `stated` before it writes. So two runs of a deterministic gate state byte-identical lines (L4).

## 4. Bounds and budgets (G3)

### 4.1 One work bound per harness call (#1)

The fake counts **work**:

- each `settleStep` is one unit (in `fake-world.ts:798`);
- each timer that `advanceWith` fires is one unit (`fake-world.ts:815-830`, existing loop). That loop is where a mutant that
  re-arms a timer at `now()` escapes every settle bound today, because each settle quiesces while the timer loop never ends.

drive.ts marks the count at the start of every public harness call (`start`, `do`, `send`, `release`, the reads that settle).
When a call's work passes `WORK_PER_CALL`, it throws `harness: did not quiesce in N work units in one call` (NEW). The 5000-task
bound per settle stays, with its failure text. The 20 s clock check (`drive.ts:1416`) is **dropped**. Proposal 1's
`SETTLE_STEPS` is replaced by this bound.

Sizing: at landing, one instrumented run of the suite and every search on the real runtime records the largest work count of any
call. `WORK_PER_CALL` is the next power of ten at or above 20 times that maximum. Both numbers go into STATUS.md, and the constant
goes under the lock. A no-task spin and a re-armed timer both reach the bound in milliseconds.

### 4.2 Searches end on state budgets, sized from measurements (#5, #11)

- `bfs` drops `deadlineMs`, `ending` and `process.memoryUsage`. `Report` drops `ms` and `peakRssMb` (**dropped** from
  `Report`). search/run.ts, the host, measures them around the call and prints them as a human line (#19). The engine is then
  pure.
- `--seconds` is **dropped** from search/run.ts. After deadlines go it means nothing to the search. A caller's time limit is its
  watchdog `limits.seconds`, passed to `spawnRun`. search/run.ts makes `--depth` and `--states` required, with no defaults (the
  default 400 000 states was never sized), and adds `--expect <verdict>`.
- A search's verdict is its own result. As an item it is `pass` iff the verdict equals the caller's stated expectation. `failed`
  and `vacuous` are never a pass expectation. `inconclusive` (budget hit) passes only where the caller expects it, so a budget hit
  where `completed` is expected is a `fail` (#11).
- falsify's "red on null / constant hash" checks require the verdict to be `failed` or `vacuous` (`detail.verdict`), so an
  inconclusive null search is not counted as red.
- Sizing rule: each caller's budget, measured alone, takes at most a third of the watchdog of the process it runs in.

| Caller | Budget (depth / states) | Runs in | Watchdog | Measured alone | Action |
| --- | --- | --- | --- | --- | --- |
| mutate-one `--search`, flush serialize store | 11 / 8000 | mutate-one, in-process | MUTANT_SEARCH | **measured here:** via search/run.ts (`flush.serialize.directed`): `completed`, 5969 states, 214 107 steps, 23.0 s, 296 MB max RSS | In-process mutate-one runs with `onePre` off, so more replays. Re-measure there. The `--search` path gets its own watchdog, `MUTANT_SEARCH.seconds` = 3 times the measured alone time of the whole `--search` run. |
| mutate-one `--search`, chain | 4 / 6000 | same | same | at landing | same rule |
| mutate-one `--search-only` (store, queue, bare) | 12 / 3000 | same | same | at landing | same rule |
| falsify `search` part, 14 searches times 3 runtimes | 4 / 4000 | search/run.ts child | `SEARCH` (120 s) | at landing | each at most 40 s alone, or the budget is lowered. `--expect` per search from a table in falsify.ts, measured on the real runtime. |
| `round-14/checks/search-vacuity-check.ts` | 6 / 30 | the check | the check's job | at landing | drop `deadlineMs: 30_000` |
| FRAG-15 | 5 / 1200 | the suite | `SUITE` (240 s) | at landing | assert `verdict` and `depthCompleted` |
| SEARCH-ODD-SMALL | 2 / 800 | the suite | `SUITE` | at landing | same |

Budget measurements are clock readings, so they decide no gate. They size bounds, and they live in STATUS.md as reviewed
evidence. gates.ts prints each job's actual time beside its declared `aloneS`. A first-attempt time over twice the declared value
prints `re-measure`, which is a human note, not an item.

### 4.3 Time: alone limits from measurements, and a global budget (#4)

- **First attempts** keep today's limits (280/290/200 s), which were tuned under load.
- **Alone attempts** get `min(first limit, max(30, 3 × aloneS))`, where `aloneS` is the job's measured alone time in alone mode,
  serial inside. An unknown no longer costs a whole 290 s watchdog.
- **The global budget.** gates.ts runs under `--budget 600` (NEW, the default). The budget is a clock, so it never decides `pass`
  or `fail`:
  - no alone attempt starts unless `elapsed + its alone limit ≤ budget`. One that cannot start stays `unknown`, with the cause
    "no budget left for the alone rerun";
  - at the budget, the top kills every live tree. Each is `unknown: budget`.
  - Other top processes (mutate.ts, falsify, lifetime-falsify run by hand) take an optional `--budget`, with no default. Their
    lists can legitimately run for an hour.

**The worst case for gates.ts is 600 s plus closing time, by construction.** Closing is one 40 ms poll, the SIGKILL of every
tree, reaping, and writing `--out`: under 5 s. So the bound is **605 s**. Without the budget, the old worst case was the sum of
the alone limits, about 2200 s (section 9 has the arithmetic). A green run is expected to take 130-150 s.

### 4.4 Memory and slots: nested pools are slices (#14)

- A job's row declares `size: { slots, peakMb, aloneS }`. `peakMb` is the measured peak, used for packing and as the memory
  reference.
- The child gets its slice in its env, `FLOW_POOL=<slots>:<mb>`. A nested process's runner uses that slice, never its own
  numbers. mutate-one under gates.ts gets `4:5000` and packs suite children by `SUITE.size.peakMb` (1750): two at once plus
  small jobs, where today it starts four.
- Kill limits are separate from packing. Every parent's kill limit is at least the sum of its concurrently allowed children's
  kill limits plus its own peak. The runner checks this when it builds a launch and refuses a launch that breaks it. That refusal
  is a defect (thrown), not a verdict.

| Limits (`limits.ts`) | Kill MB | Reference peak MB (measured) | Seconds | Was |
| --- | --- | --- | --- | --- |
| `SUITE` (any main.ts child) | 2700 | 1750 (full suite with FRAG-15, falsify's note) | 240 | falsify 2000, lifetime 1500, mutate-one's children unbounded |
| `SEARCH` (search/run.ts child) | 1200 | 296 for the largest measured (section 4.2) | 120 | falsify 2000, deadline 60 s |
| `MUTANT` (one serial mutate-one tree) | 3500 | the control's peak in this run | 240 | 2000 |
| `MUTANT_SEARCH` | 3500 | the control's peak | 3 × measured | 240 |
| gates.ts job | `max(2 × peakMb, 3000)` (existing) | `peakMb` (existing `mb`) | existing `limit` | same |

### 4.5 One runner, one process, alone across processes (#23, #24)

- `scope.runner` returns the same runner on every call. A call with a different pool is a defect.
- `stated` installs SIGINT and SIGTERM handlers. They close the runner (killing every detached tree), remove every snapshot the
  scope made, write `VERDICT` with an `unknown` item `interrupted`, and exit 2.
- **Machine-wide alone.** Each top registers `$TMPDIR/flow-verdicts/tops/<pid>.json` with its running count, updated on every
  start and end. Entries whose pid is dead are ignored. An alone attempt needs:
  - the exclusive lock `$TMPDIR/flow-verdicts/alone.lock` (an `O_EXCL` file holding the pid; stale when the pid is dead);
  - every other live top reporting 0 running.

  While another top holds the lock, a top starts no first attempts. The wait counts against the budget.
- mutate-one run by hand is a top. All its spawns, including `checks/*` (today unbounded `spawnSync`), go through its runner
  with `SUITE` limits (#24).

## 5. The module: types and signatures in full

Files, all NEW:
- `verdicts/verdict.ts` (pure);
- `verdicts/read.ts` (pure);
- `verdicts/spawn.ts`, the watchdog, `watch.ts`'s `watched` moved;
- `verdicts/runner.ts`;
- `verdicts/snapshot.ts`;
- `verdicts/state.ts`;
- harness config `limits.ts`.

The first six port as a folder to `packages/flow-state-v3/conformance/verdicts/`.

### `verdicts/verdict.ts`

```ts
import { Result, Schema } from "effect";

export const Outcome = Schema.Literals(["pass", "fail", "unknown"]);                // NEW
export type Outcome = typeof Outcome.Type;                                           // NEW

export const Scored = Schema.Struct({                                                // NEW
  kind: Schema.String,
  name: Schema.String,
  outcome: Outcome,
  why: Schema.String,
  detail: Schema.optionalKey(Schema.Json),
});
export const Noted = Schema.Struct({                                                 // NEW (#20)
  kind: Schema.String,
  name: Schema.String,
  note: Schema.String,
  detail: Schema.optionalKey(Schema.Json),
});
export const Item = Schema.Union([Scored, Noted]);                                   // NEW
export type Scored = typeof Scored.Type;                                             // NEW
export type Noted = typeof Noted.Type;                                               // NEW
export type Item = typeof Item.Type;                                                 // NEW

export const Verdict = Schema.Struct({                                               // NEW
  gate: Schema.String,
  run: Schema.String,
  items: Schema.Array(Item),
});
export type Verdict = typeof Verdict.Type;                                           // NEW

export const MARK = "VERDICT ";                                                      // NEW
export const EXIT = { pass: 0, fail: 1, unknown: 2 } as const satisfies Record<Outcome, number>;  // NEW
export const ALWAYS_JUDGED: readonly string[] = ["threw", "machine"];                // NEW

export const isScored = (i: Item): i is Scored => "outcome" in i;                    // NEW
export const judged = (items: readonly Item[], kinds?: readonly string[]): readonly Scored[] =>  // NEW
  items.filter(isScored).filter((i) => kinds === undefined || kinds.includes(i.kind) || ALWAYS_JUDGED.includes(i.kind));

export const outcomeOf = (items: readonly Item[], kinds?: readonly string[]): Outcome => {  // NEW (#8)
  const s = judged(items, kinds);
  if (s.length === 0 || s.some((i) => i.outcome === "fail")) return "fail";
  return s.some((i) => i.outcome === "unknown") ? "unknown" : "pass";
};
export const firstFail = (items: readonly Item[], kinds?: readonly string[]): Scored | undefined =>  // NEW
  judged(items, kinds).find((i) => i.outcome === "fail");
export const unknowns = (items: readonly Item[]): readonly string[] =>               // NEW
  items.filter(isScored).filter((i) => i.outcome === "unknown").map((i) => i.name);
export const noted = (items: readonly Item[]): readonly Noted[] =>                   // NEW
  items.filter((i): i is Noted => !isScored(i));

export const encode = (v: Verdict): string => `${MARK}${JSON.stringify(v)}`;         // NEW

export type Unstated =                                                               // NEW
  | { readonly kind: "silent" }
  | { readonly kind: "garbled"; readonly issue: string }
  | { readonly kind: "duplicate"; readonly count: number }
  | { readonly kind: "foreign"; readonly gate: string; readonly run: string };
export const theVerdict = (                                                          // NEW (#18): one line, at line start, last, ours
  stdout: string,
  expect: { readonly gate: string; readonly run: string },
): Result.Result<Verdict, Unstated>;

export type Holds = (v: Verdict) => string | null;                                   // NEW: null = holds
export type Judge = { readonly kinds?: readonly string[]; readonly holds?: Holds };  // NEW
export const expect = (                                                              // NEW (#2, #6)
  kind: string,
  name: string,
  r: Reading,
  want: "pass" | "fail",
  judge?: Judge,
): Scored;
export const sameCases = (planned: readonly string[]): Holds;                        // NEW: names of `case` items equal planned
export const searchVerdictIn = (verdicts: readonly string[]): Holds;                 // NEW (#11): detail.verdict of the search item
```

`expect` maps one reading to one item:

| The reading | The item |
| --- | --- |
| `none` (machine or broken contract) | `unknown`, why = `describe(r)` |
| `bound` (memory) | `want === "fail"` and no `holds`: `pass`. Otherwise `fail`, why "answered by memory, not stated". |
| `stated`, judged outcome `unknown` | `unknown` |
| `stated`, judged outcome = `want`, and `holds` is null | `pass`, `detail.failed` = the failing judged names |
| `stated`, anything else | `fail`, why "wanted fail, was pass" or the `holds` text, `detail.failed` = the failing judged names |

### `verdicts/spawn.ts`

```ts
export type Limits = { readonly mb: number; readonly seconds: number };              // NEW
export type Contract = "gate" | "tool" | "program";                                  // NEW (#7, #19)

export type RunSpec = {                                                              // NEW
  readonly gate: string;
  readonly cmd: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly limits: Limits;
  readonly contract: Contract;
};
export type Launch = RunSpec & {                                                     // NEW: what the runner adds
  readonly run: string;
  readonly referenceMb: number | null;
  readonly pool: { readonly slots: number; readonly mb: number };
  readonly alone: boolean;
};

export type Stream = { readonly head: string; readonly tail: string; readonly lastLine: string; readonly dropped: number };  // NEW (#9)
export type Ended = {                                                                // renamed: from Watched
  readonly kind: "ended";
  readonly launch: Launch;
  readonly exit: number | null;                                                      // renamed: from code
  readonly signal: string | null;                                                    // NEW
  readonly decided: "rss" | "time" | "budget" | null;                                // NEW: what the watchdog decided, before the child exited
  readonly killed: boolean;                                                          // NEW: decided, and the child's status is a signal (#17)
  readonly peakMb: number;                                                           // existing; evidence and memory reading
  readonly ms: number;                                                               // existing; evidence only
  readonly stdout: Stream;                                                           // changed: head, tail, whole last line
  readonly stderr: Stream;                                                           // NEW: always drained
  readonly leftovers: number;                                                        // existing
};
export type Unstarted = { readonly kind: "unstarted"; readonly launch: Launch; readonly message: string };  // NEW
export type Run = Ended | Unstarted;                                                 // NEW

export const HEAD_BYTES = 8 * 1024 * 1024;                                           // NEW
export const TAIL_BYTES = 1024 * 1024;                                               // NEW
export const LAST_LINE_BYTES = 64 * 1024 * 1024;                                     // NEW

export const spawnRun = (launch: Launch, o: { readonly echo: boolean; readonly stop: AbortSignal }): Promise<Run>;  // renamed: from watched
export const killed = (decided: Ended["decided"], signal: string | null): boolean => decided !== null && signal !== null;  // NEW (#17)
export const programOutput = (run: Ended): { readonly stdout: string; readonly exit: number | null } | null;  // NEW (#19): only for contract "program"
export const isTop = (): boolean;                                                    // NEW: FLOW_NESTED !== "1"
export const isAlone = (): boolean;                                                  // NEW: FLOW_ALONE === "1"
export const inheritedPool = (): { readonly slots: number; readonly mb: number } | null;  // NEW (#14): FLOW_POOL
export const runId = (): string;                                                     // NEW: FLOW_RUN, or "top"
```

`spawnRun` keeps from `watched`:
- the tree walk by `lstart`, the process group, the 40 ms poll, `endTree`, `leftovers` and tree RSS (D129) — all existing;
- stdin ignored.

It changes or adds:
- both streams are drained at the same time;
- it sets `FLOW_NESTED=1`, `FLOW_RUN`, `FLOW_POOL` and, on alone attempts, `FLOW_ALONE=1`;
- `echo` (top only) copies the streams to the parent's stderr;
- `stop` aborts with the reason `budget`.

`programOutput` returns null unless the contract is `program`. It is the one sanctioned reader of a child's stdout, for the
`flow` CLI pins.

### `verdicts/read.ts`

```ts
import { Result } from "effect";
import type { Ended, Run } from "./spawn.ts";
import { EXIT, outcomeOf, theVerdict, type Outcome, type Unstated, type Verdict } from "./verdict.ts";

export const MEMORY_MARGIN = 1.5;                                                    // NEW (#10)

export type NoAnswer =                                                               // NEW
  | { readonly kind: "unstarted"; readonly message: string }
  | { readonly kind: "time" }
  | { readonly kind: "budget" }
  | { readonly kind: "memory-near"; readonly peakMb: number; readonly limitMb: number; readonly referenceMb: number | null }
  | { readonly kind: "signal"; readonly signal: string }
  | { readonly kind: "disagree"; readonly exit: number | null; readonly stated: Outcome }
  | Unstated;
export type Bound = { readonly kind: "memory"; readonly peakMb: number; readonly limitMb: number; readonly referenceMb: number };  // NEW

export type Reading =                                                                // NEW
  | { readonly answer: "stated"; readonly verdict: Verdict; readonly run: Ended }
  | { readonly answer: "bound"; readonly bound: Bound; readonly run: Ended }
  | { readonly answer: "none"; readonly cause: NoAnswer; readonly run: Run };

const toolVerdict = (run: Ended): Verdict => ({
  gate: run.launch.gate,
  run: run.launch.run,
  items: [{ kind: "tool", name: run.launch.gate, outcome: run.exit === 0 ? "pass" : "fail", why: `exit ${run.exit}` }],
});

const memory = (run: Ended): Reading => {
  const ref = run.launch.referenceMb;
  const limitMb = run.launch.limits.mb;
  return ref !== null && limitMb >= MEMORY_MARGIN * ref
    ? { answer: "bound", bound: { kind: "memory", peakMb: run.peakMb, limitMb, referenceMb: ref }, run }
    : { answer: "none", cause: { kind: "memory-near", peakMb: run.peakMb, limitMb, referenceMb: ref }, run };
};

export const read = (run: Run): Reading => {                                         // NEW
  if (run.kind === "unstarted") return { answer: "none", cause: { kind: "unstarted", message: run.message }, run };
  if (run.killed && run.decided === "rss") return memory(run);
  if (run.killed && run.decided === "time") return { answer: "none", cause: { kind: "time" }, run };
  if (run.killed && run.decided === "budget") return { answer: "none", cause: { kind: "budget" }, run };
  if (run.signal !== null) return { answer: "none", cause: { kind: "signal", signal: run.signal }, run };
  if (run.launch.contract === "program") throw new Error(`read of a program under test: ${run.launch.gate}`);
  if (run.launch.contract === "tool") return { answer: "stated", verdict: toolVerdict(run), run };
  const v = theVerdict(`${run.stdout.tail}${run.stdout.lastLine}`, { gate: run.launch.gate, run: run.launch.run });
  if (Result.isFailure(v)) return { answer: "none", cause: v.failure, run };
  const o = outcomeOf(v.success.items);
  if (run.exit !== EXIT[o]) return { answer: "none", cause: { kind: "disagree", exit: run.exit, stated: o }, run };
  return { answer: "stated", verdict: v.success, run };
};

export const outcome = (r: Reading, kinds?: readonly string[]): Outcome =>           // NEW
  r.answer === "stated" ? outcomeOf(r.verdict.items, kinds) : r.answer === "bound" ? "fail" : "unknown";
export const describe = (r: Reading): string;                                        // NEW: outcome, first fail or cause, counts; no times
```

The duplicate check covers the whole stdout: `head` plus `tail`. A duplicate in the dropped middle of an overflowing stream cannot
be seen. That run is still read by its last line, and the dropped byte count is shown (U9).

### `verdicts/runner.ts`

```ts
import type { Reading } from "./read.ts";
import type { RunSpec } from "./spawn.ts";

export type Size = { readonly slots: number; readonly peakMb: number; readonly aloneS: number };  // NEW: measured
export type Pool = { readonly slots: number; readonly mb: number; readonly budgetS: number | null };  // NEW
export type Opened = { readonly spec: RunSpec; readonly close: () => void };         // NEW
export type Job = { readonly name: string; readonly size: Size; readonly open: () => Promise<Opened> };  // NEW
export type Done = { readonly job: Job; readonly first: Reading; readonly alone: Reading | null; readonly skipped: string | null };  // NEW
export type Event = { readonly job: string; readonly attempt: "first" | "alone"; readonly at: "start" | "end" };  // NEW
export type Runner = {                                                               // NEW
  readonly run: (job: Job) => Promise<Done>;
  readonly close: () => Promise<void>;
  readonly events: () => readonly Event[];
};

export const makeRunner = (pool: Pool): Runner;                                      // NEW (via Scope only)
export const job = (name: string, spec: RunSpec, size: Size): Job;                   // NEW: a job that needs no copy
export const final = (d: Done): Reading => d.alone ?? d.first;                       // NEW
export const aloneLimit = (first: number, size: Size): number => Math.min(first, Math.max(30, 3 * size.aloneS));  // NEW (#4)
```

The runner's rules. Rules 1-4 are proposal 1's, kept as the review asked. Rules 5-7 are new.

1. **Packing** (existing). A first attempt starts when its slots and memory fit the pool, or when nothing runs. The longest
   `aloneS` goes first. The pool is the inherited slice when nested (#14), and one slot under `FLOW_ALONE`.
2. **Holding.** Slots and memory are taken before `open` and released in `finally`. A throw from `open` is `Unstarted`. `close`
   always runs.
3. **Alone rerun.** A first attempt whose outcome is `unknown`, in a top runner, queues an alone attempt. It starts only when
   this runner is idle, no first attempt waits, the machine-wide lock is held and no other top is running (4.5). It runs with
   `FLOW_ALONE=1` and `aloneLimit`, and its reading is final. Nested runners never queue one.
4. **Close** kills every tree and resolves when they are gone.
5. **Budget** (#4). With `budgetS`, an alone attempt starts only if it fits the remaining budget; otherwise `skipped` gets the
   reason. At the budget, every live attempt is stopped with `budget`.
6. **Reference** (#10). A launch's `referenceMb` is `size.peakMb`, or null when `peakMb` is 0, which means unmeasured. A null
   reference makes every memory kill `memory-near`, so `unknown`.
7. **Ids** (#18). Run ids come from the parent's id and the submission counter.

### `verdicts/snapshot.ts`

```ts
import type { Result } from "effect";

export type Edit = readonly [file: string, find: string, replace: string];           // existing shape
export type Snapshot = { readonly root: string; readonly trees: readonly string[] }; // renamed: from mutate.ts's pristine
export type Copy = { readonly dir: string; readonly close: () => void };             // NEW
export type Problem = { readonly id: string; readonly problem: "does not apply" | "does not parse"; readonly why: string };  // NEW
export const snapshot = (sources: readonly string[]): Snapshot;                      // renamed: from mutate.ts's pristine copy
export const check = (s: Snapshot, tree: string, id: string, edits: readonly Edit[]): Problem | null;  // NEW: list rot, D113
export const copyOf = (s: Snapshot, tree: string, edits: readonly Edit[]): Result.Result<Copy, string>;  // NEW
export const applyEdits = (text: string, find: string, replace: string): string | null;  // renamed: from flexible / flex (three copies)
export const dropSnapshot = (s: Snapshot): void;                                     // NEW
```

### `verdicts/state.ts`

```ts
import type { Item } from "./verdict.ts";
import type { Pool, Runner } from "./runner.ts";
import type { Snapshot } from "./snapshot.ts";

export type Scope = {                                                                // NEW
  readonly runner: (top: Pool) => Runner;
  readonly snapshot: (sources: readonly string[]) => Snapshot;
};
export const MACHINE_ERRNOS: readonly string[] = ["EMFILE", "ENFILE", "ENOSPC", "EAGAIN", "ENOMEM", "EBUSY"];  // NEW (#22)
export const stated = (gate: string, body: (scope: Scope) => Promise<readonly Item[]>): Promise<never>;  // NEW
```

`stated`:
- runs `body`;
- maps a throw to a `threw` item, or to a `machine` item when its errno is in `MACHINE_ERRNOS`;
- closes the runner and the snapshots;
- normalises copy paths to `<copy>`;
- writes the line with `await Bun.write(Bun.stdout, …)`;
- exits `EXIT[outcomeOf(items)]`;
- installs the SIGINT and SIGTERM handlers (4.5).

**Entry rule (#3).** A gate's entry file statically imports only node built-ins and `verdicts/state.ts`. Everything else is
imported inside the body, including the conformance modules a mutant may edit (`legacy.ts`) and the runtime under test. A throw
while loading is then a `threw` item, so a mutant that throws at load is killed by `crash`, as today (D132). S1 checks the rule.

### `limits.ts`

```ts
import type { Limits } from "./verdicts/spawn.ts";
import type { Size } from "./verdicts/runner.ts";

export type Budget = { readonly limits: Limits; readonly size: Size };               // NEW
export const SUITE: Budget = { limits: { mb: 2700, seconds: 240 }, size: { slots: 1, peakMb: 1750, aloneS: 19 } };   // NEW
export const SEARCH: Budget = { limits: { mb: 1200, seconds: 120 }, size: { slots: 1, peakMb: 300, aloneS: 40 } };   // NEW
export const MUTANT: Limits = { mb: 3500, seconds: 240 };                            // NEW
export const MUTANT_SEARCH: Limits = { mb: 3500, seconds: 420 };                     // NEW: 3 × measured, set at landing
export const WORK_PER_CALL = 10_000_000;                                             // NEW: provisional, set at landing (4.1)
```

## 6. Conflicts (C1-C3, kept, with what the review sharpened)

- **C1. Reruns against speed.** Top-only alone reruns after the drain is still the choice: the only option where "alone" is
  true. This revision adds what makes its cost bounded: alone limits from measurements, a global budget, and machine-wide
  alone. Cost with no unknown: 0. Each unknown job costs at most its alone limit. The run costs at most 605 s.
- **C2. Search verdicts against fixed expectations.** Dropping deadlines makes every verdict deterministic, so every search
  caller states the verdict it expects (4.2). A changed verdict is a logged expected-result change. `inconclusive` is an
  outcome a caller must expect, never a silent pass.
- **C3. One verdict line against many lines.** Kept as in proposal 1. Added here: the `program` contract separates the `flow`
  CLI, a program under test whose stdout is the thing pinned, from a gate child, whose stdout is only evidence (#19).

## 7. Before and after: two consumers

### 7.1 mutate-one, and mutate.ts reading it

Before: as in proposal 1, section 7.1 (`mutate-one.ts:79-86` prints `{killedBy, killers, search}` and exits 0; `mutate.ts:126-145`
parses the last stdout line and counts rss and missing answers as kills).

After, `mutate-one.ts`. The order is D101's, with `checks/*` before `gate`, as today (#21):

```ts
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { stated } from "./verdicts/state.ts";                                        // NEW: the entry's only conformance import (#3)

await stated("mutate-one", async (scope) => {
  const { SUITE } = await import("./limits.ts");                                     // NEW
  const { plannedCases } = await import("./main.ts");                                // NEW export
  const { final, job } = await import("./verdicts/runner.ts");                       // NEW
  const { isAlone } = await import("./verdicts/spawn.ts");                           // NEW
  const { expect, firstFail, sameCases } = await import("./verdicts/verdict.ts");    // NEW
  const here = import.meta.dir;                                                      // existing
  const runtimeArg = process.argv[process.argv.indexOf("--runtime") + 1]!;           // existing
  const round = resolve(here, dirname(runtimeArg));                                  // existing
  const serial = process.argv.includes("--serial") || isAlone();                     // existing flag
  const runner = scope.runner({ slots: 4, mb: 5000, budgetS: null });               // a top's own pool; nested: the parent's slice
  const suiteRun = (name: string, args: readonly string[]) =>
    job(name, { gate: "suite", cmd: ["bun", ...args], cwd: here, env: {}, limits: SUITE.limits, contract: "gate" }, SUITE.size);
  const script = (name: string, file: string) =>
    job(name, { gate: name, cmd: ["bun", file], cwd: here, env: {}, limits: SUITE.limits, contract: "gate" }, SUITE.size);
  const plain = ["main.ts", "--round", "99", "--no-catalog", "--runtime", runtimeArg];                              // existing
  const swaps = existsSync(join(round, "typed/swaps.ts"));                                                         // existing
  const early = [                                                                                                  // existing order
    suiteRun("suite", plain),
    ...(swaps ? [suiteRun("swap", [...plain.slice(0, 4), "--swap", join(round, "typed/swaps.ts"), ...plain.slice(4)])] : []),
    ...(swaps ? ["typed/compare.ts", "typed/date-check.ts"].map((f) => script(f, join(round, f))) : []),
    ...(existsSync(join(round, "cli/main.ts")) ? [script("cli", join(round, "cli/main.ts"))] : []),
  ];
  const gate5s = job("gate", { gate: "gate-5s", cmd: ["bun", "gate5s.ts", "--runtime", runtimeArg], cwd: here, env: {}, limits: SUITE.limits, contract: "gate" }, SUITE.size);
  const started = serial ? undefined : [...early, gate5s].map((j) => runner.run(j));
  const at = async (k: number, j: (typeof early)[number]) => final(await (started ? started[k]! : runner.run(j)));
  const planned = plannedCases(undefined);
  const items: Item[] = [];
  const stop = () => firstFail(items) !== undefined;
  const plainReading = await at(0, early[0]!);
  items.push(expect("gate", "suite", plainReading, "pass", { kinds: ["case"], holds: sameCases(planned) }));
  for (const [k, j] of early.slice(1).entries()) if (!stop()) items.push(expect("gate", j.name, await at(k + 1, j), "pass"));
  if (!serial && started) await Promise.all(started.slice(0, early.length));         // existing: checks after the other gates end
  const checks = existsSync(join(round, "checks")) ? readdirSync(join(round, "checks")).filter((x) => x.endsWith(".ts")).sort() : [];
  for (const f of checks) if (!stop()) items.push(expect("gate", `checks/${f}`, final(await runner.run(script(`checks/${f}`, join(round, "checks", f)))), "pass"));
  if (!stop()) items.push(expect("gate", "gate", await at(early.length, gate5s), "pass"));
  if (!stop()) items.push(expect("gate", "output", plainReading, "pass", { kinds: ["output"] }));   // existing: D134, after the gate
  return items;
});
```

`Item` and the search items (`--search`, from `bfs` with no deadline and `--expect`-style pinned verdicts) are left out above to
keep the example short. `killedBy` is no longer printed: it is `firstFail(items)?.name`, and its `detail.failed` are the killers.

After, `mutate.ts`:

```ts
import { basename, join } from "node:path";
import { stated } from "./verdicts/state.ts";                                        // NEW (#3)

type Mutant = { id: string; kills: readonly string[]; edits: readonly Edit[]; unscored?: string };  // existing; NEW: unscored (#26)

export const mutantItem = (m: Mutant, r: Reading): Item => {                        // NEW: pure; plants feed it real readings
  if (r.answer === "bound") return { kind: "mutant", name: m.id, outcome: "pass", why: "killed by memory", detail: { by: "rss", killers: [] } };
  if (outcome(r) === "unknown" || r.answer === "none") return { kind: "mutant", name: m.id, outcome: "unknown", why: describe(r) };
  const by = firstFail(r.verdict.items);
  if (by !== undefined) return { kind: "mutant", name: m.id, outcome: "pass", why: `killed by ${by.name}`, detail: { by: by.name, killers: by.detail?.failed ?? [] } };
  if (m.kills.length === 0) return { kind: "mutant", name: m.id, note: "survived; claims nothing" };   // #12
  return { kind: "mutant", name: m.id, outcome: "fail", why: `survived; claims ${m.kills.join(",")}` };
};

if (import.meta.main)
  await stated("mutate", async (scope) => {
    const { MUTANT, MUTANT_SEARCH } = await import("./limits.ts");                   // NEW
    const { describe, outcome } = await import("./verdicts/read.ts");                // NEW
    const { final } = await import("./verdicts/runner.ts");                          // NEW
    const { check, copyOf } = await import("./verdicts/snapshot.ts");                // NEW
    const snap = scope.snapshot([here, source]);                                     // renamed: from pristine
    const tree = basename(source);
    const scored = list.filter((m) => m.unscored === undefined);
    const problems = scored.map((m) => check(snap, tree, m.id, m.edits));
    const rotted = problems.filter((p) => p?.problem === "does not apply");
    if (rotted.length) return rotted.map((p) => ({ kind: "list", name: p!.id, outcome: "fail", why: p!.why }));
    const limits = withSearch ? MUTANT_SEARCH : MUTANT;
    const mutantJob = (id: string, edits: readonly Edit[], peakMb: number, aloneS: number): Job => ({
      name: id,
      size: { slots: 1, peakMb, aloneS },
      open: async () => {
        const c = copyOf(snap, tree, edits);
        if (c._tag === "Failure") throw new Error(c.failure);
        const cwd = join(c.success.dir, "conformance");
        return { spec: { gate: "mutate-one", cmd: ["bun", join(cwd, "mutate-one.ts"), "--runtime", `../${tree}/adapter.ts`, ...extra], cwd, env: {}, limits, contract: "gate" }, close: c.success.close };
      },
    });
    const runner = scope.runner({ slots: parallel, mb: parallel * limits.mb, budgetS });
    const control = final(await runner.run(mutantJob("control", [], 0, 0)));
    if (outcome(control) !== "pass") return [{ kind: "control", name: "control", outcome: outcome(control) === "unknown" ? "unknown" : "fail", why: describe(control) }];
    const ref = control.run.kind === "ended" ? control.run.peakMb : 0;
    const aloneS = control.run.kind === "ended" ? control.run.ms / 1000 : 60;
    const runs = scored.map((m, i) => (problems[i] ? undefined : runner.run(mutantJob(m.id, m.edits, ref, aloneS))));
    const items: Item[] = [{ kind: "control", name: "control", outcome: "pass", why: "" }];
    for (const m of list.filter((x) => x.unscored !== undefined)) items.push({ kind: "mutant", name: m.id, note: `unscored (reviewed): ${m.unscored}` });
    for (const [i, m] of scored.entries()) {
      const p = problems[i];
      items.push(p ? { kind: "mutant", name: m.id, note: `invalid (D113): ${p.why}` } : mutantItem(m, final(await runs[i]!)));
    }
    return items;
  });
```

The control is launched with `peakMb` 0, which means unmeasured, so its reference is null and a memory kill of the control is
never `bound`. Any kill of the control is
`unknown` or (after `expect`) red (R6). Each mutant's reference is the control's peak, measured alone in this run. `mutants.json`
keeps `id`, `kills`, `killed`, `killers` and `author`. `by` stays, and `rerunFor` is **renamed** to `alone`.

### 7.2 gates.ts

Before: as in proposal 1, section 7.2 (`gates.ts:54-105`).

After (`Spec` is the existing table row, **renamed** from `Job`):

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { stated } from "./verdicts/state.ts";                                        // NEW (#3)

type Dirs = { readonly conf: string; readonly round: string };                       // NEW
type Spec = {                                                                        // renamed: from Job
  name: string;
  gate: string;                                                                      // NEW (#18)
  cmd: (d: Dirs) => string[];                                                        // changed: paths in the job's copy
  slots: number;
  mb: number;                                                                        // existing: measured peak, now also the memory reference
  s: number;                                                                         // existing: now measured alone, serial inside
  limit: number;                                                                     // existing: first-attempt seconds
  env?: Record<string, string>;                                                      // NEW
  contract?: Contract;                                                               // NEW
};
const suite = (name: string, env: Record<string, string>, mb: number, s: number): Spec =>
  ({ name, gate: "suite", cmd: () => ["bun", "main.ts", "--round", round, ...rt, "--no-search"], env, slots: 1, mb, s, limit: 280 });
const specs: Spec[] = [
  suite("suite", {}, 1400, 19),
  suite("suite canon", { FLOW_CANON_CHECK: "1" }, 1500, 31),                         // NEW job (finding 17)
  suite("suite copies", { FLOW_COPIES_CHECK: "1" }, 1300, 44),                       // NEW job (finding 17)
  { name: "typed tsc", gate: "typed tsc", cmd: (d) => [tsc, "-p", join(d.round, "typed/tsconfig.json")], contract: "tool", slots: 1, mb: 900, s: 6, limit: 200 },  // #7
  { name: "verdict plants", gate: "plants", cmd: () => ["bun", "plants/plants.ts"], slots: 2, mb: 2000, s: 100, limit: 400 },  // NEW job
];
const budgetS = Number(arg("--budget", "600")) || 600;                               // NEW (#4)
const label = { pass: "ok  ", fail: "BAD ", unknown: "UNKN" } as const;              // NEW

await stated("gates", async (scope) => {
  const { describe, outcome } = await import("./verdicts/read.ts");                  // NEW
  const { final } = await import("./verdicts/runner.ts");                            // NEW
  const { copyOf } = await import("./verdicts/snapshot.ts");                         // NEW
  const snap = scope.snapshot([here, roundDir]);
  const asJob = (s: Spec): Job => ({
    name: s.name,
    size: { slots: s.slots, peakMb: s.mb, aloneS: s.s },
    open: async () => {
      const c = copyOf(snap, basename(roundDir), []);
      if (c._tag === "Failure") throw new Error(c.failure);
      const d = { conf: join(c.success.dir, "conformance"), round: join(c.success.dir, basename(roundDir)) };
      const limits = { mb: Math.max(s.mb * 2, 3000), seconds: s.limit };
      return { spec: { gate: s.gate, cmd: s.cmd(d), cwd: d.conf, env: s.env ?? {}, limits, contract: s.contract ?? "gate" }, close: c.success.close };
    },
  });
  const runner = scope.runner({ slots: maxJobs, mb: maxMb, budgetS });
  const done = await Promise.all(chosen.map((s) => runner.run(asJob(s))));
  mkdirSync(out, { recursive: true });
  for (const d of done) {
    const f = d.job.name.replace(/[^\w.-]+/g, "_");
    const r = final(d);
    if (r.run.kind === "ended") {
      writeFileSync(join(out, `${f}.txt`), `${r.run.stdout.head}${r.run.stdout.tail}${r.run.stdout.lastLine}`);
      writeFileSync(join(out, `${f}.stderr.txt`), `${r.run.stderr.head}${r.run.stderr.tail}${r.run.stderr.lastLine}`);
    }
    writeFileSync(join(out, `${f}.reading.json`), JSON.stringify({ first: describe(d.first), alone: d.alone && describe(d.alone), skipped: d.skipped }));
    const t = r.run.kind === "ended" ? `${(r.run.ms / 1000).toFixed(1).padStart(6)} s of ${d.job.size.aloneS} s  ${String(r.run.peakMb).padStart(5)} MB` : "not started";
    console.log(`${label[outcome(r)]} ${d.job.name.padEnd(24)} ${t}${d.alone ? "  (again, alone)" : ""}${d.skipped ? `  (${d.skipped})` : ""}  ${describe(r)}`);
  }
  return done.map((d) => ({ kind: "job", name: d.job.name, outcome: outcome(final(d)), why: describe(final(d)) }));
});
```

**Dropped** names:
- from watch.ts: `judged`, `Judged`, `shared`, `alone`, `idle`, `loadUnknown`, `Unknown`, `CLOCK_TRIP`, `FLOW_DEFER_UNKNOWN`;
- from gates.ts: `loadOf`, `runJob`, `start`, `free`, `waiting`, `pool`, `queue`, `running`, `results`, `ALONE`,
  `verdictLine`, `bad`;
- from mutate.ts: `parsed`, `survived`, `one`, `settle`, `flexible`;
- from mutate-one.ts: `tripped`, `rerun`, `begin`, `started` (the old helper), `spawn`, `failed`, `done`;
- from lifetime-falsify.ts: `runOne`, its slot loop, `flex`;
- from falsify.ts: `run`, `unknowns`;
- from search/engine.ts: `deadlineMs`, `ending`, `Report.ms`, `Report.peakRssMb`;
- from drive.ts: `t0` and the clock check.

## 8. Boundary map

Proposal 1's section 8 stands, with these rows changed by this revision. Each says what it was in proposal 1 and what it is now.

| Where | Behaviour | Proposal 1 | Proposal 2 |
| --- | --- | --- | --- |
| `mutate.ts` | rss kill = killed by resources | dropped | **kept** when the limit is ≥ 1.5 × the control's peak (bound); unknown when nearer (#10) |
| `gates.ts` | rss kill reads BAD | made unknown | **kept** BAD, now with the cause "memory" (the row's peak is the reference) |
| `mutate-one.ts` | `checks/*` before `gate` | moved after | **kept** before (#21) |
| `mutate-one.ts` | lock, recipients and catalog ignored in the suite gate | judged everything | **kept** ignored, through kinds (#2, D134) |
| `mutate-one.ts` | a throw at load = killed by crash | unknown (E17) | **kept** killed, through the entry rule (#3) |
| `mutate.ts` | D113 invalid | `pass` items | noted items (#20) |
| `mutate.ts` | survivors | all `fail` | `fail` when they claim kills, noted when they claim none (#12) |
| `fake-world.ts:815-830` | the timer loop with no bound | not covered | the work bound counts fired timers (#1) |
| `search/run.ts` | `inconclusive` exits 0 | kept as pass | an outcome the caller must expect (#11) |
| `search/run.ts` | default 400 000 states, `--seconds` | `--seconds` dropped | `--depth`, `--states` and `--expect` required, defaults dropped (#5) |
| `round-14/checks/search-vacuity-check.ts` | `deadlineMs: 30_000` | missed | dropped (#5) |
| `round-14/cli/main.ts` | `spawnSync` of `flow.ts`, reads stdout | a gate child | a `program` run through the runner, `programOutput` (#19, #24) |
| `round-14/cli/main.ts` | exits 1 on a failed pin | `stated` | `stated` (kept from proposal 1) |
| `verdicts/spawn.ts` | overflow is unknown | proposal 1 | evidence: head, tail, whole last line (#9) |
| tsc job | exit agreement | checked | not checked, contract `tool` (#7) |

## 9. What it means for the rest of the system

- **Lock and logs.** As in proposal 1: `verdicts/*.ts`, `limits.ts` and `plants/*.ts` join `main.ts`'s file list, and every
  changed file under the lock gets a reasoned line in `expected-changes.log`. Two more lines: `WORK_PER_CALL` and the search
  budgets are new expectations, and get theirs.
- **`expected-output.txt` and `expected-recipients.txt`.** Expected unchanged: outputs come from harness reads, and neither the
  work bound nor the dropped deadline fires on the real runtime alone. L3's parity run shows it; any change is logged.
- **`gate-5s-expected.txt`.** Unchanged; matched against case-item `why`.
- **CLI pins.** The `flow` CLI's output is untouched. `cli/main.ts` runs it as a `program` and ends with `stated`.
- **`--out` files.** As in proposal 1. stdout and stderr are each head, tail and last line. `<job>.reading.json` says first,
  alone and skipped.
- **The falsify rule (D132).** "Seen failing" means a `stated` judged fail, or a `bound` where no named oracle is asked for.
  `unknown` never counts. The new parts are seen failing in plants (section 11): the work bound (B8), the search expectations
  (B26), the reader (B18-B24), the runner (B12, B14) and canon/copies (B17).
- **Speed, with a real bound.**
  - A green run: today's 115 s, plus the canon and copies suites (31 s and 44 s alone, in slots) and the plants job (about 100 s
    on 2 slots). It loses mutate-one and types-check's serial tail (about 25 s). mutate-one under its 4:5000 slice runs two
    suites at once instead of four, which may add about 20 s to its row. Expected 130-160 s; the first run measures it.
  - The rerun cost per unknown job is its alone limit, `max(30, 3 × aloneS)`. Today's rows give: suite 57, canon 93, copies 132,
    mutate-one (serial, about 70 s alone) 210, graph 51, suite1 78, suite2 174, suite3 63, tamper 30, mutants 180, search 120,
    lies 4 × 90, lifetime (serial, about 45 s) 135, six checks 6 × 30, tsc 30, cli 30, plants 270. The sum is about 2200 s if
    every job were unknown.
  - The global budget caps all of it: **at most 605 s, by construction**. A run that reaches the budget is red, and lists every
    alone rerun it could not fit.
  - About two of the largest unknowns, or about six small ones, fit inside 600 s after a 150 s first pass.
- **Memory.** Declared packing is unchanged at the top. Kill limits rise (`SUITE` 2700, `MUTANT` 3500), and every parent's kill
  limit is checked against the sum of its children's limits (4.4). Streams keep at most about 9 MB plus the last line.
- **Docs.** Every header and STATUS/HANDOFF passage that names `judged`, `FLOW_DEFER_UNKNOWN`, `--seconds` or the clock trip is
  updated in the same change.
- **`report.ts`.** Unchanged. `killers` stay case names (#6).

## 10. Expected-result changes (complete, #27)

**Corrections.** In each of these the old verdict was wrong, by the finding or row named.

| E | Change | Finding / row | What we know today |
| --- | --- | --- | --- |
| E1 | gates.ts reads mutate-one's verdict: a red swap, compare, date check, CLI, check or gate5s on the unmutated runtime is BAD, not ok. | f1 | mutate-one's control `killedBy` null in the last run, so no change now |
| E2 | A mutant time-killed on both attempts is `unknown`, not killed. | f2 | listed by L1's full mutate run |
| E3 | Clock trips are gone. A no-task spin or a re-armed timer is a deterministic FAIL, killed or red the same alone and under load. A slow but bounded settle is no longer "killed" under load. | f3, f4, f8, #1 | listed by L1 |
| E4 | A control that is killed, or short of its planned cases, is red; never "ok" on a partial list. | f5 | lifetime control ok at 1832 MB for 3, likely no change |
| E5 | A memory kill is a kill only with the limit ≥ 1.5 × the measured reference. Nearer, it is `unknown`. With today's numbers (mutate-one tree about 1.5 GB, old limit 2000 MB, so 1.33 ×), old rss kills of mutants would be near-limit. Under the new `MUTANT` 3500 limit, a mutant that uses over 3.5 GB is killed by memory. One that uses 2-3.5 GB is no longer killed by memory, and must be killed by an oracle or it survives. | f6, #10 | listed by L1 (`by: "rss"` rows) |
| E6 | Lines of a killed run are no catch. In lifetime-falsify, a wrong runtime whose only red came from a killed run is `unknown` (time), or BAD (memory: red, but by no named oracle). Lies with a mark: the same. | f7 | none known |
| E7 | FRAG-15, SEARCH-ODD-SMALL, falsify's search part and mutate-one's searches assert their verdict. `inconclusive` where `completed` is expected is a fail. A red-on-null search must be `failed` or `vacuous`, not merely nonzero. | f9, #11 | values from L5; `chain` stays known-red |
| E8 | A child writing past about 64 KB of stderr finishes instead of being time-killed. | f10 | none known |
| E9 | A rejected job or rotted edit is a listed `unknown` or `fail`, never a hang or a crash. | f12 | none |
| E10 | A survivor that claims kills makes mutate.ts `fail`. One that claims none is noted. | f13, #12 | any list with claiming survivors goes red |
| E11 | Alone reruns never overlap, inside a process or across top processes. A verdict that an overlapping rerun used to decide is now decided alone. | f14, #23 | none known |
| E12 | A run that ended on its own just inside the limit is read by its verdict, not as a time kill. | f15, #17 | rare |
| E13 | gates.ts runs `suite canon` and `suite copies`, and is red when they are. | f17 | both "1, the lock only" today, as the suite |
| E14 | A forged or leaked answer line cannot stand in. Old mutate.ts read whatever JSON line came last, so a grandchild's or a mutated script's line could turn a kill into a survival. | #18 | none known |
| E15 | A resource errno (EMFILE, ENOSPC, …) during a run is `unknown`. Old: a crash, so a mutant was "killed by crash". | #22 | none known |

**Not corrections.** No old verdict was wrong here. These are named because they change numbers, labels or limits.

| N | Change | Why named |
| --- | --- | --- |
| N1 | Kill limits: `SUITE` 2700 MB (falsify runs were 2000, lifetime 1500, mutate-one's children unbounded); `SEARCH` 1200 MB (was 2000); `MUTANT` 3500 MB (was 2000). gates.ts rows unchanged. | #27; replaces proposal 1's 2000/2500 |
| N2 | Alone attempts use `max(30, 3 × aloneS)`, not the first-attempt limit; gates.ts has a 600 s budget. | #4 |
| N3 | Snapshots for every copying gate (proposal 1's E14). No verdict changes unless the tree changed during a run. | f16; #27 says it is not a correction |
| N4 | Exit codes: `unknown` is 2 everywhere; mutate.ts's red control exits 1 (was 2); gates.ts exits 1 on any fail, else 2 on any unknown (was 1 for any nonzero) (proposal 1's E16). | #27 says it is not a correction |
| N5 | mutate-one's order is unchanged (`checks/*` before `gate`); its suite gate ignores lock, recipients and catalog, as today. | #21, #2: proposal 1 had changed both |
| N6 | A throw at load is still killed by crash. Proposal 1's E17 is **dropped**. | #3 |
| N7 | `mutants.json`: `rerunFor` → `alone`; `by` gains `unscored` and keeps `rss`. Noted items for D113 and claim-less survivors. | #20, #12 |
| N8 | `Report` loses `ms` and `peakRssMb`, now a human line from search/run.ts. `search/run.ts` needs `--depth`, `--states` and `--expect`; `--seconds` is gone. | #5, #19 |
| N9 | Hang mutants (U1) move into a reviewed `unscored` section; each move is a reviewed list change. | #26 |
| N10 | Lies: targeted stays the final gate (today's default). `--full` refreshes `lie-cases/` only from finished readings. | f17 |

## 11. Proof plan (G4)

### 11.1 Black-box plants, runnable on both commits (#15)

The driver is `plants/blackbox.ts` (NEW). It takes `--tree DIR` and `--commit SHA`. It exports the commit with
`git archive SHA packages/flow-state-v3/prototypes | tar -x -C DIR`: no worktree, no stash. It links `node_modules`, applies the
plant's edit with the same whitespace-insensitive match mutate.ts uses, and runs the plant's command unchanged on either tree,
under `perl -e 'alarm N; exec @ARGV' --` with `</dev/null`. It observes only:
- the exit status;
- named human lines that exist on both commits (`ok`/`BAD` rows, `KILLED`/`SURVIVED`/`UNKNOWN` lines, `CONTROL`, `GATES`,
  `FALSIFY`);
- the `VERDICT` line, on the new tree only.

S1 exempts this one file by path, with the reason: it reads the old commit's human output because the old commit has nothing else.

"Loaded" means the same command under `taskpolicy -c background` (macOS: efficiency cores, lowest priority). That gives a
repeatable slowdown with no extra memory, so load plants do not break packing (#13).

In the table, Old and New are what the driver must observe. Standing marks whether the plant reruns in the `verdict plants` job:
yes (cheap), W (only its white-box form stands), or L (landing only).

| B | For | Edit (in the exported tree) | Command | Old (must show this) | New (must) | Standing |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | f1 | `round-14/typed/swaps.ts`: swap one fixture for a wrong one (tamper's pattern) | `bun gates.ts --runtime ../round-14/adapter.ts --only mutate-one` | row `ok`, exit 0 (**wrong**) | row `BAD`, `killedBy` swap, exit 1 | yes |
| B2 | f2 | a one-mutant list `plant-mutants.ts`: `while (true) {}` at adapter boot | `bun mutate.ts --runtime ../round-14 --list plant-mutants.ts` | `KILLED … (again, alone, after time)` (**wrong**) | `UNKNOWN`, exit 2 | W: runner on `sleep 60`, limit 2 s |
| B3 | f3, f4, f8 | runtime: `pending()` stays true for K checks, then false. K is chosen so the old commit's settle runs about 12 s alone, over 20 s loaded. | `bun mutate-one.ts --runtime ../round-14/adapter.ts --serial --search`, alone and loaded | alone and loaded differ: alone passes or is unknown, loaded is killed by the clock (**wrong**) | identical alone and loaded: killed by `did not quiesce in N work units` | L |
| B4 | f4 | the same edit, inside the branch only the runtime's default interval reaches | `bun gate5s.ts --runtime ../round-14/adapter.ts`, alone and loaded | differs with load; the trip text never reaches the reader (**wrong**) | identical: `gate` red by the work bound, in the verdict | L |
| B5 | f5, R6 | `scenarios/`: one case midway through lifetime's `ONLY` list allocates 4 GB | `bun lifetime-falsify.ts --runtime ../round-14/adapter.ts --mutants <first>` | `ok   control: … pass` on a partial list (**wrong**) | `BAD control`, exit 1 | yes |
| B6 | f6, #10 | `plant-mutants.ts`: a 4 GB allocation at boot | `bun mutate.ts … --list plant-mutants.ts` | `KILLED … watchdog rss` | `KILLED … memory` (the same verdict: limit 3500 ≥ 1.5 × the control peak) | W |
| B7 | f7 | `mutants-lifetime.ts` (copy): one wrong runtime fails LIFE-02 by its oracle, then `while (true) {}` in a later case | `bun lifetime-falsify.ts … --mutants plant` | `ok   plant: 1 red` (**wrong**) | `UNKN plant`, nothing counted red, exit 2 | W |
| B8 | f8, #1 | runtime: (a) `pending()` always true; (b) a timer callback re-arms itself at `now()` | `bun main.ts --round 99 --no-catalog --runtime ../round-14/adapter.ts --only <case>` | (a) 20 s and `CLOCK_TRIP`; (b) no answer before alarm 120 s (**wrong**) | (a, b) FAIL `did not quiesce in N work units`, under 2 s | yes |
| B9 | f9 | a lie that fails an oracle only at frag-search depth 5 beyond state 600 | `bun main.ts … --only FRAG-15`, alone and loaded | alone red, loaded green, inconclusive by deadline (**wrong**) | red both ways | L |
| B10 | f10 | `round-14/checks/mailq-check.ts`: write 1 MB to stderr first | `bun gates.ts … --only checks/mailq` | time kill, `unknown: time` after its alone rerun (**wrong**) | `ok`; `.stderr.txt` holds 1 MB | W: a 1 MB stderr child |
| B11 | f11 | `round-14/checks/mailq-check.ts`: allocate 4 GB | `bun gates.ts … --only checks/mailq` | `BAD` | `BAD`, cause memory (the same; shows #10 kept it) | W |
| B12 | f12 | (a) `mutants-lifetime.ts` (copy): an entry whose edit does not apply; (b) gates.ts table: a job whose binary does not exist | (a) `bun lifetime-falsify.ts … --mutants plant`; (b) `bun gates.ts … --only plant` | (a) no final line before alarm 120 s; (b) a crash with no `GATES` line (**wrong**) | (a) fail up front, "edit does not apply", exit 1; (b) `UNKN plant: unstarted`, every other job reported | yes |
| B13 | f13, #12 | `plant-mutants.ts`: an edit swapping the operands of a commutative numeric `+`, once with `kills: ["PAY-01"]`, once with `[]` | `bun mutate.ts … --list plant-mutants.ts` | exit 0 with `SURVIVED` (**wrong** for the claiming one) | claiming: exit 1; claim-less: noted, exit 0 | W |
| B14 | f14 | runtime: B3's edit, reached in both the plain and the swap suite | `bun mutate-one.ts --runtime …` (not `--serial`), with the driver sampling `ps` every 100 ms | two main.ts reruns running at once (**wrong**) | at most one main.ts during reruns; mutate-one never reruns when nested | L |
| B15 | f15, #17 | none | `bun watch.ts --rss-mb 300 --seconds 1 -- sh -c 'sleep 0.99'`, 50 times | some runs recorded `killed time` (**wrong** where it occurs) | never `killed` without a signal status | W: pure `killed()` cases |
| B16 | f16 | none; the driver edits a runtime file in the tree after the `control` line appears | `bun lifetime-falsify.ts … --mutants a,b` | b's FAIL texts show the mid-run edit (**wrong**) | none show it | yes |
| B17 | f17 | `round-14/adapter.ts`: the `CANON_CHECK` branch reports a differ | `bun gates.ts … --only "suite canon"` | `GATES 0/0`, exit 0: nothing ran (**wrong**) | `BAD suite canon`, exit 1 | yes |
| B18 | #16 | `round-14/checks/score-check.ts`: `process.exit(0)` at the top | `bun gates.ts … --only checks/score` | `ok` (**wrong**) | `UNKN`: silent | yes |
| B19 | #16 | old: the check prints `FAIL x` and exits 0. New: it prints a hand `VERDICT` with a pass item and exits 1. | `bun gates.ts … --only checks/score` | `ok` (**wrong**) | `UNKN`: disagree | yes |
| B20 | #16, #18 | `mutate-one.ts`: after its own answer, print a forged answer (old: a `{"killedBy":null…}` line; new: a `VERDICT` of another run id) | `bun mutate.ts … --list plant-mutants.ts` with B6's mutant | `SURVIVED` (**wrong**: the forged line won) | `UNKNOWN`: duplicate/foreign | yes |
| B21 | #16 | `round-14/checks/score-check.ts`: write the answer to stderr only (new: `VERDICT` on stderr) | `bun gates.ts … --only checks/score` | `ok` | `UNKN`: silent | yes |
| B22 | #16 | `round-14/checks/score-check.ts`: `process.kill(process.pid, "SIGTERM")` | `bun gates.ts … --only checks/score` | `BAD`, exit null | `UNKN`: signal SIGTERM | yes |
| B23 | #3 | `plant-mutants.ts`: `throw new Error("plant")` at the adapter's top level | `bun mutate.ts … --list plant-mutants.ts` | `KILLED … crash` | `KILLED`, `threw` (the same; D132 kept) | yes |
| B24 | #22 | none | `ulimit -n 40; bun gates.ts … --only checks/front` | `BAD` (**wrong**: the machine's error read as a failure) | `UNKN`: machine EMFILE | L |
| B25 | #9 | `round-14/checks/mailq-check.ts`: write 20 MB to stdout, then finish | `bun gates.ts … --only checks/mailq` | `ok` | `ok`, the dropped byte count in the reading | W |
| B26 | #11 | none | `bun search/run.ts --which frag --runtime ../../round-14/adapter.ts --depth 9 --states 50` (new: plus `--expect completed`) | exit 0 on `inconclusive` (**wrong**: green forever) | `fail`: inconclusive, completed expected | yes |
| B27 | #5 | none | each search caller of section 4.2, alone | (measurement) | each at most 1/3 of its watchdog; recorded | L (L5) |
| B28 | #24 | `round-14/checks/front-check.ts`: `while (true) {}` | `bun mutate-one.ts --runtime …` run by hand, under alarm 600 | no answer: `spawnSync` is unbounded (**wrong**) | `checks/front-check.ts` `unknown: time` within its limit, plus an alone attempt | L |
| B29 | #23 | none | `bun gates.ts …`, SIGINT after 20 s | detached trees left running (`pgrep` finds them) (**wrong**) | none left; scratch removed; `VERDICT` with `interrupted`, exit 2 | L |

Every finding row 1-17 has at least one B plant, and every review row that changes behaviour has one. Each "**wrong**" cell is
shown red on the old commit once, at landing (L1), and recorded in STATUS.md.

### 11.2 White-box forms (standing, in `verdict plants`)

Pure:
- `read` on hand-built `Run` values: one per row of section 2's table, plus duplicate, foreign and identity cases;
- `killed()`;
- `outcomeOf` on `[unknown, fail]`, which must be `fail` (#8);
- `expect` for each reading kind;
- `mutantItem`, `lifetimeItems` and `gate5sItems` on readings recorded from the live forms;
- `aloneLimit`;
- the parent-limit check.

Live, with small limits:
- `sleep 60` under a 2 s limit, with its alone attempt;
- a 600 MB allocation under a 300 MB limit, with reference 100 (bound) and with reference 250 (near);
- a 1 MB stderr child and a 20 MB stdout child;
- an `open` that throws and a missing binary, in a 2-slot runner with 4 jobs (slots are freed, from `events()`);
- three unknown children in a 3-slot top runner: alone attempts never overlap, from `events()`;
- two top runners in separate processes: their alone attempts never overlap, from the lock and the registry;
- the SIGINT path.

### 11.3 Structural checks

- **S1, one reader** (standing, `plants/reader-check.ts`). Fails on any of these outside `verdicts/` and `plants/blackbox.ts`:
  - a child's stdout or stderr split, matched or searched;
  - `startsWith("PASS" | "FAIL")` on child output;
  - an exit or code compared outside `read`;
  - `process.exit` or `process.exitCode` outside `state.ts`;
  - a gate entry with a static import other than node built-ins and `verdicts/state.ts` (#3);
  - `Date.now()` or `performance.now()` outside `spawn.ts`, `runner.ts` (the budget), `search/run.ts`'s human line, main.ts's
    PASS-line `ms`, graph-gate's `seconds` and gates.ts's row time. Each of those carries an evidence-only reason on the line.

  A `program` run's stdout is read only through `programOutput` (#19). `bfs` has no clock left to exempt.
- **S2, parity** (landing, L3). As in proposal 1. Every difference must be one of E1-E15. N-rows may only change labels, limits
  and exit codes.
- **S3, determinism** (landing, L4). Each deterministic gate, alone and loaded (`taskpolicy -c background`): byte-identical
  `VERDICT` lines (#13, #25).

### 11.4 Landing only (#13)

- **L1.** The old-commit half of every B plant, and one full mutate.ts list on the old commit (for E2, E3, E5).
- **L2.** Load plants B3, B4, B9 and B14.
- **L3.** S2 parity.
- **L4.** S3 determinism.
- **L5.** The budgets of section 4.2, every job's `aloneS`, and `WORK_PER_CALL`'s measured maximum.

None of these runs inside the 2-slot plants job. They run with the gates machine to themselves, one at a time, as the memory
rules ask for browsers and benchmarks.

## 12. Not resolved

- **U1.** A synchronous CPU loop inside one step stays a machine ending (time). Known cases go into the reviewed `unscored`
  section (N9).
- **U2.** "Alone" is alone among this project's top processes. Other programs on the machine are not controlled; they can
  only ever cause an `unknown`.
- **U3.** `WORK_PER_CALL`, the search budgets, `MUTANT_SEARCH.seconds` and every `aloneS` need L5's measurements. The
  `onePre`-off cost of mutate-one's in-process searches is the one I expect to force a smaller budget.
- **U4.** FRAG-15's and SEARCH-ODD-SMALL's expected verdicts, and falsify's per-search `--expect` table, come from one alone run
  each.
- **U5.** The allow list of known reds is deferred to the user, as the review kept it.
- **U6.** Which mutants move between killed, unknown and survived (E2, E3, E5) is known only after L1's full mutate run.
- **U7.** Peak RSS as the program's answer rests on a measured reference and a 1.5 margin. A mutant whose peak sits between
  1.0 and 1.5 times the reference is never killed by memory, by design.
- **U8.** The port moves `spawn.ts`, `runner.ts`, `snapshot.ts` and `state.ts` onto Effect services (`Command`, `Scope`, a
  budget `Clock` and `Schedule`). The types carry over.
- **U9.** A duplicate `VERDICT` in the dropped middle of an overflowing stdout is not seen. The run is still read by its last
  line, and the overflow is shown.

## 13. Every review row

| # | Handled | Where | Or why rejected |
| --- | --- | --- | --- |
| 1 | Work bound per harness call, counting settle steps and fired timers; plant B8b | 4.1, 11 | — |
| 2 | Typed kinds; consumers judge chosen kinds; mutate-one ignores lock, recipients and catalog | 3.1, 7.1 | — |
| 3 | Entry rule: the code under test loads inside `stated`; a load throw is `threw`; E17 dropped | 2, 5 (`state.ts`), N6, B23 | — |
| 4 | Alone limits from `aloneS`; a 600 s global budget; worst case 605 s; the 70 s claim corrected | 4.3, 9 | — |
| 5 | Every search caller sized at a third of its watchdog or less, with one measured; `--seconds` dropped, `--depth`/`--states`/`--expect` required | 4.2, B27 | — |
| 6 | `expect` puts the failing judged names in `detail.failed`; `killers` kept | 3.3, 7.1 | — |
| 7 | `tool` contract, with no agreement check | 2 (row 12), 5 (`read`) | — |
| 8 | fail > unknown > pass; attribution by first fail, `detail.before` for earlier unknowns | 3.2, 5 | — |
| 9 | Overflow is evidence: head 8 MB, tail 1 MB, whole last line | 2, 5 (`spawn.ts`), B25 | — |
| 10 | A memory kill at ≥ 1.5 × the measured reference is the program's (fail); nearer is unknown. E5 restated; finding 11's BAD kept | 2 (rows 5-6), E5, B6, B11 | — |
| 11 | `inconclusive` is an outcome the caller must expect | 4.2, E7, B26 | — |
| 12 | Survivors judged by their claim; claim-less ones are noted | 3.1, 7.1, E10, B13 | — |
| 13 | Load plants and S3 at landing only, by `taskpolicy`, not in the plants job | 11.1, 11.4 | — |
| 14 | Nested pools are the parent's slice (`FLOW_POOL`); parent kill limit ≥ sum of children's | 4.4 | — |
| 15 | `plants/blackbox.ts` runs every plant against an exported old commit | 11.1 | — |
| 16 | Contract plants: no verdict, disagree, forged/duplicate, stderr-only, signal | B18-B22 | — |
| 17 | Killed = decided before exit, read from the child's own status, not exit 137 | 2, 5 (`killed`), B15 | — |
| 18 | One `VERDICT`, at line start, last, with `gate` and run id checked | 3.4, 5, B20 | — |
| 19 | `program` contract and `programOutput`; the engine's timing moved to search/run.ts | 2 (row 13), 4.2, 11.3 | — |
| 20 | Noted items for D113 | 3.1, N7 | — |
| 21 | `checks/*` stay before `gate` | 7.1, N5 | — |
| 22 | Resource errnos are a machine ending (`unknown`) | 2 (row 3), 5 (`MACHINE_ERRNOS`), E15, B24 | — |
| 23 | SIGINT/SIGTERM handler; one runner per process; machine-wide alone lock and registry | 4.5, B29 | — |
| 24 | mutate-one by hand: every spawn through its runner with `SUITE` limits | 4.5, B28 | — |
| 25 | No times, memory, paths or pids in any `why` or `detail` | 3.5, S3 | — |
| 26 | Hang mutants go into a reviewed `unscored` section, listed as noted items in every run | 2, 7.1, N9 | — |
| 27 | Complete E list (E1-E15) and N list (N1-N10); proposal 1's E14 and E16 marked not corrections | 10 | — |

No row was rejected. Two were narrowed, each with its reason:

- **#10** is applied as a rule about the limit's distance from a measured reference, not as a check made after the kill. A kill
  always happens at the limit, so "well above the peak" can only be a property of the launch.
- **#14** is applied by making the slice inherited, rather than by asking each child to declare matching numbers. Matching
  numbers would be two facts that must agree; an inherited slice is one.
