# Static analysis, the CLI and rules on machines: design and Spec (2026-11-20)

**Verdict: three derived things and one judge.** (1) One pure edge model, `edgesOf(compiled)`, is the only thing
`graph`, `check`, `explain`, terminals and `RuleSubjectUnreachable` read; nothing static calls a Slot. (2) Every
command returns one `Result` value; one writer in `main` turns it into a stream and an exit code, and text is rendered
from the same value JSON encodes. (3) Rules compile into `Compiled.rules`; one host judge is the only caller of a
rule's check, it writes `RuleBroken` evidence, and the test verdict and rule coverage are derived from what it wrote.
Everything here is proposed. Asks are in section 8.

Sources: @task.V3.T22, @task.V3.T23, @task.V3.T106, @task.V3.T31; @plan.CommandLine O1 to O6; @plan.Rules O1 to O8;
code:wiki/plans/flow/references/proposals/rules-2026-11-20.md;
code:wiki/plans/flow/references/proposals/spec-test-tooling-2026-11-20.md (the run verdict);
code:wiki/plans/flow/references/proposals/spec-typed-machine-2026-11-20.md (`Parts<D>`);
code:wiki/plans/flow/references/proposals/spec-fragments-2026-11-20.md (`Compiled.slots`, `fragments`);
code:wiki/plans/flow/references/proposals/spec-cohesion-2026-11-20.md.

## 1. What exists

Paths are under `packages/flow-state-v3/`.

| Part | Where | State |
| --- | --- | --- |
| Compiled data | `src/core/compiled.ts` `Compiled` (409-424), `Node`, `Level`, `Alternative` (`at`, `target`, `guards`), `Guard` (`InState`, `Check`, `Idle`, `Retryable`), `Schedule`, `Operation`, `Reaction` | Holds. It has no rules, no terminals and no source locations |
| Plain view | `src/core/data-view.ts` `dataView` (98) | Holds; two compiles of one source give equal views. Only tests read it |
| Compile findings | `src/error.ts` `Finding`; `definitionFindings` (`src/construction.ts`), `bodyFindings` (`src/config.ts`), `operationFindings`, `reactionFindings` (`src/machine.ts` 182-200), `appFindings` (`src/core/well-formed.ts` 69) | Holds. They throw at construction; none is a `flow check` result |
| CLI | `src/host/cli/main.ts` `main` on `effect/cli`; `discover.ts` | `story list`, `story run`, `trace` only. `--project-root` only |
| Trace text | `src/host/trace.ts` `render` (215), `renderers.text` (181-190) | Holds as the evidence render; not the output for people |
| Run rules | `tests/rules/rules.ts` `Rule`, `rules` (21), `breachesOf`, `checked` | Hold. Applied only where a test calls `checked` |
| CLI tests | `tests/cli/cli.test.ts` (one file) | Exit codes 0 and 2 only; planted faults in `tests/tooling-faults.ts` 169-217 |
| Verify | root `package.json` `verify` | Checks, tests and stress run v3. No v3 build, no `exports`, no `bin` |

What is wrong or missing:

1. **No static analysis exists.** No reachability, no edge list, no graph export (searched `reachab`, `unreachable`,
   `deadlock`, `mermaid` in `src/`). `check`, `explain`, `graph`, `story describe` and `--coverage` have no code.
2. **Every command prints for itself.** `list`, `run` and `trace` each call `Console.log`; `main` maps three error
   tags to exit 2 and prints `Cause.pretty` for anything else (`main.ts` 135), which @plan.CommandLine.O3 forbids
   ("raw causes, stacks"). There is no exit 1, no JSON, no result value, so text and JSON cannot be proved equal.
3. **The parity test is its own oracle.** `cli.test.ts` 109 compares `flow trace` with `render(direct.trace)`: a
   wrong `render` passes. `RunRejected` has a planted fault but no test reaches it.
4. **Discovery is soft.** The escape check is lexical (`discover.ts` 70-75, no realpath); no root `package.json`
   check; `isStory` accepts any object with the brand key; duplicates are removed by identity, not refused by id.
5. **Nothing on a machine is a rule.** `rules` is not a body key; no `RuleBroken` record; no judge. App guarantees are
   hand checks inside single Stories.
6. **`verify` reads frozen packages.** `build:library` builds `packages/flow-state`; `scripts/check-toolchain.mjs`
   19-22 reads both frozen packages. `cli.test.ts` 208-209 asserts the package has no `exports` or `bin`, which
   @task.V3.T23 adds: that test must flip in T23, and T23's change list does not name `tests/cli`.
7. **Records disagree.** See section 8: the terminal error's name, `Machine`'s second type parameter, whether
   `story run` fails on a broken rule, and whether a load failure is exit 1 or 2.

## 2. State inventory

Almost everything in this concept is derived. The stored state is small, and each piece has one owner.

| State | Owner | Values | Inputs that change it in one step |
| --- | --- | --- | --- |
| Declared rules (`Compiled.rules`) | `machine()` compile | fixed per machine | none after construction |
| The judge's `before`, per live incarnation | host judge (`src/host/rules.ts`) | none, or the last published snapshot | publication; restore; copy entry, reset, exit, freeze; disposal |
| `RuleBroken` evidence | host judge | append-only records in the trace | a judged check that returns false or throws |
| Seen counts per rule, per run | host judge (test selection) | a count per rule and placement | a judged check, whatever it returned |
| A Story's rule switch | the Story plan (data) | `{ expectBroken, off }`, fixed | none after the Story is built |
| The invocation outcome | `main` | one `Outcome` per invocation | the one command that ran; a signal |
| Loaded project (config, apps, Stories) | `discover` | loaded once per invocation, read-only | none (`check --watch` reloads whole) |

Derived, never stored: the edge list, reachable leaves, findings, the run's rule verdict, rule coverage and its
unseen reasons, every text render, the exit code and the stream.

Seams (typed values crossing):

| Value | Direction | Neighbour |
| --- | --- | --- |
| `Compiled` (plus `slots`, `fragments`, scopes) | in | compile; @task.V3.T109 (fragments) owns the new fields |
| `Parts<D>` and token `.Type`s, from `src/derive.ts` | in | typed machine; rule check inputs are built from it |
| Declared schedules (name, `key`, `pausedBy`) | in | typed machine; edges name a schedule by its declared name |
| `Snapshot<D>` at each publication, and the turn's event and edge name | in | host runtime; the judge reads, never writes |
| `RuleBroken` evidence record | out | trace, inspectors, logs; the test verdict |
| `ruleBroken: Rule` for `verdictOf(run, rules)` | out | test tooling (@task.V3.T114); it owns the verdict |
| `Story` read as data (steps, switch, fakes) | in | test tooling; `story describe` and `check` read the plan |
| `Finding` rows from owner plans | in | each owner Task adds rows to the check table (section 3.2) |
| `Result` document, version 1 | out | people, automation, @task.V3.T31 |

The test-tooling design names its verdict item `Breach`; the user's word is "broken" everywhere
(code:wiki/plans/flow/references/proposals/rules-2026-11-20.md 38-40). The seam value is named `Broken`.

## 3. The design

### 3.1 The edge model: one derivation every static command reads

```ts
// NEW file: src/core/graph.ts. Pure, synchronous, reads Compiled only, never calls a Slot's `run`.
// NEW: Edge, Sender, Decider, edgesOf, firesIn, landsIn, reachableOf
// existing: Compiled, Alternative, Guard, Target, Schedule, Operation, Reaction

export type Sender = Data.TaggedEnum<{
  Public: {};                                        // a user or another actor's send
  Internal: {};
  Schedule: { state: string; name: string };
  Ending: { operation: string; ending: string };     // lateness is a run-time fact; see `mayBeLate` below
  Reaction: { slot: string };                        // onContext
  Raise: { fragment: string };                       // a host's raise into a fragment (T109 adds)
}>;

export type Decider = Data.TaggedEnum<{
  InState: { state: string };                        // narrows where the edge fires; the only one analysis reads
  Idle: { operation: string };
  Retryable: { operation: string; times: number };
  Closure: { slot: string };                         // opaque: may pass or deny
}>;

export type Edge = {
  readonly name: string;                             // Alternative.at, or `trigger:<node>:<event>` (implicit)
  readonly declaredOn: string;                       // state path of the handler; "" is the root
  readonly event: string;
  readonly senders: ReadonlyArray<Sender>;
  readonly target: Option.Option<Target>;            // none: stays put
  readonly decidedBy: ReadonlyArray<Decider>;
};

export const edgesOf: (compiled: Compiled) => ReadonlyArray<Edge>;
export const firesIn: (compiled: Compiled, edge: Edge) => ReadonlyArray<string>;   // leaves
export const landsIn: (compiled: Compiled, edge: Edge, leaf: string) => ReadonlyArray<string>;
export const reachableOf: (compiled: Compiled) => ReadonlySet<string>;             // leaves
```

Rules of the derivation, all over-approximations (more edges fire than really can, never fewer):

- An edge fires in every leaf under `declaredOn`, narrowed only by its `InState` deciders. A deeper handler never
  removes a leaf: even an alternative with no guards can decline (`LateMayNotLeave`, `src/core/turn.ts` 143, 254),
  and selection then falls through to the ancestors. "Shadowed" is a display mark only, never used by a proof.
- `Closure`, `Idle` and `Retryable` deciders never remove a leaf.
- Implicit schedule edges are edges: a schedule's `armOn` or `disarmOn` event with no written handler at any level
  takes the turn as `trigger:<node>:<event>` (`src/core/turn.ts` 521, 554). `edgesOf` derives one per such state
  and event, with no target, and derives none where any level writes a handler for the event (the code's rule).
- `mayBeLate(compiled, edge)`: an ending edge may be late when a state that starts its operation
  (`Action.Commit.operation`) can be left while the edge's level stays active. Lateness itself is decided at serve
  time (`src/core/serve.ts` 390-400), so the model only gives this bound.
- `landsIn`: no target gives the leaf itself; `State` gives the default leaf under the path; `History` gives every
  leaf under the compound.
- `reachableOf` is the least fixed point from `compiled.initial` over `firesIn` and `landsIn`, counting an edge only
  when it has a sender.
- Restarts are not edges: a new incarnation, a restore, a trait's `resetOn` (@plan.Rules.O2).

Before and after for a consumer:

```ts
// before (src/machine.ts): one private walk per question
const handled = (compiled, event) => /* any level handles it */;

// after: every question is a filter over the same list
const handled = (compiled: Compiled, event: string) => edgesOf(compiled).some((edge) => edge.event === event);
```

`flow graph` prints `edgesOf` grouped by state; an edge's name is `Alternative.at`, which the turn record already
carries, so @task.V3.T22's "edge names equal run-evidence names" is true by construction and tested over every
fixture. Marks (`late`, `shadowed`, `unreached`, `unsourced`) are derived: `late` from `mayBeLate` (printed as "may be
late"), `shadowed` when a deeper level has an unguarded alternative for the event that is not an ending's,
`unreached` from `firesIn` outside `reachableOf`, `unsourced` from no senders.

### 3.2 `flow check`: one table of finding rules over the model

```ts
// NEW file: src/core/checks.ts (pure). NEW: Check, checks, findingsOf
// existing: Finding (src/error.ts) gains `severity` and keeps `path`

export type Check = {
  readonly reason: string;                                   // stable: "TerminalLeft"
  readonly severity: "error" | "warning" | "info";
  readonly find: (app: AppModel) => ReadonlyArray<Finding>;  // AppModel: every Compiled of an app, its edges
};
export const checks: ReadonlyArray<Check>;
export const findingsOf: (app: AppModel) => ReadonlyArray<Finding>;   // every row, sorted by path then reason
```

- @plan.CommandLine.O5 lists about ninety findings owned by many Plans. The table is the one place they register;
  each owner Task adds its rows with its fixtures. @task.V3.T22 builds only the rows whose data is in `Compiled`
  today (list in section 5) and the table's own guard: every row has a fixture that triggers it, a near fixture that
  does not, and a planted fault. A row without all three fails `tests/cli/checks.test.ts`.
- Construction findings (`definitionFindings` and the rest) stay where they are and keep throwing at `machine()`.
  `flow check` catches a construction `FlowError` while loading and reports its findings as error rows (exit 1),
  so a broken definition is a check result, not a crash; a module that does not load at all is exit 2 (ask 4).
- Severity never changes at run time: a warning never fails the check (@plan.CommandLine.O5).

The rows this concept owns:

| Reason | Severity | Derived from |
| --- | --- | --- |
| `TerminalLeft` | error | an edge that fires in a leaf of a terminal and lands outside it (3.4) |
| `TerminalEmpty`, `TerminalDuplicate` | refused at `machine()` | the `terminals` list itself |
| `RuleSubjectUnreachable` | warning | `in` state outside `reachableOf`, or no edge of `on`'s event fires in a reachable leaf |
| `StateUnreachable` | warning | a leaf outside `reachableOf` |
| `LikelyStuck` | warning | a reachable leaf with no edge leaving it, unless it is under a terminal |
| `UnhandledEvent` | warning | a declared event with no edge |
| `DelayOutOfRange` | error | a fixed delay negative or over the timer range (@task.V3.T22 comment, 2026-11-20) |

### 3.3 One result, one writer

```ts
// NEW file: src/host/cli/result.ts. NEW: Result, Status, Outcome, exitOf, write
// existing: Finding, FlowError

export const Result = Schema.Struct({
  version: Schema.Literal(1),
  command: Schema.String,                               // the leaf: "check", "story run"
  status: Schema.Literals(["completed", "equal", "different", "incomplete", "failed"]),
  data: Schema.NullOr(Schema.Unknown),                  // each command's own Schema, joined in a union
  diagnostics: Schema.Array(Diagnostic),
});

export type Outcome = Data.TaggedEnum<{
  Answered: { result: Result };                         // stdout
  Refused: { reason: InvocationFailure };               // stderr, one document
  Interrupted: { signal: "SIGINT" | "SIGTERM"; partial: Option.Option<Result> };
}>;
```

Before: each command prints. After: a command is `Effect<Result, InvocationFailure, Env>`; it never prints and
never names an exit code. `main` owns the outcome, and this is its whole table:

| Outcome | Stream | Status | Exit |
| --- | --- | --- | --- |
| Answered; no error finding (warnings allowed); help; version | stdout | `completed` | 0 |
| Answered; `check` has an error finding | stdout | `failed` | 1 |
| Answered; `story run` whose verdict has a broken rule (ask 3) | stdout | `failed` | 1 |
| Refused: `InvalidUsage` (before any loading) | stderr | none | 2 |
| Refused: `ConfigLoadFailed`, a module that does not load, unknown app, machine or Story | stderr | none | 2 |
| Refused: `RunRejected` (the run's `FlowError`: boundary and evidence, no stack) | stderr | none | 2 |
| Refused: `OutputFailed` (printed once; a broken pipe prints nothing more) | stderr | none | 2 |
| Refused: a defect (`flow: internal error` and the error's name; never `Cause.pretty`) | stderr | none | 2 |
| Interrupted, after cleanup | stderr | none | 130 or 143 |

Text is `renderers[command](result, format)`: a pure function of the same `Result` JSON encodes, so no text line
can state something the JSON does not hold. `flow trace` and `flow story run` keep their evidence unchanged; the
output for people (@task.V3.T31) is a second renderer over the same `Result`, never a second computation.

Source locations: `Compiled` carries definition paths (`Alternative.at`, a Slot's name) and no file positions, and
it stays that way. The CLI's one source adapter (decided, @plan.CommandLine Q1) maps a definition path to
`file:line`; a finding carries `path` always and `location` as an `Option` the adapter fills (ask 5).

### 3.4 Rules: declared, compiled, judged by one host judge

```ts
// existing: definition, machine, S, E      NEW: rules, invariants, turns, terminals, in, on, check, enabled
// user-defined: Order, OrderMachine, RefundKeepsTotal, PaidHasReceipt
export const OrderMachine = machine(Order, ({ S, E }) => ({
  default: S.PENDING,
  on: { Refund: { target: S.REFUNDED, guard: [S.SHIPPED] } },
  states: { /* unchanged */ },
  rules: {
    invariants: { PaidHasReceipt: { in: S.SHIPPED, check: ({ memory }) => memory.receipt !== null } },
    turns: {
      RefundKeepsTotal: { on: E.Refund, enabled: import.meta.env.DEV,
        check: ({ before, after }) => after.memory.total === before.memory.total },
    },
    terminals: [S.REFUNDED, S.CANCELLED, S.SHIPPED.DELIVERED],
  },
}));
```

Compiled gains one field. `enabled` is read once at construction; a bare function has `enabled: false`.

```ts
// src/core/compiled.ts. NEW: Rule, Rules, Compiled["rules"]
export type Rule = {
  readonly name: string;                                        // "RefundKeepsTotal"
  readonly kind: "invariant" | "turns";
  readonly subject: Option.Option<string>;                      // a state path (`in`) or an event name (`on`)
  readonly enabled: boolean;
  readonly check: Slot<(input: RuleInput) => boolean>;
};
export type Rules = {
  readonly judged: ReadonlyArray<Rule>;                         // invariants first, then turns, declaration order
  readonly terminals: ReadonlyArray<string>;                    // state paths
};
```

A fragment's rules sit on its entry in `Compiled.fragments` (@task.V3.T109 owns that field); the type is the same
`Rules`, and a trait's has no `terminals`.

**The judge** is the only code that calls `rule.check.run`. It lives in `src/host/rules.ts`; the core never imports
it. It is one pure step plus the host's fold:

```ts
// NEW file: src/host/rules.ts. NEW: Published, judgeOf, Judged
export type Published = Data.TaggedEnum<{
  Turn: { after: Snapshot; event: string; payload: Values; context: Values };   // an accepted turn
  Other: { after: Snapshot };          // a publication that is not an accepted turn (a settled ending's lane change)
  Begin: { after: Snapshot };          // a create or a restore (`start()` publishes both); a copy's entry or reset
  End: {};                             // a copy's exit or freeze; disposal
}>;

export type Judged = {
  readonly before: Option.Option<Snapshot>;                     // the next `before`
  readonly seen: ReadonlyArray<string>;                         // rules exercised by this publication
  readonly broken: ReadonlyArray<RuleBroken>;                   // invariants first, then declaration order
};

export const judgeOf: (rules: Rules, selected: ReadonlySet<string>) =>
  (before: Option.Option<Snapshot>, published: Published) => Judged;
```

`Published` is new: the core's publication record is `{ actor, state, memory }` (`src/core/evidence.ts` 157), and
the host builds `Published` from it and the turn record of the same step. In the code today an accepted turn
publishes exactly once (`src/core/serve.ts` 353), each turn of a drain publishes its own record, a denied or
unhandled public turn publishes nothing, and a settled ending publishes without a turn (`serve.ts` 233-234).

`before` has four writers, so it gets the one transition table of the concept. The judge owns it; one row per
publication kind, for one live incarnation (an actor, a fragment placement, or one `.each` copy):

| Published | Invariants | Turns rules | `before` after |
| --- | --- | --- | --- |
| `Turn` | each whose `in` holds `after.state` (or no `in`) | each whose `on` is the event (or no `on`), with `before`, `after`; `event` only with `on` | `after` |
| `Other` | as above | skipped, not counted | `after` |
| `Begin` | as above | skipped, not counted | `after` |
| `End` | not judged | skipped | none |
| `Turn` while `before` is none | as above | skipped (a defect is logged: a turn cannot precede its first publication) | `after` |

`selected` is the only difference between tests and production, so there is one judge:

| Where | `selected` |
| --- | --- |
| A Runtime outside tests | the rules with `enabled: true`; empty means the judge is not installed at all |
| A Story, generated run, reload sweep, pair sweep | every rule except the Story's `off` (and its `expectBroken` in runs generated from it) |

A broken rule becomes one `RuleBroken` evidence record; a check that throws is the same record with `threw: true`.
Nothing is thrown at the app: the publication has already happened (@plan.Rules.O6).

```ts
// NEW evidence record (src/host/trace.ts TraceRecord)
RuleBroken: {
  rule: string;            // "Shop/Order.RefundKeepsTotal"; a fragment's is "Desk/Editor/uploads.CancelSticks"
  kind: "invariant" | "turns";
  actor: string; copy: Option.Option<string>;                   // "uploads[a]"
  turn: Option.Option<string>;                                  // the edge name, for a turns rule
  before: Option.Option<Snapshot>; after: Snapshot;             // `Flow.private` fields redacted (publicMemory)
  threw: boolean;
}
```

**The test verdict and coverage are derived.** The judge's records and counts are the facts; the Story's switch
is data; one pure function maps them to the verdict item test tooling consumes (`verdictOf(run, rules)`):

| Switch for the rule | Never exercised | Exercised, never broke | Broke at least once |
| --- | --- | --- | --- |
| checked (default) | passes; coverage: unseen | passes; coverage: seen n | `Broken(rule)`: fails on the first, lists all |
| `expectBroken` | fails: "never broke" | fails: "never broke" | passes; later breaks are not failures |
| `off` | not judged; out of the total | not judged | not judged (its check is never called) |
| in both lists | refused when the Story is built | | |

Rule coverage is `coverageOf(runs, models)`: seen counts added over runs, one row per rule and placement (copies
added), and an unseen row's reason derived from the model: `RuleSubjectUnreachable` if the graph cannot reach it,
else "in X, never reached", "X never accepted" or "fragment never placed". It is never stored and never fails.

Terminals are proved in `checks.ts`, never judged: for each leaf under a terminal and each edge that fires there,

| Edge | Counts as leaving |
| --- | --- |
| lands on a leaf outside the terminal's subtree (handler on the state, an ancestor or the root) | yes: `TerminalLeft`, naming the edge and the leaf |
| leaf terminal, self-transition or no target | no |
| compound terminal, lands inside its subtree | no |
| sent by a schedule, a late ending or an `onContext` reaction | same as any sender |
| a subroutine exit taken from the leaf | yes |
| `InState` decider that excludes the leaf | does not fire there, so no |
| a restart (new incarnation, restore, `resetOn`) | not an edge |

### 3.5 Rule tokens and the type surface

@plan.Rules.O3 gives `machine()` a second type parameter for the body; the typed-machine design found that capturing
the body fails in eight shapes and keeps `Machine<D>` fixed. Both cannot hold. The design: capture **only the rule
names**, not the body, and spike it first (section 5):

```ts
// NEW: R, the rule-name parameter; machine.rules. existing: Machine<D>, BodyOf<D>
declare const machine: <D extends Definition, const R extends string = never>(
  definition: D,
  body: (tokens: Tokens<D>) => BodyOf<NoInfer<D>> & { readonly rules?: RulesOf<D, R> },
) => Machine<D> & { readonly rules: { readonly [K in R]: RuleToken<D, K> } };
```

`Machine<D>` itself is unchanged, so every neighbour's type keeps working and an annotated `Machine<typeof X>`
compiles and loses the tokens, as the Plan says. If the spike fails, the fallback is ask 2.

### 3.6 `nub run verify` builds v3

- `packages/flow-state-v3/package.json` gains the six-route `exports` map, `bin: { flow: … }` and a build; the bin
  file is five lines: provide the Node platform layers, run `main(process.argv.slice(2))`, set `process.exitCode`.
- `verify` = toolchain check, lint rules, `check`, `test`, `test:stress`, v3 build, packed-consumer smoke on the
  tarball, `docs:build`; nothing in it names `packages/flow-state` or `packages/flow-state-rewrite`.
- The packed-consumer smoke runs the installed `flow check` and `flow story list` in a scratch project: the only
  process-level CLI test, and where exit codes 130 and 143 are tested.

## 4. Requirements and Invariants

Each is a check that fails on a wrong build. Sources in brackets.

**Requirements**

- **R1** The commands are `story list`, `story describe`, `story run`, `trace`, `graph`, `check`, `explain`, and no
  other. A test lists the command tree and compares it with this list. [@plan.CommandLine.O1; the user's CLI scope]
- **R2** `graph`, `check`, static `explain`, `story list` and `story describe` call no Slot and start no Runtime.
  Test: every fixture's `Compiled` with each Slot's `run` replaced by a thrower gives byte-equal output. [O2]
- **R3** `edgesOf` names each edge by `Alternative.at` or its `trigger:` name; over every fixture Story, every
  accepted turn's part name (`Part.at`, `src/core/evidence.ts` 78) is an edge of its machine. [@task.V3.T22 acceptance]
- **R4** Every command returns one `Result`; `main` writes exactly one document to exactly one stream. [O3]
- **R5** Exit codes follow the table in 3.3, one row per test, with hand-written expected documents. [O3]
- **R6** Text holds nothing the JSON lacks: each text renderer's input type is the command's `Result`. [O3, V4]
- **R7** `flow check` reports each row of the check table with severity, reason, path and help; warnings never
  change the exit code. [O5]
- **R8** A machine body may declare `rules`; `machine()` refuses a duplicate name across `invariants` and `turns`,
  an empty `terminals` and a state listed twice, also for untyped input. [@plan.Rules.O2, O3]
- **R9** Every Story, generated run, reload sweep and pair sweep judges every selected rule with no call in the
  test; a broken rule fails the run through `verdictOf`. [@plan.Rules.O4]
- **R10** The judging table in 3.4 holds row by row. [@plan.Rules.O1; rules-2026-11-20 lines 15-20]
- **R11** The switch table in 3.4 holds cell by cell. [@plan.Rules.O4]
- **R12** Outside tests only `enabled` rules are judged; a broken one writes `RuleBroken` with private fields
  redacted and throws nothing. [@plan.Rules.O6]
- **R13** `flow check` proves terminals by the edge table in 3.4. [@plan.Rules.O2, V5]
- **R14** Rule coverage lists every rule as seen, unseen (with its reason), expected or off; unseen never fails. [O5]
- **R15** `flow explain <machine>` lists each rule's name, kind, subject and `enabled`, and each terminal. [O8]
- **R16** `nub run verify` builds and packs v3 and reads no frozen package. [@task.V3.T23 acceptance]
- **R17** Discovery refuses a root without `package.json`, a path that leaves the root after symlinks, duplicate
  Story ids, and a value that only looks like a Story or config, each before any Story runs. [O6]

**Invariants**

- **I1** One caller: `rule.check.run` is called only in `src/host/rules.ts`. Lint, plus a planted call in the core.
- **I2** The core never imports `src/host/rules.ts`, and a turn's result is equal with rules present and absent
  (same state, effects and evidence apart from `RuleBroken`). [@plan.Rules goal: "claims, never guards"]
- **I3** `edgesOf`, `reachableOf` and `findingsOf` are functions of `dataView(compiled)`: two compiles of one source
  give equal results, in equal order.
- **I4** Over-approximation: every leaf a Story run visits is in `reachableOf`; every accepted turn's edge fires, by
  `firesIn`, in the leaf it was taken from. So `RuleSubjectUnreachable` and `StateUnreachable` are never false.
- **I5** A terminal proved by `check` is never left in any run: no fixture Story or generated run publishes a state
  outside a terminal after one inside it, within one incarnation.
- **I6** `before` is the last snapshot published for the same incarnation, or none; a turns rule never sees a pair
  across a restore, a copy's entry, reset or exit.
- **I7** A rule is counted as seen exactly when its check was called; `off` rules have zero calls.
- **I8** Records for one publication are ordered invariants first, then declaration order; the run fails on the
  first and lists all.
- **I9** The exit code and stream are functions of the `Outcome` alone; no command writes to a stream.
- **I10** No output holds a stack, a fiber id, `Cause.pretty` text, a Slot's closure text or an absolute path
  outside the project root.
- **I11** A static command leaves the project tree byte-equal (no caches, no bundles).
- **I12** Severity is fixed per reason; one reason has one severity in every output.

Transition tables and where their rows come from: the outcome table (3.3) from R4, R5, I9; the judging table (3.4)
from R10, I6; the switch table from R11, I7; the terminal edge table from R13, I5; the check table from R7, I12.

## 5. Development strategy

Order, each step resting on the one before:

1. **Spike the rule-name parameter** (half a day, in a scratchpad against the real `machine()` types): `PayBody`
   and the largest fixture still compile; `machine.rules.X` exists; a duplicate is an error; `event` is typed from
   `on`. If it fails, ask 2 goes to the user before any rules code. This is the concept's largest risk.
2. **Result and outcome** (`result.ts`, `main` as the one writer), with the three existing commands moved onto it
   and the routed discovery items (R17). No new command. It removes `Cause.pretty` and adds exit 1.
3. **The edge model** (`graph.ts`) and `flow graph`. Risk: `firesIn` shadowing and `History`; prove I4 against
   every fixture run before any finding is built on it.
4. **The check table** with the rows `Compiled` can already answer: this concept's seven, plus unfilled ports,
   `ReservedStateName`, `UnknownNotUncertain`, late-event handlers, `NotSent` unmapped, `UnusedOperation`,
   unhandled events. Rows needing fragments, props, emits, domains or type facts land with their owner Tasks.
5. **`explain`** (static) and `story describe`: renderers over the model and the Story plan.
6. **Rules, declared** (`Compiled.rules`, body Schema, construction refusals, types). No judging yet.
7. **Rules, static**: `TerminalLeft`, `RuleSubjectUnreachable`, `explain` rows. Needs only steps 3 and 6.
8. **Rules, judged**: the judge, `RuleBroken`, the switch, coverage. Needs @task.V3.T114's `verdictOf`.
9. **Fragment rules** with @task.V3.T109: per placement and copy, `Story.fragment`.
10. **Verify builds v3** (@task.V3.T23), then **outputs for people** (@task.V3.T31) last, on stable `Result`s.

Proposed Task split, by state ownership:

| Task | Owns | From |
| --- | --- | --- |
| T22a Results and discovery | the invocation outcome; the loaded project | T22 |
| T22b Edge model and `graph` | nothing stored; the one derivation | T22 |
| T22c Check table and `explain` | nothing stored; the finding registry | T22 |
| T106a Rules declared and typed | `Compiled.rules` | T106 |
| T106b Rules proved | nothing stored (rows in T22c's table) | T106 |
| T106c Rules judged and covered | `before`, `RuleBroken`, seen counts, the switch | T106 |
| T106d Fragment rules | the same, per placement and copy | T106, with T109 |
| T23 Verify builds v3 | package `exports`, `bin`, build | unchanged |
| T31 Outputs for people | the text renderers | unchanged |

T106a and T106b do not need fragments, T113 or T114, so they can run in P4 right after T22b; only T106c waits for
T114 and only T106d for T109.

What to spike besides step 1: `Published` at the host. One accepted turn is one publication in the core today, but
the driver sinks a whole Serve step's evidence at once (`src/host/driver.ts` 358), so settle before T106c's first
commit how the judge gets each turn's payload and the context its guards saw, in order, from one step's records,
and whether the full (not public) snapshot is available there. If it is not, the core's publication record grows a
field, which is the core's Task, not this one.

## 6. Testing strategy

Expected results come from the tables above and the cited Plan lines, written by hand, never from `render`,
`edgesOf` or the judge.

- **Table tests.** One test per row or cell of the five tables. The judging table is run as sequences, not single
  steps: every 3-step sequence over {Turn, Other, Begin, End} for one incarnation, with a turns rule that records
  the pairs it saw; the expected pairs come from the table.
- **Several copies and keys.** Two actors of one machine, and a fragment with three copies: each has its own
  `before`; a break in copy `b` names `uploads[b]` and never pairs `a`'s snapshot with `b`'s. Coverage adds copies.
- **Non-default starts.** A machine restored into a state under a rule's `in`; a copy entered with memory that
  already breaks an invariant (judged at `Begin`); a Story whose first step is a denied turn.
- **Sequences over time.** Turn, restore, turn: the pair across the restore is never judged. Break, then break
  again under `expectBroken`: one pass. `off` in a Story, then a generated run from it: still off.
- **Restore after a definition edit.** A record saved under a definition without a rule, restored under one with it:
  invariants judge the restored snapshot. A terminal added to a state a saved record is in: `check` is unaffected,
  and the judge never sees a `before` from the old definition.
- **Hostile fakes.** `Compiled` whose every Slot throws (R2). A rule whose check throws, returns a non-boolean, or
  mutates its input (the snapshot is frozen; the turn's result is unchanged, I2). A config whose default export only
  carries the brand key. A Story file that is a symlink out of the root. A stdout that closes mid-write.
- **Generator, for the model.** For every fixture machine, generated runs feed I4 and I5: each visited leaf is in
  `reachableOf`, each taken edge fires where taken, no terminal is left. A wrong `firesIn` (too narrow) fails here.
- **Hand graphs for the other direction.** I4 only catches too few edges. Six small hand-built machines with the
  expected edge list, reachable set and findings written out catch too many: an unguarded child that does not
  shadow, `InState` narrowing, `History`, a root handler, an implicit `armOn` edge with and without a written
  handler for the same event, an ending that may be late.
- **Golden documents.** Per command, one text and one JSON document per fixture app, hand-reviewed and accepted by
  the user for @task.V3.T31; a test proves the text is a render of the JSON's `Result`.
- **Planted faults** (each caught by a named test, run by `nub run faults`): `firesIn` ignores `InState`; an
  ancestor's handler is dropped from a terminal's proof; the judge keeps `before` across a restore; the judge judges
  an `Other` publication with turns rules; `off` rules are counted as seen; `expectBroken` passes when never
  exercised; `enabled: false` judged outside tests; a `check` error exits 0; a warning exits 1; a second document on
  stderr; `Cause.pretty` back in a defect; private memory in `RuleBroken`; the core calls a rule.
- **Guards that keep the freedom away.** Lint: `src/core/graph.ts` and `checks.ts` import no host module and never
  read `.run`; `rule.check.run` appears only in `src/host/rules.ts`; `Console` is imported only by `main.ts`; a
  command's type is `Effect<Result, InvocationFailure, …>` so it cannot return an exit code. Narrow the faults
  runner's `tests/cli/*.test.ts` exemption (`tools/faults/run.ts` 243-251) to the two parity tests.
- **Bench** (`--dev` points): a turn with 0, 5 and 20 rules, selected and not (the Plan's on and off cost);
  `edgesOf` plus `findingsOf` over the largest fixture app; `flow check` cold start; one Story run with and without
  the judge installed. The no-rule turn must not move: with `selected` empty the judge is not installed.

## 7. Handoff for the Opus leads

| Task | Read first | Decided | Open, settle before code | First commit |
| --- | --- | --- | --- | --- |
| T22a | 3.3; `main.ts`; `discover.ts`; @plan.CommandLine O3, O6 | one `Result`, one writer, the outcome table | asks 3, 4 | the outcome table as failing tests; hostile config and symlink tests |
| T22b | 3.1; `compiled.ts`; `compile-body.ts` `nodesOf`; `turn.ts` 517-554 | `Edge`, over-approximation rules, names from `at` and `trigger:` | the exact `mayBeLate` bound | six hand graphs and I4 over fixtures, red |
| T22c | 3.2; @plan.CommandLine O5; `error.ts` `Finding` | the table and its three-fixture guard | which rows are in scope now (step 4's list) | one failing fixture pair per row |
| T106a | 3.4, 3.5; @plan.Rules O1 to O3; `machine.ts`; `config.ts` | `Compiled.rules`; `enabled` read once | the spike's result; ask 2 if it fails | `tests/types/` rule-token file and refusal tests, red |
| T106b | 3.4 terminal table; `graph.ts` | proved, never judged; ask 1's name | none | @plan.Rules V5 cases as failing check fixtures |
| T106c | 3.4 judge; test-tooling 3.4; `runtime.ts` publication path | one judge, `selected`, derived verdict | one turn, one publication; operation row busy timing (@plan.Rules Q1) | the judging and switch tables as failing sequence tests |
| T106d | @plan.Rules O7; fragments design | per placement and copy | the copy's address format (cohesion 9, 12) | per-copy `before` test, red |
| T23 | 3.6; root `package.json`; `scripts/check-toolchain.mjs` | verify's parts | whether `faults` joins verify (the user said no: end of Task) | flip `cli.test.ts` 208-209; a failing packed smoke |
| T31 | 3.3; @plan.CommandLine O1 text rules | renderers over `Result` only | ask 5; the user accepts each output | each output as a hand-written golden |

## 8. Proposed decisions and sidecar log

**Ask 1. A left terminal is reported as `TerminalLeft`.** The Plan says `TerminalLeft` (@plan.Rules.O2); the
proposal text says `RuleBroken` (rules-2026-11-20 line 90). Recommended: `TerminalLeft`.
- Trace A (`TerminalLeft`): `flow check` prints `error TerminalLeft Shop/Order on.Refund[0] can leave REFUNDED`;
  a log search for `RuleBroken` finds only runs.
- Trace B (`RuleBroken`): the same finding and a run's evidence record share one name; a reader cannot tell a proof
  from an observation, and `off: "all"` reads as if it applied.

**Ask 2. If the rule-name spike fails, rule tokens are checked at the Story, not by the type.** Recommended: run the
spike first; this is only the fallback.
- Trace A (spike passes): `.rules({ expectBroken: [M.rules.SetLandsInBound] })` is a type error.
- Trace B (fallback): `M.rules` is a record of tokens by name; the same typo compiles and `Story` refuses it when
  built, naming the rule and the machine's rule names. `Machine<D>` is untouched either way.

**Ask 3. `flow story run` exits 1 when the run's verdict has a broken rule.** @plan.CommandLine.O2 says `story run`
has "no pass or fail on correctness"; @plan.Rules.O4 says every Story judges; test tooling gives the CLI the same
`verdictOf`. Recommended: exit 1, result on stdout, `status: "failed"`; exit 2 stays for a rejected run.
- Trace A (exit 1): CI runs `flow story run shop/refund`; `RefundKeepsTotal` breaks; stdout holds the checkpoints
  and the broken rule; exit 1. A script fault (unknown step) is exit 2 on stderr.
- Trace B (exit 0, report only): the same run prints the broken rule and exits 0; CI passes a broken rule unless it
  parses the document.

**Ask 4. A definition that fails construction is a `check` error (exit 1); a module that does not load is exit 2.**
The Plan says a graph that fails to load is an invocation failure; the Spec draft and the lazy Plan say findings.
- Trace A (recommended): a duplicate state name gives `error DuplicateName …` beside the other machines' findings,
  exit 1; a syntax error in the file gives `flow: could not load pay.machine.ts`, exit 2.
- Trace B (all exit 2): the duplicate name prints one stderr line and hides every other machine's findings.

**Ask 5. Source locations come from the CLI's source adapter, not from `Compiled`.**
- Trace A (recommended): `Compiled` stays position-free and deterministic; `flow check` prints
  `pay.machine.ts:42` when the adapter resolves the path and the definition path alone when it cannot.
- Trace B (captured at `machine()`): positions come from a stack at construction; two compiles of one source differ
  by bundler, `dataView` equality breaks, and the core's entry reads a host API.

Implementation calls made here (the orchestrator's to confirm): a throwing check is `RuleBroken` with
`threw: true`; seen counts are kept by the judge and cross-checked against the trace's turn records in one test;
`Breach` is named `Broken` at the seam; T106 splits in four and T22 in three.

**Sidecar log** (three Haiku sidecars, read-only; one adversary pass at the end)

| Sidecar | Finding | Result | Why |
| --- | --- | --- | --- |
| Code map | `Compiled` has no rule, terminal or location field (`compiled.ts` 409-424) | accepted | read the type myself |
| Code map | CLI is `story list`, `story run`, `trace` on `effect/cli`; exit 0 and 2; `Cause.pretty` at 135 | accepted | read `main.ts` whole |
| Code map | no static analysis in `src/`; `dataView` read only by tests | accepted | `data-view.ts` read; greps not re-run |
| Code map | `verify` has no v3 build; package has no `bin` or `exports` | accepted, not re-run | consistent with `cli.test.ts` 208-209 as reported by two sidecars |
| Plans | terminal error named two ways (Plan O2 against proposal line 90) | accepted | Plan text read; became ask 1 |
| Plans | `Machine` second parameter against the typed-machine design | accepted | both texts read; became 3.5 and ask 2 |
| Plans | `story run` and broken rules have no exit code | accepted | Plan O2, O3 read; became ask 3 |
| Plans | load failure is exit 1 or 2 in different records | accepted | became ask 4 |
| Plans | `Flow.keyed` still in Machine.plan | rejected for this document | a neighbour's record; the user's drop stands |
| Plans | `RuleBroken` is "evidence" in the Plan and "a verdict kind" in T106 | changed | both: the judge writes evidence, the verdict is derived from it (3.4) |
| Reviews | parity test is its own oracle (`cli.test.ts` 109) | accepted | read through the code map; hand goldens in section 6 |
| Reviews | one key, one copy, default starts, no sequences were the repeated misses | accepted | section 6 names each dimension |
| Reviews | faults runner exempts all `tests/cli` | accepted, not re-read | guard in section 6 |
| Reviews | T23 conflicts with the "no bin" test | accepted | section 1 item 6, handoff row T23 |
| Reviews | 17 rules with no fault in the coverage record | rejected for this document | Flow's run rules belong to test tooling |
| Adversary | accepted turns carry `Part.at`; implicit `armOn`/`disarmOn` turns are named `trigger:<node>:<tag>` | accepted | read `turn.ts` 517-523; 3.1 gained implicit edges |
| Adversary | an unguarded alternative can decline (`LateMayNotLeave`), so shadow pruning is unsound | accepted | read `turn.ts` 143, 254; pruning removed from `firesIn` |
| Adversary | any written handler, even a declining one, suppresses the implicit edge (`turn.ts` 554) | accepted | read the line; the model copies the rule. Whether the code's rule is intended is the turn's owner's question |
| Adversary | a denied or unhandled public turn publishes nothing; a settled ending publishes | accepted | read `serve.ts` 233-234, 353; `Other` row reworded |
| Adversary | create and restore both publish through `start()` | accepted | read `incarnations.ts` 194-201; `Begin` covers both |
| Adversary | `late` is a serve-time fact, not in `Compiled` | accepted | `mayBeLate` bound replaces the boolean; `serve.ts` 390-400 not re-read |
| Adversary | a guard that throws refuses the turn and blocks ancestors | accepted, no change | a defect, not an edge; over-approximation still holds |
