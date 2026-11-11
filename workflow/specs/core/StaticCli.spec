spec StaticCli
status        proposed
basis         A guide, revisable whenever building shows it wrong; each change and its
              reason is recorded in workflow/specs/spec-log.md.
              Written from the merged flow plans (proposed); split per spec-split.md there.
location      packages/flow-state-v3/src
provides      flow graph, flow check, flow explain (static), flow.config.ts discovery, CLI result
              format
derives_from  [
              @plan.CommandLine.O1, @plan.CommandLine.O3, @plan.CommandLine.O5,
              @plan.CommandLine.O6, @plan.CommandLine.V1, @plan.CommandLine.V4,
              @plan.CommandLine.V6, @plan.CommandLine.V7
              ]

requirements
    R1  The command set
        source  @plan.CommandLine.O1.
        must    flow exposes only story list, story describe, story run, trace, graph, check and 
                explain; there is no diff, trace diff or search command. All support text (the 
                default) and JSON; graph also supports Mermaid. Help and version are conventional 
                text. The Story commands and explain --trace are specified with Stories, when that 
                phase starts.

    R2  Output for people
        source  @plan.CommandLine.O1.
        must    Output for people names a source location (pay.machine.ts:42) where the Diagnostic
                or data view carries one, and otherwise the definition path (such as
                operations.pay.failure.CardDeclined), never an internal closure path or an invented
                location (Diagnostics Spec R10); it groups a graph by state. Decision (agent,
                2026-11-11): audit C26; where Compiled gets source locations is Q3. The exact outputs are accepted by 
                the 
                user in phase 5.

    R3  Selection
        source  @plan.CommandLine.O1.
        must    Source commands accept --project-root and --app; --app selects an exact app id. 
                Without it, graph and check inspect all apps; a command selecting a machine 
                requires a unique exact match, and ambiguous machine-id prefixes require --app. 
                Unknown apps or operands fail rather than inspecting another app.

    R4  Usage errors and inert arguments
        source  @plan.CommandLine.O1.
        must    Invalid, missing, repeated or conflicting arguments fail with InvalidUsage before 
                application loading. Selectors are data and never execute expressions. At most one 
                input may be stdin.

    R5  graph
        source  @plan.CommandLine.O1.
        must    graph prints one edge per alternative, named by its place in the source so an edge
                and the Runtime's turn record share one name.

                Each edge says what decides it (a state token, an idle or retryable lane fact, a
                port, a closure) and is marked late, shadowed, unreached or unsourced when the data
                says it cannot be taken. Fillings, schedule triggers and `whenAbandoned` callbacks
                are edges; what data cannot say is listed as unseen.

    R6  Static explain
        source  @plan.CommandLine.O1.
        must    explain accepts a machine, state path and public event, or a domain with an 
                optional --read. It shows possible transitions, denials and fallthrough without 
                evaluating guards; each commit's operation, contract, verb, policy and lane key 
                with its cardinality; each stream placement; each schedule's path to a write. 
                explain <release> --since <release> (proposed spelling) says per definition whether 
                its saved state resets, restores, or its identity fields changed.

    R7  Results
        source  @plan.CommandLine.O3.
        must    Text and JSON describe the same result. JSON carries version: 1, the command leaf,
                status (completed, equal, different, incomplete or failed), data (null when absent)
                and ordered diagnostics. A success or a finding emits one newline-terminated
                document on stdout; an invocation failure one document on stderr.

                Results never mix with loader console output, carry no ANSI in JSON or
                non-interactive text, and never show raw causes, stacks or private authority. A
                broken pipe fails without printing another error.

    R8  Exit codes
        source  @plan.CommandLine.O3.
        must    Completed commands and warning-only checks exit 0. A check with an error finding has
                status completed, exits 1 and stays a stdout result. A check missing complete type
                facts has status failed (R9). Decision (agent, 2026-11-11): audit C18 (spec-log.md,
                T42). Usage, loading, artifact and I/O failures exit 2. Interruption 
                reports failure only after cleanup and exits 130 for SIGINT or 143 for SIGTERM. 
                Cleanup failure cannot report success.

    R9  What check reads
        source  @plan.CommandLine.O5.
        must    flow check checks the complete declared graph, lazy entries included, from each 
                machine's compiled data view, running no application callback other than entity 
                domain recorded positions. It loads declarations, so each machine's configuration
                callback runs its one construction call (Compile Spec R1), and activates no actor,
                service or fixture and no runtime callback (guard, mapper, select, action, default or
                initial). Decision (agent, 2026-11-11): audit C8 (spec-log.md, T42). Deny codes come from declared 
                types; missing complete 
                type facts fails instead of claiming a complete analysis. A Story is read as data.

    R10  check errors
        source  @plan.CommandLine.O5.
        must    check reports as errors the invalid declarations, wiring, ownership and recorded 
                domain rules listed in @plan.CommandLine.O5, including violations untyped input 
                would otherwise bypass: among them unfilled ports, a late handler with no 
                alternative that stays put, NotSent unmapped where it can occur, SharedContract 
                (proposed name), DuplicatePlacement, VerbMismatch, KeyRequired, UnresolvedHold, 
                KeyFieldOptional, ReservedReason (proposed name) and the allowlist grammar for 
                recorded positions.

    R11  Findings
        source  @plan.CommandLine.O5.
        must    Each finding carries severity, a stable rule reason, its actual path and actionable 
                help. Warnings and info never fail the check. Failing to load a graph is an
                invocation failure, except a Construction's FlowError (Compile Spec R2): check
                reports its diagnostics as error findings (exit 1), and cannot report what that
                failed construction kept from loading (a stated limit). Decision (agent,
                2026-11-11): audit C6 (spec-log.md, T42). Findings never certify runtime callbacks or runtime 
                correctness. check --watch keeps one compiler session and re-lints changed files.

    R12  Configuration discovery
        source  @plan.CommandLine.O6.
        must    At --project-root (default the cwd) flow loads only flow.config.ts, whose default
                export is defineConfig({ apps, stories?, tsconfig? }). The root must contain
                package.json; discovery never searches ancestors or picks another config.

                Missing or unloadable config fails with ConfigLoadFailed. Empty configs, duplicate
                ids, foreign setups and lookalike values reject before any execution resource is
                acquired; Flow and Effect values must come from the CLI's own package instances.

    R13  Project safety
        source  @plan.CommandLine.O6.
        must    Config, Story and entry files must resolve inside the project root after symlinks; 
                escaping entries reject before execution. Flow writes no caches or bundles into the 
                project and removes its temporary files on success, failure and interruption by
                SIGINT or SIGTERM; forced termination (a second signal, SIGKILL) has no cleanup
                guarantee (@plan.CommandLine.O2, @plan.CommandLine.O3). 
                Loading local TypeScript trusts that code; it is not a sandbox.

open
    Q1  Executable checks are not built.
        outcome  Phase 3 writes each test below behind the CLI's installed binary, with a wrong 
                 check for each rule; until then every Requirement's evidence is open.

    Q2  The exact text outputs wait for the user's acceptance in phase 5.
        outcome  R2 and R5's rendering stay open until then; the JSON shape is the contract tests 
                 read now.

    Q3  Where Compiled gets source locations for R2 (the data view carries none today, and Compile R16 lists none).
        outcome  Settled with the text outputs in phase 5; until then output names definition paths.

model
    DataView = the Compile Spec's data view of Compiled: closures as names.

    Finding = { severity, rule, path, help }.

invariants
    I1  graph, check and static explain invoke no runtime callback (guard, mapper, select, action, default or initial), 
        service, fixture or actor; besides each machine's one construction call of its configuration callback, recorded 
        positions are the only callbacks check runs. Reworded 2026-11-11 (audit C8). [@R9]

    I2  Every edge name in graph equals the name the Runtime's turn record uses for that alternative. [@R5]

    I3  Every usage error is reported before any application file is loaded. [@R4]

    I4  For every command, text and JSON give equal status, data and diagnostic codes. Reworded 2026-11-11 (audit). 
        [@R7]

    I5  stdout carries exactly one document on success or findings, and stderr exactly one on invocation failure; 
        neither carries loader output. [@R7]

    I6  The exit code is a function of the result status and, for check, whether it holds an error finding, as R8 maps 
        it; no warning or info finding changes it. Reworded 2026-11-11 (audit C18), taking the cut I9. [@R8, @R11]

    I7  check never reports complete when type facts were missing. [@R9]

    I8  Each @plan.CommandLine.O5 rule id errors (exit 1) on a fixture that violates it, and no reference app errors. 
        Reworded 2026-11-11 (audit). [@R10]

    I10  Discovery loads no config but flow.config.ts at the root, and reads nothing in a parent directory. Reworded 
         2026-11-11 (audit C19). [@R12]

    I11  After any run that ends by itself or by SIGINT or SIGTERM, the project tree is byte-identical to before, and 
         no temporary file remains. Reworded 2026-11-11 (audit C19). [@R13]

    I12  An unknown app or operand is never resolved to another app. [@R3]

composition
    flow
        Design note, proved by the prototype. check, explain and graph read the compiled data
        view only, so they need no Runtime and report callbacksRun: 0 on every fixture
        (packages/flow-state-v3/prototypes/round-14/cli/check.ts, pins in round-14/cli/main.ts).

        Production (@task.V3.T22, proposed): the CLI is an edge, so it is one Effect program run
        by the platform's runMain. R8's failure classes are tagged errors in the typed error
        channel, mapped to exit codes once at the entry; R13's temporary files are scoped
        resources (acquireRelease), and runMain turns SIGINT and SIGTERM into interruption, so
        their finalizers run with no signal handler of Flow's own. Output goes through Effect's
        Stdio and Console services. @effect/platform-node is installed at a release candidate
        older than effect; the slice pins a matching pair first.

coverage
    @R1
        enforced_by  [@I4]
        open_by      [@Q1]

    @R2
        enforced_by  [@I4], user acceptance
        open_by      [@Q1, @Q2, @Q3]

    @R3
        enforced_by  [@I12]
        open_by      [@Q1]

    @R4
        enforced_by  [@I3]
        open_by      [@Q1]

    @R5
        enforced_by  [@I1, @I2]
        open_by      [@Q1, @Q2]

    @R6
        enforced_by  [@I1]
        open_by      [@Q1]

    @R7
        enforced_by  [@I4, @I5]
        open_by      [@Q1]

    @R8
        enforced_by  [@I6]
        open_by      [@Q1]

    @R9
        enforced_by  [@I1, @I7]
        open_by      [@Q1]

    @R10
        enforced_by  [@I8]
        open_by      [@Q1]

    @R11
        enforced_by  [@I6]
        open_by      [@Q1]

    @R12
        enforced_by  [@I10]
        open_by      [@Q1]

    @R13
        enforced_by  [@I11]
        open_by      [@Q1]

tests
    T1  Inert static commands: run graph, check and explain on every reference app with spies on callbacks, services 
        and storage; zero calls apart from recorded positions. Prototype pins report callbacksRun 0 (fixtures `broken`, 
        `keyless`). [@I1]
    T2  check rules: one fixture per error rule fails with that rule and exit 1; reference apps report none. Prototype 
        pins `no-notsent`, `unencodable-no-notsent`, `shared-contract`, `gone-without-key`; wrong runtime 
        `cli.notsent-off`. Every other rule has no prototype wrong runtime; phase 3 writes one per rule. [@I8]
    T3  Type facts: run check where type facts are unavailable; it fails and never says complete. [@I7]
    T4  graph names: for each edge in the reference apps' graphs, run a Story or scenario that takes it and compare the 
        turn record's name. [@I2]
    T5  Results and streams: every command in text and JSON from one run; stdout and stderr each carry one document; a 
        loader that logs does not mix in; a closed pipe ends quietly. [@I4, @I5]
    T6  Exit codes: warning-only check exits 0, errors exit 1, bad usage exits 2 before loading, SIGINT exits 130 after 
        cleanup. [@I3, @I6]
    T7  Discovery and safety: no config, a config in a parent, a symlink escaping the root, a lookalike app value; 
        each fails before execution resources; the project tree is unchanged after every run. [@I10, @I11, @I12]
