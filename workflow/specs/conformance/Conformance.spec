spec Conformance
status        proposed
basis         A guide for the conformance suite's own contract: what a verdict of the suite can be trusted
              for, whichever implementation it runs on. Derived from the suite's purpose (the P3 phase goal, the
              Epic's "test the spec, not the code" constraint, skill:policy-verification) and the decisions
              in the suite's README, not from what the code does today; where the code falls short, the
              gap is an open item here. Revisable whenever building shows it wrong; each change and its
              reason is logged in `workflow/specs/spec-log.md`. Names marked "proposed name" are not
              confirmed. `derives_from` names this Spec's Task because no Plan outcome covers the suite yet:
              @plan.Runtime's verification target is pending a Plan edit the user has not approved, and is
              added here once it is.

              Convergence redesign (2026-11-09, after three check-spec rounds): the contract is built on
              one case model (R14, `model`), with a stated obligation per case kind for the boundary, runs
              and seeds, steps, checks, null, mutants, the time bound and verdict naming. No id was
              renumbered. Added: R14, I40 to I44, Q14, T28. Widened from runtime cases to both kinds, with
              the same id: R1, R2, R3, R6, R7, R8, R9, R10, R11, I2, I5, I12, I16, I18, I21, I22, I32, I35;
              "seed" became "run" where a static case has none.

              Replan (2026-11-11, the user's acceptance of
              code:workflow/plans/flow/references/proposals/replan-2026-11-11.md): composite parts are data
              modules read by the generator, the Spec model, the player and the benchmark replay (R15, R23);
              feature codes, the feature matrix and the combination gate (R16 to R18); the Spec model computes
              expected results, compared with reports (R19); obligations read suite facts only, and the liar
              gate proves it (R20, R21); round-14 is a mutant host for the frozen hand cases (R22). Added: R15
              to R23, I45 to I67, Q15, Q16, T29 to T44. Widened, with the same id: R1, R4, R5, R8, R9, R14, I31.
location      packages/flow-state-v3/conformance
provides      Port, Boot, Runtime, Observation, Oracle, static surfaces, mutants (`Lie` until the rename),
              case verdicts, mutant verdicts, the runner's suite and falsify modes, composite parts, scripts,
              the generator, the Spec model, the feature matrix, the combination gate, the limits list, the
              liar gate and the bench replay
derives_from  [@task.V3.T4, @task.V3.T45, @task.V3.T47]

requirements
    R1  Public behaviour only
        source  README decision 2, "The Port is public behaviour only"
                (code:packages/flow-state-v3/conformance/README.md); README decision 11 (the Runtime's values);
                the P3 goal ("through one Port"); README's static guarantees, "checked by cases over
                `Compiled` and the CLI".
        must    A case reads its subject (R14) only through public behaviour.

                A runtime case drives a runtime only through the Port's public operations (attach or create
                a use of an identity, send, release a use, dispose an actor, dispose the Runtime). It reads
                the runtime only through public results (a snapshot, an operation's public row) and public
                reports in the core Specs' vocabulary. Every data value crossing the Port (payloads, inputs,
                keys, memory, rows, Observation fields) is JSON, or a Schema value whose encoded form is JSON
                (an `Option` field). Besides data, only the world's hosts cross it, as Effect services: a
                Clock over the world's virtual time whose sleeps are world timers, the page's Scheduler, and
                the Host service, whose store wraps the world's held storage answers once as Effects. The
                report sink that `Boot` hands the runtime is the only other function. No lane cell, mint
                counter, frame, wait, replay, storage key spelling or disk encoding crosses it.

                A production adapter reaches its runtime only through the package's public entry and a
                listed seam (advisor Q8 in
                code:workflow/plans/flow/references/proposals/advisor-answers-2026-11-11.md), which a lint
                enforces.

                A static case reads its surface only through the public results its core Spec names:
                `Compiled`, `Diagnostic` and `FlowError` values, the codec's bytes and decoded values, and
                the CLI's stdout, stderr, exit code and the case's own project copy. It reads no compiler,
                codec or CLI internal.

                A boundary addition follows the same rule: it reports a fact by its meaning in the Specs'
                terms, never by an implementation's representation. One exception, in runtime cases: a settling query
                (`pending`) says the runtime has work that no host task shows yet. Only the suite's settle
                step may read it.

    R2  Implementation-independent verdicts
        source  The P3 goal: one suite for the prototype and the production runtime; the Port's contract
                (code:packages/flow-state-v3/conformance/port.ts#Port: scenarios and oracles "see only the"
                Runtime it boots, "never which one runs"); @task.V3.T13 (static cases ported from the
                prototype, run on production from phase 4).
        must    Cases, oracles and the runner never depend on which implementation of a subject is under
                test. Two implementations that show the same behaviour through the case's boundary (R1) get
                the same verdict on every case.

                A difference between adapters that can change a verdict is a stated limit, bounded so:

                - only a prototype adapter has one; a production adapter has none;
                - it is recorded in the README naming the cases and the checks it affects and the
                    implementation behaviour that retires it;
                - it may only skip judging a report or result the implementation does not make. It never
                    makes a check accept a value that contradicts the check's rule, and never moves an
                    expected value away from its cited rule (R5).

                A case or check that does more than skip is a failure of this Requirement, recorded as an
                open item until the suite fixes it.

    R3  Adapters translate, never testify
        source  README decisions 8 and 10 and the stated limit on `Ended.failure` ("the adapter will not
                fill the failure in from the suite's own Answered fact").
        must    An adapter, for a runtime or a static surface, turns its implementation's own reports and
                results into the boundary's values (R1). It never fills a report or result in from the
                suite's facts or the world's state, and never mints an id its implementation should mint.

                A substitute for a fact the implementation cannot report (decision 8: Attempt ids minted
                from the session seed; decision 10: actor attribution) is not a stated limit, since it
                supplies a value rather than skipping a report (R2). It is a failure of this Requirement and
                of R2, recorded as an open item until the implementation reports the fact. A production
                adapter has none.

    R4  Reports anchored to suite facts
        source  README decision 3; the Oracle contract
                (code:packages/flow-state-v3/conformance/dsl/oracle.ts#Oracle).
        must    Every Observation is the runtime's claim. An oracle judges each report against a fact the
                suite owns: what it drove, what its fake world received or answered, or a fixture's
                reference: hand-written for a hand fixture, derived from the machine's `Compiled` for a
                composite part (R15). A check that only compares reports with each other says so in its
                doc comment.

                Oracles exist in runtime cases only (R14). A case expectation, in either kind, is a value
                the suite owns by construction; R5 binds where it comes from.

                Decision (agent, 2026-11-09): a consistency-only check is never the only check of a Spec
                Invariant. Why: a runtime that lies consistently passes every consistency check, so such
                an Invariant would be judged by nothing the suite owns. Reverse: allow consistency-only
                coverage where no suite fact can anchor the report, listed in the README.

    R5  Expected results from cited Spec rules
        source  The Epic's constraint "Test the spec, not the code"; P3's false pass ("agreeing with the old
                suite because it was copied"); @task.V3.T13's false pass ("pins copied from current output").
        must    Every case cites the core Spec Requirements or Invariants its checks come from, every case
                expectation cites the rules it checks, and every oracle names the Spec Invariants it judges.
                Each citation resolves to an entry of a core Spec.

                Every expected value, in a case expectation or a fixture's reference, equals the value its
                cited rule gives for the fixture's source. It is derived from the rule and that source
                without running any implementation. Output recorded from an implementation is never an
                expected result; it serves only as a change detector, labelled as one. An expectation
                carried over from the old suite counts only when its cited rule gives the same value.

                The Spec model (R19) is suite code written from the Specs, not an implementation: a value it
                computes from a script and the fixture's source is derived from the rule and that source.

    R6  Every check has a mutant it kills
        source  skill:policy-verification#prove; README decision 5; the P3 gate "falsify, which rejects the
                null runtime and every registered mutant".
        must    A check is a judge paired with one Spec Invariant it judges:

                - an (oracle, Invariant) pair: an oracle together with one Invariant it names (runtime cases
                    only);
                - a (case expectations, Invariant) pair for a case-only Invariant, one whose only judge is
                    the case expectations that cite it (the guarantee map's "case" rows; every static
                    Invariant is one).

                A check catches a run (R8) only by a failure that names its judge and its Invariant (R9):
                an oracle's violation naming that Invariant, or a failed expectation citing it.

                Every check has at least one mutant for each implementation under test of its subject kind,
                null excepted: a reapplicable edit to that implementation's source that makes the mistake
                the check exists to catch.

                Decision (agent, 2026-11-09): mutants are accounted per (judge, Invariant) pair, not per
                oracle. Why: an oracle that judges several Invariants can keep one no mutant reaches, and
                falsify would still pass; violations already name their Invariant, so the pair is
                observable. Isolating each rule inside one Invariant stays an audit item. Reverse: count
                per oracle and leave per-Invariant coverage to the audit.
                Falsify kills a mutant only when all of these hold: each of its edits applies exactly once
                to a fresh copy of the code under test; its cases pass on the unedited code (the control);
                and, in at least one run of one of its cases, the check that holds it is among the checks
                that failed that run. Every failing run is judged, not only one. A mutant's verdict is one
                of: caught, red by another check, survived, not applied, no verdict. Every verdict but
                caught fails falsify.

    R7  The null implementation fails every case
        source  README decision 5 and `nullPort` ("a case that passes here proves nothing"); the P3 gate.
        must    Each subject kind has a null implementation that does nothing. The null runtime boots,
                accepts every call, reports nothing and shows no actor. A null static surface accepts every
                call and returns the least result its public type allows: an empty `Compiled`, no
                diagnostic, a codec that encodes to no bytes and rejects every input, a CLI that writes
                nothing and exits 0. Every case, of either kind, fails on its kind's null implementation by
                a stated failure (R9).

                Decision (agent, 2026-11-09): a defect (R9) does not count as the case failing on null.
                Why: such a case never reached a check, so it proves nothing about the null
                implementation; many cases fail on null today only by `NoHeldRequest`, which `dsl/case.ts`
                calls "a scenario bug, never a verdict". Reverse: count any failure.
                Decision (agent, 2026-11-09): static cases have a null implementation too. Why: a static
                case whose expectations are all absences (no diagnostic, no finding, a rejected input)
                passes on a surface that does nothing, and mutants catch that only if someone writes the
                right one. Under R7 such a case, passing on null, fails falsify's null line, so every static case 
                carries at
                least one expectation that a do-nothing surface fails; one rule for both kinds keeps the null
                line unscoped. Reverse: null judges runtime cases only, a static case's mutants are its only
                proof of strength, and R10's null line counts runtime cases only.

    R8  Deterministic from a seed
        source  README decisions 8 and 9; skill:policy-verification#build ("control clocks, seeds and
                ordering").
        must    A case's verdict is a function of the suite's code, the implementation's code, the case and
                its seeds only. Apart from the time bound below, the suite reads no wall clock, randomness or host 
                state: a runtime case owns
                its world's clock, page, storage and network; a static case owns its fixture's project copy.

                A case runs as one or more runs, each from fresh state, and passes only when every run
                passes:

                - a runtime case runs under at least two fixed world seeds, chosen so that they change load
                    order and session seeds, each on a fresh world. Each boot gets a session seed derived from
                    the world seed, distinct per page;
                - a static case that generates inputs runs under one or more fixed input seeds; a static
                    case over a fixed input has one run. Each run gets a fresh copy of its fixture's project.
                - a generated run is a function of its script, and the script a function of its part or app
                    mix, its profile and one integer seed, which fixes the generator, the world seed and the
                    session seeds.

                Every case runs under a time bound of its own, in every runner mode, in process or split.
                The bound is the one wall-clock read: a case that overruns it gets a defect (R9), never a
                stated failure, and no other case's verdict changes. Within the bound, running a case alone,
                with others, in another order or split over processes gives the same verdict.

    R9  Case verdicts
        source  The runner's role as a gate (the P3 gates; `nub run verify` in the exit criteria).
        must    A run of the runner gives exactly one verdict per requested case, of three kinds:

                - a pass;
                - a stated failure, which names, for each failing run, the run's seed (none for a
                    fixed-input static case) and each check that failed in it: the judge (an oracle, or the
                    expectation's label), the Invariant or rule it judges, the reason in the rule's words,
                    and, in a runtime case, the step at which it failed;
                - a defect: the case reached no check. A thrown scenario bug, an unsettled world, an
                    implementation that throws, a child process that died, a case over its time bound, or an
                    unknown case id is a defect with its reason.

                No requested case is absent from the verdicts, and none without a check's pass is a pass.

                The machine form is one line, `VERDICTS ` followed by the JSON array, written and decoded
                by one Schema codec; each item a stated failure names is a field of it, not only text. The
                human form is one line per case and a final `VERDICT pass|fail <passed>/<total>`. A runner
                run with any non-pass verdict, or with no case, exits non-zero.

                Decision (agent, 2026-11-09): a defect is its own verdict kind (`Defect`, proposed name),
                apart from a stated failure, and covers wall-clock overruns as well as thrown defects. Why:
                R7 and a reader must tell them apart, and an overrun depends on the machine, so calling it
                a stated failure would contradict R8. Reverse: keep two kinds and mark defects in the reason
                text.

    R10  Falsify verdicts
        source  README "How to run"; skill:policy-verification#maintain ("a gate that stays green on either
                is not a gate").
        must    Falsify reports, in order: whether every check (R6) has a mutant for each implementation under
                test; the null result, every case on its kind's null implementation; the control; then one
                line per mutant with its R6 verdict, and for a caught mutant the case, the run and the
                reason. It ends with one `VERDICT pass|fail` line counting the mutants caught.

                It passes only when every check has its mutants, every case fails on null by R7, the control
                is green, every mutant is caught, nothing outside a mutant's copy changed (R13), and at least
                one mutant ran; otherwise it exits non-zero.

    R11  The old-suite comparison
        source  P3's exit criterion "it kills every mutant the old suite kills" and its false pass.
        must    For each ported area, runtime or static, the suite's verdicts are compared with the old
                suite's (`prototypes/conformance/` and the prototype's static checks) on the same cases and
                the same mutants, on the implementation the old suite runs on. Every mutant of that
                implementation the old suite kills on a ported case, the new suite kills.

                Every difference is recorded with its reading: an old-suite weakness, a new-suite bug, or a
                case not ported, with why. An area with an unfixed new-suite bug does not count as ported.
                Agreement is evidence only where the new expectation comes from its cited rule (R5). The
                comparison retires with the old suite, and its record says so.

    R12  The suite judges the core Specs
        source  The P3 goal "one oracle per guarantee with its mutants"; each P3 area Task's acceptance
                "Every WriteLanes Invariant has its oracle or case" (and the same for Turn, Actors,
                WriteAhead, Restore and Reads); @task.V3.T13's "Every Compile, Diagnostics, Codec and
                StaticCli Invariant has a case"; README's "or a static check".
        must    For each core Spec in the suite's scope (@spec.WriteLanes, @spec.Turn, @spec.Actors,
                @spec.WriteAhead, @spec.Restore, @spec.Reads, @spec.Compile, @spec.Diagnostics,
                @spec.Codec, @spec.StaticCli), every Invariant has a check (R6): an (oracle, Invariant)
                pair, or case expectations, runtime or static, that cite it.

                The guarantee map lists every Invariant of those Specs. An Invariant that no case of either
                kind can judge is listed with why; it counts as uncovered and is an open item for the user's
                read, never as covered.

    R13  Mutants stay in their copy
        source  skill:policy-verification#prove (a mutant is an edit to the code under test); R6.
        must    A mutant's edits change files only inside its own copy of the code under test. Nothing
                outside the copy changes during or after falsify: not the original tree, not the suite, not
                any file the copy links to. When falsify ends, no copy remains.

    R14  Two case kinds, one contract
        source  The P3 goal (a runtime "through one Port"); @task.V3.T13 (cases "over `Compiled` and the
                CLI"); README's static guarantees ("not by per-step oracles"); the six guarantees of
                @task.V3.T4, which name no kind and so bind every case.
        must    Every case is of exactly one kind, fixed by its subject:

                - a runtime case: its subject is a runtime, booted through the Port over a fake world;
                - a static case: its subject is a static surface (the compiler, Diagnostics, the codec or
                    the CLI), read through its public API over a fixture's source.

                Every other Requirement binds both kinds. Where an obligation differs by kind, it differs
                only as this table states:

                | Obligation      | Runtime case                              | Static case                            |
                | --------------- | ----------------------------------------- | -------------------------------------- |
                | Boundary (R1)   | the Port                                  | the surface's public results           |
                | Implementations | prototype, production, null runtime       | prototype, production, null surface    |
                | Runs (R8)       | per world seed, at least two; fresh world | per input seed or one; fresh project   |
                | Locus (R9)      | seed and step                             | seed, if any; no step                  |
                | Judges (R6)     | oracles, case expectations                | case expectations                      |
                | Null (R7)       | null runtime: stated failure              | null surface: stated failure           |
                | Mutants (R6)    | each runtime under test                   | each surface implementation under test |
                | Time bound (R8) | own, every runner mode                    | own, every runner mode                 |

                A runtime case is a hand case (a scenario module) or a generated run, the replay of a script
                (R15).

                A runtime case's steps are its numbered `Stepped` entries; each check it makes happens at
                one: an oracle at the step it judges, an expectation at the last step taken before the
                expectation is checked.

    R15  Fixtures are data modules
        source  The replan (code:workflow/plans/flow/references/proposals/replan-2026-11-11.md, "How the change
                flows" and its questions 1, 5 and 6, accepted 2026-11-11); the fixture catalogue's "One fixture
                module" (code:workflow/plans/flow/references/proposals/fixture-catalogue-2026-11-11.md); @task.V3.T47.
        must    A composite part is one module: a machine written in the production public API, a user model
                (per leaf state, weighted next actions with think times) and a server model (an answer per
                operation). Its reference (events, states, handlers, rows) is derived from the machine's
                `Compiled`, never written by hand. A part describes no faults: the usual, stress and app-mix
                profiles are suite-wide. Composite parts run on production and the Spec model only, and no
                part is authored twice.

                One part module and one script have four readers: the generator emits the script as JSON
                from (part or app mix, profile, seed); the Spec model computes the run's expected results
                from it (R19); the player replays it on a runtime through the Port, under oracles; the bench
                replays it with no observer and no oracles (R23). A script decodes with one Schema and
                replays with no generator. A failure the generator finds shrinks to a kept regression script
                that every later suite run replays.

                Hand cases freeze: a hand case is added only to document a ruling, which it cites. The 99
                hand cases are named examples and the Spec model's tests.

    R16  Feature codes
        source  The replan ("No fixture tests a missing feature becomes a check"); the fixture catalogue's
                feature codes and its "Feature pairs" section.
        must    Each command a part offers the generator declares the feature codes it exercises, and each
                runtime adapter declares the codes its implementation builds. Every declared code is in the
                catalogue's closed code list. A code is enabled for a runtime only when its adapter declares
                it; the generator draws only commands whose every code the runtime under test declares.

                An adapter declares a code only once its implementation builds it: declaring a code is a
                claim under R3, never a switch to make a gate pass, and a slice's first-contact reds are
                classified before its codes are declared.

    R17  The feature matrix gate
        source  The replan, part 3 (T47 "owns the matrix") and its question 4.
        must    The matrix has one row per Plan feature, with its fixture kind (a composite part, a static
                case, a hand case, an example-app check or a package check) and the fixtures that reach it.
                The reach comes from the declarations (R16) and from what the reach recorder saw executed,
                not from a part's list of codes.

                The gate passes only when:

                - a feature no runtime under test implements yet reads "owed by slice N", naming an open
                    Task of that slice;
                - every feature a runtime under test declares is reached by at least one fixture, and one
                    that no fixture reaches is a failure;
                - no part claims a code no runtime under test declares.

    R18  The combination gate
        source  The user's decision (V3 log, 2026-11-11: "pairs enforced, triples reported"); the replan's
                question 12; the fixture catalogue's sections "Feature pairs: which interact", "The
                technique" and "The app-mix profile".
        must    The interacting pairs are generated from the catalogue's channel table: two codes interact
                when both touch one channel, less the non-interacting rules the user approves once, as one
                list. No pair is hand-listed.

                The gate passes only when every interacting pair of codes the runtime under test declares
                is reached together in the executed steps of some generated run: within one composite, or in
                the app mix when one of the two is a shared-resource code. A pair with a code owned by a
                later slice is waived with that slice and a date; no interacting pair is waived for any
                other reason. Triples whose three pairs all interact are reported, per composite and in
                total, and never fail the gate.

    R19  The Spec model computes expected results
        source  Advisor Q1, Q2 and Q3 (code:workflow/plans/flow/references/proposals/advisor-answers-2026-11-11.md);
                @task.V3.T45; the replan's slice template ("Model", "Proof before production").
        must    A generated run's expected results come from the Spec model: suite code written from the
                core Specs' tables that reads the script and the suite's facts and computes, per step, the
                reports and world requests owed and those allowed. It imports nothing from any runtime,
                adapter or implementation's source. It stays a judge, not a second runtime: it performs
                nothing, holds payloads and memory as opaque values with no codec, answers with a set of
                allowed outcomes where a Spec leaves a choice, has no performance structure, and traces
                every field to a Spec table cell; a field no model mutation kills is deleted.

                One generic compare judges a run: each report matches an owed or allowed item or is refused,
                and an owed item still unmatched at its step's end is refused. A refusal names the Invariant
                of the cell that produced the item. Every disagreement between the model and a hand case's
                expectation is a Spec question, settled before either changes.

                A part proves a cell only if a model mutation that changes that cell changes the part's
                expected trace; a slice's parts are proved this way before its production half starts.

    R20  Obligations read suite facts only
        source  Advisor Q1, part 1 and 2; T44's acceptance (the expect and compare split).
        must    What a runtime owes (an obligation created, discharged or voided) is computed from suite
                facts only: what the suite drove, what its world saw and answered, and a fixture's source
                and reference. A report is never an input to an obligation; it is only compared (R19). The
                modules that compute expectations import no Observation type, which a lint enforces.

                Every choice a fixture makes is computable by the suite: a guard in a conformance fixture is
                a function of what the suite knows. A fixture whose choice only a report can settle is a
                fixture bug, not a stated limit.

    R21  The liar gate
        source  Advisor Q1, part 3 (`falsify --liar`).
        must    Falsify's liar mode runs each behavioural mutant with its own reports discarded and the
                unchanged runtime's recorded reports for the same run fed in their place. The gate passes
                only when every behavioural mutant is still caught.

                A mutant that turns green under it was caught only by its confession. Each such mutant is
                fixed by a world fact (the fake server's log, the store, a snapshot or row read) or recorded
                as report truth only, with why. Report-only mutants test a truthful trace, a separate
                property, and are counted apart.

    R22  Round-14 is a mutant host
        source  The replan's question 1 and advisor Q3 (a verified limits list).
        must    Round-14 runs only the frozen hand cases, as the host of their mutants; no composite part
                runs on it. The runner's default runtime is production.

                Round-14's limits are rows of one list, each naming a case, a check and the Invariant
                round-14 breaks there. A run verifies every row: the row's case fails on round-14 by that
                Invariant, and a row whose case passes, or fails by another Invariant, fails the gate. A
                limited case counts neither as a pass nor as a mutant's control on round-14. Prose limits
                do not count.

    R23  The bench replay
        source  The fixture catalogue's section 6, "Benchmark reuse" (skill:check-benchmark, "compare the
                work done"); the replan's slice template, step 6.
        must    A conformance replay of a script records a work fingerprint from facts it already records:
                turns, publications, commits invoked by operation, requests by operation, batches landed and
                bytes written. The bench replays the same script on production with no observer and no
                oracles and fails when its fingerprint differs, so a benchmark never times less work than
                the run the suite judged. Benchmarks run alone, never beside other suites.

open
    Q1  Most checks below are not built: each test says whether it exists or "phase 3 writes this".
        outcome  Phase 3 builds them before the audit; a planned test is not evidence.

    Q2  R7 does not hold today: 29 of 61 runtime cases fail on null only by a thrown `NoHeldRequest`, and the verdict 
        format cannot tell a defect from a stated failure (R9).
        outcome  Phase 3 adds the defect verdict and makes each such case check a public result before it
                 answers a request the runtime should have made.

    Q3  Failure of R2 and R3: the prototype adapter substitutes facts its runtime does not report, actors attributed to 
        the next turn (decision 10) and Attempt ids minted from the session seed (decision 8). Its other stated
        limits, `Ended.failure` judged only when reported and `Minted.key` always `None`, are skips R2 allows on a
        prototype.
        outcome  The production adapter in phase 4 reports each fact from its runtime; every check is made
                 strict then.

    Q4  The planned disk reader (`Port.disk`, README "Planned Port changes") reads the runtime's own format, which R1 
        allows only if it reports facts by meaning.
        outcome  Its shape is checked against R1 when it is built.

    Q5  Falsify does not yet follow R6 in full: a kill is judged on the first failing run of each case only, and the 
        runtime cases' case-only Invariants (WriteLanes I4, I5, I18) have no mutants. Decision (agent, 2026-11-10):
        each mutant names the Invariant it breaks (`expects`), and falsify counts it caught only by a violation of its
        oracle that names that Invariant, so kills are per (oracle, Invariant) pair. Why: the orchestrator's design
        call on the T6 review (L2). Reverse: drop `expects` and judge by the oracle alone. Decision (agent,
        2026-11-11): a mutant held by case expectations names the judge
        code:packages/flow-state-v3/conformance/runner/falsify.ts#CASE_EXPECTATIONS and is caught only by a failed
        expectation that cites the Invariant it expects, carried as the verdict's `cites`; the static cases' mutants
        are judged this way. Why: a static case has no oracle (R14's Judges row), and the label alone would let any
        failure count. Reverse: judge case-held mutants by any red case, as before T13.
        outcome  Phase 3 adds mutants for the runtime cases' case-only Invariants and judges every failing run.

    Q6  The ported cases' expectations were written by the builder from the old suite's cases, while the Epic asks for 
        expectations written by someone other than the builder.
        outcome  The four-angle audit re-derives the expectations from their cited rules and writes its
                 own mutants from the Specs (P3's "caught by").

    Q7  The old-suite comparison is done by hand in STATUS.md.
        outcome  Phase 3 writes the verdict-compare mode (README work list item 4).

    Q8  Failure of R2: the `ending-channels` oracle accepts any value when a report is absent (`onNone: () => true`, 
        code:packages/flow-state-v3/conformance/write-lanes/ending-channels.ts#onNone), which can accept a value that
        contradicts its rule rather than only skipping a report the runtime does not make. The `lane-queue` half
        (a Held head's re-send accepted after any driven turn) is closed: since convergence step 4 a re-send needs
        an anchored retry member of the lane's reference rows, and the old `lane-model.ts` is deleted.
        outcome  A later Task narrows the `ending-channels` branch to a skip that a stated limit names, or a strict
                 check.

    Q9  Failure of R2 and R5 (I36, I41): the idle-row limit (README, "Round-14 has no idle row") makes cases expect 
        `None` for a key with no lane, where Reads R14 gives the idle row. The limit changes an expected value away
        from its cited rule instead of skipping a report.
        outcome  A later Task makes those expectations follow Reads R14 and skips the read on the prototype
                 under a stated limit naming the cases.

    Q10  Failure of R4 (I8): WriteLanes I9 is judged only by `lane-queue`' consistency-only rule (it compares
        reports with each other), and no case cites WriteLanes I9.
        outcome  A later Task anchors WriteLanes I9 to a suite fact or adds a case that checks it.

    Q11  Failure of R9 (I32, I43) and R13 (I33).

        - Verdicts: a failure's text names the seed, a violation's step and a mismatch's label, but only the first
            failing run is kept (code:packages/flow-state-v3/conformance/runner/run.ts#runCase); a mismatch names no
            step; and a violation's rule appears only in its prose, one violation per oracle. A failed expectation's
            cited Invariant is a field of `CaseVerdict` (`cites`); the seed, step and violation are still text in
            `why`.
        - Containment: a mutant's copy holds the runtime and the prototype's `conformance/` tree as copied source
            files, but links the repository's `node_modules`
            (code:packages/flow-state-v3/conformance/runner/falsify.ts#copyRuntime), and
            code:packages/flow-state-v3/conformance/runner/falsify.ts#applyEdit joins an edit's file to the copy
            without checking that the path stays inside it, so an edit through that link or a `..` path changes files
            outside the copy.
        outcome  A later Task adds the remaining verdict fields, keeps every failing run, seals the linked
                 `node_modules` and rejects an edit path outside the copy.

    Q12  Failure of R8 and R9 (I20, I24, I34): a runtime case runs under its own bound
        (code:packages/flow-state-v3/conformance/runner/run.ts#CASE_SECONDS, over all its seeds) and an overrun is the
        defect verdict `Timeout`, which names no oracle and cites nothing, so it never catches a mutant. The world asks
        the bound at every settled task, timer firing and request
        (code:packages/flow-state-v3/conformance/world/world.ts#makeWorld), so a runtime that spins without touching
        its hosts is still stopped only by its child process's bound. Static cases
        (code:packages/flow-state-v3/conformance/runner/run.ts#runStatics) run with no bound of their own beyond their 
            CLI
        child's; the split path bounds a whole slice
        (code:packages/flow-state-v3/conformance/runner/main.ts#sliceVerdicts), so an overrun there fails every case of
        that slice with one reason.
        outcome  Phase 3 bounds each static case on its own, and the split path keeps the verdicts its child stated
                 before an overrun.

    Q13  Failure of R12 (I38): the guarantee map marks Reads I1 to I5, I18 and I19 as "case", yet no scenario cites
        any Reads rule; and its rows for oracles not yet built have no check at all.
        outcome  P3's area Tasks (@task.V3.T12 for Reads, and each area's Task for its pending oracle rows)
                 build the checks; until then those Invariants count as uncovered.

    Q14  Failure of R12 (I37, I38) for static cases: of the 45 static Invariants (Compile 17, Diagnostics 10,
        Codec 6, StaticCli 12), round-14 can make results for 21, and 24 are owed rows in
        code:packages/flow-state-v3/conformance/not-yet.ts. The static surface (prototype and null), the case
        modules for Compile and StaticCli and their mutants exist; StaticCli I2 is judged by the `graph-names`
        oracle on the runtime cases and by `CLI-09` (the graph's edges equal the Compiled's places). A check that
        judges only part of an Invariant has a remainder row naming the rest and its owning Task. Decision (agent, 
            2026-11-11): each
        owed static Invariant belongs to the P4 Task that builds its surface (Compile and Diagnostics to
        @task.V3.T17, Codec to @task.V3.T20, StaticCli I3, I10 and I11 to @task.V3.T22) and is case-covered before
        that Task closes. Why: round-14 has no surface that makes those results, so no case can tell a right
        compiler from a wrong one on it. Reverse: keep the rows under @task.V3.T13.
        outcome  Each owning Task adds its cases and mutants; until then those Invariants count as uncovered.

    Q15  R15 to R23 are not built: no part module, generator, script player, reach recorder, feature matrix,
        combination gate, liar mode, limits list or bench exists, and obligations still read reports in
        `dsl/lifecycle-step.ts`, `dsl/lifecycle-owed.ts` and `turn/selection.ts`.
        outcome  Slice R builds them: @task.V3.T45 the expect and compare split, the generators, the liar mode and
                 the limits list; @task.V3.T47 parts, scripts, the player, declarations, the matrix, the
                 combination gate and the bench; @task.V3.T51 the production adapter's seam lint.

    Q16  The non-interacting rules (R18) are the catalogue's six, which a script cannot rebuild exactly (777
        interacting pairs in the catalogue, 671 in the replan's reading).
        outcome  @task.V3.T47 generates the list from the channel table, and the user approves the rules once, as
                 one list.

model
    Subject = what a case reads: a runtime (runtime case) or a static surface, the compiler, Diagnostics, the codec
        or the CLI (static case) (R14).

    Implementation = one build of a subject kind: prototype, production or null. "Under test" means every one but
        null (R2, R6, R7).

    RuntimeCase = a case whose subject is a runtime booted through the Port over a fake world (R14).

    StaticCase = a case whose subject is a static surface read through its public results; it boots no runtime and
        has no world and no step (R14).

    Run = one execution of a case from fresh state: per world seed for a runtime case, per input seed for a
        generated static case, or the one run of a fixed-input static case (R8).

    Step = a numbered `Stepped` entry of a runtime case's run; every check in a runtime case happens at one (R14).

    Check = a judge paired with one Spec Invariant: (oracle, Invariant) or (case expectations, Invariant) (R6).

    CaseOnlyInvariant = a Spec Invariant in scope (R12) whose only judge is the case expectations citing it.

    CaseExpectation = a labelled value a case expects, citing the rules it checks (R5, R9); `Mismatch` when it fails.

    GuaranteeMap = the README's section "Guarantee map": each in-scope Spec Invariant with its check (R12).

    Control = the mutants' cases run on the unedited code under test (R6).

    SessionSeed = the seed `Boot` hands a runtime, derived from the world seed, distinct per page and world seed (R8).

    StatedFailure = a case failed by an oracle violation (`Violated`) or a case expectation (`Mismatch`) in at least
        one run.

    Defect = a case that reached no check: a thrown scenario bug, an unsettled world, an implementation that throws,
        a dead child, a time-bound overrun, an unknown case id (R9).

    StatedLimit = a recorded, prototype-only difference between adapters that skips judging a report or result the
        implementation does not make (R2).

    Mutant = a named, reapplicable edit to one implementation under test with the cases it runs on, held by one
        check (`Lie` until the rename, @task.V3.T5).

    SuiteFact = a timeline entry the suite wrote itself (`Stepped`, `Drove`, `Requested`, `Answered`, `Reloaded` and
        the rest), the server's log, a script, a fixture's source or its reference; never a report (R20).

    Verdict = per case: pass, stated failure or defect (R9); per mutant: caught, red by another check, survived,
        not applied, no verdict (R6).

    Part = a composite part's module: a machine in the production public API, a user model and a server model;
        its reference is derived from the machine's `Compiled` (R15).

    Composite = a dense application built from parts (the catalogue's A to I); the app mix runs several in one
        runtime, sharing storage, network, clock, reload and disposal (R15, R18).

    Profile = usual, stress or app mix: suite-wide command weights and faults; a part names none (R15).

    Script = the JSON step list the generator emits for (part or app mix, profile, seed); decoded with one
        Schema (R15).

    HandCase = a scenario module written by hand; frozen except to document a ruling (R15).

    FeatureCode = one of the catalogue's closed feature codes; declared by a part's commands and by a runtime
        adapter (R16).

    MatrixRow = a Plan feature with its fixture kind and either the fixtures that reach it or "owed by slice N"
        (R17).

    InteractingPair = two codes that touch one channel of the catalogue's channel table and fall under no
        approved non-interacting rule (R18).

    SpecModel = suite code written from the core Specs' tables that computes, per step, what a run owes and
        allows (R19).

    Expected = per step, the owed and the allowed reports and world requests the SpecModel computes (R19).

    LiarRun = a behavioural mutant's run with the unchanged runtime's recorded reports fed in place of its own
        (R21).

    Limit = a row of round-14's limits list: a case, a check and the Invariant round-14 breaks there (R22).

    WorkFingerprint = a replay's turns, publications, commits invoked by operation, requests by operation,
        batches landed and bytes written (R23).

invariants
    I1  Every Port operation, result and Observation tag is a public operation, public result or report named in a core 
        Spec; none names a runtime's module, type or storage layout. [@R1]

    I2  No module under `scenarios/`, `oracles/`, `dsl/`, `fixtures/` or `world/` imports an adapter or any 
        implementation's source (a runtime, compiler, codec or CLI). [@R1, @R2]

    I3  Only the settle step reads `pending`; no oracle, case or expectation does. [@R1]

    I4  For one behaviour shown through the Port, every case's verdict is the same whichever adapter shows it, except 
        where a stated limit names the case. [@R2]

    I5  Every Observation or static result an adapter reports stands for a report or result its implementation made; 
        none is derived from a suite fact or the world's state, and no id in one was minted by the adapter. [@R3]

    I6  An oracle's result is a function of the case's facts only (its timeline, the server's log and the fixtures' 
        references). [@R4]

    I7  Every oracle rule that judges a report reads at least one suite fact, or its doc comment says it is 
        consistency-only. [@R4]

    I8  No Spec Invariant in the guarantee map is judged only by consistency-only rules. [@R4]

    I9  Every case cites at least one core Spec Requirement or Invariant, and each citation resolves. [@R5]

    I10  Every oracle names the Spec Invariants it judges, and each name resolves. [@R5]

    I11  No expected value in a case or a fixture reference was copied from an implementation's output; a recorded
        output used as a change detector is labelled as one. [@R5]

    I12  Every check has at least one mutant for each implementation under test of its subject kind, null excepted.
        [@R6, @R14]

    I13  Every case-only Invariant has at least one mutant whose cases fail with an expectation citing that
        Invariant. [@R6]

    I14  Every edit of every mutant occurs exactly once in its file of a fresh copy of the code under test. [@R6]

    I15  Every mutant's cases pass on the unedited code. [@R6]

    I16  Every mutant turns at least one of its cases red in at least one run, with its holding check among the
        checks that failed that run; every failing run is judged. [@R6]

    I17  After falsify, the code under test's own tree is unchanged and no copy remains in the scratch folder.
        [@R13]

    I18  On its kind's null implementation, every case, runtime or static, gets a stated failure, never a pass or a
        defect. [@R7, @R14]

    I19  Two runner runs of the same code, case and seeds that finish within the time bound give the same verdict,
        byte for byte in machine form. [@R8]

    I20  For runner runs in which every case finishes within its time bound, a case's verdict does not depend on
        which other cases run, their order, or the process split. [@R8]

    I21  A case passes only when every one of its runs passes; a stated failure names each failing run. [@R8, @R9]

    I22  Every run starts on fresh state, a fresh world for a runtime case and a fresh project copy for a static
        case; no state crosses cases or runs. [@R8, @R14]

    I23  The session seeds of one runtime case differ across its pages and across its world seeds. [@R8]

    I24  A runner run gives exactly one verdict per requested case id; an id with none is a defect with its reason.
        [@R9]

    I25  A defect is reported as a defect, never as a stated failure or a pass. [@R9, @R7]

    I26  The runner exits non-zero exactly when a verdict is not a pass or no case ran. [@R9, @R10]

    I27  The machine form decodes with the verdict Schema; the human form ends with exactly one `VERDICT`
        line. [@R9, @R10]

    I28  Falsify passes only when I12, I13, I14, I15, I16, I17, I18 and I33 hold and at least one mutant ran. [@R10]

    I29  For every ported case and every old-suite mutant that applies to the old suite's implementation and that
        the old suite kills on that case, the new suite kills the mutant. [@R11]

    I30  Every verdict difference between the two suites on a ported area has a recorded reading. [@R11]

    I31  Every data value crossing the Port is JSON or a Schema value whose encoded form is JSON; the only functions
        crossing it are the world's hosts, as Effect services, and the report sink `Boot` hands over. [@R1]

    I32  Every stated failure names, for each failing run, the run's seed (none for a fixed-input static case) and
        each check that failed in it: its judge (an oracle, or an expectation's label), the Invariant or rule it
        judges, and the reason; in a runtime case also the step at which it failed. [@R9, @R6, @R14]

    I33  No file outside a mutant's copy changes during or after its run, including files the copy links to.
        [@R13]

    I34  Every case runs under its own time bound in every runner mode; a case that overruns it gets a defect
        verdict, never a stated failure or a pass, and no other case's verdict changes. [@R8, @R9]

    I35  A production adapter, runtime or static, has no stated limit and no substitute: it supplies no value its
        implementation did not report. [@R2, @R3]

    I36  Every stated limit names its cases, its checks and the behaviour that retires it, and only skips judging a
        report or result the implementation does not make: no check accepts a value its rule contradicts, and no
        expected value differs from its cited rule. [@R2]

    I37  The guarantee map lists every Invariant of each core Spec in scope, each resolving against
        `workflow/specs/core/`. [@R12]

    I38  Every Invariant in the guarantee map has a check (R6), or is listed as judgeable by no case of either kind,
        with why, and counted as uncovered. [@R12]

    I39  No ported area is counted as ported while a difference read as a new-suite bug is unfixed. [@R11]

    I40  Every case expectation, runtime or static, cites at least one core Spec Requirement or Invariant, and each
        citation resolves. [@R5, @R9]

    I41  Every expected value in a case expectation or a fixture's reference equals the value its cited rule gives
        for the fixture's source. [@R5]

    I42  A static case reads its surface only through the public results its core Spec names; no static case or
        adapter output carries a compiler, codec or CLI internal. [@R1, @R14]

    I43  Every item I32 names is a field of the machine form's stated failure, decoded by its Schema, not only
        text. [@R9]

    I44  Every case is exactly one kind, runtime or static; a static case boots no runtime and has no step, and a
        runtime case is read only through the Port. [@R14]

    I45  A production adapter imports from its runtime only the package's public entry and the modules on the
        listed seam. [@R1]

    I46  Every composite part's reference is derived from its machine's `Compiled`; no part holds a hand-written
        handler table or row. [@R15]

    I47  Every script decodes with the script Schema, and replaying it needs no generator: the player, the Spec
        model and the bench each reproduce the run from the part modules and the script alone. [@R15]

    I48  No composite part runs on round-14, and no composite is authored a second time for another runtime.
        [@R15, @R22]

    I49  Every failure the generator finds is kept as a regression script that every later suite run replays.
        [@R15]

    I50  Every hand case added after 2026-11-11 cites the ruling it documents. [@R15]

    I51  Every code a part's command or a runtime adapter declares is in the catalogue's closed code list. [@R16]

    I52  The generator draws no command with a code the runtime under test does not declare. [@R16]

    I53  Every Plan feature has a matrix row with its fixture kind and either the fixtures that reach it or "owed by
        slice N" naming an open Task of that slice. [@R17]

    I54  Every code a runtime under test declares is reached by at least one fixture. [@R17]

    I55  No part claims a code that no runtime under test declares. [@R17]

    I56  The interacting pairs equal the pairs the channel table gives less the approved non-interacting rules.
        [@R18]

    I57  Every interacting pair of codes the runtime under test declares is reached together in the executed steps
        of some generated run, or carries a dated waiver naming the later slice that owns one of its codes. [@R18]

    I58  The combination gate's verdict depends on pairs only; triples are reported per composite and in total.
        [@R18]

    I59  The Spec model imports nothing from any runtime, adapter or implementation's source. [@R19]

    I60  At every step of a generated run, every report matches an item the Spec model owes or allows, and every
        owed item is matched by the step's end; each refusal names the Invariant of the cell that produced the
        item. [@R19]

    I61  Every Spec model field is changed by at least one model mutation that changes some part's expected
        trace. [@R19]

    I62  No module that computes an expectation imports an Observation type, so no report creates, discharges or
        voids an obligation. [@R20]

    I63  Under the liar mode every behavioural mutant is caught, or is listed as report truth only with why.
        [@R21]

    I64  Every limits row's case fails on round-14 by the row's Invariant in a verifying run. [@R22]

    I65  With no runtime named, the runner runs production. [@R22]

    I66  A limited case counts neither as a pass nor as a mutant's control on round-14. [@R22]

    I67  A bench replay of a script has the same work fingerprint as the conformance replay of that script.
        [@R23]

coverage
    @R1
        enforced_by  [@I1, @I2, @I3, @I31, @I42, @I45]
        open_by      [@Q1, @Q4, @Q14]

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
        enforced_by  [@I9, @I10, @I11, @I40, @I41]
        open_by      [@Q1, @Q6, @Q9]

    @R6
        enforced_by  [@I12, @I13, @I14, @I15, @I16, @I32]
        open_by      [@Q1, @Q5, @Q11]

    @R7
        enforced_by  [@I18, @I25]
        open_by      [@Q1, @Q2, @Q14]

    @R8
        enforced_by  [@I19, @I20, @I21, @I22, @I23, @I34]
        open_by      [@Q1, @Q12]

    @R9
        enforced_by  [@I21, @I24, @I25, @I26, @I27, @I32, @I34, @I40, @I43]
        open_by      [@Q1, @Q2, @Q11, @Q12]

    @R10
        enforced_by  [@I26, @I27, @I28]
        open_by      [@Q1, @Q5, @Q11]

    @R11
        enforced_by  [@I29, @I30, @I39]
        open_by      [@Q7]

    @R12
        enforced_by  [@I37, @I38]
        open_by      [@Q1, @Q13, @Q14]

    @R13
        enforced_by  [@I17, @I33]
        open_by      [@Q11]

    @R14
        enforced_by  [@I12, @I18, @I22, @I32, @I42, @I44]
        open_by      [@Q1, @Q14]

    @R15
        enforced_by  [@I46, @I47, @I48, @I49, @I50]
        open_by      [@Q15]

    @R16
        enforced_by  [@I51, @I52]
        open_by      [@Q15]

    @R17
        enforced_by  [@I53, @I54, @I55]
        open_by      [@Q15]

    @R18
        enforced_by  [@I56, @I57, @I58]
        open_by      [@Q15, @Q16]

    @R19
        enforced_by  [@I59, @I60, @I61]
        open_by      [@Q15]

    @R20
        enforced_by  [@I62]
        open_by      [@Q15]

    @R21
        enforced_by  [@I63]
        open_by      [@Q15]

    @R22
        enforced_by  [@I48, @I64, @I65, @I66]
        open_by      [@Q15]

    @R23
        enforced_by  [@I67]
        open_by      [@Q15]

tests
    T1  Boundaries. Exists: `nub run check` type-checks `port.ts`, whose types name no adapter. Phase 3 writes this: an 
        import-boundary lint over `scenarios/`, `oracles/`, `dsl/`, `fixtures/` and `world/`, seen rejecting a
            planted import of `adapters/prototype.ts` and a planted static case importing a compiler module; and a
            check that every Port operation, result and Observation tag names a public operation, result or report in
            `workflow/specs/core/`, seen rejecting a planted tag no core Spec names. [@I1, @I2, @I42]
    T2  Settling only. Phase 3 writes this: a static check that only the settle step calls `pending`, seen rejecting a 
        planted read in an oracle. [@I3]
    T3  Cross-adapter parity. Phase 4 writes this: every case, of both kinds, on the prototype and on production; each 
        verdict difference is a stated limit naming that case, or a bug. [@I4]
    T4  Adapter testimony. Phase 3 writes this: the audit reads each adapter against its implementation's report and 
        result types and lists every value not backed by one; each is a stated limit or a bug. [@I5, @I42]
    T5  Oracle purity. Exists: the `Oracle` type (`check: (facts: Facts) => ...`) under `nub run check`. Phase 3 writes 
        this: a lint over `oracles/` forbidding clock, randomness and host APIs, seen rejecting a planted
            oracle that reads `Date.now()`. [@I6]
    T6  Anchors. Phase 3 writes this: the audit marks every oracle rule as anchored or consistency-only and checks the 
        guarantee map for an Invariant with consistency-only rules alone. [@I7, @I8]
    T7  Citations resolve. Phase 3 writes this: a check that resolves every case's and every expectation's cited rules 
        and every oracle's `guarantee` against `workflow/specs/core/`, seen rejecting a planted
            "WriteLanes R99", a planted expectation with no citation and a planted violation citing an Invariant its
            oracle does not name. [@I9, @I10, @I40]
    T8  Expectation provenance. Phase 3 writes this: the audit re-derives each expectation and fixture reference from 
        its cited rules and the fixture's source, lists every value that differs from the rule or that only a run
            could give, and writes its own mutants from the Specs. [@I11, @I41]
    T9  Every check has a mutant. Exists for oracles only: falsify's first line (`runner/main.ts`). Phase 3 writes 
        this: the line counts (judge, Invariant) pairs per implementation under test, seen failing on a planted
            pair with no mutant. [@I12, @I13]
    T10  Case-only mutants. Phase 3 writes this: one mutant per guarantee-map "case" row, run by falsify and caught
            only when a failed expectation cites that row's Invariant. [@I13]
    T11  Exactly-once edits. Exists: falsify's "not applied" verdict (`applyEdit` in `runner/falsify.ts`); seen by
            planting an edit whose text occurs twice. [@I14]
    T12  Control. Exists: falsify's control line, the mutants' cases on the unedited code under test. [@I15]
    T13  Kill by the holding check. Exists per oracle: falsify's per-mutant judge (caught, or red by another check).
            Phase 3 writes this: the judge matches the failure's judge and Invariant and reads every failing run, seen
            catching a planted mutant red by a mismatch in one run and by its oracle in another, and seen failing on a
            planted mutant whose holding oracle fails only on a different Invariant than the holding check's.
            [@I16, @I32]
    T14  Copy isolation. Exists: each copy is removed when its run ends (`copyRuntime`). Phase 3 writes this: falsify
            hashes the code under test's tree and the suite before and after, lists leftover copies, and is seen
            failing on a planted mutant that edits a file through the copy's link. [@I17, @I33]
    T15  Null by stated failures. Phase 3 writes this: falsify's null line runs every case on its kind's null
            implementation and counts a case as failed only by a stated failure, seen failing on a runtime case that
            throws on boot and on a planted static case whose expectations are all absences. Today's null line counts
            every `Fail`, defects included, so it cannot fail on I18 and is not evidence for it. [@I18, @I25]
    T16  Rerun. Phase 3 writes this: `suite --json` twice on one implementation, outputs compared byte for byte.
            [@I19]
    T17  Order and split. Phase 3 writes this: the verdict set of `suite`, `suite --parallel 4` and each case run
            alone with `--only`, compared by case id; and each case's runs in reverse order and each run alone,
            compared by run, seen failing on a planted case that keeps state in a module variable across its runs.
            [@I20, @I22]
    T18  Runs. Exists: `runCase` runs every case under the fixed seeds. Phase 3 writes this: a seed-sensitive
            mutant (store load order) that passes one seed and fails another, seen failing with that seed named in the
            decoded verdict; and a planted generated-input static case that fails one input seed, seen with that seed
            named. [@I21, @I43]
    T19  Session seeds. Phase 4 writes this: WriteLanes T18's seed cases with a seed-ignoring mint as the mutant
            (README decision 8); and a page-ignoring mint (the session seed without its page) as a second mutant, seen
            failing on a two-page case. [@I23]
    T20  One verdict per id. Exists: `--only NOPE` gives a non-pass "no such case"; a child with no verdicts gives a
            non-pass per id (`sliceVerdicts`). Phase 3 writes this: a runner self-test with a killed child and an
            unknown id, each seen giving a defect, and a planted child that reports two verdicts for one id, seen
            giving a defect. [@I24]
    T21  Exit codes and forms. Exists: `report` in `runner/main.ts`. Phase 3 writes this: runner self-tests for one
            failing case of each kind (exit 1), an empty run (exit 1), a decoded `VERDICTS` line whose failure fields
            name the run, the judge, the rule and, for the runtime case, the step, and one final `VERDICT` line.
            [@I26, @I27, @I32, @I43]
    T22  Falsify verdict. Phase 3 writes this: a runner self-test with a planted surviving mutant, a planted null pass
            and a planted case-only Invariant with no mutant, a planted red control, a run with no mutants and a
            planted edit that does not apply, each seen giving `VERDICT fail` and exit 1. [@I28]
    T23  Old-suite comparison. Exists by hand: STATUS.md compares the ported payment cases and each mutant against the
            old suite. Phase 3 writes this: the verdict-compare mode (README work list item 4), run per ported area,
            and the area's ported mark refused while a new-suite bug is open. [@I29, @I30, @I39]
    T24  Port values. Phase 3 writes this: a type-level check that every Port data type's Schema encodes to JSON and
            that only the world's hosts and the report sink are function-typed, seen rejecting a planted `Map` field.
            [@I31]
    T25  Defect verdicts. Phase 3 writes this: runner self-tests with a case that throws, a case that overruns a short
            time bound (in process and split, its slice-mates unchanged) and an unknown id, each seen giving a defect
            and exit 1. [@I25, @I34]
    T26  Stated limits. Phase 3 writes this: the audit reads every stated limit and every adapter- or
            absence-dependent branch in the oracles and cases, and lists any that accepts a contradicting value or
            moves an expectation from its rule. Phase 4 writes this: the same audit of each production adapter, whose
            README section lists no stated limit. [@I35, @I36]
    T27  Core coverage. Phase 3 writes this: a check that resolves the guarantee map against `workflow/specs/core/`
            and lists every in-scope Invariant with no check and no listed reason, seen failing on a deleted map row.
            [@I37, @I38]
    T28  Case kinds. Phase 3 writes this: a type-level check that a case is a union of the two kinds, a static case's
            run has no world and its failures no step, seen rejecting a planted static case that boots a Port.
            [@I44, @I22]
    T29  Seam. Slice R writes this (@task.V3.T51): a lint over `adapters/production.ts`, seen rejecting a planted
            import of a core module not on the seam list. [@I45]
    T30  Parts. Slice R writes this (@task.V3.T47): a check that each part's reference is built from its
            `Compiled`, seen rejecting a planted part with a hand row; the three pilot parts (S16, S21 flattened,
            S10) replayed from their emitted scripts by the player, the model and the bench, with equal step
            counts. [@I46, @I47]
    T31  Composites stay off round-14. Slice R writes this: the runner refuses a part on round-14, seen with a
            planted request. [@I48]
    T32  Regressions. Slice R writes this (@task.V3.T45): a planted mutant found by a seeded run shrinks to a
            script in `regressions/`, which the next suite run replays red. [@I49]
    T33  Frozen hand cases. Slice R writes this: a check that each hand case newer than 2026-11-11 cites a ruling,
            seen rejecting a planted uncited case. [@I50]
    T34  Declarations. Slice R writes this: the declared codes of every part and adapter resolve against the code
            list, seen rejecting a planted code; generated scripts for a runtime that does not declare `ca` contain
            no `ca` command. [@I51, @I52]
    T35  Matrix. Slice R writes this: the gate run over all Plan features, seen failing on a deleted row, on a row
            owed to a closed Task, on a declared code no fixture reaches and on a part claiming an undeclared
            code. [@I53, @I54, @I55]
    T36  Pairs. Slice R writes this: the pair list regenerated from the channel table equals the gate's list; the
            gate seen failing on a planted unreached pair of declared codes and on a waiver without a later slice;
            a triple left unreached changes no verdict. [@I56, @I57, @I58]
    T37  Model purity. Slice R writes this (@task.V3.T45): an import-boundary lint over the model's modules, seen
            rejecting a planted runtime import. [@I59]
    T38  Compare. Slice R writes this: a runtime that omits an owed report, one that adds a report the model
            neither owes nor allows, and one whose report breaks a named cell, each refused at its step with the
            cell's Invariant. [@I60]
    T39  Model mutation. Slice R writes this: each model table cell mutated in turn; a cell no part's expected
            trace notices is listed, and a model field no mutation reaches fails the gate. [@I61]
    T40  Facts only. Slice R writes this (@task.V3.T45): a lint banning Observation imports in the expect
            modules, seen rejecting a planted import. [@I62]
    T41  Liar gate. Slice R writes this (@task.V3.T45): `falsify --liar` on production, with the count of
            behavioural mutants green under it and the report-truth list; seen failing on a planted mutant held
            only by its own report. [@I63]
    T42  Limits. Slice R writes this (@task.V3.T45): the limits run on round-14, seen failing on a planted row
            whose case passes and on one whose case fails by another Invariant. [@I64, @I66]
    T43  Default runtime. Slice R writes this: the runner with no runtime flag names production in its first
            line. [@I65]
    T44  Fingerprints. Slice R writes this (@task.V3.T47): conformance and bench replays of each pilot part's
            usual script give equal fingerprints; seen failing on a planted bench that skips the persistence
            edge. [@I67]
