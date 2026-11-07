# Proposal: one reading of a run

Status: **proposed**, 2026-11-08. Nothing here is decided. It is the convergence design asked for by
`VERDICTS-CONVERGENCE.md` (requirements 1-12, findings 1-17). No code was changed. All paths are under
`packages/flow-state-v3/prototypes/conformance/` unless they say otherwise.

## 1. The class, named

Every finding has one shape: **a gate decided pass or fail from something the child never said.** An exit code from a child
that writes its verdict in JSON (1). A watchdog kill read as a mutant's answer (2, 6, 11). Words the clock put into a FAIL line
(3, 4, 8, 9). Lines from a child that was stopped halfway (5, 7). A stream nobody read (10). A promise nobody caught (12). A
survivor that the exit code hid (13). A rerun that was not alone (14). A kill recorded after the child had already exited (15).
A copy taken from a folder that was still changing (16). A gate that never ran (17).

So the fix is not one more check in each consumer. It is to stop consumers from reading runs at all.

## 2. The one rule

> **A run means only what its child finished stating. Anything else is `unknown`: it is red, scores nothing, and gets one
> rerun alone, from the top.**

"Finished stating" means all of these hold. The child ended by itself (no watchdog kill, no signal). Its last stdout line is one
`VERDICT` line that decodes. Its exit code is the one that verdict implies. Every other case is `unknown`, with its cause: killed
by time, killed by memory, signal, silent, garbled, disagreeing exit, unstarted or overflow.

Six consequences follow without exceptions:

1. **One reading** (R1). Only `read(run)` turns a run into an outcome. Consumers get either a decoded `Verdict` or a cause. They
   never get lines to parse. A standing check enforces this (S1, section 11).
2. **No clock decides** (R2). A time or memory kill is a cause of `unknown`, never `pass` or `fail`. The clock trip is gone.
   `settle` and `bfs` stop on deterministic bounds (steps, states), and those give real, reproducible failures.
3. **A partial run scores nothing** (R3). An unfinished `Reading` has no `verdict` field. The type makes it impossible to
   count a killed run's lines.
4. **All evidence is read** (R4). Both streams are always drained at the same time and saved. A verdict carried in JSON is the
   only verdict, and the exit code must agree with it.
5. **Unknown is red.** An outcome is `pass` only when every item passes and there is at least one item. Otherwise the outcome
   is the first item that did not pass, in the order the gate states. Every `unknown` item is listed by name.
6. **Reruns belong to the top.** Only the process the user started reruns anything. It reruns each unknown run once, alone
   (nothing else of its tree running, the rerun itself serial), and that second answer is final. A nested process never reruns.
   It states `unknown` upward.

## 3. Design

Four parts, each in one place. They are all **new**, in a folder `verdicts/` that ports as is to
`packages/flow-state-v3/conformance/verdicts/`.

| Part | File | Pure? | Job |
| --- | --- | --- | --- |
| Verdict | `verdicts/verdict.ts` | yes | The data a child states, the outcome rule, `expect`. |
| Child side | `verdicts/state.ts` | no (stdout, exit) | `stated(gate, body)`: the only way a gate script ends. |
| Run and reading | `verdicts/spawn.ts`, `verdicts/read.ts` | spawn no, read yes | Watchdog and drained streams; `read(run)`. |
| Runner | `verdicts/runner.ts` | no | One scheduler: slots, memory, slot release, the alone rerun. |
| Snapshot | `verdicts/snapshot.ts` | no (fs) | One copy of the sources at start; per-run copies with edits. |

There is also one harness config file outside the generic module, `limits.ts` (**new**). It holds every memory and time limit a
consumer passes.

### 3.1 The verdict line

- Each gate script's stdout ends with exactly one line: `VERDICT ` followed by JSON `{ gate, items }`.
- An item is `{ name, outcome, why, detail? }`. `detail` is structured evidence (search report, killers). It never holds a
  clock or memory value, so a deterministic gate states byte-identical verdicts on every run (S3).
- The outcome is never stored. It is derived from the items, by the child (to pick its exit) and by the reader (to check the
  exit). So a child cannot state one outcome and exit with another without the reader seeing a disagreement.
- Exit codes: `pass` 0, `fail` 1, `unknown` 2.
- An uncaught throw inside the body becomes one `fail` item `threw: <message>`. A throw is a finished statement ("I broke"). This
  keeps D132 (bugs M2): a mutant that crashes a gate is killed, by `crash`. Code that dies before `stated` runs (a module that
  throws while loading) states nothing, so it is `unknown`.
- Human lines (PASS/FAIL, SUMMARY, RECIPIENTS, `ok`/`BAD`, GRAPH-GATE, WATCH) stay as they are. They are evidence for people
  and `--out` files. No program reads them.

### 3.2 Deterministic bounds

| Where | Before (existing) | After |
| --- | --- | --- |
| `drive.ts` settle | 5000 tasks (kept); `Date.now() - t0 > 20_000` every 4096 steps throws `CLOCK_TRIP` | 5000 tasks (kept); `guard >= SETTLE_STEPS` throws `settle: did not quiesce in N steps` (**new**). This catches a spin that adds no tasks, such as scheduler picks or `pending()` with no work, in milliseconds, on every machine. |
| `search/engine.ts` | `out = states >= maxStates \|\| elapsed > deadlineMs` | `out = states >= maxStates`. `deadlineMs` is **dropped** from `bfs` and from every search's options, so any caller that still passes it fails to compile. `inconclusive` now means only "state budget reached", which is deterministic. `Report.ms` stays as evidence. |
| Search cases (FRAG-15, SEARCH-ODD-SMALL) | assert "no failure" and a state floor | also assert `verdict` and `depthCompleted` (R7). |
| Watchdog time limit | decided `time` kills, read as kills or unknowns by each consumer | a safety net only: its kill is a cause of `unknown`. |

The only hang that no deterministic bound can catch is a synchronous CPU loop inside one runtime step. It touches neither the
fake nor the harness. It stays `unknown: killed time` forever: red and listed, never killed (section 12, U1).

`SETTLE_STEPS` is provisionally `1_000_000`. Before landing it, one run must measure the largest step count any settle reaches
on the real runtime, across the suite and every search. The bound must be at least 20 times that maximum, and both numbers go
into STATUS.md. Like the task bound, this is a fixed constant under the lock.

## 4. The module: types and signatures

Everything in this section is **new** unless marked. In the code, `// NEW`, `// renamed: from`, `// existing` and
`// dropped` mark each name.

### `verdicts/verdict.ts` (pure)

```ts
import { Result, Schema } from "effect";

export const Outcome = Schema.Literals(["pass", "fail", "unknown"]);                // NEW
export type Outcome = typeof Outcome.Type;                                           // NEW

export const Item = Schema.Struct({                                                  // NEW
  name: Schema.String,
  outcome: Outcome,
  why: Schema.String,
  detail: Schema.optionalKey(Schema.Json),
});
export type Item = typeof Item.Type;                                                 // NEW

export const Verdict = Schema.Struct({ gate: Schema.String, items: Schema.Array(Item) });  // NEW
export type Verdict = typeof Verdict.Type;                                           // NEW

export const MARK = "VERDICT ";                                                      // NEW
export const EXIT = { pass: 0, fail: 1, unknown: 2 } as const satisfies Record<Outcome, number>;  // NEW

export const firstNonPass = (items: readonly Item[]): Item | undefined =>            // NEW
  items.find((i) => i.outcome !== "pass");

export const outcomeOf = (items: readonly Item[]): Outcome =>                        // NEW
  items.length === 0 ? "fail" : (firstNonPass(items)?.outcome ?? "pass");

export const unknowns = (items: readonly Item[]): readonly string[] =>               // NEW
  items.filter((i) => i.outcome === "unknown").map((i) => i.name);

export const encode = (v: Verdict): string => `${MARK}${JSON.stringify(v)}`;         // NEW

export type Unstated =                                                               // NEW
  | { readonly kind: "silent" }
  | { readonly kind: "garbled"; readonly issue: string };

export const lastVerdict = (stdout: string): Result.Result<Verdict, Unstated>;      // NEW

export type Holds = (v: Verdict) => string | null;                                   // NEW: null = holds, text = why not

export const expect = (                                                              // NEW
  name: string,
  r: Reading,
  want: "pass" | "fail",
  holds?: Holds,
): Item;

export const sameCases = (planned: readonly string[]): Holds;                        // NEW: item names of cases equal planned, exactly
```

`expect` is how every consumer turns a child's reading into its own item. That makes it the only place a falsify-style "this must
go red" or a control's "this must be green" is decided:

- an unfinished reading, or a stated `unknown`, gives `unknown`, with `describe(r)` as `why`;
- a finished reading whose outcome is `want`, and `holds` is null, gives `pass`;
- anything else gives `fail` ("wanted fail, was pass", or the `holds` text).

### `verdicts/state.ts` (the child side)

```ts
import type { Item } from "./verdict.ts";
import type { Pool, Runner } from "./runner.ts";

export type Scope = { readonly runner: (pool: Pool) => Runner };                     // NEW

export const stated = (                                                              // NEW
  gate: string,
  body: (scope: Scope) => Promise<readonly Item[]>,
): Promise<never>;
```

`stated` runs `body`. A throw becomes `[{ name: gate, outcome: "fail", why: "threw: ..." }]`. Then it closes every runner the
scope made (each live process tree is killed and awaited). It writes the line with `await Bun.write(Bun.stdout, ...)` so a pipe
cannot truncate it, and exits with `EXIT[outcomeOf(items)]`. No gate script calls `process.exit` or sets `process.exitCode`
anywhere else (S1).

### `verdicts/spawn.ts` (the watchdog: `watch.ts`'s `watched`, moved)

```ts
export type Limits = { readonly mb: number; readonly seconds: number };              // NEW
export type Contract = "stated" | "exit";                                            // NEW: "exit" for a foreign tool (tsc) only

export type RunSpec = {                                                              // NEW
  readonly name: string;
  readonly cmd: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly limits: Limits;
  readonly contract: Contract;
};

export type Ended = {                                                                // renamed: from Watched
  readonly kind: "ended";
  readonly spec: RunSpec;
  readonly exit: number | null;                                                      // renamed: from code
  readonly signal: string | null;                                                    // NEW
  readonly killed: "rss" | "time" | null;                                            // existing; set only when our SIGKILL ended a live child
  readonly peakMb: number;                                                           // existing
  readonly ms: number;                                                               // existing; evidence only
  readonly stdout: string;                                                           // existing
  readonly stderr: string;                                                           // NEW
  readonly overflow: "stdout" | "stderr" | null;                                     // NEW
  readonly leftovers: number;                                                        // existing
};
export type Unstarted = { readonly kind: "unstarted"; readonly spec: RunSpec; readonly message: string };  // NEW
export type Run = Ended | Unstarted;                                                 // NEW

export const CAP_BYTES = 16 * 1024 * 1024;                                           // NEW: per stream; past it, drained and dropped

export const spawnRun = (spec: RunSpec, o?: { readonly echo: boolean }): Promise<Run>;  // renamed: from watched
export const killOf = (                                                              // NEW: pure, the rule for finding 15
  decided: "rss" | "time" | null,
  exitedBeforeKill: boolean,
  signal: string | null,
): "rss" | "time" | null;
export const isTop = (): boolean;                                                    // NEW: process.env.FLOW_NESTED !== "1"
export const isAlone = (): boolean;                                                  // NEW: process.env.FLOW_ALONE === "1"
```

`spawnRun` keeps what works in `watched`: the tree walk by `lstart`, the process group, the 40 ms poll, `endTree`, `leftovers`,
and tree RSS (D129). It changes five things:

- stdin is ignored and both streams are always piped and read at the same time (R8);
- `FLOW_NESTED=1` goes into every child's env;
- `echo` copies both streams to the parent's **stderr** as they arrive, which only a top process uses, so the parent's stdout
  stays clean for its own verdict line;
- the result keeps up to `CAP_BYTES` of each stream and drains the rest, so the child never blocks;
- `killOf` records a kill only when the watchdog decided one, the child had not exited before the signal, and the child's
  `signalCode` is `SIGKILL`.

A spawn that throws becomes `Unstarted`.

### `verdicts/read.ts` (pure: the one reading)

```ts
import { Result } from "effect";
import type { Ended, Run } from "./spawn.ts";
import { EXIT, lastVerdict, outcomeOf, type Outcome, type Verdict } from "./verdict.ts";

export type Unfinished =                                                             // NEW
  | { readonly kind: "unstarted"; readonly message: string }
  | { readonly kind: "killed"; readonly by: "rss" | "time" }
  | { readonly kind: "signal"; readonly signal: string }
  | { readonly kind: "overflow"; readonly stream: "stdout" | "stderr" }
  | { readonly kind: "silent" }
  | { readonly kind: "garbled"; readonly issue: string }
  | { readonly kind: "disagree"; readonly exit: number | null; readonly stated: Outcome };

export type Reading =                                                                // NEW
  | { readonly complete: true; readonly verdict: Verdict; readonly run: Ended }
  | { readonly complete: false; readonly cause: Unfinished; readonly run: Run };

const exitVerdict = (run: Ended): Verdict => ({
  gate: run.spec.name,
  items: [{ name: run.spec.name, outcome: run.exit === 0 ? "pass" : "fail", why: `exit ${run.exit}` }],
});

export const read = (run: Run): Reading => {                                         // NEW
  if (run.kind === "unstarted") return { complete: false, cause: { kind: "unstarted", message: run.message }, run };
  if (run.killed !== null) return { complete: false, cause: { kind: "killed", by: run.killed }, run };
  if (run.signal !== null) return { complete: false, cause: { kind: "signal", signal: run.signal }, run };
  if (run.overflow !== null) return { complete: false, cause: { kind: "overflow", stream: run.overflow }, run };
  const stated = run.spec.contract === "exit" ? Result.succeed(exitVerdict(run)) : lastVerdict(run.stdout);
  if (Result.isFailure(stated)) return { complete: false, cause: stated.failure, run };
  const o = outcomeOf(stated.success.items);
  if (run.exit !== EXIT[o]) return { complete: false, cause: { kind: "disagree", exit: run.exit, stated: o }, run };
  return { complete: true, verdict: stated.success, run };
};

export const outcome = (r: Reading): Outcome => (r.complete ? outcomeOf(r.verdict.items) : "unknown");  // NEW
export const describe = (r: Reading): string;                                        // NEW: one line: outcome, first non-pass item or cause, counts
```

That function is the whole rule. It never looks at a PASS or FAIL line, a SUMMARY, a `killedBy` or a clock-trip text.

### `verdicts/runner.ts` (the one scheduler)

```ts
import type { Reading } from "./read.ts";
import type { RunSpec } from "./spawn.ts";

export type Pool = { readonly slots: number; readonly mb: number };                  // NEW
export type Opened = { readonly spec: RunSpec; readonly close: () => void };         // NEW
export type Job = {                                                                  // NEW (gates.ts's Job was a local table row)
  readonly name: string;
  readonly slots: number;
  readonly mb: number;
  readonly expectedS: number;
  readonly open: () => Promise<Opened>;
};
export type Done = { readonly job: Job; readonly first: Reading; readonly alone: Reading | null };  // NEW
export type Event = { readonly job: string; readonly attempt: "first" | "alone"; readonly at: "start" | "end" };  // NEW
export type Runner = {                                                               // NEW
  readonly run: (job: Job) => Promise<Done>;
  readonly close: () => Promise<void>;
  readonly events: () => readonly Event[];
};

export const makeRunner = (pool: Pool): Runner;                                      // NEW
export const final = (d: Done): Reading => d.alone ?? d.first;                       // NEW
```

The runner's rules, all in one function:

1. **Packing** (existing, from `gates.ts`). A waiting first attempt starts when its slots and memory fit, or when nothing is
   running. Among the waiting attempts, the one with the longest `expectedS` goes first. Under `FLOW_ALONE=1` the pool is one
   slot.
2. **Holding** (finding 12). The runner takes the slots and memory before `open` and gives them back in `finally`, whatever
   `open`, `spawnRun` or `read` did. A throw from `open` becomes an `Unstarted` run, so its reading is `unknown: unstarted`
   with the message. `close` from `Opened` always runs.
3. **The alone rerun** (R3, findings 2, 14). Suppose a first attempt's outcome is `unknown` (unfinished, or a stated
   `unknown`) and `isTop()`. Then the runner queues an alone attempt. An alone attempt starts only when nothing is running and
   no first attempt is waiting. Alone attempts run one at a time, with `FLOW_ALONE=1` added to the env, and their reading is
   final. When `!isTop()`, nothing is queued and the unknown goes up in the stated verdict.
4. **Close.** `close()` kills every running tree and resolves once they are gone. `stated` calls it.
5. **Events.** `events()` records the order of starts and ends, with no times. That evidence lets a test prove "alone" (P14).

A sequential consumer (falsify, `await` after `await`) and a pooled one (gates.ts) both use the same rule. In the sequential
case, nothing else is waiting, so the alone rerun starts as soon as the running work ends. In the pooled case, it starts after
the first attempts drain.

### `verdicts/snapshot.ts`

```ts
import type { Result } from "effect";

export type Edit = readonly [file: string, find: string, replace: string];           // existing shape (mutate.ts, lifetime-falsify)
export type Snapshot = { readonly root: string; readonly trees: readonly string[] }; // renamed: from mutate.ts's `pristine`
export type Copy = { readonly dir: string; readonly close: () => void };             // NEW
export type Checked = { readonly id: string; readonly problem: "does not apply" | "does not parse"; readonly why: string };  // NEW

export const snapshot = (sources: readonly string[]): Snapshot;                      // renamed: from mutate.ts's pristine copy
export const check = (s: Snapshot, tree: string, id: string, edits: readonly Edit[]): Checked | null;  // NEW: merges mutate.ts's up-front loop and D113's parse check
export const copyOf = (s: Snapshot, tree: string, edits: readonly Edit[]): Result.Result<Copy, string>;  // NEW
export const applyEdits = (text: string, find: string, replace: string): string | null;  // renamed: from flexible / flex (three copies)
export const dropSnapshot = (s: Snapshot): void;                                     // NEW
```

`snapshot` copies each source tree once, at the start, into a fresh temp folder, and links `node_modules` beside them, as
mutate.ts does today. Every copy any gate makes comes from that snapshot, never from the live folder (finding 16, R10).

### `limits.ts` (harness config, not part of the ported module)

```ts
import type { Limits } from "./verdicts/spawn.ts";

export const SUITE: Limits = { mb: 2000, seconds: 240 };                             // NEW: every main.ts child; lifetime's 1500 rises to it
export const SEARCH: Limits = { mb: 2000, seconds: 120 };                            // NEW: every search/run.ts child
export const MUTANT: Limits = { mb: 2500, seconds: 240 };                            // NEW: one serial mutate-one tree
```

## 5. Conflicts, resolved

### C1. Rerunning unknowns alone, against speed

| Option | What it does | Cost | Correct? |
| --- | --- | --- | --- |
| A. Today | Each layer reruns on its own (`judged`, mutate-one's `rerun`, gates.ts's pass), with a `FLOW_DEFER_UNKNOWN` patch. | Small. | No. Nested "alone" is not alone (14). Rss kills are not rerun (6, 11). A recurring kill counts (2). |
| B. Pause at once | When any unknown appears, block new starts, wait for the running jobs to end, rerun it, then resume. | Idle slots while draining, up to the longest running job (about 60 s) per unknown. | Yes. |
| **C. Proposed: top only, after the first attempts drain** | Nested processes never rerun. The top reruns each unknown once, serially, when nothing else runs (`FLOW_ALONE=1`, so the job's own children are serial too). | 0 when there is no unknown. Each unknown job adds its own alone time: at most about 70 s (mutate-one, serial). | Yes. "Alone" holds machine-wide for our tree, and the result is one answer per run. |

**Choice: C.** It is the only option where "alone" is true, because only the top sees the whole tree. In the sequential case it
behaves like B for free. How many reruns: exactly one per unknown run. When the pool pauses: never mid-run. Alone attempts wait
for the pool to drain.

### C2. Searches asserting their verdict, against fixed expectations

| Option | Effect |
| --- | --- |
| A. Keep the deadline and assert only "no failure" (today) | Under load the verdict varies (9), so the suite's claim depends on the machine. |
| B. Assert the verdict but keep the deadline | A locked verdict that flips under load turns the suite red for no reason. |
| **C. Proposed: drop the deadline and assert `verdict` and `depthCompleted`** | The verdict depends only on the runtime and the budget, so the lock can hold it. A change of verdict is a real change of behaviour, logged like any expected-result change in `expected-changes.log`. |

**Choice: C.** Each search case also picks a budget that reaches `completed` or `closed` where that is affordable. If it reaches
`inconclusive` (budget hit), the case asserts that plus `depthCompleted`. Both are deterministic now. FRAG-15 and
SEARCH-ODD-SMALL get their values from one alone run before landing (U4). This proposal does not guess them.

### C3. One verdict line per child, against scripts that print many lines, CLI pins and `--out` files

| Option | Effect |
| --- | --- |
| A. Only one line, delete the others | Breaks every human reader, the `--out` diffs and STATUS tables, with no gain in correctness. |
| B. Teach `read` each script's lines | This is R1 again: one parser per script. |
| **C. Proposed: keep every human line, add one last `VERDICT` line** | Programs read only the verdict and people read the rest. `--out` keeps `<job>.txt` (stdout) and adds `<job>.stderr.txt` and `<job>.reading.json`. When a job was rerun, it also adds `<job>.first.txt` and `<job>.first.stderr.txt`. |

**Choice: C.** The CLI pins read the `flow` CLI's product output (`check`, `explain`, `graph`, `story`), and that output does not
change. `cli/main.ts` is a gate like any other, so it ends with `stated`. `gate-5s-expected.txt` matches item `why` prefixes,
which are the same text the FAIL lines carry. `expected-recipients.txt` reads the RECIPIENTS line, which is kept as it is, and
`main.ts` checks it in-process as before.

## 6. Smaller calls made here

These are proposed, with a reason for each.

- **Survivors are `fail`** (finding 13). A mutant claims, in `kills`, the ids it breaks, and a survivor disproves that claim.
  lifetime-falsify already treats a survivor as BAD, so this makes the two agree.
- **D113's invalid mutants stay unscored and not red.** They become `pass` items with `detail: { by: "invalid" }` and the
  reason, so they are still listed. Making them red would change a verdict the brief does not call wrong.
- **List rot ("edit does not apply") is checked up front.** mutate.ts and lifetime-falsify run `check` on every edit against
  the snapshot before any run. Each problem becomes a `fail` item and nothing runs. That keeps "the list cannot rot silently"
  without a throw or a hang (findings 9 and 12). An `open` that still throws later is `unknown: unstarted`.
- **Every gates.ts job runs in its own copy of one snapshot.** That drops the `ALONE` set. `mutate-one` and
  `checks/types-check.ts` no longer have to run after the pool, because their scratch writes land in their own copies. Inside
  mutate-one, `checks/*` still run after its other gates, as now.
- **Lies: targeted is the final gate** (finding 17). It makes the same claim ("red by its oracle in at least one case"), and a
  stale record falls back to the whole suite. `--full` remains the refresh of `lie-cases/`, run by hand in the live tree. It
  writes a record only from a finished reading.
- **`FLOW_CANON_CHECK=1` and `FLOW_COPIES_CHECK=1` become gates.ts jobs** (`suite canon`, `suite copies`). STATUS.md already
  lists them as end gates.
- **A new gates.ts job, `verdict plants`.** It is the falsify of the reader itself (section 11).
- **A foreign tool's contract is its exit code.** Only `typed tsc` uses that. It is declared up front in the job, with
  `contract: "exit"`.
- **The `watch.ts` CLI stays** (`bun watch.ts --rss-mb N --seconds S -- cmd`) as a thin wrapper on `spawnRun` with `echo`.
  The search headers name it.

## 7. Before and after: two consumers

### 7.1 mutate-one's end, and mutate.ts reading it

Before (existing, `mutate-one.ts:79-86`):

```ts
const done = (killedBy: string | null, killers: readonly string[], search = "not run") => {
  for (const pid of running)
    try {
      process.kill(-pid, 9);
    } catch {}
  console.log(JSON.stringify({ killedBy, killers, search, ...(tripped.size ? { unknown: `${CLOCK_TRIP}: ${[...tripped].join(" ")}` } : {}) }));
  process.exit(0);
};
```

Before (existing, `mutate.ts:126-145`):

```ts
const r = await judged(["bun", join(dir, "conformance/mutate-one.ts"), "--runtime", `../${basename(source)}/adapter.ts`, ...extra], { rssMb, seconds: 240, capture: true });
const line = r.stdout.trim().split("\n").at(-1) ?? "";
let parsed: { killedBy: string | null; killers: string[]; search: string; unknown?: string } | undefined;
try {
  parsed = JSON.parse(line);
} catch {
  parsed = undefined;
}
const unknown = r.unknown ?? (parsed?.unknown ? "clock" : undefined);
const killed = !unknown && (r.killed !== null || !parsed || (parsed?.killedBy ?? null) !== null);
if (!killed && !unknown) survived++;
```

After, mutate-one (its gates, in their order, as items; the first one that does not pass is the answer):

```ts
import { join } from "node:path";
import { SUITE } from "./limits.ts";                                                 // NEW
import { plannedCases } from "./main.ts";                                            // NEW export of main.ts
import { final, type Job } from "./verdicts/runner.ts";                              // NEW
import { isAlone } from "./verdicts/spawn.ts";                                       // NEW
import { stated } from "./verdicts/state.ts";                                        // NEW
import { expect, sameCases, type Item } from "./verdicts/verdict.ts";               // NEW

const here = import.meta.dir;                                                        // existing
const gate = (name: string, args: readonly string[]): Job => ({                      // NEW (replaces begin, started, gate, rerun)
  name,
  slots: 1,
  mb: SUITE.mb,
  expectedS: 20,
  open: async () => ({ spec: { name, cmd: ["bun", ...args], cwd: here, env: {}, limits: SUITE, contract: "stated" }, close: () => {} }),
});

await stated("mutate-one", async (scope) => {
  const runner = scope.runner({ slots: serial || isAlone() ? 1 : 6, mb: 6 * SUITE.mb });
  const early = [gate("suite", plainArgs), ...swapGates, ...cliGate, gate("gate", gate5sArgs)];     // existing order (D101)
  const pending = serial || isAlone() ? undefined : early.map((j) => runner.run(j));
  const items: Item[] = [];
  for (const [k, j] of early.entries()) {
    const r = final(await (pending ? pending[k]! : runner.run(j)));
    items.push(j.name === "suite" ? expect("suite", r, "pass", sameCases(plannedCases(undefined))) : expect(j.name, r, "pass"));
    if (items.at(-1)!.outcome !== "pass") return items;
  }
  for (const f of checks) {                                                          // existing: after every other gate
    items.push(expect(`checks/${f}`, final(await runner.run(gate(`checks/${f}`, [join(round, "checks", f)]))), "pass"));
    if (items.at(-1)!.outcome !== "pass") return items;
  }
  return items;
});
```

`suite` is the plain run with named oracles. The output-only kill (D134), named `output`, is an item `mutate-one` derives from
the same `suite` reading's items whose `why` starts with `output:`. It comes after `gate`, as today. It was left out above to keep
the example short. The searches under `--search` become items too, from `bfs` with no deadline.

After, mutate.ts (the control and one mutant; `one()` and the hand-made queue are gone):

```ts
import { basename, join } from "node:path";
import { MUTANT } from "./limits.ts";                                                // NEW
import { describe, outcome, type Reading } from "./verdicts/read.ts";               // NEW
import { final, type Job } from "./verdicts/runner.ts";                              // NEW
import { check, copyOf, snapshot, type Edit } from "./verdicts/snapshot.ts";        // NEW (snapshot renamed from pristine)
import { stated } from "./verdicts/state.ts";                                        // NEW
import { firstNonPass, type Item } from "./verdicts/verdict.ts";                     // NEW

export const mutantItem = (id: string, r: Reading): Item => {                       // NEW: pure, so P2, P6, P13 test it on real readings
  if (!r.complete || outcome(r) === "unknown") return { name: id, outcome: "unknown", why: describe(r) };
  const by = firstNonPass(r.verdict.items);
  if (by === undefined) return { name: id, outcome: "fail", why: "survived: every gate is green" };
  return { name: id, outcome: "pass", why: `killed by ${by.name}`, detail: { killedBy: by.name, killers: by.detail ?? null } };
};

if (import.meta.main)
  await stated("mutate", async (scope) => {
    const snap = snapshot([here, source]);
    const tree = basename(source);
    const problems = list.map((m) => check(snap, tree, m.id, m.edits));
    const rotted = problems.filter((p) => p?.problem === "does not apply");
    if (rotted.length) return rotted.map((p) => ({ name: p!.id, outcome: "fail", why: p!.why }));
    const job = (id: string, edits: readonly Edit[]): Job => ({
      name: id,
      slots: 1,
      mb: MUTANT.mb,
      expectedS: 60,
      open: async () => {
        const c = copyOf(snap, tree, edits);
        if (c._tag === "Failure") throw new Error(c.failure);
        const cwd = join(c.success.dir, "conformance");
        return { spec: { name: id, cmd: ["bun", join(cwd, "mutate-one.ts"), "--runtime", `../${tree}/adapter.ts`, ...extra], cwd, env: {}, limits: MUTANT, contract: "stated" }, close: c.success.close };
      },
    });
    const runner = scope.runner({ slots: parallel, mb: parallel * MUTANT.mb });
    const control = final(await runner.run(job("control", [])));
    if (outcome(control) !== "pass") return [{ name: "control", outcome: outcome(control) === "unknown" ? "unknown" : "fail", why: describe(control) }];
    const runs = list.map((m, i) => (problems[i] ? undefined : runner.run(job(m.id, m.edits))));
    const items: Item[] = [{ name: "control", outcome: "pass", why: "" }];
    for (const [i, m] of list.entries()) {
      const p = problems[i];
      items.push(p ? { name: m.id, outcome: "pass", why: `invalid, not scored (D113): ${p.why}`, detail: { by: "invalid" } } : mutantItem(m.id, final(await runs[i]!)));
    }
    return items;
  });
```

Marked names: `judged`, `Judged`, `rerunFor`, `unknown` (field), `parsed`, `killed` computation, `survived` counter, `one`,
`settle` (printer), `flexible` and the hand queue are **dropped**. `mutants.json` rows keep `id`, `kills`, `killed`, `killers`
and `author` (existing, what `report.ts`'s `MutantResult` reads). `by` stays, and `rerunFor` is **renamed** to `alone` (the first
attempt's cause). The KILLED/SURVIVED/UNKNOWN lines and the summary line are printed from the items, in list order (existing).

### 7.2 gates.ts

Before (existing, `gates.ts:54-105`, abridged only by the job table, which is unchanged):

```ts
const loadOf = (r: Watched) => (r.killed === "time" ? "time" : r.stdout.includes(CLOCK_TRIP) ? "clock" : /^UNKNOWN /m.test(r.stdout) ? "unknown" : undefined);
const runJob = (j: Job, together: boolean) =>
  watched(j.cmd, { rssMb: Math.max(j.mb * 2, 3000), seconds: j.limit, capture: true, cwd: here, ...(together ? { env: { FLOW_DEFER_UNKNOWN: "1" } } : {}) });
const start = (j: Job) => {
  slots += j.slots;
  mb += j.mb;
  running.push(runJob(j, true).then((r) => { results.set(j, { job: j, r }); slots -= j.slots; mb -= j.mb; free(); }));
};
while (queue.length) { /* pack */ }
await Promise.all(running);
for (const j of chosen.filter((x) => ALONE.has(x.name))) results.set(j, { job: j, r: await runJob(j, false) });
for (const j of chosen) { const d = results.get(j)!; const why = loadOf(d.r); if (why) results.set(j, { job: j, r: await runJob(j, false), again: why }); }
for (const j of chosen) { const { r, again } = results.get(j)!; const left = loadOf(r); if (r.code !== 0 || left) bad++; /* row */ }
process.exitCode = bad ? 1 : 0;
```

After (`Spec` is the existing table row, **renamed** from `Job`; its rows are unchanged except as marked):

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { describe, outcome } from "./verdicts/read.ts";                              // NEW
import { final, type Done, type Job } from "./verdicts/runner.ts";                   // NEW
import { copyOf, snapshot } from "./verdicts/snapshot.ts";                           // NEW
import type { Contract } from "./verdicts/spawn.ts";                                 // NEW
import { stated } from "./verdicts/state.ts";                                        // NEW

type Dirs = { readonly conf: string; readonly round: string };                       // NEW
type Spec = {                                                                        // renamed: from Job
  name: string;
  cmd: (d: Dirs) => string[];                                                        // changed: paths inside the job's copy
  slots: number;
  mb: number;
  s: number;
  limit: number;
  env?: Record<string, string>;                                                      // NEW
  contract?: Contract;                                                               // NEW
};
const specs: Spec[] = [
  { name: "suite", cmd: () => ["bun", "main.ts", "--round", round, ...rt, "--no-search"], slots: 1, mb: 1400, s: 19, limit: 280 },
  { name: "suite canon", cmd: () => ["bun", "main.ts", "--round", round, ...rt, "--no-search"], env: { FLOW_CANON_CHECK: "1" }, slots: 1, mb: 1500, s: 31, limit: 280 },   // NEW job
  { name: "suite copies", cmd: () => ["bun", "main.ts", "--round", round, ...rt, "--no-search"], env: { FLOW_COPIES_CHECK: "1" }, slots: 1, mb: 1300, s: 44, limit: 280 }, // NEW job
  { name: "typed tsc", cmd: (d) => [tsc, "-p", join(d.round, "typed/tsconfig.json")], contract: "exit", slots: 1, mb: 900, s: 6, limit: 200 },
  { name: "verdict plants", cmd: () => ["bun", "verdicts/plants.ts"], slots: 2, mb: 2000, s: 90, limit: 400 },                                                          // NEW job
];
const save = (d: Done) => {                                                          // changed: both streams, both attempts
  const f = d.job.name.replace(/[^\w.-]+/g, "_");
  const r = final(d);
  if (r.run.kind === "ended") {
    writeFileSync(join(out, `${f}.txt`), r.run.stdout);
    writeFileSync(join(out, `${f}.stderr.txt`), r.run.stderr);
  }
  if (d.alone && d.first.run.kind === "ended") writeFileSync(join(out, `${f}.first.txt`), d.first.run.stdout);
  writeFileSync(join(out, `${f}.reading.json`), JSON.stringify({ first: describe(d.first), alone: d.alone && describe(d.alone) }));
};
const label = { pass: "ok  ", fail: "BAD ", unknown: "UNKN" } as const;              // NEW
const row = (d: Done) => {
  const r = final(d);
  const e = r.run.kind === "ended" ? `exit ${r.run.exit}  ${(r.run.ms / 1000).toFixed(1).padStart(6)} s  ${String(r.run.peakMb).padStart(5)} MB` : "not started";
  return `${label[outcome(r)]} ${d.job.name.padEnd(24)} ${e}${d.alone ? `  (again, alone, after ${describe(d.first)})` : ""}  ${describe(r)}`;
};

await stated("gates", async (scope) => {
  const snap = snapshot([here, roundDir]);
  const job = (s: Spec): Job => ({
    name: s.name,
    slots: s.slots,
    mb: s.mb,
    expectedS: s.s,
    open: async () => {
      const c = copyOf(snap, basename(roundDir), []);
      if (c._tag === "Failure") throw new Error(c.failure);
      const d = { conf: join(c.success.dir, "conformance"), round: join(c.success.dir, basename(roundDir)) };
      return { spec: { name: s.name, cmd: s.cmd(d), cwd: d.conf, env: s.env ?? {}, limits: { mb: Math.max(s.mb * 2, 3000), seconds: s.limit }, contract: s.contract ?? "stated" }, close: c.success.close };
    },
  });
  const runner = scope.runner({ slots: maxJobs, mb: maxMb });
  const done = await Promise.all(chosen.map((s) => runner.run(job(s))));
  mkdirSync(out, { recursive: true });
  for (const d of done) save(d);
  console.log(done.map(row).join("\n"));
  return done.map((d) => ({ name: d.job.name, outcome: outcome(final(d)), why: describe(final(d)) }));
});
```

Marked names: `loadOf`, `runJob`, `start`, `free`, `waiting`, `pool`, `queue`, `running`, `results`, `ALONE`, `verdictLine`,
`bad`, the `GATES n/m exit 0` line and `FLOW_DEFER_UNKNOWN` are **dropped**. Packing, longest first, `--jobs`, `--mb`,
`--only`, `--out` and the per-job limit `max(mb*2, 3000)` are **existing**, and the runner and this file now own them. The
exit code is derived from the items (0, 1 or 2) and is no longer a count of nonzero exits.

## 8. Boundary map: every current behaviour

K = kept, C = changed (requirement or finding), D = dropped (reason).

| Where | Behaviour | | Why |
| --- | --- | --- | --- |
| `watch.ts` | `watched`: tree RSS by `lstart`, process group, 40 ms poll, `endTree`, `leftovers`, `peakMb` | K | moved to `verdicts/spawn.ts` as `spawnRun` |
| `watch.ts` | stderr piped and never read; capture optional | C | R8, finding 10: both drained, always |
| `watch.ts:83` | time kill decided after the child may have exited | C | finding 15: `killOf` |
| `watch.ts` | `CLOCK_TRIP`, `loadUnknown`, `Unknown` | D | no clock trip exists (3.2) |
| `watch.ts` | `shared`, `alone`, `idle`, `blocked`, `judged`, `Judged` | D | runner rule 3, top only (finding 14) |
| `watch.ts` | `FLOW_DEFER_UNKNOWN` and the `UNKNOWN` line | D | a nested process states `unknown` in its verdict (R1) |
| `watch.ts` | CLI with a WATCH line | K | thin wrapper on `spawnRun` |
| `gates.ts` | job table, packing, longest first, a job bigger than the pool runs alone | K | runner rule 1 |
| `gates.ts` | jobs run in the live tree, `ALONE` set after the pool | C | R10: one snapshot, a copy per job; the `ALONE` set is not needed |
| `gates.ts` | verdict = exit only; `loadOf` without rss; `verdictLine` regex | C | R1, findings 1, 11: `read` |
| `gates.ts` | reruns of load-answered jobs alone | K, widened | every `unknown`, once (R3) |
| `gates.ts` | no catch on a rejected job | C | finding 12: runner rule 2 |
| `gates.ts` | `--out` with stdout per job | K, widened | adds stderr, the first attempt, the reading (R8) |
| `gates.ts` | job set without canon/copies suites | C | finding 17 |
| `mutate.ts` | one snapshot at the start (round 10) | K | `snapshot.ts`, now used by every copying gate |
| `mutate.ts` | control first, a failure stops the run | K, stronger | the control must be a finished pass with every planned case (R6) |
| `mutate.ts` | edits checked up front, a throw stops the run | C | R9: `fail` items, no throw |
| `mutate.ts` | D113 invalid: reported apart, not scored | K | |
| `mutate.ts` | rss kill = killed by resources | D | finding 6, R3 |
| `mutate.ts` | a time kill again alone counts as killed | D | finding 2 |
| `mutate.ts` | last stdout line parsed as JSON; no answer = killed by `crash` | C | R1, R2: a stated `threw` is killed; no verdict is `unknown` |
| `mutate.ts` | survivors exit 0 | C | finding 13 |
| `mutate.ts` | `--parallel`, printed in list order, `mutants.json` fields | K | `rerunFor` renamed `alone` |
| `mutate.ts` | `CONTROL FAILED`, exit 2 | C | exit 1 when a gate is red, 2 when unknown |
| `mutate-one.ts` | gates in D101 order, the first that kills is the answer | K | items in order, first non-pass |
| `mutate-one.ts` | one JSON line, always exit 0 | C | finding 1: `VERDICT`, exit derived |
| `mutate-one.ts` | non-serial gates at once, killing the rest at the end | K | runner, `scope` close |
| `mutate-one.ts` | `CLOCK_TRIP` reruns, `tripped`, `rerun` | D | findings 3, 4, 14; nested, so no reruns |
| `mutate-one.ts` | `checks/*` by `spawnSync`, unwatched, after the other gates | C (K order) | R8, R9: through the runner; still after the rest |
| `mutate-one.ts` | `crash` when there is no SUMMARY | C | the suite's reading: stated `threw` = kill, unfinished = `unknown` |
| `mutate-one.ts` | searches with `deadlineMs: 100_000` | C | R7: state budget only |
| `gate5s.ts` | `spawnSync` of main.ts, no watchdog, stderr shown only on "could not run" | C | finding 4, R8: runner and `read` |
| `gate5s.ts` | allow list, "fails as it was read to fail" | K | on item `why` prefixes |
| `gate5s.ts` | exit 2 "could not run" | K (2 = unknown) | |
| `falsify.ts` | `run` with `judged`, CLOCK_TRIP filtering, `unknowns` list | D | runner and `expect` |
| `falsify.ts` | `say` ok/BAD lines | K | they become items; the lines stay |
| `falsify.ts` | checks by `code !== 0` and stdout regexes | C | `expect(name, r, "fail", holds)` on item `why` and `detail` |
| `falsify.ts` | a crash counts as red | C | only a stated `fail` (a `threw` counts); unfinished is `unknown` |
| `falsify.ts` | `reset()` and `copy()` from the live folder | C | R10: from one snapshot |
| `falsify.ts` | `watch` part on real sleeps | K | on `spawnRun`; also in plants |
| `falsify.ts` | lies targeted with a full fallback; `--full` writes records | K | targeted is final; records only from finished readings |
| `lifetime-falsify.ts` | copies from the live folder per run | C | finding 16 |
| `lifetime-falsify.ts` | control at 1500 MB, `passed > 0 && failed == 0` | C | finding 5, R6: `SUITE` limits, `expect(..., "pass", sameCases(planned))` |
| `lifetime-falsify.ts` | FAIL lines of unknown runs scored red | D | finding 7 |
| `lifetime-falsify.ts` | parallel loop with no catch | D | finding 12: runner |
| `lifetime-falsify.ts` | every case red on some wrong runtime | K | from finished readings only; `unknown` when an unfinished run could have decided it |
| `graph-gate.ts` | in-process; GRAPH lines; `seconds` in the JSON line | K | ends with `stated`; `seconds` is evidence only |
| `graph-gate.ts` | runs the suite's searches with their deadlines | C | through C2 |
| `search/engine.ts` | `deadlineMs`, `ending` | D | R7 |
| `search/engine.ts` | `ms`, `peakRssMb` in `Report` | K | evidence, kept out of verdict `detail` |
| `search/run.ts` | `--seconds` as the deadline; exit by verdict (`inconclusive` exits 0) | C (K mapping) | the watchdog limit is the caller's; one item, `inconclusive` = pass |
| `drive.ts:1416` | 20 s clock trip | C | finding 8: `SETTLE_STEPS` |
| `drive.ts:1415` | 5000-task bound | K | |
| scenarios FRAG-15, SEARCH-ODD-SMALL | deadline; assert no failure and a floor | C | finding 9: no deadline; assert `verdict`, `depthCompleted` |
| `main.ts` | PASS/FAIL, SUMMARY, RECIPIENTS, the lock, early `process.exit` | K lines, C exits | items: one per case, then `lock`, `catalog`, `recipients`, `only` |
| `main.ts` | the case list known only inside a run | C | `plannedCases(only)` exported (R6) |
| round-14 `checks/*`, `cli/main.ts`, `typed/compare.ts`, `typed/date-check.ts` | exit only | C | end with `stated` (R2) |

## 9. What it means for the rest of the system

- **The lock.** `main.ts`'s file list (`main.ts:120-135`) gains `verdicts/*.ts` and `limits.ts`, so the reader sits under the
  lock it serves. Every changed file under the lock (`watch.ts`, `gates.ts`, `mutate.ts`, `mutate-one.ts`, `gate5s.ts`,
  `falsify.ts`, `drive.ts`, `harness.ts` if touched, `main.ts`, the two scenario files, the search files) needs a line in
  `expected-changes.log` that gives its reason. Until then the suite is red "on the lock only", as now.
- **`expected-output.txt`.** Expected unchanged. Case outputs come from harness reads, not from process output. FRAG-15's
  line changes only if dropping the deadline changes what it reads, which can only happen under load. Any change is logged. The
  `VERDICT` line never enters it.
- **`expected-recipients.txt`.** Expected unchanged, for the same reason (FRAG-15's harnesses are counted). Any change is
  logged.
- **`gate-5s-expected.txt`.** Unchanged. It is matched against item `why`, which is the same text as before.
- **CLI pins.** The `flow` CLI's output is untouched. `cli/main.ts` gains its verdict line.
- **`--out` files.** Same stdout file names, plus stderr, first-attempt and reading files. The "0d diff" of ok/BAD lines becomes
  a diff of `(name, outcome)` items between two verdicts. Paths of temp copies are normalised, as STATUS.md already does by hand.
- **The falsify rule, "every gate seen failing" (D132).** It now means: a finished reading whose outcome is `fail`. A crash
  counts only when it is a stated `threw`. An `unknown` never counts as seen failing. The new parts must be seen failing
  themselves: `verdict plants` covers the reader, the runner and the snapshot. The step bound is covered by P8, the search
  assertions by P9 and the canon/copies jobs by P17.
- **Speed.**
  - A green gates.ts run gains two suite jobs (31 s, 44 s, about 1.4 GB each) and the plants job (about 90 s on 2 slots). It
    loses the serial tail of mutate-one and types-check after the pool (about 25 s), and copies cost about 0.1 s per job.
  - Today's 115 s should become about 130-150 s. That is an estimate, measured by the first run.
  - Rerun cost: 0 with no unknowns. Each unknown job adds its alone time, at most about 70 s (mutate-one, serial). About six
    unknown jobs still fit in 10 minutes, and any unknown makes the run red anyway.
  - The clock trip's removal takes away the most common source of unknowns.
- **Memory.** No change to declared packing. A stream cap of 16 MB means at most 32 MB per child. A suite's stdout plus its
  verdict is about 0.3 MB.
- **Docs.** STATUS.md, HANDOFF.md and the headers of `mutate.ts`, `gates.ts`, `falsify.ts`, `lifetime-falsify.ts` and
  `search/run.ts` name `judged`, `FLOW_DEFER_UNKNOWN`, "memory kill counts as killed" and `--seconds`. They are updated in the
  same change.
- **`report.ts`.** Unchanged. It reads `id`, `kills`, `killed`, `killers` and `author`.
- **`bench/`.** Untouched. Benchmarks measure time by design and decide no gate.

## 10. Expected-result changes (each one, named)

Verdicts on the real, null, broken, lying, mutant and lifetime runtimes must stay the same except for these, each of which the
brief lists as wrong:

| # | Change | Finding | Today's state |
| --- | --- | --- | --- |
| E1 | gates.ts reads mutate-one's verdict: a red swap, compare, date check, CLI or gate5s on the unmutated runtime is BAD, not ok. | 1 | mutate-one's control `killedBy` null, so the same now |
| E2 | A mutant time-killed on both attempts is `unknown`, not killed. | 2 | unknown which; the first full run lists them |
| E3 | A mutant "killed" by a clock trip in a search edge or in gate5s is killed by the step bound, or survives. | 3, 4 | the first full run lists them |
| E4 | A control killed by memory is `unknown` (red), never "ok" on a partial pass list. | 5 | lifetime control ok at 14.3 s, 1832 MB for 3, so likely unchanged |
| E5 | A mutant killed by rss is `unknown`, not killed. | 6 | `mutants.json` rows with `by: "rss"`, listed before landing (U6) |
| E6 | A run's partial FAIL lines are no catch: the lie or wrong runtime is `unknown`, not "ok". | 7 | none known |
| E7 | A spin that adds no tasks is a deterministic FAIL (`did not quiesce in N steps`), so the mutant or lie is killed or red, no longer `unknown: clock` forever. | 8 | the first full run lists them |
| E8 | FRAG-15 and SEARCH-ODD-SMALL assert their verdict and depth. Under load they no longer pass as inconclusive or vacuous. | 9 | expected green, values from one alone run |
| E9 | A child that writes past 64 KB to stderr finishes instead of being time-killed. | 10 | none known |
| E10 | An rss-killed gates.ts job is `unknown`, rerun alone, not BAD as a failure. | 11 | none |
| E11 | A rejected job or an edit that does not apply is a listed `unknown` or `fail`, not a hang or a crash. | 12 | none |
| E12 | A mutate.ts survivor makes mutate.ts `fail` (exit 1). | 13 | any list with survivors goes red |
| E13 | A run that ended on its own just inside the limit is read by its verdict, not as a time kill. | 15 | rare |
| E14 | lifetime-falsify, falsify lies and tamper copies come from one snapshot. | 16 | same verdict unless the tree changed during a run |
| E15 | gates.ts runs `suite canon` and `suite copies` and is red when they are. | 17 | both "1, the lock only" today, the same as the suite |
| E16 | Exit codes: `unknown` exits 2 everywhere. mutate.ts's red control exits 1, not 2. gates.ts exits with the first non-pass outcome's code. | 1, 13 | — |
| E17 | A search that crashes while its module loads, on null or a constant hash, was a catch by exit code. Now it is `unknown` (red). | 7's class (R3) | none known |

The three known reds of the last gates.ts run (falsify search `chain`, tamper's control on the lock, the suite on the lock) stay
red. This design adds no allow list (U5).

## 11. Proof plan

Each plant is a standing test in `verdicts/plants.ts`, which runs as the gates.ts job `verdict plants`. It plants failures in
two ways, and neither adds a test hook to production code:

- **Live plants.** Real child processes under `spawnRun`, `read` and the runner, with small limits and children that exceed
  those limits by ten times or more. That makes time and memory plants deterministic. Runtime plants are source edits to copies
  of the snapshot, the mechanism mutants already use.
- **Mapping plants.** Each consumer's decision is now a pure exported function of readings: `mutantItem`, `mutateOneItems`,
  `lifetimeItems`, `gate5sItems`, `falsify`'s `expect` calls. The live plants' real readings are fed into them.

Old code on each plant is shown once, at landing, by running the plant against the commit before the change. The result goes
into STATUS.md. The plant then stays against the new code.

| P | Finding | Plant (what, where) | Old code did | New code must |
| --- | --- | --- | --- | --- |
| P1 | 1 | Copy edit to `typed/swaps.ts` so the swap suite fails on the unmutated runtime; gates.ts `--only mutate-one` on that copy | mutate-one exits 0 with `killedBy: "swap"`; row `ok` | mutate-one states `fail` (item `swap`), exits 1; row `BAD`; gates exits 1 |
| P2 | 2 | A child that sleeps 60 s under a 2 s limit, on both attempts; its reading goes through `mutantItem` | `judged` returns the alone run, so killed | `unknown: killed time` twice; the alone attempt exists; not counted killed or survived |
| P3 | 3 | (a) A runtime edit that adds a fixed CPU cost per step, slow but correct, with a settle over 20 s in one `searchFlush` edge, under `mutate-one --search`. (b) A runtime edit where `pending()` stays true with no work, in that edge. (c) A type test: passing `deadlineMs` to `bfs` fails to compile. | (a) CLOCK_TRIP becomes an `Oracle`, so a false kill. (b) Unknown after 20 s, or a kill only under load. | (a) No kill: the search verdict is the same as unplanted. (b) `failed` by `did not quiesce in N steps` in under 1 s, the same `Report` (less `ms`) alone and beside 7 suite copies. (c) Compile error. |
| P4 | 4 | (a) P3a's edit under `gate5s`. (b) A real `unknown: killed time` reading of main.ts fed to `gate5sItems`, then to `mutantItem`. | (a) The trip text never reaches mutate-one, so a false kill `gate`. (b) n/a: no structure | (a) gate5s `pass`. (b) gate5s `unknown`, mutate-one `unknown`, mutant `unknown` |
| P5 | 5 | Copy edit: one case midway through lifetime's `ONLY` list allocates 4 GB. Plus a mapping test: a finished control missing one planned case. | Control `ok` on a partial pass list; never-red checked against fewer cases | Control `unknown: killed rss`, after an alone attempt; no wrong runtime scored; exit 2. The short control is `fail` by `sameCases`. |
| P6 | 6 | Runtime edit that allocates 4 GB at boot, as a one-mutant list | Killed by `rss` | `unknown: killed rss`; not killed |
| P7 | 7 | Copy edit: a wrong runtime that prints FAIL lines and then hangs in a later case (time kill); through `lifetimeItems` and falsify's lie check | FAIL lines counted red, so `ok` | That wrong runtime is `unknown`; its cases are not in the ever-red set; exit 2 |
| P8 | 8 | (a) Runtime edit: `pending()` always true. (b) Runtime edit: `while (true) {}` in one step. Suite `--only` one case. | (a) 20 s, `CLOCK_TRIP`, unknown forever. (b) Time kill. | (a) FAIL `did not quiesce in N steps`, under 1 s, alone and beside 7 suite copies. (b) `unknown: killed time` on both attempts (U1) |
| P9 | 9 | (a) FRAG-15 and SEARCH-ODD-SMALL alone and beside 7 suite copies. (b) A lie: an action of the frag search that never moves the state | (a) Under load, inconclusive or vacuous passes. (b) Green | (a) The same `verdict` and `depthCompleted` both ways, asserted. (b) The case is red on its verdict |
| P10 | 10 | A child writes 1 MB to stderr, then states `pass` | Blocks at about 64 KB until a time kill | `pass`; all 1 MB in `<job>.stderr.txt` |
| P11 | 11 | A gates.ts job that allocates past its limit | `BAD`, no rerun (`loadOf` has no rss) | `unknown: killed rss`, an alone attempt, listed |
| P12 | 12 | (a) An `open` that throws ("edit does not apply"). (b) A job whose binary does not exist. Both in a runner with 2 slots and 4 jobs, and in lifetime-falsify. | Unhandled rejection; leaked slots; lifetime hangs until its watchdog | (a, b) `unknown: unstarted` with the message; slots freed (events); every other job runs; lifetime states `fail` items up front for rotted edits |
| P13 | 13 | A mutant whose edit swaps the operands of a commutative `+` on numbers | Exit 0, a survivor | mutate.ts `fail`, the survivor listed |
| P14 | 14 | Three children in one top runner with 3 slots, each `unknown` on its first attempt | Reruns can start together | `events()`: each alone attempt starts with nothing running, and no two overlap |
| P15 | 15 | (a) Pure: `killOf("time", true, null)` gives null, and `killOf("time", false, "SIGKILL")` gives `"time"`. (b) Live: a child that exits 0 at about its limit, 30 runs | Sometimes recorded `time` | (a) As stated. (b) Never a kill without `SIGKILL`; the reading is the child's verdict |
| P16 | 16 | A temp "live" tree; start lifetime-falsify on it; after the control ends, edit a runtime file in that tree | Later wrong runtimes run the edited source | No run sees the edit (every copy is from the start snapshot); the same for falsify lies and tamper |
| P17 | 17 | Copy edit: `FLOW_CANON_CHECK`'s comparison reports a differ | gates.ts `ok` (not a job) | `suite canon` `BAD` |

Three structural standing checks run in the same job:

- **S1, one reader.** `verdicts/reader-check.ts` scans every conformance script outside `verdicts/`. It fails on any of: a
  child's `.stdout`/`.stderr` being split, matched or searched; `startsWith("PASS"|"FAIL")` on child output; `.exit`/`.code`
  compared outside `read`; `process.exit`/`process.exitCode` outside `state.ts`; `Date.now()`/`performance.now()` in any
  file except `spawn.ts`, unless the line carries the reason that the value is evidence only (main.ts's `ms`, graph-gate's
  `seconds`, gates.ts's wall line).
- **S2, parity** (requirement 11). Once, at landing, every runtime class runs on the old and the new code: the real runtime,
  null, the 7 broken runtimes, all 77 lies, falsify's named mutants, all 57 lifetime runtimes, and one full mutate.ts list.
  Old ok/BAD/KILLED lines are mapped to items by name and compared with the new verdicts. Every difference must be one of
  E1-E17. The table goes into STATUS.md.
- **S3, determinism.** Each deterministic gate (the suite, graph-gate, the checks, CLI pins, a search) runs twice, alone and
  beside 7 suite copies. The two `VERDICT` lines must be byte-identical once the copy folder is normalised.

## 12. Not resolved

- **U1. A synchronous CPU hang inside one step.** No bound outside the runtime can see it, because it calls nothing the fake
  or the harness owns. It stays `unknown: killed time`: red, listed, never a kill. A mutant whose only effect is such a hang
  can never be scored. The list must change it or drop it.
- **U2. "Alone" means alone among this tree.** Load from other programs on the machine is not controlled. It can still cause
  a time kill, and that kill is only ever `unknown`, never a verdict.
- **U3. `SETTLE_STEPS`.** It needs one measurement (3.2).
- **U4. FRAG-15's and SEARCH-ODD-SMALL's verdicts.** They need one alone run. If either cannot reach `completed` within its
  current cost, it asserts `inconclusive` and `depthCompleted`.
- **U5. Known reds.** This design adds no scheduler-level allow list, so gates.ts stays red on known failures, as it is today.
  `gate-5s-expected.txt` is the existing pattern if the user wants one. That is a separate decision.
- **U6. Which mutants change.** The mutants that move from killed to `unknown` (E2, E5) or to deterministic kills (E3, E7) are
  known only after one full mutate.ts run on the old code. No round-14 `mutants.json` is kept in the tree.
- **U7. Two deterministic bounds in `settle`** (tasks and steps). They could later merge into one work bound. Not done here: the
  task bound's failures are under the lock as they are.
- **U8. The port.** `verdict.ts` and `read.ts` port as plain TypeScript. In production `spawn.ts`, `runner.ts` and
  `snapshot.ts` are host-edge code, and AGENTS.md has that code use Effect (`Command`, `Scope`, `Schedule`). Their types and
  rules carry over unchanged. The conversion is the port's work, not this proposal's.
