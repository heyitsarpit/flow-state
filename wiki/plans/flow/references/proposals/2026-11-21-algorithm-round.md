---
proposal algorithm-round
status proposed 2026-11-21
---
# Algorithm design round: principles, reading list and clusters (2026-11-21)

**Goal:** one lead per cluster designs the core algorithms that the twelve concept designs need, at Spec depth, so
to-spec can turn them into Requirements and Invariants after one review.

**Why now:** @review.algorithm-review found no design Spec-ready (19 problems, holes S-1 to S-8, X-1 to X-6), and
schedules had all the attention so far. Every cluster gets the same depth this time.

## Framing

- **Three tiers** [decided: user 2026-11-21]: fixed constraints, principles to weigh, and a fixed deliverable shape
  that includes a principle ledger.
- **Performance** [decided: user 2026-11-21]: state the cost per turn and the hot-path allocations; no hard target,
  the bench decides.
- **Home** [decided: user 2026-11-21]: this file now; promoted to a convention once this round shows it helps.
- **Breaking a principle** [decided: user 2026-11-21]: allowed, with a written trade-off in the ledger.

## 1. Fixed

- Correctness first, then readability at a glance, then agent UX.
- The core is pure, synchronous and deterministic; work is returned as data; ids come from the mint (`AGENTS.md`).
- The current code is the source of truth, and most of it is stable.
- **User decisions are fallible** [decided: user 2026-11-21]: the decisions in @proposal.spec-handover and the 15
  answers in @review.spec-cohesion-r2 section 6a are the best calls so far, not fixed ground. When one, public API
  included, blocks a correct core algorithm, design past it: show the trace that ends wrong, propose the
  replacement, and list it in the questions for the user. Never change it silently.
- Nothing breaks the single graph, static analysis, Stories or CLI inspection.

## 2. Principles to weigh

- **Classes, not instances** [decided: user 2026-11-21]: treat each problem as a member of a family. First try to
  remove the family by construction, so no instance can occur. Where that fails, reduce every instance to one point
  of handling (one owner, one table, one pass) that settles them all at once. Never fix instances one by one: that
  is how T57 and T20 reached the failure limit.
- **Full type inference** [decided: user 2026-11-21]: every type user code sees is inferred from the definition and
  body through generics designed in from the start; no module is designed untyped with types threaded in later.
- **Cheap operations over the graph** [decided: user 2026-11-21]: the code has quadratic and cubic nested loops.
  Each design gives the time complexity of its operations in the graph's sizes (states, events, schedules, keys,
  instances, actors), answers repeated questions from indexes built once at compile time, and does per-turn work in
  proportion to what changed, not to the whole graph. A nested scan over graph collections on a hot path needs a
  stated reason.

skill:to-design step 3 already asks for a state inventory, one owner per state, a complete transition table, and
the removal of implicit state machines. These add the project's weights; each names the failure it prevents.

| Principle                                                                                     | Failure it prevents                                    |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| One owner per state, one writer per field                                                     | T57: issues written by several passes, four reviews    |
| Store facts, derive views                                                                     | Stored issues outliving their condition                |
| Explicit states: a lifecycle in flags or `Option`s becomes a tagged union with a table        | `arming` had no `Refused`; a refusal lived as an issue |
| One decision per subject per occasion, applied once; any order dependence is in a table       | Same-turn schedule combinations ending wrong           |
| Total tables: every occasion × state cell filled, impossible cells named and refused          | Holes S-2 and S-3 are empty cells                      |
| Survives a reload: each fact a later decision reads is saved with a codec, or re-derived      | The unsaved `restartOn` baseline (S-1)                 |
| Same rule at every scope: root, keyed, fragment, instance                                     | X-2: schedules per scope have no owner                 |
| One equality and one codec per fact                                                           | X-5: `Equal.equals` against `sameValue`                |
| A throw in user code changes only its own check                                               | T57 review 4 B2                                        |
| General: checked against several very different apps, not one fixture                         | Features that fit one example                          |
| Simple: fewest states and concepts; cut a feature before adding a special case                | Case-by-case rules from review-by-review fixes         |
| Effect at the edges; nothing built parallel to Effect in the host                             | Hand-rolled schedulers, retries, queues                |
| Types derive from their source: illegal states unrepresentable, public types derived from     | `restartOn` returns `unknown` (no codec, S-1); `key`   |
| the declaration they depend on, never hand-copied or partial; core casts removed or justified | typed `ScheduleKey` in an unkeyed mapper; T104, T113   |

## 3. Deliverable, per cluster

One design file in this folder, `YYYY-MM-DD-algo-<cluster>.md`, using skill:to-design's section shapes (`model`,
`operations`, `algorithm`, `rules`, `composition`). It runs to-design steps 1 to 4 and 6; step 5 (recording in the
Spec) waits for review. About 700 lines at most; say each fact once. It holds:

- **required properties first**, in user terms (what must never be lost, invented or shown wrongly), before any
  table; invariants are then checked against these, not only against the design's own rows;
- a state inventory: each state, its owner, writers, readers, and whether it is saved; plus **every input of every
  user callback** (the clock included: `now` reaches schedule callbacks at `core/schedules.ts:90`);
- for each occasion that does not compare (restore, wake, thaw), one rule: which changes it skips and which later
  occasion compares them;
- a transition table wherever two or more rules write one state;
- pseudo-code at Spec depth;
- invariants, and a sequence or exhaustive check with its alphabet and size, its oracle derived from the rules;
- the Story of the wrong ending and the planted faults;
- the cost: each operation's time complexity in the graph's sizes, the compile-time indexes it relies on, the
  per-turn work against what changed, and hot-path allocations; nested loops in today's code for this area are
  listed with their complexity and replacement;
- fit to today's code: **one** table (keep, change, delete), each kept function checked against the new types and
  every caller listed, citing @review.code-audit sections 2 and 4;
- **types**: the concrete type of each state in the inventory (tagged unions for lifecycles, branded ids); each
  public type the cluster touches with the declaration it derives from; the casts and `unknown`s in the area, each
  removed or justified. Cluster 5 owns the type-level derivation machinery (body capture, `derive.ts`, types through
  `Compiled`); other clusters state what must derive from what, and cluster 5 proves it compiles;
- the problem classes: each family of problems in the cluster, its known members, and whether the design removes
  the family by construction or handles it at one point (which one); members still handled one by one are named
  as debt. A family counts as removed only when a type or signature cannot express a member; resting on a lint
  rule, a hand-written shape or a convention is "handled at one point";
- the principle ledger: each principle held, or traded off and why;
- the seams it hands to later clusters;
- questions for the user, each with options and a recommendation; **every departure from a concept proposal or an
  accepted decision is a question**, never a silent change;
- **process notes**: what in our development process (Tasks, tests, fixtures, reviews, convergence) went wrong for
  this cluster's area, read from the case studies and the area's history, and how the lead would build this
  cluster: order of work, the first failing checks, where a review pays off. Short; advice, not a plan.

## 4. Reading list, by authority

1. **Base:** `packages/flow-state-v3/src/` in the cluster's area, read in full; its `tests/` and `fixtures/`,
   the sequence ledgers first; @review.code-audit sections 2 and 4.
2. **Fixed:** @proposal.spec-handover's decided list; @review.spec-cohesion-r2 section 6a; `AGENTS.md`;
   `tools/lint-bomb/STYLE.md` and `FLOW-STATE.md`.
3. **Destination:** the cluster's designs; its Tasks in `wiki/tasks/V3/`; the Plans, read as guidance, not as
   correctness.
4. **Holes:** @review.algorithm-review (the worklist); @review.spec-cohesion-r2; @review.complexity-sweep (read whole; the lead decides what is relevant); @review.case-studies (T57 to
   T118, T20 to T92: how a class stayed open while each fix closed one instance); for schedules, @task.V3.T57 and
   @task.V3.T118 in full and `git show 3a84b878`.
5. **Types:** @task.V3.T104 (type gaps closed at module seams) and @task.V3.T113 (derived types, `derive.ts`);
   @review.type-coverage and @review.type-gaps-deep (2026-11-19, read despite 4a's date rule);
   @proposal.body-capture-settled. They say what is typed today and what is still open.
6. **Method:** skill:to-design at the Epic's pin, its realization guides and the policies it applies; this file.

## 4a. Do not read

| Path                                                            | Why                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `wiki/specs/` (core and testing, `spec-split.md`)               | Superseded by running code; they predate it                                                |
| Proposals and reviews in this folder dated before 2026-11-20    | Earlier rounds; read one only when a design cites it, or the two type records in section 4 |
| `advisor-consult-2026-11-20/`, `body-capture-spike-2026-11-20/` | Prior art; follow only a cohesion-ledger row or BCS cite                                   |
| `reference/`                                                    | Historical, archived plans and Tasks                                                       |
| `packages/flow-state/`, `packages/flow-state-rewrite/`          | Frozen earlier builds                                                                      |
| `packages/flow-state-v3/prototypes/`                            | Never production; only results a review cites                                              |
| `apps/docs/`                                                    | Generated from the code                                                                    |
| `codebases/`                                                    | Look up an Effect API only; `node_modules` is the truth                                    |
| `.log` files beyond the entries a record cites                  | History, not rules                                                                         |

## 5. Clusters, one lead at a time

- **Serial leads** [decided: user 2026-11-21]: one lead per cluster, run one after another for usage limits.

| Order | Cluster                                            | Algorithm-review problems |
| ----- | -------------------------------------------------- | ------------------------- |
| 1     | Schedules and occasions                            | 1 to 6                    |
| 2     | Turn walk, boundary channels, fragments            | 7 to 9                    |
| 3     | Records, data layer, saved format                  | 12, 13                    |
| 4     | Reads and operations, errors and trust             | 10, 11, 14                |
| 5     | UI host, test tooling, static rules, typed machine | 15 to 19                  |

Each lead reads the files the earlier clusters wrote and names every seam it crosses.

## 6. Code deletion

- **Nothing deleted now** [deferred: user 2026-11-21]: @review.code-audit's lists stay a prepared inventory; each
  cluster cites what its design would supersede.
  Reopen if: a cluster's design is accepted and names code it supersedes.

## 7. Runbook (orchestrator)

1. Case studies: one Opus owner with 4 Haiku sidecars writes `2026-11-21-case-studies.md` (T57 to T118, T20 to
   T92, with branch `t92-format-4`).
2. Clusters 1 to 5, one lead at a time: Fable at effort high, up to 8 Haiku sidecars at once (effort medium for
   research, high for reviewing a draft). Read the 5-hour window before each lead: above 80% only the running lead
   continues, above 90% it checkpoints and stops.
3. After cluster 1: one Opus review of its design, to calibrate the brief before the next four, and one revision
   by the same lead. This is the only per-cluster review.
4. **One run per cluster** [decided: user 2026-11-21]: clusters 2 to 5 get one lead run each, with no separate
   review and no revision round; the lead's own adversary and executable-model sidecars are its check. Review
   limits do not allow repeated reviews.
5. After cluster 5: one Opus review across all five designs; whether a revision pass follows is the user's call.
6. Then the user's round on the leads' questions, recorded as tags.
7. **Development-strategy review** [proposed]: after all designs, one model (Opus or Fable, the user's call) reads
   every lead's process notes and the reviews of this round, and proposes how we build: Task shape, tests,
   fixtures, review cadence, convergence. The user judges the current process mostly right; the core problem has
   been algorithm design, so this review says what to keep as well as what to change.
8. Then to-spec per cluster, and the Task changes.

The orchestrator verifies every report against the file it names before the next step.

## 8. Lead brief (template)

Each lead gets this brief, with `<…>` filled from section 5 and @review.algorithm-review.

> **Design the core algorithms for `<cluster>` at Spec depth, so to-spec can write their Requirements and
> Invariants after one review.**
>
> **Why now:** `<the cluster's holes from @review.algorithm-review, one line each, and what later clusters need
> from it>`.
>
> **Read first:** @proposal.algorithm-round: its principles (section 2), deliverable (3), reading list by
> authority (4) and **do-not-read list (4a)**. Then, in that order: the code `<files>`; the tests `<files>`; the
> user's decisions; the designs `<list>` and Tasks `<list>`; the holes (@review.algorithm-review section `<n>`,
> @review.case-studies, `<history>`); the design files of earlier clusters `<list>`; skill:to-design at the Epic's
> pin. Code wins any disagreement; Plans are guidance.
>
> **Problems:** `<the numbered problems and open red classes>`. Group them into families first; remove each family
> by construction, or reduce it to one point of handling that settles every member in one pass. No one-by-one
> fixes.
>
> **Risk:** `<what the cluster must not reopen>`. The user's decisions, public API included, are the best calls so
> far and fallible: where one blocks a correct core algorithm, show the trace that ends wrong, propose the
> replacement and put it in the questions; never change one silently.
>
> **Deliverable:** `YYYY-MM-DD-algo-<cluster>.md`, made with `wk`, to-design steps 1 to 4 and 6, no Specs, with
> everything section 3 lists, process notes included.
>
> **Sidecars:** up to 8 Haiku at once as general-purpose agents (not Explore), read-only, no gates, benchmarks or
> tracked-file edits; findings with `file:line`, not verdicts. Give each sidecar your scratchpad path and forbid
> writing anywhere else (`/tmp` and `/private/tmp` included): two sidecars left stray files in earlier runs.
> Suggested angles: writers per state in the code; the area's history; a blind derivation of sample check rows
> from the rules alone; scopes; restore and codecs; prior art (Effect, XState, others); hot-path cost, including a
> sweep for nested loops over graph collections. Once the tables exist: an adversary attacking your **invariants
> using only your own rows**, and one Sonnet sidecar building a small executable model of the tables in the
> scratchpad to run the invariants mechanically. Read every line, re-check each finding, and log each as
> accepted, changed or rejected with why; a log that accepts everything is a warning sign.
>
> **Rules:** only that one file is written; no commits; bounded shell commands, kill what you start; weigh each
> choice against the graph, Stories, static analysis and the CLI. Report back in under 15 lines: the file, the
> shape chosen and why, the open questions, the seams handed on.
