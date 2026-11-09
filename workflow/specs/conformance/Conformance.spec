spec Conformance
status        proposed
basis         A guide for the conformance suite's own contract: what a verdict of the suite can be trusted
              for, whichever runtime it runs on. Derived from the suite's purpose (the P3 phase goal, the
              Epic's "test the spec, not the code" constraint, skill:policy-verification) and the decisions
              in the suite's README, not from what the code does today; where the code falls short, the
              gap is an open item here. Revisable whenever building shows it wrong; each change and its
              reason is logged in `workflow/specs/spec-log.md`. Names marked "proposed name" are not
              confirmed. `derives_from` names this Spec's Task because no Plan outcome covers the suite yet:
              @plan.Runtime's verification target is pending a Plan edit the user has not approved, and is
              added here once it is.
location      packages/flow-state-v3/conformance
provides      Port, Boot, Runtime, Observation, Oracle, mutants (`Lie` until the rename), case verdicts,
              mutant verdicts, the runner's suite and falsify modes
derives_from  [@task.V3.T4]

requirements
    R1  Public behaviour only
        source  README decision 2, "The Port is public behaviour only"
                (code:packages/flow-state-v3/conformance/README.md); README decision 11 (the Runtime's values);
                the P3 goal ("through one Port").
        must    The Port drives a runtime only through public operations (attach or create a use of an
                identity, send, release a use, dispose an actor, dispose the Runtime). It reads the runtime
                only through public results (a snapshot, an operation's public row) and public reports in
                the core Specs' vocabulary.

                Every data value crossing it (payloads, inputs, keys, memory, rows, Observation fields) is
                JSON, or a Schema value whose encoded form is JSON (an `Option` field). The only functions
                crossing it are the world's hosts and the report sink that `Boot` hands the runtime.

                No lane cell, mint counter, frame, wait, replay, storage key spelling or disk encoding
                crosses it. A Port addition follows the same rule: it reports a fact by its meaning in the
                Specs' terms, never by a runtime's representation.

                One exception: a settling query (`pending`) says the runtime has work that no host task
                shows yet. Only the suite's settle step may read it.

    R2  Runtime-independent verdicts
        source  The P3 goal: one suite for the prototype and the production runtime; the Port's contract
                (code:packages/flow-state-v3/conformance/port.ts#Port: scenarios and oracles "see only the"
                Runtime it boots, "never which one runs").
        must    Cases, oracles and the runner never depend on which runtime is under test. Two runtimes
                that show the same behaviour through the Port get the same verdict on every case.

                A difference between adapters that can change a verdict is a stated limit, bounded so:

                - only a prototype adapter has one; the production adapter has none;
                - it is recorded in the README naming the cases and the checks it affects and the runtime
                    behaviour that retires it;
                - it may only skip judging a report the runtime does not make. It never makes a check
                    accept a value that contradicts the check's rule, and never moves an expected value away
                    from its cited rule (R5).

                A case or check that does more than skip is a failure of this Requirement, recorded as an
                open item until the suite fixes it.

    R3  Adapters translate, never testify
        source  README decisions 8 and 10 and the stated limit on `Ended.failure` ("the adapter will not
                fill the failure in from the suite's own Answered fact").
        must    An adapter turns its runtime's own reports into Observations and its public results into
                Port values. It never fills a report in from the suite's facts or the world's state, and
                never mints an id its runtime should mint.

                Where a prototype cannot report a fact, the adapter's substitute is a stated limit
                (decision 8: Attempt ids from the session seed; decision 10: actor attribution), bounded as
                R2 bounds every limit. The production adapter uses none of them.

    R4  Reports anchored to suite facts
        source  README decision 3; the Oracle contract
                (code:packages/flow-state-v3/conformance/oracles/oracle.ts#Oracle).
        must    Every Observation is the runtime's claim. An oracle judges each report against a fact the
                suite owns: what it drove, what its fake world received or answered, or a fixture's
                hand-written reference. A check that only compares reports with each other says so in its
                doc comment.

                Decision (agent, 2026-11-09): a consistency-only check is never the only check of a Spec
                Invariant. Why: a runtime that lies consistently passes every consistency check, so such
                an Invariant would be judged by nothing the suite owns. Reverse: allow consistency-only
                coverage where no suite fact can anchor the report, listed in the README. User's read:
                pending.

    R5  Expected results from cited Spec rules
        source  The Epic's constraint "Test the spec, not the code"; P3's false pass ("agreeing with the old
                suite because it was copied").
        must    Every case cites the core Spec Requirements or Invariants its expectations come from, and
                every oracle names the Spec Invariants it judges. Each citation resolves to an entry of a
                core Spec.

                An expected result is derived from the cited rule and the fixture's source, without running
                any runtime. Output recorded from a runtime is never an expected result; it serves only as a
                change detector, labelled as one. An expectation carried over from the old suite counts
                only when its cited rule gives the same value.

    R6  Every check has a mutant it kills
        source  skill:policy-verification#prove; README decision 5; the P3 gate "falsify, which rejects the
                null runtime and every registered mutant".
        must    Every check has at least one mutant for each runtime the suite runs on: a reapplicable edit
                to that runtime that makes the mistake the check exists to catch.

                A check is one of:

                - an (oracle, Spec Invariant) pair: an oracle together with one Invariant it names. It
                    catches a case only by a violation that names that Invariant;
                - a case expectation that is the only check of a Spec Invariant (a case-only Invariant,
                    the guarantee map's "case" rows). It catches a case only as the failed expectation R9
                    names.

                Decision (agent, 2026-11-09): mutants are accounted per (oracle, Invariant) pair, not per
                oracle. Why: an oracle that judges several Invariants can keep one no mutant reaches, and
                falsify would still pass; violations already name their Invariant, so the pair is
                observable. Isolating each rule inside one Invariant stays an audit item. Reverse: count
                per oracle and leave per-Invariant coverage to the audit. User's read: pending.

                Falsify kills a mutant only when all of these hold: each of its edits applies exactly once
                to a fresh copy of the runtime; its cases pass on the unedited runtime (the control); and,
                on at least one seed of one of its cases, the check that holds it is among the checks that
                failed that case. Every failing seed is judged, not only one. A mutant's verdict is one of:
                caught, red by another check, survived, not applied, no verdict. Every verdict but caught
                fails falsify.

    R7  The null runtime fails every case
        source  README decision 5 and `nullPort` ("a case that passes here proves nothing"); the P3 gate.
        must    Under the null runtime (it boots, accepts every call, reports nothing and shows no actor),
                every case fails by a stated failure: an oracle violation or a case expectation.

                Decision (agent, 2026-11-09): a defect (R9) does not count as the case failing on null.
                Why: such a case never reached a check, so it proves nothing about the null runtime; many
                cases fail on null today only by `NoHeldRequest`, which `dsl/case.ts` calls "a scenario bug,
                never a verdict". Reverse: count any failure. User's read: pending.

    R8  Deterministic from a seed
        source  README decisions 8 and 9; skill:policy-verification#build ("control clocks, seeds and
                ordering").
        must    A case's verdict is a function of the suite's code, the runtime's code, the case and the
                world seed only. The suite reads no wall clock, randomness or host state: the case owns its
                world's clock, page, storage and network. The runner's time bound is the one wall-clock
                read; a case that overruns it gets a defect (R9), never a stated failure.

                Each case runs under at least two fixed world seeds, chosen so that they change load order
                and session seeds, each on a fresh world, and passes only when every seed passes. Each boot
                gets a session seed derived from the world seed, distinct per page. Running a case alone,
                with others, in another order or split over processes gives the same verdict.

    R9  Case verdicts
        source  The runner's role as a gate (the P3 gates; `nub run verify` in the exit criteria).
        must    A run gives exactly one verdict per requested case, of three kinds:

                - a pass;
                - a stated failure, which names, for each failing seed, the seed, the step and the checks
                    that caught it, with the reason in the rule's words. An oracle check is named by its
                    oracle and the Invariant its violation names; a case's own expectation is named by its
                    label and the rule it cites;
                - a defect: the case reached no check. A thrown scenario bug, an unsettled world, a runtime
                    that throws, a child process that died, a run over the time bound, or an unknown case id
                    is a defect with its reason.

                No requested case is absent from the verdicts, and none without a check's pass is a pass.

                The machine form is one line, `VERDICTS ` followed by the JSON array, decoded with a Schema.
                The human form is one line per case and a final `VERDICT pass|fail <passed>/<total>`. A run
                with any non-pass verdict, or with no case, exits non-zero.

                Decision (agent, 2026-11-09): a defect is its own verdict kind (`Defect`, proposed name),
                apart from a stated failure, and covers wall-clock overruns as well as thrown defects. Why:
                R7 and a reader must tell them apart, and an overrun depends on the machine, so calling it
                a stated failure would contradict R8. Reverse: keep two kinds and mark defects in the reason
                text. User's read: pending.

    R10  Falsify verdicts
        source  README "How to run"; skill:policy-verification#maintain ("a gate that stays green on either
                is not a gate").
        must    Falsify reports, in order: whether every check (R6, both kinds) has a mutant for the runtime;
                the null result; the control; then one line per mutant with its R6 verdict, and for a caught
                mutant the case and the reason. It ends with one `VERDICT pass|fail` line counting the
                mutants caught.

                It passes only when every check has a mutant, null fails every case by R7, the control is
                green, every mutant is caught, and at least one mutant ran; otherwise it exits non-zero.

    R11  The old-suite comparison
        source  P3's exit criterion "it kills every mutant the old suite kills" and its false pass.
        must    For each ported area, the suite's verdicts are compared with the old suite's
                (`prototypes/conformance/`) on the same cases and the same mutants, on the runtime the old
                suite runs on. Every mutant the old suite kills on a ported case, the new suite kills.

                Every difference is recorded with its reading: an old-suite weakness, a new-suite bug, or a
                case not ported, with why. An area with an unfixed new-suite bug does not count as ported.
                Agreement is evidence only where the new expectation comes from its cited rule (R5). The
                comparison retires with the old suite, and its record says so.

    R12  The suite judges the core Specs
        source  The P3 goal "one oracle per guarantee with its mutants"; each P3 area Task's acceptance
                "Every WriteLanes Invariant has its oracle or case" (and the same for Turn, Actors,
                WriteAhead, Restore and Reads).
        must    For each core Spec in the suite's scope (@spec.WriteLanes, @spec.Turn, @spec.Actors,
                @spec.WriteAhead, @spec.Restore, @spec.Reads), every Invariant has its oracle or case: an
                (oracle, Invariant) check or a case expectation that checks it.

                The guarantee map lists every Invariant of those Specs. An Invariant that cannot be judged
                through the Port is listed with why; it counts as uncovered and is an open item for the
                user's read, never as covered.

    R13  Mutants stay in their copy
        source  skill:policy-verification#prove (a mutant is an edit to the code under test); R6.
        must    A mutant's edits change files only inside its own copy of the runtime. Nothing outside the
                copy changes during or after falsify: not the runtime's own tree, not the suite, not any
                file the copy links to. When falsify ends, no copy remains.

open
    Q1  Most checks below are not built: each test says whether it exists or "phase 3 writes this".
        outcome  Phase 3 builds them before the audit; a planned test is not evidence.

    Q2  R7 does not hold today: 29 of 61 cases fail on null only by a thrown `NoHeldRequest`, and the verdict format 
        cannot tell a defect from a stated failure (R9).
        outcome  Phase 3 adds the defect verdict and makes each such case check a public result before it
                 answers a request the runtime should have made.

    Q3  The prototype adapter's stated limits change verdicts against R2 and R3: actors attributed to the next turn 
        (decision 10), Attempt ids from the session seed (decision 8), `Ended.failure` judged
        only when reported, `Minted.key` always `None`.
        outcome  Each is retired by the production adapter in phase 4, and its check made strict then.

    Q4  The planned disk reader (`Port.disk`, README "Planned Port changes") reads the runtime's own format, which R1 
        allows only if it reports facts by meaning.
        outcome  Its shape is checked against R1 when it is built.

    Q5  Falsify does not yet follow R6: it counts mutants per oracle, not per (oracle, Invariant) pair; case-only 
        Invariants have no mutants; and a kill is judged on the first failing seed only.
        outcome  Phase 3 accounts mutants per pair, adds the case-only mutants and judges every failing seed.

    Q6  The ported cases' expectations were written by the builder from the old suite's cases, while the Epic asks for 
        expectations written by someone other than the builder.
        outcome  The four-angle audit re-derives the expectations from their cited rules and writes its
                 own mutants from the Specs (P3's "caught by").

    Q7  The old-suite comparison is done by hand in STATUS.md.
        outcome  Phase 3 writes the verdict-compare mode (README work list item 4).

    Q8  Failure of R2: the `three-channels` oracle accepts any value when a report is absent (`onNone: () => true`, 
        code:packages/flow-state-v3/conformance/oracles/three-channels.ts#onNone), which can accept a
        value that contradicts its rule rather than only skipping a report the runtime does not make.
        outcome  A later Task narrows each such branch to a skip that a stated limit names, or a strict check.

    Q9  Failure of R2 and R5: the idle-row limit (README, "Round-14 has no idle row") makes cases expect `None` for a 
        key with no lane, where Reads R14 gives the idle row. The limit changes an expected value away from its
        cited rule instead of skipping a report.
        outcome  A later Task makes those expectations follow Reads R14 and skips the read on the prototype
                 under a stated limit naming the cases.

    Q10  Failure of R4 (I8): WriteLanes I9 is judged only by `lane-cells`' consistency-only rule (it compares
        reports with each other), and no case cites WriteLanes I9.
        outcome  A later Task anchors WriteLanes I9 to a suite fact or adds a case that checks it.

    Q11  Failure of R9 (I32) and R13 (I33): verdicts name no seed or step and a mismatch names no
        expectation label; and a mutant's copy links the original suite folder
        (code:packages/flow-state-v3/conformance/runner/falsify.ts#symlinkSync), so an edit through it would change 
            files outside the copy.
        outcome  A later Task adds the verdict fields and copies or seals the linked folder.

model
    Check = an (oracle, Spec Invariant) pair, or a case expectation that is the only check of a Spec
        Invariant (R6).

    CaseOnlyInvariant = a Spec Invariant in scope (R12) whose only check is a case expectation.

    StatedFailure = a case failed by an oracle violation (`Violated`) or a case expectation (`Mismatch`).

    Defect = a case that reached no check: a thrown scenario bug, an unsettled world, a runtime that throws, a
        dead child, a time-bound overrun, an unknown case id (R9).

    StatedLimit = a recorded, prototype-only difference between adapters that skips judging a report the
        runtime does not make (R2).

    Mutant = a named, reapplicable edit to one runtime's source with the cases it runs on, held by one
        check (`Lie` until the rename, @task.V3.T5).

    SuiteFact = a timeline entry the suite wrote itself (`Stepped`, `Drove`, `Requested`, `Answered`,
        `Reloaded` and the rest), the server's log, or a fixture's reference.

    Verdict = per case: pass, stated failure or defect (R9); per mutant: caught, red by another check,
        survived, not applied, no verdict (R6).

invariants
    I1  Every Port operation, result and Observation tag is a public operation, public result or report named in a core 
        Spec; none names a runtime's module, type or storage layout. [@R1]

    I2  No module under `scenarios/`, `oracles/`, `dsl/`, `fixtures/` or `world/` imports an adapter or a runtime's 
        source. [@R1, @R2]

    I3  Only the settle step reads `pending`; no oracle, case or expectation does. [@R1]

    I4  For one behaviour shown through the Port, every case's verdict is the same whichever adapter shows it, except 
        where a stated limit names the case. [@R2]

    I5  Every Observation an adapter reports stands for a report its runtime made; none is derived from a suite fact or 
        the world's state, outside a stated limit. [@R3]

    I6  An oracle's result is a function of the case's facts only (its timeline, the server's log and the fixtures' 
        references). [@R4]

    I7  Every oracle rule that judges a report reads at least one suite fact, or its doc comment says it is 
        consistency-only. [@R4]

    I8  No Spec Invariant in the guarantee map is judged only by consistency-only rules. [@R4]

    I9  Every case cites at least one core Spec Requirement or Invariant, and each citation resolves. [@R5]

    I10  Every oracle names the Spec Invariants it judges, and each name resolves. [@R5]

    I11  No expected value in a case or a fixture reference was copied from a runtime's output; a recorded
        output used as a change detector is labelled as one. [@R5]

    I12  Every (oracle, Invariant) check has at least one mutant for each runtime the suite runs on. [@R6]

    I13  Every case-only Invariant has at least one mutant whose cases fail with that expectation named as the
        failed check. [@R6]

    I14  Every edit of every mutant occurs exactly once in its file of a fresh copy of the runtime. [@R6]

    I15  Every mutant's cases pass on the unedited runtime. [@R6]

    I16  Every mutant turns at least one of its cases red, on at least one seed, with its holding check among the
        checks that failed that case on that seed; every failing seed is judged. [@R6]

    I17  After falsify, the runtime's own tree is unchanged and no copy remains in the scratch folder.
        [@R13]

    I18  On the null runtime, every case's verdict is a stated failure, never a pass or a defect. [@R7]

    I19  Two runs of the same code, case and seed that finish within the time bound give the same verdict, byte for
        byte in machine form. [@R8]

    I20  A case's verdict does not depend on which other cases run, their order, or the process split.
        [@R8]

    I21  A case passes only when it passes under every seed; a failure names each failing seed. [@R8, @R9]

    I22  Every seed of every case starts on a fresh world; no state crosses cases or seeds. [@R8]

    I23  The session seeds of one case differ across its pages and its world seeds. [@R8]

    I24  A run gives exactly one verdict per requested case id; an id with none is a defect with its reason.
        [@R9]

    I25  A defect is reported as a defect, never as a stated failure or a pass. [@R9, @R7]

    I26  The runner exits non-zero exactly when a verdict is not a pass or no case ran. [@R9, @R10]

    I27  The machine form decodes with the verdict Schema; the human form ends with exactly one `VERDICT`
        line. [@R9, @R10]

    I28  Falsify passes only when I12, I13, I14, I15, I16 and I18 hold and at least one mutant ran. [@R10]

    I29  For every ported case and every old-suite mutant that applies to the old suite's runtime and that the old
        suite kills on that case, the new suite kills the mutant. [@R11]

    I30  Every verdict difference between the two suites on a ported area has a recorded reading. [@R11]

    I31  Every data value crossing the Port is JSON or a Schema value whose encoded form is JSON; the only functions
        crossing it are the world's hosts and the report sink `Boot` hands over. [@R1]

    I32  Every stated failure names, for each failing seed, the seed, the step and each check that caught it: an
        oracle with the Invariant its violation names, or an expectation's label with its cited rule. [@R9, @R6]

    I33  No file outside a mutant's copy changes during or after its run, including files the copy links to.
        [@R13]

    I34  A case that overruns the runner's time bound gets a defect verdict, never a stated failure or a pass.
        [@R8, @R9]

    I35  The production adapter has no stated limit. [@R2, @R3]

    I36  Every stated limit names its cases, its checks and the behaviour that retires it, and only skips judging a
        report the runtime does not make: no check accepts a value its rule contradicts, and no expected value
        differs from its cited rule. [@R2]

    I37  The guarantee map lists every Invariant of each core Spec in scope, each resolving against
        `workflow/specs/core/`. [@R12]

    I38  Every Invariant in the guarantee map has an (oracle, Invariant) check or a case expectation, or is listed
        as not judgeable through the Port with why and counted as uncovered. [@R12]

    I39  No ported area is counted as ported while a difference read as a new-suite bug is unfixed. [@R11]

coverage
    @R1
        enforced_by  [@I1, @I2, @I3, @I31]
        open_by      [@Q1, @Q4]

    @R2
        enforced_by  [@I2, @I4, @I35, @I36]
        open_by      [@Q1, @Q3, @Q8, @Q9]

    @R3
        enforced_by  [@I5, @I35]
        open_by      [@Q1, @Q3]

    @R4
        enforced_by  [@I6, @I7, @I8]
        open_by      [@Q1, @Q10]

    @R5
        enforced_by  [@I9, @I10, @I11]
        open_by      [@Q1, @Q6, @Q9]

    @R6
        enforced_by  [@I12, @I13, @I14, @I15, @I16, @I32]
        open_by      [@Q1, @Q5]

    @R7
        enforced_by  [@I18, @I25]
        open_by      [@Q2]

    @R8
        enforced_by  [@I19, @I20, @I21, @I22, @I23, @I34]
        open_by      [@Q1]

    @R9
        enforced_by  [@I21, @I24, @I25, @I26, @I27, @I32, @I34]
        open_by      [@Q1, @Q2, @Q11]

    @R10
        enforced_by  [@I26, @I27, @I28]
        open_by      [@Q1, @Q5]

    @R11
        enforced_by  [@I29, @I30, @I39]
        open_by      [@Q7]

    @R12
        enforced_by  [@I37, @I38]
        open_by      [@Q1]

    @R13
        enforced_by  [@I17, @I33]
        open_by      [@Q11]

tests
    T1  Port boundary. Exists: `nub run check` type-checks `port.ts`, whose types name no adapter. Phase 3 writes this: 
        an import-boundary lint over `scenarios/`, `oracles/`, `dsl/`, `fixtures/` and `world/`, seen rejecting a
            planted import of `adapters/prototype.ts`. [@I1, @I2]
    T2  Settling only. Phase 3 writes this: a static check that only the settle step calls `pending`, seen rejecting a 
        planted read in an oracle. [@I3]
    T3  Cross-adapter parity. Phase 4 writes this: every case on the prototype runtime and on production; each verdict 
        difference is a stated limit naming that case, or a bug. [@I4]
    T4  Adapter testimony. Phase 3 writes this: the audit reads each adapter against its runtime's report types and 
        lists every observation not backed by a runtime report; each is a stated limit or a bug. [@I5]
    T5  Oracle purity. Exists: the `Oracle` type (`check: (facts: Facts) => ...`) under `nub run check`. [@I6]
    T6  Anchors. Phase 3 writes this: the audit marks every oracle rule as anchored or consistency-only and checks the 
        guarantee map for an Invariant with consistency-only rules alone. [@I7, @I8]
    T7  Citations resolve. Phase 3 writes this: a check that resolves every scenario's `cites` and every oracle's 
        `guarantee` against `workflow/specs/core/`, seen rejecting a planted "WriteLanes R99". [@I9, @I10]
    T8  Expectation provenance. Phase 3 writes this: the audit re-derives each case's expectations from its cited rules 
        and writes its own mutants from the Specs; a value only a run could give is a finding. [@I11]
    T9  Every check has a mutant. Exists for oracles only: falsify's first line (`runner/main.ts`). Phase 3 writes 
        this: the line counts (oracle, Invariant) pairs and case-only Invariants, seen failing on a planted pair with
            no mutant. [@I12, @I13]
    T10  Case-only mutants. Phase 3 writes this: one mutant per guarantee-map "case" row, run by falsify and caught
            only when the failure names that case's expectation. [@I13]
    T11  Exactly-once edits. Exists: falsify's "not applied" verdict (`applyEdit` in `runner/falsify.ts`); seen by
            planting an edit whose text occurs twice. [@I14]
    T12  Control. Exists: falsify's control line, the mutants' cases on the unedited runtime. [@I15]
    T13  Kill by the holding check. Exists per oracle: falsify's per-mutant judge (caught, or red by another check).
            Phase 3 writes this: the judge matches the violation's Invariant and reads every failing seed, seen 
                catching a
            planted mutant red by a mismatch on one seed and by its oracle on another. [@I16, @I32]
    T14  Copy isolation. Exists: each copy is removed when its run ends (`copyRuntime`). Phase 3 writes this: falsify
            hashes the runtime's tree and the suite before and after, lists leftover copies, and is seen failing on a
            planted mutant that edits a file through the copy's link. [@I17, @I33]
    T15  Null by stated failures. Phase 3 writes this: falsify's null line counts a case as failed only by a stated
            failure and fails on any pass or defect, seen failing on a case that throws on boot. Today's null line 
                counts
            every `Fail`, defects included, so it cannot fail on I18 and is not evidence for it. [@I18, @I25]
    T16  Rerun. Phase 3 writes this: `suite --json` twice on one runtime, outputs compared byte for byte. [@I19]
    T17  Order and split. Phase 3 writes this: the verdict set of `suite`, `suite --parallel 4` and each case run alone
            with `--only`, compared by case id. [@I20, @I22]
    T18  Seeds. Exists: `runCase` runs every case under the fixed seeds. Phase 3 writes this: a seed-sensitive mutant
            (store load order) that passes one seed and fails another, seen failing with that seed named. [@I21]
    T19  Session seeds. Phase 4 writes this: WriteLanes T18's seed cases with a seed-ignoring mint as the mutant (README
            decision 8). [@I23]
    T20  One verdict per id. Exists: `--only NOPE` gives a non-pass "no such case"; a child with no verdicts gives a
            non-pass per id (`sliceVerdicts`). Phase 3 writes this: a runner self-test with a killed child and an 
                unknown
            id, each seen giving a defect. [@I24]
    T21  Exit codes and forms. Exists: `report` in `runner/main.ts`. Phase 3 writes this: runner self-tests for one
            failing case (exit 1), an empty run (exit 1), a decoded `VERDICTS` line and one final `VERDICT` line.
            [@I26, @I27]
    T22  Falsify verdict. Phase 3 writes this: a runner self-test with a planted surviving mutant, a planted null pass
            and a planted case-only Invariant with no mutant, each seen giving `VERDICT fail` and exit 1. [@I28]
    T23  Old-suite comparison. Exists by hand: STATUS.md compares the ported payment cases and each mutant against the
            old suite. Phase 3 writes this: the verdict-compare mode (README work list item 4), run per ported area, and
            the area's ported mark refused while a new-suite bug is open. [@I29, @I30, @I39]
    T24  Port values. Phase 3 writes this: a type-level check that every Port data type's Schema encodes to JSON and
            that only the world's hosts and the report sink are function-typed, seen rejecting a planted `Map` field.
            [@I31]
    T25  Defect verdicts. Phase 3 writes this: runner self-tests with a case that throws, a case that overruns a short
            time bound and an unknown id, each seen giving a defect and exit 1. [@I25, @I34]
    T26  Stated limits. Phase 3 writes this: the audit reads every stated limit and every adapter- or absence-dependent
            branch in the oracles and cases, and lists any that accepts a contradicting value or moves an expectation
            from its rule; the production adapter's README section lists none. [@I35, @I36]
    T27  Core coverage. Phase 3 writes this: a check that resolves the guarantee map against `workflow/specs/core/` and
            lists every in-scope Invariant with no check and no listed reason, seen failing on a deleted map row.
            [@I37, @I38]
