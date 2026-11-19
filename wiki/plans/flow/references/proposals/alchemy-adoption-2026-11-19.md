# Alchemy adoption (proposed, 2026-11-19)

**Bottom line (proposed, nothing here is decided):** admit three ideas and one research item. (1) Rules on the
definition: `invariants`, `transitions` and `eventually` on a machine's `definition`, and `relations` on an `app`,
checked by the Story runner, the generator and both sweeps with no extra call. (2) Each rule reports whether any run
ever reached it, so a rule that saw nothing shows as unseen instead of passing. That report is computed, never kept.
(3) A bounded, exhaustive generator profile: every sequence of up to `depth` sample steps, shortest first, deduplicated
by published snapshot. (Research) Prove small finite pure parts of the core, such as the lane cell table, by
enumerating them in an ordinary test; no solver. Reject: moving Flow's own run rules onto definitions, an SMT prover,
a readable-subset rule on the core, a "story cannot run this" note, and a second counterexample printer.

**Why Alchemy lands proofs and the conformance suite did not:** Alchemy never writes a second model. The rule is a
predicate in TypeScript on the user's own declaration. The explorer and prover read the production `decide` and
`evolve` source mechanically. Every sequence found is replayed on the real code, and any disagreement fails the check
(`packages/domain/src/Verify.ts:45-50`, `:148-152`). Flow's suite hand-wrote the model it checked against: a Spec
model, predictors and round-14 as a second runtime. That restated the core in 9.4k lines, so every change was made
twice, and its owed lists were keyed by computed ids that went stale. Flow's run rules today already have Alchemy's
shape: a predicate over the real run (`packages/flow-state-v3/tests/rules/rules.ts:35-38`). What is missing is the
rest: rules on the user's own declarations, a computed report of what each rule saw, and short exhaustive search.

Paths: Alchemy is under `codebases/alchemy/`, with `A:` for `codebases/alchemy/packages/domain/src/`. Flow is under
`packages/flow-state-v3/`, with `F:`.

## Concept map

| Concept | Alchemy | Flow today | Verdict |
|---|---|---|---|
| State invariant on the declaration | `invariants` (A:Aggregate.ts:157) | none; written ad hoc in tests | admit (1) |
| Per-step rule over before/after | `transitions` (A:Aggregate.ts:121-130, :167) | ad hoc in tests | admit (1) |
| Eventually, at rest | model `eventually` (A:Model.ts:167-171) | only "nothing pending" at the horizon | admit (1) |
| Relation across instances | `Domain.Relation` (A:Relation.ts:20-31) | ad hoc, across fixtures in a mix | admit (1) |
| Runtime's own guarantees | none (platform commit is assumed, A:Prove.ts:160-161) | 21 run rules | keep Flow's |
| Standing per rule | proved, checked, broken, unseen (A:Verify.ts:118-123) | pass/fail; hand-kept record | admit (2) |
| Required to be proved | `require.proved` (A:Verify.ts:80-101) | none | fold into (2) |
| Bounded exhaustive search | BFS to `depth` 2-3 (A:Explore/internal/Search.ts:535) | none | admit (3) |
| Delivery faults | redeliver, reorder, rerun (A:Explore.ts:90-104) | reorder, drop, lose, reload, storage | Flow more |
| Seeded walks | `walks` with seed (A:Explore.ts:113) | seeded generator, shrink (F:generate.ts:1002) | Flow has it |
| Counterexample as Story | `story(...)` (A:Verify.ts:718-723) | shrunk `Story.app(...)` (F:generate.ts) | Flow has it |
| Prover over a readable subset | oxc + z3 (A:Prove/internal/Interpreter.ts:219) | none | research only |

## 1. Rules on the definition

**Can Flow's own guarantees be written in this form?** No, and they shouldn't be. Every ending exactly once (WriteLanes
I15, I16), every commit ends once (I27) and one publication per turn (Turn I9) are about the runtime's evidence. They
do not describe any user's memory, so there is no user declaration for them to sit on. They already have Alchemy's
form: a predicate in the same language over the real run, with no second model (F:tests/rules/rules.ts:35-38, the list
at :535, applied at :562-568). Alchemy has no counterpart. Its prover assumes how the platform commits
(A:Prove.ts:160-161). So the run rules stay. What this idea replaces is the user-side rules that tests now hand-write
over published memory.

**Flow today:** NUMBER-12 hand-writes a state invariant ("value within bounds") and a transition ("each commit is
seq + 1 and differs from its start") as filters over `publishedOf`
(F:tests/number-input/number-input.stress.test.ts:8-37). Only that one Story checks them. The generator and sweeps
never do.

**Alchemy:** the rule sits on the aggregate, next to `decide` and `evolve`
(`examples/cloudflare-domain/packages/domain/src/Account/Account.aggregate.ts:85-104`):

```ts
invariants: { NeverOverdrawn: (account) => account._tag !== "Open" || account.balance >= 0 },
transitions: { AClosedAccountStaysClosed: ({ before, after }) => before._tag !== "Closed" || after._tag === "Closed" },
```

Model rules see every instance at rest (A:Model.ts:149-171). Nothing runs a rule at runtime: it is a claim, not a
guard (`website/src/content/docs/domain/verifying-models.mdx:26`).

**Before** (F:fixtures/number-input/machines/stepper.ts:19, the test above):

```ts
export const Stepper = definition({                 // existing: definition
  id: "Number/Stepper",
  states: ["IDLE", "HOLD_DELAY", "HOLD_REPEAT", "HOLD_STOPPED", "WHEELING"],
  events: { /* existing events, unchanged */ },
  memory: { /* existing memory, unchanged */ },
});

// tests/number-input/number-input.stress.test.ts
const fields = publishedOf(run, quantity).map((p) => p.memory);       // existing: publishedOf
const outOfBounds = fields.filter((m) => m.value !== null &&
  (m.value < (m.settings.min ?? m.value) || m.value > (m.settings.max ?? m.value)));
expect(outOfBounds).toEqual([]);
```

**After (proposed):**

```ts
export const Stepper = definition({                 // existing: definition
  id: "Number/Stepper",
  states: ["IDLE", "HOLD_DELAY", "HOLD_REPEAT", "HOLD_STOPPED", "WHEELING"],
  events: { /* existing events, unchanged */ },
  memory: { /* existing memory, unchanged */ },
  invariants: {                                     // NEW: invariants
    WithinBounds: ({ memory }) =>                   // user-defined: WithinBounds
      memory.value === null ||
      ((memory.settings.min ?? memory.value) <= memory.value &&
        memory.value <= (memory.settings.max ?? memory.value)),
  },
  transitions: {                                    // NEW: transitions
    OneCommitPerInteraction: ({ before, after }) => // user-defined: OneCommitPerInteraction
      after.memory.lastCommit.seq === before.memory.lastCommit.seq ||  // NEW: before, after (a published turn)
      after.memory.lastCommit.seq === before.memory.lastCommit.seq + 1,
  },
});

// illustrative only: the memory fields below are not shop's real ones
export const shopApp = app({                        // existing: app
  id: "shop",
  machines: { /* existing */ },
  relations: {                                      // NEW: relations
    BadgeMatchesCart: ({ actors }) =>               // user-defined: BadgeMatchesCart; NEW: actors (published, at rest)
      actors.cartBadge.every((b) => b.memory.count === actors.shopper[0]?.memory.items.length),
  },
  eventually: {                                     // NEW: eventually
    NoCheckoutHangs: ({ actors }) =>                // user-defined: NoCheckoutHangs
      actors.shopper.every((s) => s.state !== "PAYING"),
  },
});

// the test keeps only its Story; every rule above is judged by played(), generate and both sweeps
const run = await played(stress);                   // existing: played
```

Semantics, proposed:
- `invariants` hold at every published snapshot (Turn I9 makes that one per accepted turn).
- `transitions` hold for each accepted turn's before and after. A refused turn changes nothing (Turn I14), so it has
  no step.
- `relations` and `eventually` are judged only at quiet points. These are the points where the generator already
  quiets its world (F:src/host/testing/generate.ts:939-955) and the end of every Story.
- Each rule becomes a `Property` (F:src/host/testing/samples.ts:15-18) named `<machine id>.<rule>`, and is appended to
  `rules`.
- Rules are plain synchronous predicates over plain data. The core never calls them, so no turn gets slower. They are
  compiled into `Compiled` so that `explain` lists them. That keeps the CLI to its five verbs.
- Context and lanes: a relation reads published snapshots only. A rule over a lane's ending reads it the way the user
  sees it, in memory written by the ending's handler. No lane internals leak (the user's "don't leak wiring").

**Cost:** about 150 to 250 lines.
- The definition fields and their types: `before`/`after` typed from `Memory` and `states`, checked in `tests/types/`.
- Compile them into `Compiled`.
- One adapter from declared rules to `Property`.
- An `explain` line for each rule.
- A fixture rule plus a planted fault for each rule kind, per `wiki/conventions/fixtures.md`.

**Replaces:** hand-written memory checks in Story tests, such as NUMBER-12's filters and the same pattern in other
fixture tests (not counted; see Uncovered). It also widens their reach: the generator and the sweeps judge them too,
and today they do not.

**Kind:** new concept, the user's call. It adds four public fields across `definition` and `app`.

## 2. A computed standing for every rule, instead of a hand-kept coverage record

**Flow today:**
- A rule returns breaches only (F:tests/rules/rules.ts:35-38). A rule whose precondition no run met, such as I15 on a
  fixture with no lane, passes silently.
- The pair sweep already reports `Unreached` cells (F:src/host/testing/sweep.ts:51-62). The rules do not.
- What the suite covers lives in hand-kept records: `wiki/tasks/V3/P3-coverage.md` (424 lines, "Matched at" a
  commit), the 1,597-line `wiki/conventions/fixture-catalog.md`, and fixture paths that `fixtures.md` names by
  string, "updated by hand".

**Alchemy:**
- Each rule's standing is one of `proved | checked | broken | unseen` (A:Verify.ts:118-123).
- `unseen` means "no sequence reached it".
- `require.proved` fails a rule that slid to checked (A:Verify.ts:80-101).
- A pass means the whole check was done. Unread code, a skipped part or a hit budget fails it
  (A:Explore.ts:52, A:Verify.ts:404-415).
- The report is printed, never stored (A:Verify.ts:~632-784).

**Before:**

```ts
export type Rule = {                                 // existing: Rule
  readonly rule: string;
  readonly breaches: (run: StoryRun) => ReadonlyArray<string>;
};
```

**After (proposed):**

```ts
export type Rule = {                                 // existing: Rule
  readonly rule: string;
  readonly judge: (run: StoryRun) => Verdict;        // renamed: breaches -> judge
};
type Verdict =                                       // NEW: Verdict
  | { readonly _tag: "Kept"; readonly seen: number } // NEW: seen, how many times the rule's subject occurred
  | { readonly _tag: "Broken"; readonly breaches: ReadonlyArray<string> }; // existing: breaches
// A run's report, printed by the suite's reporter and never stored:
//   WriteLanes I15  checked  stories 41, reload variants 1,212, pair cells 49/56, seeds 200
//   WriteAhead I21  unseen   no run crashed with an unsaved release
//   Number/Stepper.WithinBounds  checked  stories 3, seeds 200
```

Tiers here, by their honest meaning:
- **Checked:** every variant of an exhaustive family. That covers the reload sweep at every step
  (F:tests/rules/sweep.ts), the pair sweep's reached cells, and idea 3's depth-bounded search.
- **Sampled:** by seed.
- **Unseen:** `seen` is 0 everywhere.
- **Proved:** only for finite pure tables enumerated in full (the research item). Flow claims no proof otherwise.

An `unseen` rule fails the suite unless an `allow.unseen` entry names it with its reason. This is Alchemy's "never
widen `allow` to get a pass" (`packages/domain/skills/alchemy-domain/references/testing.md:231`).

**Cost:**
- About 100 lines.
- Each of the 21 rules returns a count of the subject it judged, which most already compute (`deliveries(...)`,
  `turnRecords(...)`).
- One reporter.

**Replaces:**
- The rule-coverage claims of `P3-coverage.md` and any later phase's record: which rules the suite judges, over how
  many runs, and matched at which commit.
- The planted faults stay. They answer a different question: does a rule bite? A fault's `rule` field could print in
  the same report.

**Kind:** small change. It is test-side only, with no public API. The `allow.unseen` list is the user's call: it is a
new record, though a short one.

**Risk:** this is not an owed list. Nothing in it is keyed by attempt ids or `file:line`. It names only rule ids,
which are stable.

## 3. A bounded exhaustive profile

**Flow today:**
- The generator draws random runs from a seed and shrinks them (F:src/host/testing/generate.ts:845-858, :1002).
- The reload sweep tries every reload position in hand-written Stories.
- The pair sweep crosses 8 phases with 7 faults (F:src/host/testing/sweep.ts:20-44).
- Nothing tries *every* short sequence of a fixture's steps from boot. So the shortest failure is found only by
  luck, then shrunk.

**Alchemy:**
- A level-by-level BFS: every sequence of up to `depth` commands, shorter first, so "a story is then the shortest
  there is" (A:Explore/internal/Search.ts:535).
- Values are picked by z3, not enumerated.
- Faults are on by default (A:Explore.ts:90-104).
- `budget` caps the search, and hitting it fails (A:Explore.ts:49-52).
- There is no state dedup.

**What each explores that the other does not:**
- Alchemy, not Flow: exhaustive short command sequences; values chosen by a solver to break a rule; policy
  redelivery; reaction reorder across aggregates.
- Flow, not Alchemy: crash and reload at every step; lost and dropped answers; storage refusal; disposal and its
  bound; TestClock time; held writes; several fixtures sharing one Runtime. Alchemy has no drop or crash fault. It
  assumes atomic commit (A:Prove.ts:160-161) and runs no middleware (A:Verify.ts:222-228).

**Before:**

```ts
await propertyTest(fixtures, { profile: "usual", properties: rules, seeds: 200 }); // existing: propertyTest, profile
```

**After (proposed):**

```ts
await propertyTest(fixtures, {                       // existing: propertyTest
  profile: "exhaustive",                             // NEW: "exhaustive" profile
  depth: 4,                                          // NEW: depth, sequences of up to 4 sample steps
  properties: rules,                                 // existing: properties
});
// BFS over the fixture's sample steps and armed answers (existing: STEPS, ANSWERS). A state is skipped when its
// published snapshots and pending work equal one already seen. Snapshots are plain, structurally shared data
// (Turn I29/I30), so equality is cheap. The first breach is the shortest one, printed by the existing Story printer.
```

**Cost:**
- About 200 lines in `generate.ts`, reusing its step alphabet and printer.
- Run time grows as (steps × answers)^depth. It needs a budget that fails when hit, as Alchemy's does.
- Its own bench entry.

**Replaces:**
- Nothing is deleted.
- Shrinking stays for long random runs.
- The `exhaustive` family counts as "checked" in idea 2.

**Kind:** small change, test tooling only.

## 4. Shortest counterexample as a paste-able Story: rejected as a duplicate

Flow already prints a failing run as a chained `Story.app(...)` after shrinking (F:src/host/testing/generate.ts,
`Failure.story`; F:src/host/testing/samples.ts:169 `print`), and the pair sweep prints one for each cell
(F:src/host/testing/sweep.ts:59). Alchemy's version (A:Verify.ts:718-723) adds two things:
- A shortest-length guarantee. Idea 3 gives that with no new printer.
- A note when the story "needs an event delivered twice … a story does not". Flow's Stories express their faults as
  `WorldWord`s, so that note has nothing to say here.

## 5. Readable subset and proving pure core parts: research, not a commitment

**Alchemy:**
- Proves by induction with z3 over an interpreted TS subset.
- The subset is no `try`/`throw`/`class`/`async`, whole numbers only, a fixed library allowlist
  (`website/src/content/docs/domain/verifiable-code.mdx:17-95`), and lists up to 2 extra items
  (A:Prove/internal/Symbolic.ts:230).
- Anything outside the subset is "not read" and named by `file:line`, never guessed.

**For Flow, proposed as research only:**
- **Finite pure tables** such as the lane cell table (policy × phase × fault) can be *proved by exhaustion*: enumerate
  the whole domain in a plain test and check each cell against the rule. This needs no solver and no subset, so it is
  realistic. `tests/write-lanes/policy-cells.test.ts` already walks cells through Stories. The research question is
  whether the table is a pure function that can be called directly.
- **Guards and `updateMemory` over numbers** would need a solver and a subset rule on user code or the core. That
  conflicts with the core's code style (`Option`, `Result`, hot loops), adds a z3 dependency, and needs an interpreter
  that must track Effect's API, as PR 3503 shows for `effect/Match`. Not recommended now.

**Kind:** research. It is the user's call before any Task exists.

## Rejected

- **Flow's own run rules moved onto definitions.** They judge the runtime, not a user's machine. They already have the
  target form (§1).
- **An SMT prover, or a readable subset imposed on the core.** It is a second reader of the core that must track its
  code, the cost class that sank the conformance suite (§5).
- **Redeliver and rerun as new faults.** Flow's fake servers already draw `reordered`, `drop` and `lose`
  (F:src/host/testing/generate.ts:46, :103). Mailbox order is a run rule (Actors I19). Whether a *duplicate answer* is
  drawn was not checked (see Uncovered).
- **Seeded walks.** These duplicate Flow's seeded generator.
- **Alchemy's "Assumed" section as a new record.** Flow's fixtures.md already states scope. Only the computed report
  of idea 2 is admitted.

## Sidecar log

Six Sonnet sidecars, all read-only. I checked their claims against the code.

- Alchemy rule kinds: accepted. Re-read `Aggregate.ts:121,157,167` and `Verify.ts:118`.
- Verify, Explore and Prove internals: accepted. Re-read the standing at `Verify.ts:123`, faults and defaults at
  `Explore.ts:90-104,240-256`, shortest-first at `Search.ts:535`, the story text at `Verify.ts:718-723` and
  `MAX_ITEMS` at `Symbolic.ts:230`. Changed: "no state dedup" was not re-read and stands as the sidecar's word.
- Docs and skill: accepted. Cited only by path and line.
- Flow run rules and sweeps: accepted. Re-read `Rule` at `rules.ts:35-38`, `rules` at :535, `checked` at :567,
  `Property`, `PHASES`/`FAULTS`, `MAX_SHRINKS` and `Unreached`. Changed: "no user invariants" rests only on a grep of
  `definition.ts`, `index.ts` and `core`.
- Flow Specs and Plans: accepted, not re-read. The conformance-suite causes are from `test-system-2026-11-15.md`.
  The per-Spec invariant counts were not re-read.
- Adversary: the user-rule hook is accepted. "Fold `unread` into `check`" is changed to a test reporter, to keep the
  CLI small. Its rejection of tiers is changed: the report is computed and names only stable rule ids, so it is not
  an owed list. Its rejection of the prover, the subset rule and the second printer is accepted.

## Uncovered (budget reached)

- Not audited: which other fixture tests hand-write memory checks that idea 1 would replace. Only NUMBER-12 was read.
- Not drafted: the exact typing of `before`/`after` for `transitions` on hierarchical states.
- Not checked: whether a relation over context providers needs the context wave order (Actors I27).
- Not checked: whether the lane cell table is a callable pure function today.
- Not checked: whether Flow's generator draws a duplicate wire answer.
- Not measured: the cost of the exhaustive profile on the bench.
- Read only through sidecar summaries: PR 3260's full body.
- Not read: Alchemy's `ModelSearch.ts` in depth.
