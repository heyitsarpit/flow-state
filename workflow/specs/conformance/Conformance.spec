spec Conformance
status        proposed
basis         A guide for the conformance suite's own contract: what a verdict of the suite can be trusted
              for, whichever runtime it runs on. Derived from the suite's purpose (the P3 phase goal, the
              Epic's "test the spec, not the code" constraint, skill:policy-verification) and the decisions
              in the suite's README, not from what the code does today; where the code falls short, the
              gap is an open item here. Revisable whenever building shows it wrong; each change and its
              reason is logged in the suite's STATUS.md. Names marked "proposed name" are not confirmed.
location      packages/flow-state-v3/conformance
provides      Port, Boot, Runtime, Observation, Oracle, mutants (`Lie` until the rename), case verdicts,
              mutant verdicts, the runner's suite and falsify modes
derives_from  [@task.V3.T4]

requirements
    R1  Public behaviour only
        source  README decision 2, "The Port is public behaviour only"
                (code:packages/flow-state-v3/conformance/README.md); the P3 goal ("through one Port").
        must    The Port drives a runtime only through public operations (attach or create a use of an
                identity, send, release a use, dispose an actor, dispose the Runtime). It reads the runtime
                only through public results (a snapshot, an operation's public row) and public reports in
                the core Specs' vocabulary. Every value crossing it is JSON.

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

                A difference between adapters that can change a verdict is a stated limit of one adapter.
                It is recorded in the README with the behaviour that retires it.

    R3  Adapters translate, never testify
        source  README decisions 8 and 10 and the stated limit on `Ended.failure` ("the adapter will not
                fill the failure in from the suite's own Answered fact").
        must    An adapter turns its runtime's own reports into Observations and its public results into
                Port values. It never fills a report in from the suite's facts or the world's state, and
                never mints an id its runtime should mint.

                Where a prototype cannot report a fact, the adapter's substitute is a stated limit
                (decision 8: Attempt ids from the session seed; decision 10: actor attribution). The
                production adapter uses none of them.

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
                to that runtime that makes the mistake the check exists to catch. A check is an oracle, or
                a case expectation that is the only check of a Spec Invariant (the guarantee map's "case"
                rows).

                Falsify kills a mutant only when all of these hold: each of its edits applies exactly once
                to a fresh copy of the runtime; its cases pass on the unedited runtime (the control); and it
                turns a case red with the check that holds it among the checks that failed that case. A
                mutant that is green, red only by another check, does not apply, or gives no verdict fails
                falsify. Mutants never edit the runtime's own tree.

    R7  The null runtime fails every case
        source  README decision 5 and `nullPort` ("a case that passes here proves nothing"); the P3 gate.
        must    Under the null runtime (it boots, accepts every call, reports nothing and shows no actor),
                every case fails by a stated failure: an oracle violation or a case expectation.

                Decision (agent, 2026-11-09): a thrown defect (a scenario bug such as `NoHeldRequest`, an
                unsettled world) does not count as the case failing on null. Why: such a case never
                reached a check, so it proves nothing about the null runtime; 29 of the 61 cases fail on
                null today only by `NoHeldRequest`, which `dsl/case.ts` calls "a scenario bug, never a
                verdict". Reverse: count any failure. User's read: pending.

    R8  Deterministic from a seed
        source  README decisions 8 and 9; skill:policy-verification#build ("control clocks, seeds and
                ordering").
        must    A case's verdict is a function of the suite's code, the runtime's code, the case and the
                world seed only. The suite reads no wall clock, randomness or host state: the case owns its
                world's clock, page, storage and network.

                Each case runs under a fixed list of world seeds (1 and 2), each on a fresh world, and
                passes only when every seed passes; a failure names its seed. Each boot gets a session seed
                derived from the world seed, distinct per page. Running a case alone, with others, in
                another order or split over processes gives the same verdict.

    R9  Case verdicts
        source  The runner's role as a gate (the P3 gates; `nub run verify` in the exit criteria).
        must    A run gives exactly one verdict per requested case: a pass, or a failure naming the checks
                that caught it in the failing step (none for a case's own expectation), the seed, the step
                and the reason in the rule's words. A requested case with no verdict (an unknown id, a child
                process that died or overran its time bound) is a failure with that reason, never absent
                and never a pass.

                The machine form is one line, `VERDICTS ` followed by the JSON array, decoded with a Schema.
                The human form is one line per case and a final `VERDICT pass|fail <passed>/<total>`. A run
                with any non-pass verdict, or with no case, exits non-zero.

                Decision (agent, 2026-11-09): a thrown defect is its own verdict kind (`Defect`, proposed
                name), apart from a stated failure, so R7 and a reader can tell them apart. Why: today both
                are `Fail` with no checks named, so null's 0/61 hides 29 scenario bugs. Reverse: keep two
                kinds and mark defects in the reason text. User's read: pending.

    R10  Falsify verdicts
        source  README "How to run"; skill:policy-verification#maintain ("a gate that stays green on either
                is not a gate").
        must    Falsify reports, in order: whether every check has a mutant for the runtime; the null result;
                the control; then one line per mutant, as caught (with the case and reason), red by another
                check, survived, not applying, or no verdict. It ends with one `VERDICT pass|fail` line
                counting the mutants caught.

                It passes only when every check has a mutant, null fails every case by R7, the control is
                green, every mutant is caught, and at least one mutant ran; otherwise it exits non-zero.

    R11  The old-suite comparison
        source  P3's exit criterion "it kills every mutant the old suite kills" and its false pass.
        must    For each ported area, the suite's verdicts are compared with the old suite's
                (`prototypes/conformance/`) on the same cases and the same mutants, on round 14. Every
                mutant the old suite kills on a ported case, the new suite kills.

                Every difference is recorded with its reading: an old-suite weakness, a new-suite bug (fixed
                before the area counts as ported), or a case not ported, with why. Agreement is evidence
                only where the new expectation comes from its cited rule (R5). The comparison retires with
                the old suite, and its record says so.

open
    Q1  Most checks below are not built: each test says whether it exists or "phase 3 writes this".
        outcome  Phase 3 builds them before the audit; a planned test is not evidence.

    Q2  R7 does not hold today: 29 of 61 cases fail on null only by a thrown `NoHeldRequest`, and the verdict format 
        cannot tell a defect from a stated failure (R9).
        outcome  Phase 3 adds the defect verdict and makes each such case check a public result before it
                 answers a request the runtime should have made.

    Q3  The prototype adapter's stated limits change verdicts against R2 and R3: actors attributed to the next turn 
        (decision 10), Attempt ids from the session seed (decision 8), `Ended.failure` judged
        only when reported, `None` for the idle row, `Minted.key` always `None`.
        outcome  Each is retired by the production adapter in phase 4, and its check made strict then.

    Q4  The planned disk reader (`Port.disk`, README "Planned Port changes") reads the runtime's own format, which R1 
        allows only if it reports facts by meaning.
        outcome  Its shape is checked against R1 when it is built.

    Q5  Falsify counts mutants per oracle. An oracle with several rules can keep a rule no mutant isolates 
        (`attempt-identity`'s "a send names its Attempt's operation"), and case-only Invariants
        have no mutant requirement in falsify yet.
        outcome  Phase 3 accounts mutants per rule with `--sweep` and adds the case-only mutants.

    Q6  The ported cases' expectations were written by the builder from the old suite's cases, while the Epic asks for 
        expectations written by someone other than the builder.
        outcome  The four-angle audit re-derives the expectations from their cited rules and writes its
                 own mutants from the Specs (P3's "caught by").

    Q7  The old-suite comparison is done by hand in STATUS.md, per round (rounds 1 to 3).
        outcome  Phase 3 writes the verdict-compare mode (README work list item 4).

model
    Check = an oracle, or a case expectation that is the only check of a Spec Invariant.

    StatedFailure = a case failed by an oracle violation (`Violated`) or a case expectation (`Mismatch`).

    Defect = anything else a case throws: a scenario bug, an unsettled world, a runtime that throws.

    Mutant = a named, reapplicable edit to one runtime's source with the cases it runs on, held by one
        check (`Lie` until the rename, @task.V3.T5).

    SuiteFact = a timeline entry the suite wrote itself (`Stepped`, `Drove`, `Requested`, `Answered`,
        `Reloaded` and the rest), the server's log, or a fixture's reference.

    Verdict = per case: pass, stated failure or defect (R9); per mutant: caught, wrong reason, survived,
        not applied, no verdict.

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

    I12  Every oracle has at least one mutant for each runtime the suite runs on. [@R6]

    I13  Every case-only Invariant has at least one mutant whose cases fail by that expectation. [@R6]

    I14  Every edit of every mutant occurs exactly once in its file of a fresh copy of the runtime. [@R6]

    I15  Every mutant's cases pass on the unedited runtime. [@R6]

    I16  Every mutant turns at least one of its cases red with its holding check among that case's failing
        checks. [@R6]

    I17  After falsify, the runtime's own tree is unchanged and no copy remains in the scratch folder.
        [@R6]

    I18  On the null runtime, every case's verdict is a stated failure, never a pass or a defect. [@R7]

    I19  Two runs of the same code, case and seed give the same verdict, byte for byte in machine form.
        [@R8]

    I20  A case's verdict does not depend on which other cases run, their order, or the process split.
        [@R8]

    I21  A case passes only when it passes under every seed; a failure names the first seed that failed.
        [@R8]

    I22  Every seed of every case starts on a fresh world; no state crosses cases or seeds. [@R8]

    I23  The session seeds of one case differ across its pages and its world seeds. [@R8]

    I24  A run gives exactly one verdict per requested case id; an id with none is a failure with its
        reason. [@R9]

    I25  A defect is reported as a defect, never as a stated failure or a pass. [@R9, @R7]

    I26  The runner exits non-zero exactly when a verdict is not a pass or no case ran. [@R9, @R10]

    I27  The machine form decodes with the verdict Schema; the human form ends with exactly one `VERDICT`
        line. [@R9, @R10]

    I28  Falsify passes only when I12, I14, I15, I16 and I18 hold and at least one mutant ran. [@R10]

    I29  For every ported case and every old-suite mutant that applies to round 14 and that the old suite
        kills on that case, the new suite kills the mutant. [@R11]

    I30  Every verdict difference between the two suites on a ported area has a recorded reading. [@R11]

coverage
    @R1
        enforced_by  [@I1, @I2, @I3]
        open_by      [@Q1, @Q4]

    @R2
        enforced_by  [@I2, @I4]
        open_by      [@Q1, @Q3]

    @R3
        enforced_by  [@I5]
        open_by      [@Q1, @Q3]

    @R4
        enforced_by  [@I6, @I7, @I8]
        open_by      [@Q1]

    @R5
        enforced_by  [@I9, @I10, @I11]
        open_by      [@Q1, @Q6]

    @R6
        enforced_by  [@I12, @I13, @I14, @I15, @I16, @I17]
        open_by      [@Q1, @Q5]

    @R7
        enforced_by  [@I18]
        open_by      [@Q2]

    @R8
        enforced_by  [@I19, @I20, @I21, @I22, @I23]
        open_by      [@Q1]

    @R9
        enforced_by  [@I24, @I25, @I26, @I27]
        open_by      [@Q1, @Q2]

    @R10
        enforced_by  [@I26, @I27, @I28]
        open_by      [@Q1]

    @R11
        enforced_by  [@I29, @I30]
        open_by      [@Q7]

tests
    T1  Port boundary. Exists: `nub run check` type-checks `port.ts`, whose types name no adapter. Phase 3 writes this: 
        an import-boundary lint over `scenarios/`, `oracles/`, `dsl/`, `fixtures/`
            and `world/`, seen rejecting a planted import of `adapters/prototype.ts`. [@I1, @I2]
    T2  Settling only. Phase 3 writes this: a static check that only the settle step calls `pending`, seen rejecting a 
        planted read in an oracle. [@I3]
    T3  Cross-adapter parity. Phase 4 writes this: every case on round 14 and on production; each verdict difference is 
        a stated limit naming that case, or a bug. [@I4]
    T4  Adapter testimony. Phase 3 writes this: the audit reads each adapter against its runtime's report types and 
        lists every observation not backed by a runtime report; each is a stated limit or a
            bug. [@I5]
    T5  Oracle purity. Exists: the `Oracle` type (`check: (facts: Facts) => ...`) under `nub run check`. [@I6]
    T6  Anchors. Phase 3 writes this: the audit marks every oracle rule as anchored or consistency-only and checks the 
        guarantee map for an Invariant with consistency-only rules alone. [@I7, @I8]
    T7  Citations resolve. Phase 3 writes this: a check that resolves every scenario's `cites` and every oracle's 
        `guarantee` against `workflow/specs/core/`, seen rejecting a planted "WriteLanes R99".
            [@I9, @I10]
    T8  Expectation provenance. Phase 3 writes this: the audit re-derives each case's expectations from its cited rules 
        and writes its own mutants from the Specs; a value only a run could give is a
            finding. [@I11]
    T9  Every oracle has a mutant. Exists: falsify's first line, "every oracle has a lie" (`runner/main.ts`); 4 
        oracles, 25 mutants. [@I12]
    T10  Case-only mutants. Phase 3 writes this: one mutant per guarantee-map "case" row, run by falsify
            and killed by that case's expectation. [@I13]
    T11  Exactly-once edits. Exists: falsify's "does not apply" verdict (`applyEdit` in
            `runner/falsify.ts`); seen by planting an edit whose text occurs twice. [@I14]
    T12  Control. Exists: falsify's control line, the mutants' cases on the unedited runtime. [@I15]
    T13  Kill by the holding check. Exists: falsify's per-mutant judge (caught, or "red by another
            check"), 25 of 25 caught at `bc8dffba`. [@I16]
    T14  Copy isolation. Exists: each copy is removed when its run ends (`copyRuntime`). Phase 3 writes
            this: falsify compares a hash of the runtime's tree before and after, and lists leftover copies.
            [@I17]
    T15  Null by stated failures. Exists: falsify's null line (every case a `Fail`). Phase 3 writes this:
            it counts only stated failures, and fails today on the 29 `NoHeldRequest` cases. [@I18, @I25]
    T16  Rerun. Phase 3 writes this: `suite --json` twice on one runtime, outputs compared byte for byte
            (done by hand for round 5's parity). [@I19]
    T17  Order and split. Phase 3 writes this: the verdict set of `suite`, `suite --parallel 4` and each
            case run alone with `--only`, compared by case id. [@I20, @I22]
    T18  Seeds. Exists: `runCase` runs seeds 1 and 2 and returns the first failure. Phase 3 writes this:
            a seed-sensitive mutant (store load order) that passes seed 1 and fails seed 2, seen failing
            with "seed 2". [@I21]
    T19  Session seeds. Phase 4 writes this: WriteLanes T18's seed cases with a seed-ignoring mint as the
            mutant (README decision 8). [@I23]
    T20  One verdict per id. Exists: `--only NOPE` gives a failure "no such case"; a child with no
            verdicts gives a failure per id (`sliceVerdicts`). Phase 3 writes this: a runner self-test with
            a killed child. [@I24]
    T21  Exit codes and forms. Exists: `report` in `runner/main.ts`. Phase 3 writes this: runner
            self-tests for one failing case (exit 1), an empty run (exit 1), a decoded `VERDICTS` line and
            one final `VERDICT` line. [@I26, @I27]
    T22  Falsify verdict. Phase 3 writes this: a runner self-test with a planted surviving mutant and a
            planted null pass, each seen giving `VERDICT fail` and exit 1. [@I28]
    T23  Old-suite comparison. Exists by hand: STATUS.md rounds 1 to 3 compare PAY-01 to PAY-20 and each
            mutant against the old suite. Phase 3 writes this: the verdict-compare mode (README work list item
            4), run per ported area. [@I29, @I30]
