# Advisor answers (2026-11-11, Fable 5.2)

**Bottom line: the suite judges a runtime partly by what the runtime says about itself, the Specs have no
executable model, and agents report results that a command could produce. Fix those three and most of Q1 to Q10
follows.** The five changes that buy the most, in order:

1. Compute what a runtime owes from the suite's own facts only. Reports are compared, never read as inputs.
   Enforce it with types and one new gate (the "liar" gate), not with another review.
2. For the 111 Invariants still owed, write one small executable model of the Spec and generate cases from it
   (search, seeded sequences, a crash at every step). Hand-written cases become the model's tests.
3. Replace agents' claims and clock-driven reviews with machine gates: a catch matrix that is diffed, generic
   mutants of `src/core`, and round-14 limits that a run verifies.
4. Drive production through its public API and test the host on its own. The suite is blind to both today.
5. Do not bring TLA+ back yet. The same model, searched in the harness, catches the same 10 to 12 of the 26
   conflicts. Price TLA+ with a one-day backtest only if that search misses three or more of them.

Everything here is proposed. I changed no code and no record. I read the files each question names, the reviews of
2026-11-10 and 2026-11-11, `conformance/` and `src/` as they stand in the working tree (a builder is editing `src/`,
so line numbers drift). I ran no gate: every count below is quoted from a record or a review, and every size or
cost is an estimate, marked as one.

## Q0. What are we missing?

**Bottom line: three assumptions are wrong, and each has a standard fix from another field.** Ranked by what each
buys:

| #   | Change                                           | Buys                               | Cost (estimate)      |
| --- | ------------------------------------------------ | ---------------------------------- | -------------------- |
| 1   | Obligations from suite facts only; the liar gate | Closes the class six reviews found | 1 to 2 builder days  |
| 2   | One executable Spec model; generated cases       | Most of the 111 owed Invariants    | 2 to 3 days at first |
| 3   | Machine gates, not claims and timed reviews      | Review usage, about a third today  | 1 day                |
| 4   | Public API in the adapter; host tests            | Bugs the suite cannot see now      | 0.5 to 1 day         |
| 5   | The Spec's tables in the Spec, and searched      | Conflicts found at edit time       | With 2               |
| 6   | Evidence derived from commands and state         | Reports true by construction       | 0.5 day in T17, T18  |
| 7   | More than one machine: fixtures from a suite IR  | Generality; no hand-written rows   | 1 to 2 days, later   |
| 8   | A different model family for Spec-only reading   | The shared misreading              | Small, per area      |

### Wrong assumption 1: the runtime's reports are evidence

They are the thing under test. `Fact` in `conformance/dsl/oracle.ts` holds what the suite did, what its world saw
and `Reported { observation }` in one union, and `step` in `dsl/lifecycle-step.ts` folds all of it. So a report can
create, move or void an obligation, and each review found the next field that did (members, `Released`, `Nothing`,
the header, `Incarnated`, `Parked`).

The threat is not a lying runtime. It is an honest runtime with one wrong decision: it takes the wrong alternative,
truthfully reports it, and the report excuses the cancel it dropped. Protocol conformance testing has a name for the
fix (ioco, Tretmans): after any trace of inputs, the outputs seen must be among those the specification allows, and
silence counts as an output. Jepsen follows the same rule: the history comes from the clients, never from the
server's log. Detail and the before and after are under Q1.

### Wrong assumption 2: a second runtime proves the suite

Green on round-14 shows the suite agrees with round-14. The step 9 review found six cells and about ten trace cites
that follow round-14 rather than the Spec, and rows were moved three times on a false "round-14 cannot show this".
What a suite needs is a statement of the Spec that a machine can run. The Specs have none: `WriteLanes.spec`'s
model section says "the table of machine-design 2.7.13", a file that is deleted. The real tables (A, B, C) live in
`conformance/dsl/lifecycle-rules.ts`. Detail under Q3 and Q4.

### Wrong assumption 3: a review is the way to find a hole

Every High in the reviews I read was found by running a changed runtime, not by reading: step 9's H1 by a probe and
H2 by a sweep of old mutants; the revision review's H1 and H2 by probes p2, p4 and p5; the StaticCli High "planted
and run"; T40/S2's by "a Pay probe passes 67/67". The reviewer is doing test generation by hand, at Opus prices,
every 90 minutes. Mechanise the probes and keep the reviewer for reading the Spec. Detail under Q6 and Q7.

### Two more that are smaller but real

- **The suite does not judge the public surface.** `conformance/adapters/production.ts` sends, reads snapshots and
  rows, attaches uses and disposes the Runtime through `src/host/testing.ts` (the internal driver). Only `app`,
  `ready` and `disposeActor` go through the public API, and `ensure` ignores its input. The Effect audit then found
  that the public `dispose` leaks call fibers and that long timers fire at once. The 61 green Pay cases could not
  have seen either: one is in a path the adapter bypasses, the other in a host the fake world replaces.
- **One machine carries the suite.** 61 of 111 cases are Pay. AGENTS.md says "test it against many very different
  real-world cases, not one example". Each new fixture costs hand-written rows (`fixtures/reference.ts`), so there
  are few. A small suite-owned description of a machine (states, events, alternatives, members), from which both
  the public-API fixture and the rows are generated, removes that cost and the `claimed` rows with it. Compiler
  fuzzers work this way (Csmith). Do it after the model exists, for the Actors and Reads areas.

### Stop doing

- Stop requiring green on round-14 as an exit. Keep it as a host for mutants, with a verified limits list (Q3).
- Stop using Haiku to draft expected results for protocol cases. It is the weakest reader on the step that most
  needs judgment, and it is the same family. The model computes the expectation; a different family reads a sample.
- Stop counting Invariants as the measure of strength (Q9).
- Stop reviewing each step of a convergence. Steps 4, 5 and 6 each got a review and each found "the next field".
  One class-level test (the liar gate) is the acceptance; one review at the end reads the result.
- Stop spending code-quality sidecars on what lint can find. The revision review's sidecar d reported 83 long
  lines and 13 unused exports; both are lint rules.
- Stop amending the loop mid-area. The log holds 18 amendments in two days (101 notes). Each one costs a re-brief
  and makes the last hours' numbers incomparable. Batch them at an area's close-out unless one fixes a wrong result.

### Evidence that would show each is right

- 1: under the liar gate, the count of behavioural mutants that turn green falls to zero, and the next two reviews
  find no High of the class "a report decides an obligation".
- 2: on round-14 with the 149 suite mutants, generated runs alone kill at least as many as the hand cases, and
  the search finds at least one Spec conflict or runtime difference no case has.
- 3: usage per accepted High falls; no note reports a number that the generated gate file contradicts.
- 4: the adapter imports only `src/index.ts` plus a short, listed seam; the dispose leak fails a test before a fix.
- 7: a new fixture costs under 30 lines and no hand-written row.

## Q1. Judging a runtime without trusting its reports

**Bottom line: neither (a) nor (b) as stated. Keep the tables, but change the direction of information: the suite
predicts from its own facts, and reports are only ever compared with the prediction. Then prove the class closed
with one mechanical adversary instead of a list of triggers.**

Why (a), the trigger table, does not close it: it is a list, and a list is closed only as far as its author
imagined. Its own rows show the leak ("claimed rows a stated limit", "not judged" twice, "claim, gated"). Every new
Port field is a new door.

Why (b), a full interpreter, is too much: it closes the class by construction, since a report cannot be an input.
But it carries the most common-mode risk (the same family writes two interpreters from one Spec) and it is a
second runtime (Q2).

**Recommendation, in three parts.**

1. **Split the types so the leak cannot be written.** A function that creates or removes an obligation cannot see
   a report.

   Before (existing, `dsl/oracle.ts`, `dsl/lifecycle-step.ts`):

   ```ts
   // existing: one union holds what the suite saw and what the runtime said
   type Fact = Data.TaggedEnum<{ Drove: {...}; Answered: {...}; Reported: { observation: Observation }; ... }>;
   // existing: one fold reads both, so a report can create or void an obligation
   const step = (model: Model, known: Known, facts: ReadonlyArray<Fact>, requests: ReadonlyArray<Request>) => ...
   ```

   After (proposed):

   ```ts
   // NEW: SuiteFact. What the suite did and what its world saw; no Reported.
   type SuiteFact = Exclude<Fact, { readonly _tag: "Reported" }>;
   // NEW: Expected. What the step owes (must be reported or seen) and what it allows (may be).
   type Expected = {
     readonly model: Model;
     readonly owed: ReadonlyArray<Owed>;
     readonly allowed: ReadonlyArray<Allowed>;
   };
   // NEW: expect. Reads suite facts and the fixture's rows. Lint bans importing Observation into its module.
   const expect = (model: Model, rows: Rows, facts: ReadonlyArray<SuiteFact>): Expected => ...
   // NEW: compare. Reads reports. It can match an Owed, match an Allowed, or refuse. Nothing else.
   //      An Owed left unmatched at the step's end is a refusal: silence is judged.
   const compare = (expected: Expected, reports: ReadonlyArray<Observation>): ReadonlyArray<Refusal> => ...
   ```

   The lint rule (`no-restricted-imports` of `Observation` in the `expect` modules) is the machine check that the
   trigger table tried to be.

2. **Make every choice computable by the suite.** A report decides an obligation exactly where the suite cannot
   compute a choice itself: the `claimed` rows (Pay's `Leave` guard), a tie "broken by the reported members", the
   first `from` after a reload. The suite owns its fixtures, so close these at the source: every guard in a
   conformance fixture is a function of what the suite knows (the event's payload, the lane's state, a memory that
   is a plain fold of the driven events). The row carries that function. Where the Spec truly allows two outcomes,
   `expect` returns both in `allowed` and follows each (a set of model states, as on-the-fly ioco testers do).
   A fixture whose choice the suite cannot compute is a fixture bug, not a stated limit.

3. **Prove it with the liar gate.** One generic adversary replaces the hand-written lie per report field:

   ```ts
   // NEW: a runner mode. Run the case on the unchanged runtime and record its reports per step.
   //      Run it again on a behavioural mutant, discard the mutant's reports, and feed the recorded ones.
   //      The mutant acts wrongly and says exactly what a correct runtime says.
   falsify --liar          // gate: every behavioural mutant is still red
   ```

   A mutant that turns green under it was caught only because it confessed. That list is the complete inventory of
   trust in the suite, produced by a run. Each entry is fixed by a world fact (the fake server's log, the store, a
   snapshot or row read) or recorded as "report truth only". Report-only lies stay as they are: they test that the
   trace is truthful, which is a second, separate property.

**Common-mode risk.** The split does not add any: `expect` is today's tables with one input removed. What stays is
the risk that the tables and the runtime share a misreading of the Spec. No machine check finds that. It is bounded
by three things: the Invariants run as separate predicates over the model's own traces (Q4), a different-family
read of a sample (Q6), and tables small enough for the user to read.

**Cost:** 1 to 2 builder days: the type split touches `lifecycle-step.ts`, `lifecycle-owed.ts`, `turn/selection.ts`
and the Case; the liar mode is about 100 lines in `dsl/case.ts` and the runner (estimates).
**Catches:** every past High of the class, by construction, and the ones no review has reached (`Finished`,
`InvalidTurn`, a delivered ending's `Denied`, all "not judged" in the trigger table today).
**Evidence:** the liar gate's green count reaches zero; the perturbation test (528 lines) becomes deletable.

## Q2. Suite size and where the line is

**Bottom line: a judge of "this must happen" has to track the control state the runtime tracks, so it is an
abstract runtime and cannot avoid being one. The line is what it leaves out. The lifecycle is 2.6 times its
estimate because it also handles claims; remove that half and it shrinks.**

A model that judges stays on the right side of the line while all five hold:

- it consumes inputs and outputs and performs nothing (no host, no scheduling, no effects);
- it holds no data: payloads and memory are opaque, there is no codec;
- it may answer with a set of allowed outcomes where the Spec leaves a choice; a runtime must pick;
- every field traces to a Spec table cell, and a field no mutant can kill is deleted (the suite already applies
  this rule);
- it has no performance structure: everything is derived, quadratic is fine.

Where the 3,634 lines went (read from the files, not measured per line):

- claim handling: `Refuse` cells for reports in impossible phases, `claimed` rows, member resolution
  (`lifecycle-owed.ts`), the 340 perturbations (`lifecycle-perturbations.ts`, 528 lines), guards on reported values;
- hand-kept traces: about 2,250 lines in six `*.traces.ts` files;
- turn selection rebuilt beside it (`turn/selection.ts`, `anchor.ts`, `phases.ts`, about 930 lines) because
  obligations needed a judged header.

**Recommendation:**

- After Q1's split, `compare` is a generic diff of expected against reported. The acceptor half of Table A (the
  cells that only refuse a report) collapses into it; the Invariant named in the failure comes from the cell that
  produced the expectation.
- Generate the traces. A trace file is a hand-written run of the model; a search over the model visits every cell
  and says which are unreached (Q4, Q5). Keep a trace only where it documents a ruling.
- Derive rows from one fixture description (Q0), so `reference.ts` rows and the fixture source cannot drift.
- Leave to the boundary oracles what they already judge against the server's log (`attempt-identity`,
  `ending-channels`); the model need not repeat it.

**Do not rewrite the lifecycle now.** It is converged and 149 mutants ride on it. Apply the split to it, and build
the next area (Restore or WriteAhead) model-first. Then compare the two areas on lines per Invariant and Highs per
review. That comparison is the evidence; my estimate is 40 to 50 percent fewer lines, unproven.

## Q3. Is round-14 still the right reference?

**Bottom line: no, and the question is slightly off. Do not build a second implementation. Build a model that
predicts and does not perform, make hand-written expectations its tests, and let production be the second runtime.
Round-14 becomes a host for mutants with a limits list that a run verifies.**

What round-14 is still good for: 1,035 old runtime edits, 98 of which turn a case red, and a correct-enough runtime
that shows the suite gives no false red. What it costs: cells that follow it rather than the Spec, "follow round-14
until answered" (KeyRequired), and three wrong row moves.

**Recommendation.**

1. The reference for an expected result is the model (Q4), never a runtime. Given a case's script (what the suite
   drives and what the world answers), the model computes the expected reports and world requests with no runtime
   present.
2. Hand-written expectations test the model. The expectation drafter still writes "after this script the state is
   X, the lane is Held" from the Spec; the check is model against draft, and it needs no runtime. A disagreement is
   a Spec question found before any code.
3. A case is proven before production exists by model mutation: a case is useful if changing some table cell
   changes its expected trace. That replaces "mutant-proven on round-14" for anything round-14 cannot do.
4. Round-14's differences become data that a run checks:

   Before (existing, `conformance/not-yet.ts`): the case is not written; the reason is prose.

   ```ts
   { owner: "@task.V3.T18", why: "round-14 cannot show these (searched round-14's turn.ts, ...): no check() (I18), ...",
     invariants: invariantsOf("Turn", [16, 18, 28, 31, 32, 33, 34]) }
   ```

   After (proposed): the case is written from the Spec now; the limit is a row a run verifies.

   ```ts
   // NEW: limits.ts. A case listed here must fail on round-14, by this Invariant or as unsupported.
   //      If it passes, the limit is stale and the gate is red. A red case not listed is a real red.
   { runtime: "round-14", case: "TURN-07/check-refuses", invariant: "Turn I18", why: "no check()" }
   ```

   The claim "round-14 cannot show this" is then tested every run, and a wrong move cannot happen.
5. P3's exit (proposed wording): "green on the model's predictions and on production; null red; every round-14
   red is a listed limit".

**Cost:** the limits gate is about 50 lines plus moving STATUS's stated limits and the `not-yet` reasons into it.
The model is costed under Q4. **Catches:** the RC2 class (a cell follows round-14) and every false move.
**Risk:** with round-14 demoted, production and the model are written by one family in the same weeks. Q8's
additions (lock, first-contact log, held-out seeds) are what guard that.

## Q4. Checking the Specs' consistency, and which prover

**Bottom line: a model checker would have caught 10 to 12 of the 26, all in one cluster (lanes, delivery,
disposal, restore, capture). The other 14 are wording across documents, and no prover finds those. Do not bring
TLA+ back yet: write the model once in TypeScript, where it is also Q1's judge and Q5's generator, and search it
with the engine the old suite already had. Run a one-day TLA+ backtest only if that search misses three or more.**

### Why not each tool

- **A solver over Invariant pairs:** no. The conflicts are not pairwise contradictions. Each is an Invariant
  against a Requirement through a trace (C9, C10, C11, C15 and C16 are all "the Invariant says iff, only or never;
  a Requirement has an exception"). Finding them needs the transition relation, which is a model.
- **Lean or Dafny:** no. Proof upkeep on Specs that are "guides, revised whenever building shows them wrong"
  (I15 was reworded, reverted and widened in three commits on 2026-11-11 alone).
- **P:** no. Its monitors are what the lifecycle already is; it adds a .NET toolchain.
- **Alloy 6:** only for structural questions such as C21 (the Boundary of "self"). A 20-line property test over
  the Turn model does the same.
- **Quint:** the best outside option if you want TypeScript-like syntax. `quint run --mbt` writes traces as JSON
  that a driver can replay through the Port. Exhaustive checking needs Apalache and a JVM. I could not confirm
  from the docs whether `quint verify` can use TLC.
- **TLA+ with TLC:** the best outside option for the protocol itself: shortest counterexamples, liveness with
  fairness, and agents write it well. It needs a JVM (none is installed here) and it is a third statement of the
  lane protocol beside the Spec and the suite's tables, to be kept in step by agents.

The deciding point is AGENTS.md's own rule: each fact lives in one place. A TLA+ model beside the suite's tables
will drift, and industry reports say so: MongoDB's team found checking implementation traces against their TLA+
specs impractical because of the gap between them, while generating tests from a small model worked (Davis et al.,
VLDB 2020). Amazon's S3 team reached the same shape: small executable reference models in the implementation's own
language, checked by property-based tests, crash states included (Bornholt et al., SOSP 2021). That is the
recommendation here.

### What to model (either notation)

One model, "lane life": the write-lane protocol with delivery, disposal and restore. Turn selection is left out:
it is sequential and deterministic, so it has no interleavings to search, and property tests fit it better.

- **State:** each Attempt (lane, one of 8 phases, sent, retries, cancel pending); the waiting order per lane;
  each ending (channel, reason, one of 8 lives, tries); the actor (live incarnation n, ended with a record,
  forgotten); the disk (captured Attempts, one write out at most); the Runtime (open, disposing, disposed).
- **Actions, about 16:** commit, retry, cancel, cancelAll; the server answers ok, fail or lost; the store
  acknowledges or refuses; a tick (timeouts, the disposal bound, the 5 s capture); reload; dispose the Runtime;
  dispose an actor; forget; ensure; release; deliver the next mail (accepted or refused).
- **Bounds:** 1 actor, 1 operation, 2 keys, at most 3 commits, a queue of 2 (not 64), 1 reload, 2 retries, each
  of the four policies on its own. My estimate is 10^5 to 10^6 states per policy: seconds to a few minutes.
- **Properties:** WriteLanes I1, I3, I5, I7 to I13, I15, I20, I21, I27; Actors I24, I29, I35, I38; Restore I1, I6;
  WriteAhead I12, I17; and one quiescence rule: when nothing is on the wire and no mail waits, no commit is still
  queued and nothing is owed.
- **Size (estimate):** as TLA+, 350 to 450 lines plus about 60 of properties. As TypeScript, 900 to 1,300 lines,
  larger because it also predicts reports for the suite. The search engine is the old suite's
  `prototypes/conformance/search/engine.ts` (156 lines), keyed on the model's own state, not on a runtime's hash.

### Which of the 26 it would have caught

| Conflict                                               | Caught | How                                         |
| ------------------------------------------------------ | ------ | ------------------------------------------- |
| C1 second refusal against a boot's one try             | yes    | I15 fails: refuse, refuse, reload, deliver  |
| C2 a kept ending on an Idle lane                       | yes    | I8 against I13 on one reachable state       |
| C3 `latest`: an uninvoked head superseded, lane stalls | yes    | the quiescence rule                         |
| C5 order of queued commits under cancelAll             | yes    | at writing: I21 cannot be stated without it |
| C9 "iff" against an invalid success write              | yes    | needs one flag for an invalid write         |
| C10 Held's exits against forget                        | yes    | needs forget with the operation gone        |
| C11 a pending cancel lost under `cancel`               | yes    | I15's list against R14                      |
| C14 capture within 5 s against one write per key       | yes    | with the capture tick                       |
| C15 "never lost" against forget and a boot's drop      | yes    | Actors I24 fails after forget               |
| C16 "no remote write is repeated" against retry        | yes    | fails on the first retry                    |
| C17 an Owed identity whose record cannot be read       | yes    | needs one "record unreadable" action        |
| C22 Disposed then Restored for one Attempt             | yes    | Restore I6 fails past the disposal bound    |
| C12 OldVersion against Rejected across paths           | no     | needs versions and fragment paths           |
| C13 silent restore against the return wave             | no     | context waves are another model             |
| C21 the Boundary of "self"                             | no     | a property test over the Turn model         |
| C25 "kept read" wording                                | no     | terminology                                 |
| C4, C6, C7, C8, C18, C19, C20, C23, C24, C26           | no     | static, CLI, codec, diagnostics wording     |

Seven are certain (C1, C2, C3, C11, C15, C16, C22), three need a cheap extra flag (C9, C10, C17), C5 falls out
while writing the model, and C14 needs the capture tick: 10 to 12. It would also have caught items the reviews
found outside the 26: a never-sent commit's `NotSent { Disposed }` lost across a reload (CQ6), a definite ending
with no answer (M5), and `unknown { Restored }` outside a boot (the revision review's M5).

**It also finds gaps, not only conflicts.** Change one action of the model (make retry do nothing) and search
again. If no Invariant fails, no Invariant constrains that action. That is how "no Invariant says an owed retry
re-sends" and "no Invariant says a turn runs exactly its declared members" would have been found by a run, not by
a builder. The suite's cell-mutation gate does this against cases today; run it against the Invariants too.

**For the other 14:** one table per closed vocabulary (each failure code, exit code and term defined once, with
the Specs citing it) removes C7, C18, C23 and C25 by construction. The rest are found by building, which is cheap
for static areas.

**The backtest that decides TLA+.** The pre-audit Specs are in git (`bcc2bbbb`, before T42 at `9230fae6`), and the
26 conflicts are the known answers. Give an agent only those Specs, have it write the model and run the search,
and count how many of the 12 it finds. If the TypeScript search finds 9 or more, stay in the harness. If it misses
three or more, repeat the backtest with TLC (one day, one `.tla` file, a pinned `tla2tools.jar`) and adopt it if it
finds them. **Cost of the first backtest:** it is the model you need anyway, plus half a day.

## Q5. Hand-written cases versus generated ones

**Bottom line: yes. For interleavings and crashes, generated sequences with the same oracles find more per hour of
work than hand cases. Keep hand cases as named examples and as the model's tests. Start with the cheapest
generator: a reload after every step of every existing case.**

The Case is already an action alphabet (`ensure`, `send`, `answer`, `ack`, `answerStorage`, `advance`, `reload`,
`dispose`, `forget`, `disposeRuntime`), the world is a synchronous simulator, and ids come from a seed. That is
deterministic simulation testing in all but the generator. The old suite had the generator: twelve searches over a
156-line engine, listed in the README as rest item 3, not ported.

Three generators, in order of yield for cost:

1. **A crash at every step.** For each of the 111 cases and each step i, run to i, reload, settle, and judge with
   the oracles and the end-of-case disposal check only (the case's own `eq` lines do not apply after the crash).
   About 100 lines, no new modelling, roughly a thousand runs. This is how file-system crash bugs are found (ALICE,
   OSDI 2014), and Restore and WriteAhead are the next two areas.
2. **Exhaustive small search.** Port `search/engine.ts`. Actions are the Case alphabet on the one-lane fixture,
   depth 8 to 12, the state key from the model and the world.
3. **Seeded long sequences with shrinking.** fast-check's model-based commands (`fc.commands`, `fc.modelRun`) are
   already installed through `effect/testing/FastCheck`. A failure shrinks to a short script and prints as an
   ordinary case.

**What it needs.**

- From the Port: nothing new. The old engine asked the runtime for a state hash; do not. Key on the model's state
  and the world's.
- From the world: which actions are enabled (open requests, a storage write out, the next timer). All of it is
  already in `world/`.
- From the oracles: they must carry the verdict alone. Step 9's probes show many catches are "case-only" (71 red,
  all by case expectations, for the NoPersistence probe). Generated runs have no case expectations, so that list is
  the to-do list.
- Negative inputs: unknown events, invalid payloads, events to an absent actor. The suite sends only valid input
  today, which is how "event payloads are never decoded" reached production unseen.

**It is partly owed already.** `Testing.plan` O6 specifies `propertyTest` for the product: seeded steps, faults as
steps, crash and restore, shrinking to 1,000 candidates. The suite's generator and shrinker are that feature's
first draft.

**Cost:** generator 1, half a day; 2 and 3, about one day together (estimates).
**Evidence:** on round-14 with the 149 mutants, count kills by generated runs alone and by hand cases alone, per
authored line. Then count failures on the unchanged runtimes that no hand case shows. I expect the crash
generator to find at least one within its first run on production; if all three find nothing, drop 2 and 3.

## Q6. Correlated blind spots and agent claims

**Bottom line: independence of method is worth more than independence of model. A command beats a second agent,
and a second agent of another family beats one of the same. Apply to agents the rule the suite applies to
runtimes: accept only what a harness observed.**

Claims a machine should check, each of which failed at least once in the log:

| Claim an agent made                         | Machine check                                              |
| ------------------------------------------- | ---------------------------------------------------------- |
| "111/111, falsify 149/149, coverage 72/183" | the runner writes a gate file at the commit; notes cite it |
| "no verdict changed", "no check lost"       | a committed catch matrix, diffed                           |
| "round-14 cannot show this"                 | the limits list, verified by the run (Q3)                  |
| "the expectation came from the Spec"        | the model computes it; the draft is compared with it       |
| "checked" for an Invariant checked in part  | `remainders` (exists)                                      |

The catch matrix has one row per (mutant, case): the oracle and Invariant that caught it. It is the important
one. Step 9's review found five lost catches and five unlogged narrowings by
running old mutants on two trees. That is a diff of two generated files. With the matrix committed, a lost catch
shows in the commit that loses it, and the builder must list it to pass the gate.

Where a model is still needed, and which:

- **Reading the Spec** is where the family's misreadings are shared. Use a different family for exactly three
  Spec-only jobs per area: read a sample of 10 to 20 expected results, write adversarial mutants from the Spec
  alone, and read the area's Invariant predicates against the prose. A backup file in `proposals/`
  (`invariant-audit-2026-11-11.md.codex-...bak`) suggests another family's tool is already on this machine.
- **The user's read** is the strongest independent check and the scarcest. Point it at the smallest artefact that
  carries the most: the model's tables and the Invariant predicates for an area, about a page, once per area.
- **Imagining failures** is the other shared blind spot. Machines break it: generic mutants and the search do not
  share the family's idea of what can go wrong.

**How much:** one different-family pass per area at its gate, not per review. **Cost:** small, and it replaces
Haiku drafting. **Evidence:** log, per area, the disagreements between the other family and the model that turned
out to be the model's error. If that count is zero over three areas, drop the pass.

## Q7. When reviews stop paying for themselves

**Bottom line: the fix is mostly upstream. Every review found a High because six of them found the same class,
and they found it by running probes. Reviews are standing in for three missing gates. Add the gates, then trigger
reviews by events, not by the clock.**

The evidence that it is one class and not general subtlety: T40/S2 (a quiet `Released`), step 4 (cancels anchored
to reported members), step 5 (a reported release), step 6 (a reported `Nothing`), step 9 (the header, `Parked`)
and the revision (the header with no root part, `from` after a reload) are all "a report decides". The rule that
triggers a convergence on the third repeat fired, but the convergence was scoped to members, one instance of the
class. A root cause should be stated as an information flow ("no path from a report to an obligation"), because
that can be enforced by a type, and an instance cannot.

**The review shape that gives the most per unit of usage (proposed):**

Before: an Opus lead and four Haiku sidecars every 90 minutes on the latest checkpoint.

After:

- On every checkpoint, by machine, at no model usage: the catch-matrix diff, the liar gate, generic mutants on
  the files the checkpoint changed, the crash generator.
- A review starts on an event: a lost catch in the matrix, a Port change, a new oracle, a Spec change, or an
  area's gate. A checkpoint that changes none of these gets none.
- The reviewer's job is the two things a machine cannot do: read the change against the Spec, and write new
  probes. Probes that find something are kept as mutants (already the practice).
- Sidecars by need, zero to two, not a fixed four. Code quality goes to lint. The accepted, changed or rejected
  log already exists; total it per angle, and drop an angle whose findings are mostly rejected.

**Generic mutants.** The reviews' probes are hand-made mutants of a runtime. A mutation tool makes them without a
model: StrykerJS has a Vitest runner and an incremental mode. Its support for TypeScript 7 is reported as
experimental and I did not verify it; time-box a trial to two hours. The fallback is a small operator-level
mutator that writes the edit files the reviewers' `suite --runtime` already reads. On `src/core` (about 3,500
lines) the survivors are the review's work list. Mutants of the core are also the right adversary: one wrong
decision feeds both the act and the report, which is the honest-bug case.

**Evidence:** track Highs per review by class. If the gates go in and reviews still find a new class each time,
this is the normal cost of a subtle suite and the cadence should stay. If they go quiet for two areas, it was
upstream. I expect reviews to fall from about a third of usage to under a sixth (estimate).

## Q8. Interleaving suite and production

**Bottom line: it is necessary and not enough. The order stops the suite learning from production in time, but
they still adapt through four channels the order does not touch: the adapter, the Port's shape, the testing seam
and case edits. Add four cheap machine checks.**

- **The adapter and the seam.** `adapters/production.ts` is 340 lines and reaches into the driver. Rule: it
  imports `src/index.ts` and a listed, shrinking part of `src/host/testing.ts`; anything with a public route uses
  it (send, snapshot, ensure, dispose). A lint rule holds the list.
- **The Port's shape.** `src/core/evidence.ts` mirrors the Port's `Observation` (`Turn.parts`, `members`,
  `MemberTarget`). The suite's needs are shaping production's public trace. Rule: a Port field exists because a
  Spec names it as publicly observable (@plan.Inspection), and the Spec is cited on the field.
- **A lock.** When an area's suite passes its audit, hash its case, oracle and fixture files into a lock file
  (the old suite had `expected.lock`). During that area's production Task, a change to a locked file fails the
  gate unless the commit lists it with the Spec rule that justifies it. "A case is never edited just to pass"
  becomes checkable.
- **A first-contact record.** Record production's result on an area's cases at its first full run, before any
  fix, and classify each red: production bug, suite bug or Spec gap. An area where production is green at first
  contact, or where most reds are suite bugs, is the signal of co-adaptation. I did not find T16's first-contact
  numbers in STATUS; start with T17.
- **Held-out seeds.** Once cases are generated (Q5), keep a set of seeds the builder never runs, and run them only
  at the area's close. It is a held-out test set and costs nothing.

**Evidence:** the classification itself. Suite bugs found by production should fall area by area; if they do not,
the area audit before production is not doing its job.

## Q9. Is Invariant count the right measure?

**Bottom line: no. It measures bookkeeping: an Invariant counts once one mutant is caught under its name,
whatever share of its clauses is judged. The revision review's M6 found five Invariants counted whole whose own
docs name unjudged clauses. Keep it as a to-do list and measure strength with four numbers a run produces.**

| Measure                      | What it says                                      | Source                |
| ---------------------------- | ------------------------------------------------- | --------------------- |
| Mutation score on `src/core` | generic mutants killed, with survivors listed     | the mutation run (Q7) |
| Liar score                   | behavioural mutants caught with reports replaced  | the liar gate (Q1)    |
| Oracle share                 | catches by an oracle, not only a case expectation | the catch matrix (Q6) |
| Cell and pair reach          | table cells and (phase, event) pairs reached      | the search (Q5)       |

- The oracle share matters because generated cases have only oracles; "case-only" catches do not carry over.
- The pair grid is the cross-area measure: 8 phases by reload, actor disposal, forget, release, the disposal
  bound, storage refusal. Step 9's H2 and CQ6 both sat in cells of that grid that no case reached.
- Per Invariant, show the number of distinct mutants killed under it and the clauses in `remainders`, not a tick.

**Cost:** each number falls out of a gate proposed above. **Evidence:** when a review or production finds a hole,
check whether one of the four numbers was already low at that spot. If the numbers were high and the hole was
there anyway, the measure is wrong and needs another.

## Q10. Production core's shape

**Bottom line: keep the core independent of the suite in behaviour, and share no table or obligation. Take the
suite's lessons as shape, not as code. The first production files have five risks worth acting on now.**

**Sharing.** If production's lanes read the suite's tables, the tables judge themselves. Both are written from
the Spec's table (once it is in the Spec, Q4), separately. The Port keeps its own vocabulary literals, and the
adapter fails `Unreadable` on a name it does not know, so a drift is loud. What to carry over as shape: phases
record progress only, a lane's position is derived, and what is owed is explicit data. `world.ts`'s `Phase`
already goes this way.

**Risks, from reading the working tree (unverified by a run; the builder is editing these files):**

1. **Evidence is written beside the act.** `lanes.ts` `invoke` calls `tx.emit(Evidence.Sent(...))` and then
   `tx.command(Command.Invoke(...))`: two lines that must agree, in every such place. AGENTS.md says to store
   facts and derive views. Where a command or a state change already determines the report (`Sent` from an
   `Invoke` with an Attempt, `Minted` from a new Attempt, an ending from the mail), derive it in one function of
   (state before, input, state after, commands). Reports are then true by construction and the suite's second
   property (a truthful trace) needs far fewer mutants. `Turn`'s parts and members cannot be derived and stay.

   ```ts
   // before (existing, src/core/lanes.ts): the report and the act are written separately
   tx.emit(Evidence.Sent({ operation: lane.operation, attempt: head.id }));
   tx.command(Command.Invoke({ call, machine, operation, input, attempt }));
   // after (proposed): only the act is written; step derives the report at its end
   tx.command(Command.Invoke({ call, machine, operation, input, attempt }));
   // NEW: evidenceOf(before, input, after, commands): ReadonlyArray<Evidence>, called once in step's tx.out()
   ```

2. **The driver can wedge silently.** In `src/host/driver.ts`, `run` sets `running = true`, loops, then sets it
   false, with no `try`/`finally`. If `step` hits a defect, or the inspector's `sink` (user code) throws,
   `running` stays true and every later input queues forever. Use `try`/`finally`, and decide what a throwing
   inspector means (my recommendation: caught, reported as an issue, never fatal).
3. **A silent return where a defect belongs.** `perform`'s `Invoke` returns if the operation is not found. The
   lane's head then stays on the wire with no `Settled`, for ever. By construction this cannot happen, so it
   should throw as a defect ("only defects are thrown").
4. **Lanes will become an implicit state machine.** `commit` is a chain of `if`s with only `reject` built. With
   `latest`, `serialize` and `cancel` it becomes what AGENTS.md forbids. Before T18 adds them, write the lane as
   one total function of (phase, member or ending) with an exhaustive match, from the Spec's table.
5. **The pure core is the cheapest thing to search, and nothing searches it.** `step(machines, world, input, env)`
   is pure and takes about 0.2 ms. Commands are acts, not reports, so Invariants stated over inputs and commands
   need no trust at all ("no `Invoke` for an Attempt twice without a retry between"). Run Q5's search directly on
   `step`, below the host. It is the strongest and cheapest check available for the core, and the host then needs
   only its own small tests under Effect's `TestClock` plus the real-browser runs.

Two smaller ones: `step` builds `makeTx` and six `make*` objects on every input and copies the world on each
change, so put a turn-time budget test in the fast gates now and not in P9, because the budget decides the data
structures; and a read's call context carries a made-up Attempt (`id: ""`, `key: {}`), an illegal value that a
read's code can see, so give reads a context with no Attempt.

**Evidence:** for 1, the count of report-only production mutants needed falls. For 2 and 3, a test that throws
from the inspector and one that invokes a missing operation fail today. For 5, the search on `step` finds a
difference from the model, or reaches every lane cell with none.

## Sources

Read for these answers, beyond the project's files:

- Tretmans, "Model Based Testing with Labelled Transition Systems" (2008): ioco and quiescence. From memory.
- Bornholt et al., "Using Lightweight Formal Methods to Validate a Key-Value Storage Node in Amazon S3" (SOSP
  2021): executable reference models, property-based conformance, crash states. From memory.
- Davis et al., "eXtreme Modelling in Practice" (VLDB 2020): trace checking against TLA+ failed, generated tests
  worked. From memory.
- Cirstea, Kuppe, Loillier, Merz, "Validating Traces of Distributed Programs Against TLA+ Specifications":
  https://arxiv.org/abs/2404.16075v2
- Howard et al., "Smart Casual Verification of the Confidential Consortium Framework":
  https://arxiv.org/pdf/2406.17455
- Pillai et al., "All File Systems Are Not Created Equal" (OSDI 2014): a crash at every point. From memory.
- Jackson, "Software Abstractions" (2006): the small scope hypothesis behind bounded search. From memory.
- StrykerJS, Vitest runner and incremental mode: https://stryker-mutator.io/docs/stryker-js/vitest-runner/ and
  https://stryker-mutator.io/docs/stryker-js/incremental/
- Quint: `quint run --mbt` and ITF traces, as described by the quint-connect wrappers
  (https://cdn.jsdelivr.net/npm/@firfi/quint-connect@2.0.1/README.md); whether `quint verify` supports TLC is not
  confirmed.
- fast-check's model-based testing, installed as `effect/testing/FastCheck`
  (`codebases/effect-v4/packages/effect/src/testing/FastCheck.ts`).
