spec Types
status        proposed
basis         Pre-coding analysis, to follow as best-guess guidance; revisable whenever building shows it wrong, with
              each change and its reason recorded in wiki/specs/specs.log.
location      packages/flow-state-v3/src
provides      derive.ts, Machine, RuleToken, RuleTokens, RuleName, Build, rules, ScheduleDecl, TimersOf, Construction, 
              Finding, CHECKS,
              compile, indexOf, findingsOf, compiledOf, project, door, slot
derives_from  [
              @plan.Machines.O1,
              @plan.Machines.O5,
              @plan.Machines.O8,
              @plan.Diagnostics.O1,
              @plan.Diagnostics.O2,
              @plan.CommandLine.O5,
              @plan.Rules.O3
              ]

requirements
    R1  Nothing is typed by hand
        source  @plan.Machines.O1; the round's principle of full type inference.
        must    A handler, mapper, schedule callback, rule, snapshot read, send or Story step needs no annotation, and
                no user type restates a Schema or a declaration. Every public type that mentions a name, payload, key
                or reason of a definition is a row of one type-only module, `derive.ts`, computed from the definition.

    R2  A misspelt name does not compile
        source  @plan.Machines.O1; @plan.Machines.O5; @plan.Rules.O3.
        must    Wherever Flow holds the name, a misspelt one is a type error: a state, event, field, operation,
                schedule, key field, pause reason, rule or slot, in the body and at every reader (a snapshot, a
                handle, a Story step, evidence). An unknown structural key in a body (`gaurd`, `pausd`) is a type error 
                too: `machine`
                captures the body's type as `B` and checks `B & Exact<B, MachineBody<D>>`
                (code:packages/flow-state-v3/src/machine.ts#BodyOf), so a typo in a target, `updateMemory` (and its
                returned keys), guard, actions, state or schedule gets a red line at its key. The strict decode at
                construction and `flow check` stay as the runtime backstop (Q19).
                [decided: user 2026-11-22] Why: Q5 A reversed the earlier capture-free answer once the spike showed
                the capture costs little and changes no body. Reverse: drop the capture; the runtime refuses alone.
                Open: a field named `pipe` turns the check off for its record (@task.V3.T121).

    R3  A type never promises what the runtime does not deliver
        source  @plan.Machines.O8.
        must    An unkeyed schedule's `key` is `undefined` in the type and at run time; a snapshot field is typed
                exactly as it is published; the value a reader delivers has the row's type. The one place a type
                is wider than its source is stated: a schedule metadata's `output` is `unknown`.

    R4  A finding is reported whole, beside every other machine's
        source  @plan.Diagnostics.O1; @plan.CommandLine.O5.
        must    A definition or body with a finding is reported with every finding, beside every other machine's
                findings: it never hides another machine and never shows only its first finding. An argument of the
                wrong kind (not a definition, not a function) is a module that does not load; its raise carries all
                its diagnostics.

    R5  A finding says where
        source  @plan.Diagnostics.O2.
        must    A finding names its owner (machine, definition or contract), the path inside the owner, and, when the
                CLI can resolve it, the file and export. The core never holds a source position.

    R6  The same source gives the same machine
        source  Agreed by the user for the algorithm round: deterministic core.
        must    Construction reads no environment, clock, random or stack. Two constructions of one source are equal.

    R7  Types and construction stay cheap
        source  Agreed by the user for the algorithm round: cheap operations over the graph.
        must    Check time grows by a stated bound; construction is linear in the definition; nothing fixed per
                machine is recomputed per turn: what a hot path reads is a field of `Compiled` built once.

    R8  Declared schedules
        source  @plan.Machines.O5; `Schedules` R16.
        must    A schedule's name, key, pause reasons and selection type are declared on the definition; the body entry
                is checked against the declaration at construction and by `flow check`, and by type where a key is
                required (a declared reason, `keys`; Q19). `key` has one derived type in every
                callback, the send mapper included, and is `undefined` in an unkeyed one. A body schedule must be
                declared; a declared schedule placed nowhere is a warning. Every refusal the types make has a
                construction row of the same meaning (the twin rule).
                [decided: user 2026-11-20] `key` and `pausedBy` are in the declaration.
                [decided: user 2026-11-21] the declaration names the `restartOn` Schema beside `key` and `pausedBy`;
                a key is a field record, always a struct with one canonical text.
                The user's 2026-11-22 decision makes the body `Flow.keyed` form and body-declared names void.

    R9  A machine's rules are attached by `.rules(build)`, and its type carries their names
        source  @plan.Rules.O3.
        must    `machine(definition, body)` returns a `Machine<D>`. `.rules(build)` on it, and on what `trait()` and
                `subroutine()` return, returns the same value typed `Machine<D, N>`: its `rules` record has exactly the
                rule names the build declares (an invariant and a turns rule share one namespace) and the value gets
                nothing else from them. A value with no `.rules(...)` has no rules: its `rules` record is empty.
                `Machine<D, N>` assigns to `Machine<D>` and to `Machine`.
                [decided: user 2026-11-22] Why: rules leave the body, are optional and are judged only by Stories
                (@proposal.external-rules). Reverse: the rules back in the body, their names captured from it.
                Superseded by the user's 2026-11-22 decision (@proposal.external-rules): "The machine's type carries
                its rule names", read from the body through `machine<D, const B>` and `RuleNames<B>`.

    R10  Mappers and contracts are typed from their source
        source  @plan.Operations.O1; the typed mapper shape the user decided.
        must    An ending's mapper gets `(value, { input, key })`, each typed from the contract with no annotation,
                keyed or unkeyed; a schedule's `send` mapper gets one argument, the firing's metadata. A `resource`
                key that omits an input field is an error on `key`; a `transaction` may keep a partial key; an
                unhandled timeout in a `transaction`'s `commit` is an error on `commit`; `E.X.Type` and `D.M.x.Type`
                are the payload and the field type.

    R11  Construction is a value
        source  @plan.Diagnostics.O1; @plan.CommandLine.O5.
        must    No authoring constructor (`definition`, `transaction`, `resource`, `machine`, `app`, `runtimeSetup`,
                `Story.app`) raises for a finding. A machine is `Built`, `Refused` or `Blocked`. Only `compiledOf`
                turns an app into something runnable, and raises, once, with every finding. A machine with an error
                construction row never runs; only construction errors stop a run, a graph error never does.

    R12  One reason, one row
        source  @plan.Diagnostics.O2.
        must    A reason is the key of one table, `CHECKS`; its row gives one severity and one stage; a finding stores
                neither. `UnhandledEvent` has one meaning and one severity. Terminals are proved by `flow check` and,
                for a value a Story runs, again when the Story starts (Q6); no run judges them.

    R13  A type crosses between the typed shell and the erased core at named functions only
        source  Agreed by the user for the algorithm round: one point for each class of cast.
        must    The cast disables in `src/` outside test tooling are exactly the named crossings (`door`, `slot`,
                `project`, `provided`), the boundaries to something outside Flow's types (the mint, `draft`, the JSON
                entry, Effect's Schema AST) and nothing else. Inside a door the erased value comes from a decode,
                never a cast.

    R14  `Compiled` is erased, precise where that is free, and built by one pass
        source  Agreed by the user for the algorithm round: one writer per field; cheap graph operations.
        must    One erased `Compiled` serves every machine of a world. It holds the codecs of the declaration (the
                saved groups and each schedule's key and selection), branded names and the derived fields
                of `DerivedFields` (`model`), written only by `indexOf`. Rules are not on `Compiled`: `.rules()` returns
                them on the value (R9). The restore decodes a saved key and baseline
                with these codecs, so a key whose Schema changed is dropped with a report, never routed to another
                timer.

    R15  Types stay honest under test
        source  Agreed by the user for the algorithm round: every type test is two-sided.
        must    Each type claim is asserted two-sided (the right value compiles, a named wrong value does not), each
                pin of today's limit names the row that flips it, and each typed reader has a run that reads the same
                value.

open
    Q1  Construction returns a value instead of throwing for a finding. Overturns `machine()` throwing 
        (@plan.Machines.O1 as written) and the earlier ruling to keep the throw. Limited by Q12: a definition with a
        finding must still hand out every token, or module-level code such as `const Idle = Toaster.S.IDLE` throws at
        import and hides the module again; a definition finding that cannot hand out tokens keeps raising at
        `definition()`, as a wrong-kind argument does. [decided: user 2026-11-22] Why: `flow check` then prints every
        finding of the app at once. Reverse: B keeps the throw.
        outcome  A: construction is a value; the tokens are still handed out. B keeps the throw (an import that
                 fails with a `FlowError` exits 1 and prints that error's findings), C is today.

    Q2  `Machine<D, N>`'s default for `N` is `never`, so `M.rules.Typo` on a value with no rules, or on an annotated 
        `Machine<typeof X>`, is an error; the alternative `string` makes it `RuleToken | undefined`. Both compiled.
        [decided: user 2026-11-22] Why: a misspelt rule is a type error. Reverse: B defaults `N` to `string`.
        Edited by the user's 2026-11-22 decision (@proposal.external-rules): the parameter was `R`, read from the
        body; it is `N`, the names of `.rules(build)` (R9, `RuleTyping`).
        outcome  A: `N` defaults to `never`; an annotated `Machine<typeof X>` loses only the rule tokens either way.

    Q3  `turn` is a token of the rules builder, `.rules(({ S, E, turn }) => ...)`, not of the body and not an imported 
        function. [decided: user 2026-11-22] (@proposal.external-rules) Why: its memory type comes from the
        definition, which `.rules` has, and the body no longer holds rules. Reverse: `turn` back as a body token.
        Superseded by the user's 2026-11-22 decision (@proposal.external-rules): "The body gives the machine's type
        only its rule names, and `turn` is a body token, not an imported function. [decided: user 2026-11-22] Why: a
        token's memory type comes from the machine it is handed out by. Reverse: B is an imported `Flow.turn`." Its
        outcome  was "A: `turn` is a body token". The old text is at commit 1c200671.
        outcome  A: `turn` is a rules-builder token; B (an imported `Flow.turn`) compiles too but its memory type
                 rests on the surrounding record.

    Q4  Every declared pause reason has a callback in every placement. [decided: user 2026-11-22] Why: a reason that 
        can never hold at a placement is a type error, not a silent no-op. Reverse: B makes the callback
        optional.
        outcome  A: required; B makes the callback optional, so `pausedBy` may name a reason that can never hold
                 at that placement.

    Q5  A rule has no `enabled`, and the Runtime has no rules switch: only Story tooling judges rules (Stories and 
        everything built from them), so an app's Runtime never reads them. The run rules are one list in one module the
        config imports, passed to every Story constructor as `runRules` ([decided: agent specs lead 2026-11-22] the
        name; Why: `rules` now means `.rules(build)`; Reverse: name it `rules`). [decided: user 2026-11-22]
        (@proposal.external-rules) Why: a flag read in the body throws under the plain CLI, and rules that never run
        outside a Story need no switch. Reverse: B keeps `enabled`; C is the Runtime setup's `rules: "judge" | "off"`.
        Superseded by the user's 2026-11-22 decision (@proposal.external-rules): the Runtime setup option `rules:
        "judge" | "off"` of the earlier answer A, and its "Stories and the CLI always judge" as a contrast to a
        Runtime that may. `enabled` stays overturned (@plan.Rules.O6).
        outcome  A: no `enabled`, no Runtime switch; Stories and the CLI judge. B keeps `enabled` as a plain boolean
                 the user computes.
        reasoning  A: a flag read in the body throws under the plain CLI, which refuses the machine, so `enabled` is
            not safe. A Runtime switch was the first answer and is superseded: nothing outside a Story reads a rule,
            so there is nothing to switch. B keeps the decided API but every app writes its own environment read, and
            the CLI must stub it.

    Q6  Terminals are proved by `flow check`, as the finding `TerminalLeft`, and also when a Story starts: once per 
        ruled value, memoised, and a `TerminalLeft` fails the Story's verdict. No run-time terminal rule exists, so a
        break never names a terminal. [decided: user 2026-11-22] (@proposal.external-rules) Why: a graph proof covers
        every run, but a value only a test runs is otherwise never proved. Reverse: `flow check` only.
        Superseded by the user's 2026-11-22 decision (@proposal.external-rules): "proved by `flow check` only" (the
        earlier answer A and @plan.Rules.O2's line).
        outcome  A: `flow check` proves terminals, and Story start proves them again for the values it runs; B also
                 judges at run time.
        reasoning  A: a graph proof covers every run, so a run-time judge can only repeat it; terminals then need no
            token. B catches a terminal left through a path the proof over-approximates away, which cannot
            happen: guards are treated as passable, so the proof is never short.

    Q7  Source locations come from the CLI's adapter, which resolves file and export by identity and adds the line by 
        reading that file along the definition path. [decided: user 2026-11-22] Why: `discover` already knows which
        module exported which machine. Reverse: B captures at `machine()` from a stack and breaks I9. The adapter's
        algorithm is not spiked.
        outcome  A, after a spike (@task.V3.T22). B captures at `machine()` from a stack and breaks I9.

    Q8  `Compiled` holds the saved codecs and the schedule codecs. Granted, with the same question in `Records`: one 
        answer, once. [decided: user 2026-11-22] Why: the core must decode a saved key. Reverse: B keeps codecs on
        the definition.
        outcome  A, for both Specs; B keeps codecs on the definition, so the core cannot decode a saved key.

    Q9  Closed by R8: a schedule's `key` is a field record, always a struct with one canonical text.
        outcome  Closed.

    Q10  A schedule's `send` mapper takes one argument, the firing's metadata `({ key, attempt, armedAt, dueAt,
        firedAt, output })` without `name`; B would take `(value, { input, key })` like an ending, where `value` and
        `input` have no meaning for a firing. [decided: user 2026-11-22] Why: a firing has no value or input.
        Reverse: B takes `(value, { input, key })`.
        outcome  A: the mapper takes the firing metadata.

    Q11  The metadata's `output` stays `unknown`; two typed shapes were compiled and both failed. B declares `output:
        Schema` on the schedule, typed and checked at the firing, one more declared field for a value no fixture
        reads. [decided: user 2026-11-22] Why: no fixture reads it and two typed shapes failed to compile. Reverse:
        B declares `output: Schema` on the schedule.
        outcome  A: `output` stays `unknown`.

    Q12  Two spikes block the cast deletions and Q1: `AnyBody` assigned from every `MachineBody<D>` with its `on`
        handlers at `never`, and which of today's definition findings leave every token in place. Until they pass,
        the casts of `machine.ts`, `compile-body.ts` and `compile-schedules.ts` are handled at one point. Also not
        compiled: `Bound<"read">` without `concurrency`, `refs.ts`'s recorded limit, `R` when `B` takes its default,
        the changed `CoversInput`. Blocks build.
        outcome  Both spikes are the first acceptance rows of @task.V3.T113 and @task.V3.T22.

    Q13  The rows of `Changes` (props, emits, fragments, slots, `Reads<D, Scope, View>`), `EvidenceOf<D>`, a fragment
        event's address and the public faces of `Published` and `Turn` are designed by rule only; nothing is compiled
        because the code they type does not exist. Only one new definition was compiled end to end and no fixture was
        migrated to declared schedules.
        outcome  Compile each row when its code lands; migrate `home/Room` first.

    Q14  `RefMapsOf` over `Records`' real shapes, so `RefRows` totality, is unproved; only the mapped-type mechanism
        compiled.
        outcome  The type proof, with `Records`' shape types in code.

    Q15  The full derivation's check cost with every fixture migrated, the JSON-form reuse of the cost table and
        construction time are unmeasured; the migration fixtures fail today, which skips their checking.
        outcome  Record check time after each build step; add the construction benches.

    Q16  Family D's members not yet rows: `owed[].reason`, `Ended.reason`, `decline`'s `why` (G3, the declines of an
        event as a row, is dropped; deny codes stay inline), the Story checkpoint names.
        outcome  Inventory them against `derive.ts` one by one; each is a row or a stated debt.

    Q17  Rule tokens are typed on a machine that is not `Built`. `.rules(build)` reads only the definition and the
        build, so the returned value carries its tokens whatever its `construction`; a `Refused` or `Blocked`
        machine never runs, so no reader of a token reaches it. [decided: agent writer 2026-11-22] Why: with rules out
        of the body the token record no longer waits on the compiled body (@proposal.external-rules). Reverse: the
        record empty on a machine that is not `Built`, as before.
        Superseded: "the record is empty at run time", a limit of tokens read from the compiled body (commit
        1c200671).
        outcome  No limit: the tokens are built from the build's keys.

    Q18  `Types` proposes the rows G1 to G8 of `model` (public types other Specs name). [decided: user 2026-11-22]
        Why: the departure in Q5 is answered A. Reverse: reopen the rows.
        outcome  Each row follows its answer.

    Q19  [decided: user 2026-11-22] Exactness is by type: `machine` captures the body's type as `B` and checks `B &
        Exact<B, MachineBody<D>>`, so an unknown key at any depth is a type error. The strict decode at construction
        and `flow check` stay as the runtime backstop. Why: the user's Q5 A (`@proposal.body-key-typos`) reversed this
        row's earlier option C, which kept no captured type; the spike measured the capture at a small check-time
        cost and no change to any body. Reverse: option C, the runtime refusal alone.
        The body's type is captured for exactness only: rule names are still typed from the keys of the
        `.rules(build)` object (`RuleTyping`), and deny codes stay inline in guards [decided: user 2026-11-22] (Why: a
        declared union needs the body's type read for its literals, and no fixture reads one; Reverse: declare decline
        reasons on the definition), so `Denied`'s `why` stays `string`, a stated debt of family D (Q16).
        History: the earlier analysis (a narrow capture with `RuleNames<B>`, options A `Exact`, B `Exact` to a fixed
        depth, C no capture) is at commit 1c200671.

    Q20  One name per concept inside and outside: rename the declaration's `pausedBy` to `paused` and `key` to
        `keys`, so each declared field has the body field's name (`restartOn` already matches). [deferred: user
        2026-11-22] Reopen if: the user revisits it; the user leans to the rename (option B).
        outcome  Deferred; the declaration keeps `key` and `pausedBy` until then.

model
    StateInventory = who owns and writes each state. The states are values made once at module load; none changes at
        run time.
        a definition  made value: tokens and `findings`. Owner and writer: `definition()`. Readers: `machine()`,
            context reads, `derive.ts`. Saved: no.
        a contract  made value: `Bound` and `findings`. Writers: `transaction()`, `resource()`. Reader:
            `definition()`. Saved: no.
        a machine's construction  `Built { compiled, warnings }`, `Refused { findings, cause }` or `Blocked`.
            Writer: `machine()`. Readers: `findingsOf`, `compiledOf`. Saved: no.
        `Compiled`  immutable data and Slots. Writer: `compile`. Readers: the core, `project`, the CLI. Saved: no
            (`Records` stamps its records with its `shape`).
        `Compiled`'s derived fields  `DerivedFields` below. Writer: `indexOf`, alone. Readers: the core's hot paths.
        a machine's rules  made value: what `.rules(build)` returns, a `Machine<D, N>` with its `rules` tokens and the
            build's invariants, turns and terminals, held on the value (@task.V3.T106 settles the field). Owner and
            writer: `.rules()`. Readers: Story tooling (`storyCompiled`, `verdictOf`), `flow check`, `flow explain`.
            Never the Runtime. Saved: no. [decided: user 2026-11-22] (@proposal.external-rules) Supersedes the row "the
            body's type `B`". Why: rules attach by `.rules(build)`, so nothing holds the body's type. Reverse: the
            body-type row and the capture.
        a finding  `FindingShape`. Writer: the table `Reasons`. Readers: `flow check`, the `FlowError` of a refused
            use. Saved: no.

    CallbackInputs = the inputs of each user callback this Spec adds.
        the body function  `{ S, E, O, C }`, tokens only. Never: memory, the clock, the environment.
        the rules builder (`.rules(build)`)  `{ S, E, turn }` for a machine; `{ E, turn }` for a trait (no `S`, no `in`,
            no `terminals`); a subroutine's own `S` and `E` (with `hostEvents`) and `turn`. Tokens only. Never:
            memory, the clock, the environment. [decided: user 2026-11-22] `turn` moved here from the body (Q3). Why: 
                its
            memory type comes from the definition the builder has. Reverse: `turn` back as a body token.
        an invariant's `check`  `{ state, memory, props, operations, schedules }` of one publication (`Changes`'
            `Published`). Never: the event, the clock, `context`.
            [decided: user 2026-11-20] what a guard reads; only a turns rule also reads `context`.
        a turns rule's `check`  `{ event, before, after }` from `Changes`' `Turn`, `event` typed by `turn({ on })`.
            Never: the clock, operations in flight.

    Derivation = `src/derive.ts` (new, types only) is the only module that turns a declaration into a public type, with
        two named exceptions each for its own declarations: `contract.ts` (a contract's `Bound`) and `core/checks.ts`
        (`Reason`). `Parts<D>` moves there and gains one field per declared part; every public type is one of its
        rows. A new feature adds a declared part to `Definition`, a field to `Parts`, and rows; it never adds a type
        parameter to `Machine`, `ActorRef`, `Actor` or `Snapshot`. `Machine`'s one extra parameter, `N`, is for what
        only `.rules(build)` authors: the rule names (`RuleTyping`).

        Fact: source, one -> reader types, all in `derive.ts`. Status is `compiled` (on a merged copy of the real
        package) or `designed` (a rule only; nothing compiled).
        leaf states, paths: `D["states"]` -> `Snapshot.state`, `S` tokens, `in:` of a rule, terminals. today.
        event payload: `D["events"]`, `D["internalEvents"]` -> handler `event`, `E.X(...)`, `E.X.Type`, a turns rule's
            `event`. compiled.
        memory: `D["memory"]` -> every callback's `memory`, `Snapshot.memory` by `View`, `D.M.x.Type`. compiled.
        operation names, rows: `D["operations"]` -> `Snapshot.operations`, `O` handles. today.
        a mapper's `value`, `{ input, key }`: the contract's `commit` or `lookup`, `input`, `key` ->
            `E.X.from((value, { input, key }) => ...)`. compiled.
        schedule name, key, reasons, selection: `D["schedules"]` -> `DeclaredSchedules`. compiled.
        rule names: the keys of `.rules(build)`'s `invariants` and `turns` -> `Machine<D, N>["rules"]`, the verdict's
            `Broken.rule`, `off`. designed: compiled on a toy definition only (`RuleTyping`).
        context slot values: `D["context"]` -> callbacks' `context`, `Snapshot.context`, `C.slot.change`. today.
        props, emits, fragment memory, slot rows: `Changes`' declared parts -> `Reads<D, Scope, View>`,
            `Snapshot.props`, `onEmit`, slot rows. designed.
        evidence names: the rows above -> `EvidenceOf<D>`: each `state`, `event`, `operation`, `schedule` field a
            union, with the declared schedule name, key and reasons; `Host` fills the fields. designed.

        `Reads<D, Scope, View>` is the one callback-input type: `{ memory, context, props, key, item, operations }`
        picked by `View`; the six literals in `tokens.ts` become picks of it. Its schedule instance is
        `ScheduleInput`. Exported as the author-facing name, with `E.X.Type`; a copied shape is a lint finding.
        Exporting `Reads` (G1) is deferred; outside-body callbacks name the per-part derived types
        (`wiki/specs/specs.log`, 2026-11-22).

        Rows other Specs need (each follows its answer):
        G1 `Reads<D, Scope, View>`: no new row, exported.
        G2 `BodyTokens<D>`: existing, exported, so a shared body needs no hand type; its return type is inferred. It
            has no `turn` (Q3); the rules builder's tokens are its own (`RuleTyping`).
        G3 the decline reasons of an event: dropped. Deny codes stay inline in guards and are not declared on the
            definition [decided: user 2026-11-22] (Why and Reverse: as Q19); `Denied`'s `why` stays `string` (Q16, 
                Q19). Superseded: the `deny`
            literals read through `B`, since no body type is captured.
        G4 `MapperContext<I, K>`: no new row; `MapperTypes` is the one definition, `K` the picked key record
            `Pick<I, Key[number]>`.
        G5 `PropsOf<D>` (new alias): `D["props"]`, for `setProps`.
        G6 `EventOf<D>` (new), with a fragment event's address `{ slot, key }`.
        G7 the public `Published<D>` and `Turn<D>` faces: `EvidenceOf<D>`, fields by `Host`.
        G8 a schedule issue's source: `{ name, key, at }`, as `Operations`' `IssueSource.Schedule`, erased (key text);
            no generic. The typed face is `EvidenceOf<D>`, a lookup of the declaration by name.

    DeclaredSchedules = the declaration and the types it derives (a schedule's name, key, reasons and selection).

        ```ts
        // src/tokens.ts. NEW: ScheduleDecl, ScheduleDecls, KeyOfDecl, ReasonOfDecl, SelOfDecl, ScheduleBodyOf
        // existing: ScheduleInput, ScheduleMetadata, ScheduleEvent, ScheduleOperations, AnySchedule, Ending, Entry
        export type ScheduleDecl = {
            readonly key?: Schema.Struct.Fields;             // a field record, as an event's fields are
            readonly pausedBy?: ReadonlyArray<string>;
            readonly restartOn?: Schema.Top;                 // the selection's Schema (Schedules R16)
        };
        export type ScheduleDecls = Readonly<Record<string, ScheduleDecl>>;
        export type KeyOfDecl<Dc> = Dc extends { readonly key: infer F extends Schema.Struct.Fields }
            ? Schema.Struct<F>["Type"] : undefined;
        export type ReasonOfDecl<Dc> =
            Dc extends { readonly pausedBy: ReadonlyArray<infer R extends string> } ? R : never;
        export type SelOfDecl<Dc> =
            Dc extends { readonly restartOn: infer S extends Schema.Top } ? S["Type"] : never;

        type In<M, Cx, Dc> = Omit<ScheduleInput<M, Cx, KeyOfDecl<Dc>>, "now">;
        export type ScheduleBodyOf<M, Ev, Id extends string, Cx, Dc> = {
            readonly schedule: Duration.Input | AnySchedule
                | ((input: ScheduleInput<M, Cx, KeyOfDecl<Dc>>) => Duration.Input | AnySchedule);
            readonly send: ({ readonly tag: keyof Ev & string }
                | { readonly ending: { readonly event: keyof Ev & string } })
                & Ending<Omit<ScheduleMetadata, "name" | "key"> & { readonly key: KeyOfDecl<Dc> }, Id>;
            readonly armOn?: ReadonlyArray<ScheduleEvent<Ev, Id> | Entry>;
            readonly disarmOn?: ReadonlyArray<ScheduleEvent<Ev, Id>>;
        } & ([KeyOfDecl<Dc>] extends [undefined] ? { readonly keys?: never }
            : { readonly keys: (input: { readonly memory: M; readonly operations: ScheduleOperations })
                => ReadonlyArray<KeyOfDecl<Dc>> })
            & ([SelOfDecl<Dc>] extends [never] ? { readonly restartOn?: never }
                : { readonly restartOn: (input: In<M, Cx, Dc>) => SelOfDecl<Dc> })
            & ([ReasonOfDecl<Dc>] extends [never] ? { readonly paused?: never }
                : { readonly paused: { readonly [P in ReasonOfDecl<Dc>]:
                    (input: In<M, Cx, Dc> & { readonly operations: ScheduleOperations }) => boolean } });

        // src/definition.ts: Definition gains its eighth parameter `Sch extends ScheduleDecls` and
        // `readonly schedules: Sch`; definition() infers `const Sch`, so `pausedBy: ["LidOpen"]` is a literal with
        // no `as const`.
        // src/derive.ts: Parts<D> gains `Sch`; a state's `schedules` is
        // { readonly [N in keyof Sch]?: ScheduleBody<D, N> }.

        // src/host/snapshot.ts. CHANGED: TimerView takes its reasons. NEW: TimersOf.
        export type TimerView<R extends string = string> =
            | { readonly dueAt: number } | { readonly left: number; readonly pausedBy: ReadonlyArray<R> };
        export type TimersOf<D extends AnyDefinition> = {
            readonly [N in keyof D["schedules"]]?: [KeyOfDecl<D["schedules"][N]>] extends [undefined]
                ? TimerView<ReasonOfDecl<D["schedules"][N]>>
                : ReadonlyArray<{ readonly key: KeyOfDecl<D["schedules"][N]> }
                    & TimerView<ReasonOfDecl<D["schedules"][N]>>>;
        };
        ```

        Compiled on the real package with 13 refusals and exact positive assertions: `key` is the declared record in
        `schedule`, `restartOn`, each reason and the send mapper, and `undefined` in an unkeyed schedule (`key.slot`
        there is an error, which turns the one-sided pin in `tests/types/schedules.test-d.ts`); `keys` is required when
        keyed and refused otherwise; a misspelt, missing or undeclared reason, a `restartOn` of the wrong type or with
        none declared, an undeclared schedule name and an excess key are each refused, at nesting depth 2 as well;
        `Snapshot<typeof D>["schedules"]` equals `TimersOf<D>` (turns the second pin). The comment in `tokens.ts`
        ("the mapper's call is resolved before `K` is inferred") stops being true: `K` is no longer inferred. No
        TypeScript limit was hit. `Flow.keyed`, `KeyedConfig`, `KeyedSchedule`, `ScheduleKey` and the
        `"~flow": "keyed"` wrapper are deleted.

        Placement. A body schedule must be declared (a construction finding, `ScheduleUndeclared`, which `flow check`
        reports; not a type error).
        A declared name may be placed in several states, never in a state and one of its descendants (a
        construction finding at the lower placement, since both would be active at once and their timers' issues
        could not be told apart; no type refuses the shape); all placements share the name, key, reasons and
        selection type; `Schedules` decides what an active placement inherits. A declared schedule placed nowhere is the
        warning `ScheduleUnplaced`. Every declared reason has its callback in every placement (Q4).

        Twin rule. Every refusal the types make has a construction row of the same meaning, for a body that reaches
        `machine()` through a cast or plain JavaScript: `ScheduleUndeclared`, `ReasonUndeclared`, `ReasonMissing`,
        `KeysMissing`, `KeysUnexpected`, `RestartOnUndeclared`, `RestartOnMissing` (a declared `restartOn` placed
        without one), `KeyOmitsField` (a `resource` key, `MapperTypes`) and `RuleNameTwice` (`RuleTyping`). A
        declared schedule or reason name follows the name rules of every authored name (`InvalidName`,
        `DuplicateName`). An excess key is already refused by the body decode (`config.ts`, `onExcessProperty:
        "error"`). A `restartOn` result its Schema refuses is that read's failure at run time (`Schedules`).

        In `Compiled`: `Compiled.schedules: ReadonlyMap<ScheduleName, { key: Option<Codec>, selection: Option<Codec>,
        reasons: ReadonlyArray<Reason> }>`, built from the declaration, and each `Node`'s compiled schedule points at
        its entry. A key codec is the declared fields' JSON codec to canonical text, as a contract's `keyText`, and
        decodes exactly: a saved key with a field the declaration no longer has does not decode, so two saved timers
        never merge into one key text (`Schedules` I14). The restore decodes a saved key and baseline with these
        codecs, so a key whose Schema changed is dropped with a report (`Records`' reference rows), never routed to
        another timer.

        The compiled `Schedule` is the record `Schedules`' `decide` and `wake` read; this Spec owns it.

        ```ts
        // CHANGED: core/compiled.ts#Schedule. RENAMED: paused -> reasons. The codecs are not here: a placement
        // reads them by `name` from `Compiled.schedules`, so no fact is held twice.
        type Schedule = {
            readonly name: ScheduleName;
            readonly slot: SlotName;                       // existing: names the delay slot
            readonly send: EventTag;
            readonly from: Option<Slot<(metadata: FiringMetadata) => Values>>;   // existing: the send mapper
            readonly delay: Delay;
            readonly armOn: ReadonlyArray<EventTag>;
            readonly disarmOn: ReadonlyArray<EventTag>;
            readonly onEntry: boolean;                     // existing: "arms on entry" in `Schedules`' tables
            readonly restartOn: Option<Slot<(input: ScheduleInput) => unknown>>;   // declared or not
            readonly keys: Option<Slot<(input: ScheduleInput) => ReadonlyArray<Values>>>;   // keyed or not
            readonly reasons: ReadonlyArray<{ reason: Reason; check: Slot<(input: ScheduleInput) => boolean> }>;
        };
        ```

    RuleTyping = rules are attached by a chained `.rules(build)`; the body is not captured and gives the machine
        nothing. [decided: user 2026-11-22] (@proposal.external-rules) Why: rules out of the body, optional, judged
        only by Stories; names come from the keys of the build alone. Reverse: rules in the body, with the capture.
        Supersedes the section `BodyCapture` (`ExactBodyOf`, `RuleNames`, `machine<D, const B>`, the turn paragraph
        and its kept limits), superseded by the user's 2026-11-22 decision; its text is at commit 1c200671.
        Superseded, short: "BodyCapture = the body is captured exactly and gives the machine's type only its rule
        names" (`machine<D, const B>` with `ExactBodyOf<D, B>`, `RuleNames<B>` read from the body's `rules`, and a
        `Machine<D, R>` whose `rules` carried `RuleToken<K>`); the capture that stands is `B` for exactness only (Q19).

        ```ts
        // src/rules.ts (types). NEW: Build, RuleToken, rules; `.rules` on what `machine()`, `trait()` and
        // `subroutine()` return; Machine gains N. existing: MachineBody, BodyTokens. moved: turn (body -> builder)
        type Machine<D, N extends string = never> = {
            readonly definition: D
            readonly construction: Construction
            readonly rules: { readonly [K in N]: RuleToken<`${D["id"]}.${K}`> }
            // present only while N is never: a ruled value has no .rules method
            rules<const I extends string = never, const T extends string = never>(
                build: Build<D, I, T>): Machine<D, I | T>
        }
        // RuleTokens<D>: the builder's tokens, `{ S, E, turn }` for a machine and as listed below for a fragment
        type Build<D, I extends string, T extends string> = (tokens: RuleTokens<D>) => {
            readonly invariants?: { readonly [K in I]: Invariant<D> }
            readonly turns?: { readonly [K in T]:
                K extends I ? { readonly "~error": "a rule name is used twice" } : Turn<D> }
            readonly terminals?: ReadonlyArray<StateToken<D>>
        }
        type RuleToken<Id extends string> = { readonly "~rule": Id }          // Id: `${definition id}.${Name}`
        declare const rules: <D, const I extends string = never, const T extends string = never>(
            source: D | Machine<D>, build: Build<D, I, T>) => Build<D, I, T> // returns the build itself: shared, typed
        ```

        What each builder gets. A machine: `S`, `E` and `turn`. A trait: `E` and `turn`, no `terminals`, no `in`. A
        subroutine: its own `S`, `E` (with `hostEvents`) and `turn`. `turn({ on, check })` is typed by the definition:
        `event` is the payload of `on`, `before.memory` and `after.memory` the definition's memory; a bare function
        `({ before, after }) => ...` is also a turns rule, with no `event`. One token id per rule, the definition's:
        `Shop/Order.PaidHasReceipt`, `Ui/Upload.CancelSticks`; a placement is not part of the id (`Host` names it
        beside the rule). `rules(Order, build)` returns the build itself, so one build is shared by machines of one
        definition and keeps its tokens.

        Spiked on toy definitions under `strict` and `exactOptionalPropertyTypes` (TypeScript 7.0.2; not yet on the real
        package): names are inferred from the keys alone; `event` is typed through `turn` and a wrong payload field is
        refused; a duplicate name across `invariants` and `turns` is refused at the key; `.rules` on a ruled value is
        refused; a shared build keeps its tokens and a build of another definition is refused; `Machine<D, N>` assigns
        to `Machine<D>`; a trait's builder has no `S`. A subroutine's builder and the real `Definition` are
        @task.V3.T109's spike, and "a ruled value has no `.rules` method" in one `Machine<D, N>` is a build detail of
        @task.V3.T106.

        Construction refuses, so a cast or plain JavaScript meets the same reasons as the types (I13): `RulesEmpty` (a
        build with no rule; write no `.rules(...)`), `RuleNameTwice`, `InvalidName` (a reserved name),
        `RulesWrongSubject` (a build typed from another definition, by id), and an empty or repeated `terminals`
        list. `.rules()` is an authoring constructor, so it raises for no finding (R11): the value it returns is
        `Refused`, with these findings. [decided: agent writer 2026-11-22] Why: R11 has no raise for a finding.
        Reverse: `.rules()` raises. An unknown key (`chek`, `terminalz`, `in` on a turns rule) is refused by the strict
        decode, never relied on in the types (Q19). `RulesDiffer` (two values of one id with different rules in one
        run) is not a construction row: `Host`'s `storyCompiled` refuses it when a Story starts.

        Kept limits, each to re-run on the real package: `Machine<D>` annotations lose the tokens (Q2); the messages
        of a wrong payload in a turns rule read "no overload matches" at `.rules(`; a rule named `constructor` or
        `rules`
        is refused as `InvalidName`.

    MapperTypes = mappers and contracts.

        ```ts
        // src/contract.ts. NEW: MapperContext, CoversInput, HandlesTimeout. CHANGED: Ending gains Cx; ErasedEnding.
        export type MapperContext<I, K> = { readonly input: I; readonly key: K };
        // Ending: `from` becomes (value: V, context: Cx) => Values; its other fields are unchanged.
        export type Ending<V = unknown, Id extends string = string, Cx = unknown> = EndingFields<V, Id, Cx>;
        export type ErasedEnding = Ending<never, string, never>;
        export type CoversInput<F extends Fields, Key extends ReadonlyArray<string>> =
            [Exclude<keyof StructType<F>, Key[number]>] extends [never] ? unknown : { readonly key: never };
        export type HandlesTimeout<E> =
            [Extract<E, { readonly _tag: "TimeoutError" }>] extends [never] ? unknown : { readonly commit: never };
        // src/event-tokens.ts. CHANGED: `from` takes (value: V, context: Cx); MappedEvent gains Cx.
        // NEW: `readonly Type: P`.
        ```

        With no annotation, `value` is the commit's success or the tagged failure, `input` the contract's input and
        `key` its picked key record, keyed and unkeyed. `V` is found by return-type inference from the ending's slot.
        An empty key is `{}`, not `never`. Today a second mapper parameter is a compile error (`TS2345`), so the
        user's decided shape is not yet expressible. A schedule's `send` keeps one argument, the firing's metadata
        (Q10): a firing has no `input`.

        `resource` keys: a key that omits an input field, optional ones included, is an error on `key`; a
        `transaction` may keep a partial key; no fixture `resource` is newly refused. This needs `KeyFields<F>`
        widened from required keys to `keyof StructType<F>`: with today's `KeyFields` an input with an optional field
        could never have a resource. The widening also lets a `transaction` name an optional field. `TimeoutError`:
        the match is by tag, since `Extract<E, Cause.TimeoutError>` matched fixture errors structurally and refused
        correct commits. `Bound<"read">` has no `concurrency`: designed, not compiled (Q12). `E.X.Type` and
        `D.M.x.Type` are the payload and the field type; the token stays callable.

    OutputKept = the schedule metadata's `output` stays `unknown` (Q11). Two shapes were compiled and both fail: a
        per-entry helper leaves `from`'s `V` with no inference source (`output: never`), and a check against the
        captured body type gives `unknown` (no body is captured now, Q19), because a callback's parameter cannot be
        typed from a sibling property through a mapped type of the body. No fixture mapper reads it
        (`home/machines/room.ts` reads `key`, `firedAt` and `attempt`).

    ErasedCompiled = `Compiled` is not generic in `D`. The core runs every machine of a world through one
        `Map<MachineId, Compiled>`; a `Compiled<D>` would be instantiated at `AnyDefinition` in every core signature,
        and TypeScript has no existential type, so the parameter buys nothing inside the core and costs
        instantiations on every function. One erased `Compiled`, precise where that is free; the typed face is
        `Machine<D, N>`.
        Branded names. One list, each made only by a decode built from `Compiled` or by the mint: `MachineId`,
            `StateName`, `EventTag`, `OperationName`, `ScheduleName`, `Reason`, `SlotName`, `RuleName` (a rule's name: 
                a key of the build, before the definition id is added),
            `ActorName`,
            `ContractName`, `KeyText`, `AttemptId`, `SubjectAddress`, `ShapeStamp`. `state: string` and `operation:
            string` in `compiled.ts`, `world.ts` and `evidence.ts` become these; `Changes`' `history` and
            `context.slots` maps key by `StateName` and `SlotName`; `Broken.rule` and `off` both use the rule token
            ids (`Verdict<R>`, `Host`).
        `Slot<I, O>` keeps its erased input honest: `run: (input: never) => O`. A typed callback assigns to it with no
            cast, and only `slot` may call it.
        `AnyBody` becomes a true supertype of every `MachineBody<D>`: its callbacks take `never`. A body then assigns
            to it with no cast, inside a generic function too (compiled: rule checks and schedule `keys`, `restartOn`
            and reasons at `never`; `states` and `schedules` must be `Partial` records under
            `exactOptionalPropertyTypes`; `on` handlers were not confirmed at `never`, Q12).
        New fields: `schedules` (`DeclaredSchedules`), `saved` (`Records`' seven codec groups, granted) and
            the derived fields of `DerivedFields`.

    Crossings = a type crosses between the typed shell and the erased core at three named functions and nowhere
        else; a fourth carries a contract's services.
        `door`: public signature onto an erased implementation. `entry.ts#door<Public>(name, args, run)`. Its cast
            is justified because `run` is written on erased types only and the public type is a `derive.ts`
            declaration. Absorbs `entry.ts` `wrapped as F`, `machine.ts` `trustedTokens`, `flow.ts`'s `contextSlot`
            overload cast, `events.ts` `codecOf` and `trusted`.
        `slot`: typed callback into the erased core. `handles.ts#slot(name, run)`, the only caller of a `Slot`.
            Justified because the input was built by `Compiled`'s own codecs for that callback's position. Absorbs
            `handles.ts` `erase`, `machine.ts` `erasedWhen`, `contract.ts` `trustedAttempt`, `compiled-parts.ts`
            `endingValue`.
        `project`: erased state out to the typed reader. `host/snapshot.ts#project<D, View>(machine, erased, view)`.
            Justified because the actor is of `Machine<D>` and its memory passed `Compiled.memory` at every write.
            Absorbs `host/snapshot.ts` `asOutside`; the test tooling's own restores (`Host`).
        `provided`: `host/driver.ts#provided`, a contract's services; the boot provides them and
            `host/run-promise.ts` calls it instead of casting again.
        Inside a door the erased value comes from a decode, never a cast: `machine()`'s body decode
        (`config.ts#bodyFindings`) already runs and its result is thrown away; it now returns the `AnyBody`. That
        removes the casts of `machine.ts` `decodedOf` and `erasedBody`, `compile-body.ts`'s alternatives cast,
        `compile-schedules.ts`'s `Duration.Input` cast and `flow.ts` `selectOf`, and one of the two body walks, once
        the `AnyBody` spike passes (Q12). A door cannot be written without its one cast: the erased implementation
        assigns to the public signature in its parameters and fails only on the return type ("`AnyDefinition` is not
        assignable to type `D`"). Evidence leaves through the same `project` rule: a Story reads typed evidence only
        through one function per carrier that takes the `Machine<D>`; `Host` names it. The other kept casts are not
        crossings but boundaries to something outside Flow's types: the mint, `tx.ts#draft`, the JSON entry and
        Effect's Schema AST (`core/boundary.ts`). A count cannot tell a wrong cast from a right one; what justifies
        `slot` and `project` is I3: each typed reader has a run that reads the same value.

    ConstructionValue = construction is a value.

        ```ts
        // src/derive.ts. NEW: Construction
        export type Construction = Data.TaggedEnum<{
            Built: { readonly compiled: Compiled; readonly warnings: ReadonlyArray<Finding> };
            Refused: { readonly findings: NonEmptyReadonlyArray<Finding>; readonly cause: Option.Option<unknown> };
            Blocked: {};                // its definition or a contract has an error finding; the body never ran
        }>;
        ```

        `Refused.findings` are the machine's own, at least one an error; `cause` is what a throwing body threw. A
        definition and a contract keep their tokens and store their own `findings` (empty when clean). No authoring
        constructor (`definition`, `transaction`, `resource`, `machine`, `app`, `runtimeSetup`, `Story.app`) raises
        for a finding; each still raises for an argument of the wrong kind, since no tokens can be made from it.
        Findings are stored once, where they arise; an app's are derived: `findingsOf(app)`. `compiledOf(app)` is the
        only function that turns an app into something runnable, and the only one that raises for findings; a
        Runtime start and a Story's `run()` are its only callers. A definition with a finding must still hand out
        every token (Q1, Q12); a finding that cannot keeps raising at `definition()`.

    FindingShape = a finding.

        ```ts
        // src/error.ts. CHANGED: Finding. NEW: reason as a key of CHECKS, owner, location.
        // existing: path, summary, help, details
        export type Finding = {
            readonly reason: Reason;                       // keyof typeof CHECKS; severity is CHECKS[reason].severity
            readonly owner: Owner;                         // { kind: "contract" | "definition" | "machine"; id }
            readonly path: ReadonlyArray<string | number>; // the path inside the owner, always
            readonly location: Option.Option<Location>;    // { file: string; export: string; line: Option<number> }
            readonly summary: string; readonly help: string; readonly details: Values;
        };
        ```

        A finding stores no severity and no stage: both are read from its reason's row, so they cannot disagree.
        `location` is always `none` in the core. Only the CLI's source adapter fills it (Q7).

    DerivedFields = the fields `indexOf` writes, each read instead of a scan. `Compiled`'s derived fields are written
        only by `indexOf`, in the one construction step, and never at run time. The slow scan each replaces is the
        reference in the I10 test. Per field, what it replaces and who reads it.
        `Node.chain`, `Node.depth`: `tree.ts#chainOf` (28 uses in `src`, 8 inside `tree.ts`, O(d^2) allocation each).
            Reader: the turn walk's `levelsOf`, which moves.
        `Node.leaf`: `tree.ts#leafOf` walking defaults. Readers: entry, restore.
        `Node.declared` (the schedules of its chain): `schedule-plan.ts` `declaredOn` per pass. Reader: `Schedules`'
            `schedulesAt`.
        `Node.armedBy`, `Node.disarmedBy` (tag to schedules): scans of `armOn` and `disarmOn` per turn. Readers:
            `Schedules`, `Changes`.
        `schedulesByName`, `rank`: `findIndex` at `schedule-plan.ts`; the due order. Reader: `Schedules`. `rank` is
            the schedule's position in the definition's `schedules`.
        `entryArmed` (names armed on entry): `persist.ts`, states by schedules per saved timer. Readers: `Schedules`,
            `Records`.
        `fieldsByName`, `privateFields`: `compiled.ts` a Set per call. Readers: `project`, `Changes`.
        `inputFields`, `savedFields`, each sorted: `identity.ts`, `actor-record.ts` filter and sort per call. Reader:
            `Records`.
        `handledTags`: `machine.ts` `handled`. Readers: construction, the `UnhandledEvent` row.
        `shape`: `Records`' `shapeOf`. Reader: the record stamps.
        `slotsAt`, `listOf`, fillings by callback: `Changes`. Reader: `Changes` (with fragments).
        Memory: `Node.chain` costs O(N*d); `Node.declared` and the two tag maps O(leaves * the schedules of a chain);
        the rest O(N + F + S). The edge graph (`edgesOf`) is not stored: only the CLI reads it, once per command. Per
        turn, nothing in this Spec runs.

invariants
    I1  One source. Every exported type that mentions a name, payload, key or reason of a definition is an 
        instantiation of a `derive.ts` type (or of `contract.ts` or `core/checks.ts`, each for its own
        declarations). [@R1, @R2]

    I2  Unknown keys refused at construction. A body or a rules build with a key its definition's shape lacks is 
        refused by the strict decode when the machine or `.rules()` is built, and `flow check` reports it; no type test
        promises it (Q19). A misspelt name held in a typed record or token is a type error. [@R2]
        Superseded: "a body with a key its definition's shape lacks does not compile, at every depth and in every
        union member", by the user's 2026-11-22 decision (Q19, @proposal.external-rules).

    I3  Delivered as typed. For each row of `Derivation`, the value the runtime delivers at that reader has the row's 
        type: a type test and a Story read the same reader. [@R3, @R15]

    I4  Named crossings. The cast disables in `src/` outside test tooling are exactly: `door`, `slot`, `project`, 
        `provided`; the mint, `tx.ts#draft` and `codec.ts`'s JSON entry; the seven in `core/boundary.ts`. `refs.ts`'s
        `slotRefs` joins the list or goes once its spike is run (Q12). The count of 38 cast disables at HEAD is of
        `src/` production files, not `tests/` or `fixtures/`. [@R13]

    I5  Total construction. No authoring constructor raises for a finding. [@R11]

    I6  Nothing hidden. `findingsOf(app)` holds every finding of every owner exactly once, warnings included, whatever 
        the state of the other machines. For a `Refused` machine one is its own error; for a `Blocked` one,
        an error of its definition or of a contract. [@R4, @R5]

    I7  Never runs. `compiledOf(app)` raises when any machine is not `Built`; no `Compiled` exists for a machine with 
        an error construction row; a `Blocked` machine's body ran zero times. [@R11]

    I8  One row per reason. A reason has one severity and one stage, and a finding has no other source for either. 
        [@R12]

    I9  Pure compile. `compile` reads only its two arguments; two compiles of one source are equal by `dataView` (which 
        shows a Slot by its name); no type reachable from `Compiled` holds a file position. [@R6, @R5]

    I10  Derived fields are derived. Every field of `DerivedFields` equals its defining scan over `Compiled`'s facts.
        [@R7, @R14]

    I11  Codecs come from the declaration. Each leaf of `Compiled.saved` and of `Compiled.schedules` is the codec of
        the declaration that types its readers in `Derivation`. [@R3, @R14]

    I12  A machine's type widens. `Machine<D, N>` assigns to `Machine<D>` and to `Machine`. [@R9]
        Edited by the user's 2026-11-22 decision (@proposal.external-rules): `R` from the body became `N` from
        `.rules(build)`.

    I13  Twin refusals. Every refusal the types make for a schedule or a rule name has a construction row of the same
        meaning, so a body that reaches `machine()`, or a build that reaches `.rules()`, by a cast or plain JavaScript
        is refused with the same reason. [@R8, @R9]

    I14  Stage decides refusal. A construction row with severity `error` is exactly what makes a machine `Refused`; a
        graph row never does, and a warning never blocks a definition, a contract or a machine. [@R11, @R12]

operations
    definition(config)
        ensures  Returns `Definition<..., Sch>`; never raises for a finding. Raises only for an argument of the wrong
                 kind.

    machine(definition, body)
        ensures  Returns `Machine<D>` whose `construction` follows table `Construction`; the only raise is a body
                 that is not a function, checked first. Nothing is read from the body's type.

    attachRules(build)                         written `.rules(build)`; also on what `trait()`, `subroutine()` return
        requires  The value has no rules yet: `.rules` on a ruled value is a type error.
        ensures   Returns the same value typed `Machine<D, N>`, `N` the names of `build`'s `invariants` and `turns`;
                  pure; reads only the definition and the build; a refusal (`RulesEmpty`, `RuleNameTwice`,
                  `InvalidName`, `RulesWrongSubject`, a bad `terminals` list) makes its `construction` `Refused`, and
                  it never raises for a finding. Rules judge only in Stories (`Host`). [@R9, @R11]

    rules(source, build)
        ensures  Returns `build` itself, typed from `source` (a definition or a machine), so machines of one definition
                 share one build and `.rules(shared)` keeps its tokens. [@R9]

    compile(definition, written)
        requires  `written` is what the body returned.
        ensures   Returns `Result<{ compiled, warnings }, NonEmptyReadonlyArray<Finding>>`; pure; one decode, one
                  walk, `indexOf`.

    indexOf(parts)
        ensures  The derived fields of `DerivedFields`; the only writer of them.

    findingsOf(app)
        ensures  `ReadonlyArray<Finding>` in the order of `Loading`; each owner once.

    compiledOf(app)
        ensures  Returns the `CompiledApp`, or raises one `FlowError` with every error finding. Called when a Runtime
                 starts and when a Story runs.

    project(machine, erased, view)
        ensures  Returns `Snapshot<D, View>`; the one outward restore.

    flowCheck(app)
        ensures  `flow check`: `Effect<Result, InvocationFailure, Env>`; behaviour in table `Loading`.

algorithm
    The tables below are the one statement of each rule; the pseudo-code at the end restates them.

    Construction. A machine's construction, one row per case; the first row is checked first and is the only raise.
        body not a function; any definition or contracts: raises `WrongKind` (a module that does not load); body
            runs 0.
        a function; definition or a contract has an error finding: `Blocked`; body runs 0.
        a function; no error finding; the body throws: `Refused`, one `Defect` finding, the cause kept; body runs 1.
        a function; no error finding; the body returns and a construction row has an error: `Refused`, every
            construction finding; body runs 1.
        a function; no error finding; the body returns with construction warnings only, or none: `Built`, with those
            warnings; body runs 1.
        `Blocked` exists because a body run against a refused definition's tokens would throw for reasons that are
        not the body's. A definition or contract with only warnings does not block.

    Loading. For the CLI and for a run, one row per outcome of the config import.
        loads; all machines `Built`, no error row: `flow check` prints findings (warnings, info), exit 0; starting a
            Runtime or running a Story runs.
        loads; all `Built`, an error row: `flow check` prints findings, exit 1; a run runs (a graph error does not
            stop a run).
        loads; some `Refused` or `Blocked`: `flow check` prints every machine's findings, graph rows only for `Built`
            ones, exit 1; `compiledOf` raises one `FlowError`, exit 2 as `RunRejected`.
        throws anything: `ConfigLoadFailed` on stderr, exit 2; when the throw is a `FlowError` (a wrong-kind
            argument), all its diagnostics are printed; a Runtime start or Story run fails the same.
        `findingsOf(app)` visits owners in this order and each owner once, at its first visit: for each machine in
        key order, its contracts in declaration order, its definition, then the machine itself (`Refused.findings` or
        `Built.warnings`), then, when `Built`, its graph rows. Within an owner: by path, then reason. `Blocked` has
        no finding of its own; its definition's or contract's error is in the list under that owner. A graph error
        (`TerminalLeft`) fails `flow check` and does not stop a machine or a Runtime: only construction errors do.

    Reasons. One table of reasons (`src/core/checks.ts`; a reason is a key, so it has one row).

        ```ts
        // src/core/checks.ts. NEW: CHECKS, Reason, Stage.
        export const CHECKS = {
            DelayOutOfRange:        { severity: "error",   stage: "construction" },
            ScheduleUndeclared:     { severity: "error",   stage: "construction" },  // and the other twins
            RuleNameTwice:          { severity: "error",   stage: "construction" },  // `.rules()`: invariant and turns
            UnknownField: { severity: "error",   stage: "construction" },  // an unknown body key; `flow check` too
            RulesEmpty:             { severity: "error",   stage: "construction" },  // NEW: `.rules()` with no rule
            RulesWrongSubject:      { severity: "error",   stage: "construction" },  // NEW: another definition's build
            RulesDiffer:            { severity: "error",   stage: "story" },         // NEW: two builds of one id
            ReactionUnhandled:      { severity: "error",   stage: "construction" },  // today `UnhandledEvent`
            ScheduleUnplaced:       { severity: "warning", stage: "graph" },
            UnhandledEvent:         { severity: "warning", stage: "graph" },
            StateUnreachable:       { severity: "warning", stage: "graph" },
            LikelyStuck:            { severity: "warning", stage: "graph" },
            RuleSubjectUnreachable: { severity: "warning", stage: "graph" },
            RulesBypassed:          { severity: "warning", stage: "graph" },  // NEW: `flow check`, over loaded modules
            TerminalLeft:           { severity: "error",   stage: "graph" },
            // ... every other reason: today's codes (`Defect`, the decode's, each `InvalidConfiguration` reason),
            // then each owner Task's rows
        } as const satisfies Readonly<Record<string, { severity: Severity; stage: Stage }>>;
        export type Reason = keyof typeof CHECKS;
        ```

        A `construction` row with severity `error` is what makes a machine `Refused`; a `graph` row never does; a
        `story` row refuses a Story's start (`Host`'s `storyCompiled`), never a machine and never a Runtime.
        [decided: agent writer 2026-11-22] Why: `RulesDiffer` concerns two values of one run, and no other stage fits
        (@proposal.external-rules). Reverse: a `construction` row that `storyCompiled` raises.
        `UnhandledEvent` as a graph row means: a declared event that no state and no root handler names;
        `handledTags` is machine-wide, as `machine.ts` is today. The reaction finding is renamed `ReactionUnhandled`,
        so `UnhandledEvent` has one meaning and one severity; `DelayOutOfRange` is a construction row only.
        Terminals are proved by `flow check` over the edge graph, and again by `storyCompiled` when a Story starts
        (once per ruled value, memoised); no run judges them; the finding is `TerminalLeft`. Every row has a fixture
        `CATALOG` (`Operations`) names run-time codes; its `InvalidConfiguration.reasons` is `keyof typeof CHECKS`,
        derived, never copied.

    machine(definition, body):                       # door; erased inside
        if body is not a function: raise WrongKind
        if definition or one of its contracts has a finding whose row is an error: return made(Blocked)
        written = try body(tokensOf(definition))       # tokens: S, E, O, C
        if threw: return made(Refused { findings: [Defect at ["body"]], cause })
        return match compile(definition, written):
            failure fs         -> made(Refused { findings: fs, cause: none })
            success (c, warns) -> made(Built { compiled: c, warnings: warns })

    machine.rules(build):                            # `.rules()`; pure; reads the definition and the build only
        fs = construction rows over (definition, build): RulesEmpty, RuleNameTwice, InvalidName, RulesWrongSubject, a
            bad `terminals` list, and the strict decode's unknown keys
        return fs is empty ? the same machine, its tokens typed from the build
            : the same machine, `Refused` with fs (its own findings stay; `findingsOf` lists each once)

    compile(definition, written):                    # pure, no host API
        body  = decode(BodySchema(definition), written)        # the one walk that types the body as AnyBody
        tree  = definition.tree                                 # built once in definition(); chain and depth
        parts = walk(tree, body):                               # one pre-order walk, an accumulator, no spreads
            per node: handlers (by Map lookup of the node's children), schedules through slot(...),
            add each handled tag to handledTags
        fs    = construction rows of CHECKS over (definition, parts)       # one pass each; reads handledTags
        if any row of fs is an error: return failure(fs)                # all of them, warnings included
        return success(freeze({ ...parts, schedules, saved, ...indexOf(parts) }), fs)   # fs holds warnings only

    findingsOf(app):
        seen = {}
        for machine in app, in key order:
            for owner in contracts of its definition, then its definition: if owner not in seen: add; yield findings
            yield Refused.findings | Built.warnings | nothing when Blocked
            if Built: yield graph rows of CHECKS over edgesOf(compiled)     # computed per command, not stored

composition
    flow
        Offers `derive.ts`: every public type another Spec names, the rows of `model` (`Derivation`), exported as the
        author-facing names where `model` says (`Reads`, `BodyTokens`, `E.X.Type`).
        Offers `Construction`, `findingsOf` and `compiledOf`: a Story's `run()` and a Runtime start call `compiledOf`
        and nothing else does; a verdict never sees a machine that is not `Built`.
        Offers `CHECKS`, `Reason` and `Finding`: `Operations`' `CATALOG.InvalidConfiguration.reasons` derives from
        them; every owner's rows join `CHECKS`.
        Offers `project` and the evidence rows: the one outward restore; `EvidenceOf<D>` is the evidence the public
        `Published<D>` and `Turn<D>` faces carry, with the declared schedule name, key and reasons; the faces are
        `Host`'s.
        Offers `Compiled`'s schedules, saved groups and derived fields as `model` says, and the rules builder's
        types and `rules(source, build)` (`RuleTyping`).

        What each other Spec must provide.
        - `Schedules`. The declared form and its decide tables; what an active placement inherits; the codecs of the
            key and selection are read from `Compiled.schedules`.
        - `Changes`. The declared parts of its rows (props, emits, fragments, slot rows); `Reads<D, Scope, View>`;
            the turn walk reads `Node.chain`, `depth`, `armedBy`, `disarmedBy` and the field indexes; a turns rule
            reads its `Turn`.
        - `Records`. `Compiled.saved` and `shape` exist; the brands of `ErasedCompiled` are one list; `RefMapsOf`
            is still unproved (Q14).
        - `Operations`. The authoring doors do not raise for a finding (Q1), which amends the rule that a refused
            door raises, for those doors only; `HandlesTimeout` matches by tag; `CoversInput` counts optional
            fields; the mapper context is `MapperContext<I, K>`; `intake` returns
            `NonEmptyReadonlyArray<Finding>`.
        - `Host`. `compiledOf` called by a Story's `run()` and a Runtime start; the rule tokens of
            `Machine<D, N>["rules"]`, with `Broken.rule` over their ids; rules judged only by Story tooling, never by a
            Runtime (Q5); `storyCompiled`'s refusal (`RulesDiffer`); `RulesBypassed` is a `flow check` warning only, 
                with no twin
            refusal in `storyCompiled`;
            `project` as the one outward restore for `read(ref)`, the publication and inspection, and the
            eight test-tooling casts of the companion's fit table; the fields of `EvidenceOf<D>`; `Finding.location`
            and the source adapter (Q7); the CLI's result table with `Loading`'s rows; the generators and mutation
            tooling.

rules
    FindingStored      A finding stores no severity and no stage: both are read from its reason's row (`Reasons`), so 
                       they
                       cannot disagree. [@R12]
    NoRaiseForFinding  No authoring constructor raises for a finding; each raises only for an argument of the wrong
                       kind. `compiledOf(app)` is the one function that raises for findings. [@R11]
    OneWriter          `indexOf` alone writes `Compiled`'s derived fields; `compile` alone makes a `Compiled`. [@R14]
    OneSource          A fact read outside the body is declared on the definition; no second declaration site exists, 
                       and
                       a new feature names its declared part, its `Parts` field and its rows before code. [@R1]
    Twin               Every refusal the types make has a construction row of the same meaning (`DeclaredSchedules`). 
                       [@R8]
    ThrowingBody       A throwing body refuses its own machine only: `Refused`, one `Defect` finding at `["body"]`, the
                       cause kept; no other machine of the module is lost. [@R4]

realization typescript
    Type-check cost, measured on a copy of the real package (`tsc` 7.0.2, the full project of 1028 files).
        today: 0.77 s, 4.47 M instantiations, 836 k types.
        body capture: 0.95 s, 5.89 M, 1.04 M types. [Measured; the capture is not built, Q19.]
        body capture and the mapper context: 1.01 s, 5.97 M, 1.05 M types.
        Body capture costs about 23% check time and 32% instantiations here, nearly all of the cost. It is not built
        (Q19, option C): these figures are the reason, kept as measured and not as a plan. Rule names, `turn`, `.Type`
        and the two contract checks: 0.614 s against 0.602 s on a smaller project (src, fixtures, spikes), 3.85 M
        against 3.83 M instantiations: about 2%, measured when the rule names came from the capture. Declared
        schedules are not measurable in this run: the copy's fixtures still use `Flow.keyed` and fail (46 errors),
        which skips their checking, so its 0.95 s and 5.73 M are a floor. Measured total with the capture: 31% (0.77 s
        to 1.01 s); withdrawn: the "30 to 40% expected" total. The build records the real time per step without the
        capture, and the `.rules(build)` typing's once it compiles on the real package. Not measured: editor
        latency, the emitted declaration size with `N`, the docs build.

    Construction cost, by reading; no bench covers it, so the build adds `construct.small`, `.wide` and `.deep`.
        Sizes: `N` states, `d` depth, `c` children of a compound, `K` body keys of a compound, `H` handler
        alternatives, `S` schedules, `R` reactions, `F` fields, `O` operations. Today against after.
        body decode and compile: two walks of the body (`config.ts`, `compile-body.ts`) -> one decode whose result the
            compile walks.
        state tree: built in `definition()` and again in `machine.ts`; `tokenMaps` re-splits every path, O(N*d) ->
            built once, with `chain` and `depth`.
        `nodesOf` result: `[...self, ...below]` per level, O(N*d) copies -> one accumulator, O(N).
        `childNodes`, `defaultOf`: `K x c` and `c` scans per compound -> Map lookups, O(K).
        reaction check `handled`: O(R*N) -> the `handledTags` set, O(R).
        schedule arming check: O(armOn x disarmOn) per schedule -> a set, O(armOn + disarmOn).
        key field check: `toType` per operation, `includes` per key -> the contract's field set, built in its door.
        `codecsOf`: per binding (`contract.ts`) -> once, in the contract's door.
        a field's JSON form: about four times per Schema -> once per field; the struct forms built from them (not
            measured).
        whole construction: O(N*d + N*c + R*N + S*a^2) -> O(N + H + S + R + F + O).

    Lint rows (one point each, `tools/flow-state-lint/`).
        `no-hand-typed-callback`: an annotation on a parameter that a Flow position already types.
        `no-wide-public-name`: `string`, `Values` or `unknown` where an exported signature carries a declared name or
            a payload, outside `FLOW_STATE_ALLOW_UNKNOWN`.
        `no-throw-in-user-callback`: a `throw` statement lexically inside a body, mapper, guard or rule.
        `no-host-read-in-body`: `import.meta`, `process`, `Date` or `Math.random` lexically inside a machine body or
            a definition config.
        `no-bare-export`: a module that calls `X.rules(...)` must not export the bare `X`.
            [decided: agent specs lead 2026-11-22] Why: an app that imports the bare machine would run no rules and
            would not know it. Reverse: no lint rule; the Story's own check stays.
        `rules-argument`: the argument of `.rules(...)` is an arrow or an identifier, never a conditional.
            [decided: agent specs lead 2026-11-22] (@proposal.external-rules) Why: a conditional rule set is a
            hidden switch. Reverse: allow it.
        `paired-refusals` stays; `no-mark-probe` goes with the marks of the doors.

    Kept wide, each with its reason: the schedule metadata's `output` (`OutputKept`); members of family D not yet
    rows (Q16).

coverage
    @R1    enforced_by [@I1]               proven_by [@T1, @T3]
    @R2    enforced_by [@I1, @I2]          proven_by [@T1, @T3]
    @R3    enforced_by [@I3, @I11]         proven_by [@T2]
    @R4    enforced_by [@I6]               proven_by [@T4, @T8]
    @R5    enforced_by [@I6, @I9]          proven_by [@T4, @T6]
    @R6    enforced_by [@I9]               proven_by [@T6]
    @R7    enforced_by [@I10]              proven_by [@T5, @T10]
    @R8    enforced_by [@I13]              proven_by [@T1, @T4]
    @R9    enforced_by [@I12]              proven_by [@T1]
    @R10   enforced_by [@I3]               proven_by [@T1, @T2]
    @R11   enforced_by [@I5, @I7, @I14]    proven_by [@T4, @T8]
    @R12   enforced_by [@I8, @I14]         proven_by [@T4]
    @R13   enforced_by [@I4]               proven_by [@T7]
    @R14   enforced_by [@I10, @I11]        proven_by [@T2, @T5]
    @R15   enforced_by [@I3]               proven_by [@T1, @T2]

tests
    T1  Type patches. Each is a planted change to a type that must turn a named two-sided test red: `KeyOfDecl` 
        returning `Values`; `ReasonOfDecl` returning `string`; `SelOfDecl` returning `unknown`; `keys` optional when
            keyed; `TimersOf` replaced by `Timers`; `MapperContext` as `unknown`; `CoversInput` and `HandlesTimeout`
            as `unknown`; `.Type` as `unknown`; a turns rule's `event` as `Values`; `RuleToken`'s id widened to
            `string`; `Machine`'s `N` invariant; a duplicate name across `invariants` and `turns` accepted. 13 patches
            (`ExactBodyOf` without `Exact` and `RuleNames` returning `string` are gone with the capture, Q19), each
            against the toaster of the companion and, once migrated, two fixtures (`home/Room`, `shop/Cart`), at
            depths 1 to 3. Also pinned: a state, event and memory typo (the rows marked "today"); `.rules` on a ruled
            value and a build of another definition refused; a rule name outside the build a type error. The two
            one-sided pins of `tests/types/schedules.test-d.ts` are inverted and each pin names the row that flips it.
            The unknown-key refusal (I2) is a runtime test, not a type test: `tests/compile/construction.test.ts` and
            a `flow check` case in `tests/cli/`, for a body key and for a rules key. `paired-refusals` stays at 0.
            [@I1, @I2, @I12, @I13]
    T2  Delivered as typed. Each two-sided type test has a Story that reads the same reader at run time: an unkeyed 
        mapper's `key` is `undefined`; a snapshot's timers have exactly `TimersOf`'s keys; a value encoded by the
            declaration's Schema decodes through `Compiled.schedules`' codec to an equal value, per fixture. A surface
            test (`tests/types/public.test-d.ts`) walks every export; a type that names a definition's part without 
                going
            through `derive.ts` fails it, and family D's debt (Q16) is its starting red list. [@I1, @I3, @I11]
    T3  The walkthrough toaster of the companion compiles with no annotation, and every claim of its bullets is 
        asserted two-sided: a misspelt state, event, schedule, reason or rule name, an unkeyed `key.slot`, a wrong
            payload or another definition's event each fail to compile. [@I1, @I2]
    T4  Construction, exhaustive. Alphabet: definition {clean, finding} x contract {clean, finding} x body {clean, 
        warning only, error finding, two error findings, throws, not a function} x a second machine {clean, error
            finding} x use {`flow check`, run}: 96 cells, with the definition's and contract's "finding" taken once as 
                an
            error and once as a warning in a 16-cell slice. The oracle is tables `Construction` and `Loading` read row 
                by
            row; it checks the exit, that every owner's findings are present exactly once, the count of findings, and
            that the body ran exactly the number of times `Construction` gives. Seven more cells give each authoring
            constructor an argument with a finding and require no raise. One test asserts every `Finding`'s severity is
            read from `CHECKS`. Each twin row of `DeclaredSchedules` is reached by a body through a cast. [@I5, @I6, 
                @I7,
            @I8, @I13, @I14]
    T5  Index. For every fixture machine, recompute each derived field by its slow scan and compare. The scans 
        (`chainOf`, `leafOf`, the filters `DerivedFields` replaces) move into this test as the reference; `shape`,
            `slotsAt` and `listOf` take their defining scans from `Records` and `Changes`. [@I10, @I11]
    T6  Purity. Compile each fixture twice, once under a stubbed clock and a second module instance; compare by 
        `dataView`. A lint row bans `Date`, `Math.random`, `import.meta`, `process` and `Error().stack` in every file
            `compile` reaches, and a type test asserts `Location` is not reachable from `Compiled`. [@I9]
    T7  Crossings. A test compares the cast disables, by file and function, with I4's list; a new one fails it. Its 
        count goes from 38 to the list as the casts are deleted. [@I4]
    T8  Stories of the wrong ending. (1) A room's poll is paused by `Vacation`; its author writes `paused: { Vacaton: 
        ... }` and a view reads `pausedBy.includes("Vacation")`. Today both compile: the reason never holds,
            the timer fires while the house is empty, the view never shows the pause. Here the misspelt reason is a
            type error because every declared reason is a required key (Q4: the missing `Vacation` callback does not
            compile), and the construction check refuses the stray `Vacaton` key too (`ReasonUndeclared`, Q19: no
            body type is captured, so the type error rests on the required keys). [decided: agent specs lead
            2026-11-22] Why: Q4 and Q19 together give both refusals. Reverse: state only the construction refusal.
            (2) An app has two machines, one with a negative delay and one with an unreachable state. Today `flow check`
            can show at most the first throw and the second problem ships. Here both rows print and the exit is 1.
            [@I1, @I6, @I7]
    T9  Planted faults, each caught by `nub run faults`: `machine-throws-on-finding`, `first-finding-only`, 
        `blocked-runs-body`, `refused-compiles`, `reason-two-severities`, `index-chain-stale`,
            `index-armedby-missing-root`, `compile-reads-clock`, `project-second-cast`, `key-codec-from-body`,
            `rule-name-widened` (aimed at `.rules()`'s name typing), `location-in-compiled`, `warning-blocks-machine`,
            `construction-warning-dropped`, `shared-definition-reported-twice`.
            [@I4, @I6, @I7, @I8, @I9, @I10, @I11, @I12, @I14]
    T10  Bench. The build adds `construct.small`, `.wide` and `.deep`, and records check time after each build step.
            [@I10]
