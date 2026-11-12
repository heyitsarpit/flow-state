# Spec format check against to-design and to-spec (2026-11-12)

Proposed, read-only review. Verdict: the Specs pass `workflow check` and `workflow format --check`, and keep stable IDs,
one coverage row per Requirement, every Invariant cited by a coverage row and tested. They deviate from the skills'
rules in the ways below. "NEW" means the rewrite (476c1519, 673d0378) introduced or widened it, checked against
`git show 476c1519~1:<path>`; "OLD" means it was already there.

Skills read (paths under `/Users/arpit/Developer/workflow/skills/suites/workflow/`):
- TS = `to-spec/SKILL.md`; TSA = `to-spec/references/spec-author.md`; TSE = `to-spec/references/example.md`.
- TD = `to-design/SKILL.md`; TDE = `to-design/references/example.md`.
- CLI = `.agents/skills/workflow-cli/SKILL.md` and its `syntax.md` (Spec format).

Severity is for a builder: HIGH misleads about what is binding or what to build; MED costs time or hides a rule; LOW is
cosmetic. Line numbers are in `workflow/specs/core/` unless stated. Sidecars were not used; every finding was read in
the file.

## Findings

### F1. Design and realization written into `model` and `composition`, not marked optional (HIGH, NEW and OLD)

Rule: TD#Steps 5: sections are `model`, `operations`, `algorithm`, `rules`, `composition` (boundaries, exchanged
values, dependency contracts), `realization` (target mappings); "Keep optional proposals visibly separate from binding
obligations; a chosen mechanism becomes binding only when the user agrees." TD#Steps 1 (realization guide applies).

- WriteLanes `composition.flow` 535-591: file names (`src/core/cells.ts`, `src/core/ledger.ts`,
  `src/core/evidence-of.ts`), function signatures (`cell(state, cue)`, `owe`, `tryOne`, `suspend`, `start`, `close`),
  Effect module choices ("Effect features: `Data.taggedEnum`... Skipped: `Match`, `HashMap`..."), and host mechanics
  (`Deferred`, `FiberMap`, `Scheduler`). That is `realization` content under `composition`, with no label saying it is
  proposed. Only 542 says "proposed"; 548 ("Production realization ... consolidated by T54") reads as settled. NEW (548-591),
  OLD (542-546).
- Actors `composition.flow` 468-497 (Runtime life, `life.ts`, `Deferred`, `Scope`, "the conformance suite's lifetime wrong
  runtimes all edit step.ts"); WriteAhead 297-322 (`encodeActor`, `Persist` command, `Due`, `Store` service); Restore
  219-227; Turn 345-358 ("Production layout (T16, proposed...)" is labelled; the rewritten sentences inside it are not
  distinguished). NEW.
- WriteLanes `model` 314-357 (`Cell` table, every phase-by-input move) and 382-396 (`LedgerFunctions`, "the only five
  that build, move or remove a row") and Actors `model` `Verdict` 328-350 (admit table, "today's guards in
  `src/host/runtime.ts`") are `algorithm` content placed in `model`, with no `algorithm` section and no label. The Cell
  table is OLD (WriteLanes before: line 271); `LedgerFunctions`, the `Verdict` table, `Audience`, `Delivery`, `Owed` are NEW.
- Unclear in the skills: TD says implementation notes may live in the Spec and are not binding "until the user agrees",
  but gives no marker for agreed-and-binding design. These Specs state design as plain fact ("is the World's only
  holder", "opaque outside that module"). A builder cannot tell whether the user agreed.
- Spec has no `owner` blocks, `operations`, `algorithm`, `rules` or `realization` sections in any of the ten Specs (TD
  Steps 5 makes them optional, so this is a gap, not a violation). TD says owner sections "hold state authority"; here
  ownership is in `composition` prose only, and every Invariant is top-level.

### F2. Private representation stated as normative Requirements and Invariants (HIGH, NEW)

Rule: TS#Steps 3 and 5, TSA#Invariants: "Only require a private representation when it is an agreed constraint"; "Do not
prescribe internal types, algorithms, module layouts". TD#Steps 5: "private design properties stay in design prose".

- WriteLanes I29 (499: mail reference per Queued/Retrying row, "waker"), I30 (503: mail reference), I35 (522: own counter),
  I36 (525: `mayHaveApplied` derivation, no head or record stores it), I37 (528: no ticket, timer or record key in a
  report), I34 (518). All added 2026-11-12.
- WriteLanes R5 (90-96: mint draws a session seed, "Attempts have their own counter"), R10 (176-178: "The mailbox holds a
  reference to the row"), R3 (42-44: `Data.TaggedEnum`, `Match.tag`). The `Data.TaggedEnum` and `Match.tag` text is also in
  Reads R9 (97-99).
- Actors I42 (458: `admit` gives every pair one verdict, "no host flag"), I40 (450: mailbox), I41; R10/R15 mailbox text
  (131). WriteAhead I21 (283: "every lane and identity whose entry a step changed has its record written in that
  step's write list") and I22, I23 (`Store.write`). Turn I36 (R26: "one Turn act", "the one function that builds a
  report").
- Some of these are user-agreed (`Store` is Flow's own, 2026-11-12 user decision at WriteAhead Q4). Most name no user
  agreement.

### F3. Agent decisions have no `Why:` and `Reverse:`; user decisions do not quote the user; a new role appears (MED, NEW and OLD)

Rule: TS#Steps 5: "`Decision (agent|user, <date>): <choice>.` then, for an agent's choice, `Why:` and `Reverse:`; a user's
choice quotes the user."

- No agent decision in the seven rewritten Specs has `Why:` or `Reverse:` (0 of 19; most are OLD, the orchestrator ones are NEW). They point to `spec-log.md` or an audit id instead (Actors 96, 173, 218,
  267; WriteLanes 33, 94, 138, 149, 186, 410, 434, 456, 482, 486; Restore 53; Turn 282+). Compile (the only core Spec
  not rewritten that does it) has `Why:` and `Reverse:` at 151-170, as does Conformance; StaticCli and Diagnostics do not
  (OLD).
- `Decision (orchestrator, 2026-11-12)` is not `agent|user`: Actors 122, 180; WriteAhead 79, 135; WriteLanes 121, 179;
  Restore 25. NEW. Unclear: whether "orchestrator" is a kind of agent. TS names only two roles and says nothing checks
  the shape.
- User decisions cite a consult round instead of quoting: Actors 57, Reads 73 and 103, WriteLanes 58 and 75, WriteAhead 33
  and 161, Turn R26, Codec R5. Only Actors 431 and 435 quote ("Q1 A"). Mostly NEW.
- Decisions are used as provenance ("ruling CQ7") rather than for a choice made while writing the Spec.

### F4. Change history and Task instructions inside contract text (MED, NEW)

Rule: TS#Before you start: "Records about the Specs as a whole, such as ... their change log ... live in
`workflow/specs/`" (here `spec-log.md`). TSA#Requirements: project choices belong in Plan decisions and Task
provenance. TSA#Finalize ("Keep actual results in the owning Task evidence").

- Inline "Added 2026-..", "Reworded 2026-.. from "..."", "Retired", "Renamed": Actors (10 lines, e.g. 268, 357, 383,
  402...), WriteAhead (6), Restore (5, 53, 165-214), Turn (8, 282-335), Codec (85, 92), WriteLanes (19). Counts rose from
  3, 2, 2, 6, 1, 6 to these. NEW, though OLD in a smaller form.
- Task assignments inside Requirements and composition: Codec R5 ("Still @task.V3.T20's: the canonical codec ..."),
  Restore R3 (38-40), WriteAhead R2/R4 ("for @task.V3.T19 to build", 66, 147), WriteLanes 563-564 ("@task.V3.T54 may keep a
  fourth Delivery state ... must then rewrite R10 and I32 and say so to the user"), Actors `model` `Verdict` (328-350: "by input (agent, 2026-11-12; ... @task.V3.T55 adds)"). `@task` counts went from
  1, 1, 0, 1, 3, 4, 0 to 15, 4, 3, 2, 12, 16, 2. NEW.
- Test run status inside tests: WriteLanes T23 ("written before the code"), T24 ("Pending in the suite until"), T25 ("Red
  until one `Answered` cue lands"), T27 ("Failing first"), Turn T24, Codec T6, Actors T21-T25. NEW.

### F5. Requirements bundle several obligations and reference Invariants (MED, OLD and NEW)

Rule: TSA#Requirements "one independently verifiable obligation per Requirement"; TS#Watch out ("Bundled Invariants").

- Almost every Requirement is a multi-paragraph bundle: WriteLanes R2, R3, R4, R5, R6, R10 (four paragraphs), R14; Reads
  R1, R6 (two topics), R9; Codec R4, R5; Actors R8, R15. R10 even says "exactly as I15 counts", so a Requirement leans on
  an Invariant (TS#Steps 2 and 3 order: Requirements first, Invariants derived from them). OLD mostly; R5, R6, R10, R14
  grew in the rewrite.
- Invariants that bundle independent properties: WriteLanes I15 (six exceptions, 446-457), I17, I27 (488-493), I29
  (three properties), I3; Reads I20, I22. I15 is OLD; I27, I29, I34 are NEW.
- Duplicated guarantees (TSA#Requirements "Define each guarantee once"): WriteLanes I28, I35, I36, I30 restate R5 and
  R10; Reads I22 restates R6; the "Kept row blocks its key" rule is stated in WriteLanes R6, R8, I8, I13, I33, `model`
  `Blocked`, and Actors R15. NEW.

### F6. Retired and settled items kept in live positions (LOW, NEW)

Rule: TSA#Existing Specs and lifecycle (keep superseded requirements with their coverage) is satisfied; the form is the
issue.
- WriteLanes R15 (243-248) is a Requirement whose `must` says "Retired"; I21 and T10 are retired but keep coverage rows
  (`@R15 enforced_by [@I21]`, 650). It is an obligation that says "no obligation", which a builder may still try to build.
- Settled questions stay in `open`: Reads Q3 (151), WriteAhead Q4 (217). TS says open holds unsettled items.

### F7. Coverage rows point to Invariants that do not cite the Requirement (LOW, OLD)

Rule: TS#Steps 4 and TSA#Tests ("Every requirement needs a coverage row ... Cite a relevant invariant").
Mismatches (coverage lists an Invariant whose own `[@R]` tag lacks the Requirement): Reads R8->I8; Turn R4->I4, I5,
R12->I12, R16->I20, R23->I29; WriteAhead R2->I1, R15->I3; and in Specs not rewritten Compile R10, R13, R14,
Diagnostics R4, StaticCli R1, R2, R5, R6. All were present before the rewrite. Also, coverage of Reads R1 (I1 does not
cover "services is required") and R8 (only join behaviour) is thinner than the Requirement text.

### F8. Cross-Spec citations are prose, not links (MED, OLD, widened)

Rule: CLI syntax ("Use local references such as `@R1` inside a Spec. Use qualified references across files"); TSA
(Preserve and cite).
- Cross-Spec references are written "WriteLanes Spec R3", "Actors Spec R15", "Restore Spec R5" (about 90 in core), and
  "(WriteLanes Spec `model`)". Only 6 uses of `@spec.X.R` exist (Actors 1, Reads 1, Restore 2, WriteAhead 2). `workflow
  check` resolves none of the prose ones, so a renumbered rule is not caught. Prose counts rose from 6, 3, 4, 7, 5, 18, 0
  to 12, 10, 8, 14, 5, 28, 6. Section citations (`model`, `composition`) have no ID at all.
- The Reads R6 and Turn R26 designs rely on those prose citations being right.

### F9. Test entries tied to prototype and harness names (LOW to MED, OLD)

Rule: TS#Steps 4: expectations "derived independently of the implementation", defined at public boundaries.
- Nearly every test cites prototype cases, "lies" and "wrong runtimes" by id. These are checked by
  `workflow/specs/checks/spec-refcheck.pl`, which exits 1 on 12 core misses today (6 OLD: Actors 662, Turn 497,
  WriteLanes 673-674, 692; 6 NEW and mostly false hits on code tokens: Codec 126 `kept/<lane>`, WriteAhead 430, 439,
  WriteLanes 713, 752, 755). Unclear: TS says nothing about citing harness case ids; the project's own rule is "test the
  spec, not the code", which this partly cuts across.
- Several tests have no `[@R]` link and only `[@I]` (all of them): fine under TSE, since T-lines there link both.

### F10. Format details (LOW)

- Ragged continuation indentation and hard wraps inside paragraphs that the formatter leaves: Reads 289-296, Codec 46-47,
  WriteLanes 195-196, 453-454, 713-757. Codec Q2 (70-71) has `outcome` on the same line as the question, as do WriteLanes
  Q2, Reads Q2 (OLD and NEW mix). Reads `open` lists Q1, Q3, Q2 out of order.
- `basis` carries process text ("A guide, revisable whenever...") on every Spec; Conformance `basis` (3-32) holds two
  dated change logs, which TS puts in `spec-log.md`. OLD.
- Many Invariants lack a named validity point (TSA#Invariants "at named points where it must hold"); a few say "At
  Observation" or "at every quiescent point". OLD.
- No `realized_by` or `spec-trace` typed link; `derives_from` is set. Both optional in TSA.

## Not found

- Missing required header fields (`status`, `basis`, `location`, `provides`, `derives_from`) or required sections
  (`requirements`, `open`, `invariants`, `coverage`, `tests`): none.
- Section order follows TDE (requirements, open, model, invariants, composition, coverage, tests).
- Every `enforced_by` row has `open_by` while the status is proposed (CLI Proposed Spec).
- IDs: none removed by the rewrite; new IDs are appended (Actors I40-I43, WriteLanes I29-I38, Turn R26, Codec R5).

## What to tell the builder

1. Treat `model`, `composition`, Actors `Verdict`, WriteLanes `Cell` and `LedgerFunctions` as design guidance until the
   user marks them binding (F1, F2).
2. Treat file names, Task notes and test status in Spec text as Task content (F4).
3. Cross-Spec "X Spec Rn" citations are unchecked; verify them by hand (F8).
