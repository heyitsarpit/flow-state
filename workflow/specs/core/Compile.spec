spec Compile
status        proposed
basis         A guide, revisable whenever building shows it wrong; each change and its
              reason is recorded in workflow/specs/spec-log.md.
              Written from the merged flow plans (proposed); split per spec-split.md there.
location      packages/flow-state-v3/src
provides      definition, machine, trait, subroutine, app, Compiled
derives_from  [
              @plan.Machines.O1, @plan.Machines.V1, @plan.Machines.V2,
              @plan.Runtime.O1, @plan.Runtime.V1
              ]

requirements
    R1  Inert construction
        source  @plan.Machines.O1; @plan.Runtime.O1.
        must    definition, machine, trait, subroutine and app return synchronously and start no 
                actor, work, timer, storage access, service, loader or evidence. machine runs its 
                callback exactly once, with { S, E, O }, and the callback returns static 
                configuration.

    R2  One construction failure
        source  @plan.Machines.O1; @plan.Runtime.O1.
        must    Invalid construction throws one FlowError that lists every discovered violation, in 
                declaration order then rule order, each with its offending field path. Nothing is 
                returned and nothing starts.

    R3  The machine adds nothing
        source  @plan.Machines.O1.
        must    The machine callback cannot add states, events or operations. Targets, operations, 
                outcome events and send and write targets are static; callbacks compute values 
                only. A write starts only by a commit listed in actions. Foreign tokens, undeclared 
                handler events, foreign producer events, non-public send events and duplicate 
                schedule names reject.

    R4  Declared shape
        source  @plan.Machines.O1.
        must    A definition requires id, states and events, and may declare `internalEvents`,
                memory, traits, operations, context and persist (default false).

                Machine configuration mirrors the state tree:

                - the root and each compound have a default direct child and states;
                - leaves have neither;
                - only the root declares `onContext`.

                Unknown fields, wrong kinds, empty compounds, duplicate siblings, overlapping public
                and internal names, _tag fields and self-selecting context reject.

    R5  One source per memory field
        source  @plan.Machines.O1.
        must    Each memory field starts from exactly one of Flow.input, Flow.initial, or absence 
                for an optional key. A field with none is a type error. Two different defaults, or 
                a Schema default beside Flow.initial, reject as TwoDefaults. A default whose Effect 
                is not a succeeded value rejects as ImpureDefault (proposed name) without being 
                run. A computed initial reads input or constant fields, never another computed 
                field.

    R6  Pure creation
        source  @plan.Machines.O1.
        must    Creation checks a present input by the Input Schema's type side with no 
                transforming decode, copies the input fields, applies constant then computed 
                initials, and reads no clock or randomness. It runs once per incarnation and never
                on restore, adoption or hydration; there only R8's defaults run, and only for fields
                the record lacks. Decision (agent, 2026-11-11): audit C24 (spec-log.md, T42).

    R7  Identity fields
        source  @plan.Machines.O1.
        must    A machine's input fields are read-only (writing one is a type error). On a 
                value-named machine they are required, default-free and string-encoded, else 
                IdentityFieldOptional (proposed name). A fragment's input fields stay writable.

    R8  Defaults at restore
        source  @plan.Machines.O1.
        must    At restore a field the record lacks takes its default or computed initial, an 
                optional key stays absent, and an input field with no default refuses the record 
                with RestoreMissingInput. A field has one default, the same at creation and restore.

    R9  Operations declared once
        source  @plan.Machines.O1.
        must    operations declares each server interaction once by name, mapping its endings onto 
                this definition's events. Each unknown: target is a Flow.uncertain event or 
                Flow.ignore, else UnknownNotUncertain. One write operation per write contract per 
                actor tree, counting every fragment placement, else SharedContract (proposed name).

    R10  Fragments
        source  @plan.Machines.O1.
        must    A fragment declares id, events, `hostEvents`, `internalEvents`, guards, callbacks,
                exits (subroutines only), memory, child traits and operations; ports are required
                unless wrapped in Flow.optional. It may not declare context, `onContext`, send or
                persist.

                Each fragment carries an inferred summary in its type, and hosts are checked against
                summaries, never bodies. Instance names, operation names, state names and memory
                keys share one namespace; key and item are reserved under .each.

    R11  Fragment write scope
        source  @plan.Machines.O1.
        must    A fragment may own a write that maps anything only if every placement from the root
                to it is a root trait, an .each copy or a .resumable() trait, any of which may carry
                `resetOn`, with no subroutine on the path; there a `resetOn` returns a string, null
                or undefined.

                Elsewhere it may own reads, streams and bare writes. Acting members (commit, lookup,
                subscribe, retry, cancel, cancelAll, refetch) are typed only inside the declaring
                fragment; outside it Fragment.O offers only its write operations' reads (get in
                views; get, idle and retryable in a host's guards and updateMemory).

    R12  Names
        source  @plan.Machines.O1.
        must    The state names "is" and "child", the top-level name "root", and the names "self" 
                and "__proto__" are reserved (ReservedStateName). State paths have at most ten 
                segments. Authored names and ids are nonempty, at most 256 UTF-8 bytes, contain no 
                C0 control, DEL or lone surrogate, and compare by exact spelling.

    R13  Static errors named by the plan
        source  @plan.Machines.O1; the full finding list is the StaticCli Spec's R10.
        must    Construction also rejects unfilled required ports, a raise into a fragment the 
                turn's state change exits, two state changers or overlapping keys that state-token 
                pruning cannot separate, an acting fragment member used outside its fragment, and a 
                mapped write or resetOn outside the fragment write scope.

    R14  Types and Schemas
        source  @plan.Machines.O1.
        must    Literals, payloads, context, operation names and state paths infer without 
                assertions, explicit generics or wrappers; invalid machine additions are type 
                errors. Definitions expose Event, State, Input, Memory and Snapshot Schemas. E.X 
                validates its payload on every call and throws InvalidEvent on mismatch.

    R15  Closed app
        source  @plan.Runtime.O1.
        must    app({ id, machines }) lists every machine the Runtime may run. Construction throws 
                on unknown fields, duplicate machine ids, one machine under two keys, and colliding 
                operation, domain or entity identities. Lazy entries are checked the same way when 
                adopted, under the lazy-features Spec when it is written.

    R16  Compiled data view
        source  @plan.Runtime.O1.
        must    machine() outputs Compiled: plain data plus Slots, each closure named by its place 
                in the definition. Its data view, with closures as names, carries every event with 
                its payload Schemas, the Flow.uncertain events, each memory field with its Schema, 
                source and privacy, each operation's key fields, input fields and services, and 
                each fragment's kind, events and ports. There is no runtime codec for Compiled.

                A Schema's own functions (its filters and transformations) belong to the Schema and
                are not Slots. The machine callback is construction: Compiled holds its output, never
                the callback. Decision (agent, 2026-11-11): ruling Compile Q3 (spec-log.md, T42).

    R17  Runtime refuses a malformed Compiled
        source  @plan.Runtime.O1.
        must    Creating a Runtime refuses a Compiled with a key field outside the input, a missing
                events table, or a function outside a Schema that is not a Slot (R16's exemption;
                ruling Compile Q3).

                Decision (agent, 2026-11-11): the refusal's code is InvalidConfiguration, whose
                owners include @plan.Runtime.O1 (@plan.Diagnostics.O2), with details.reason naming
                the malformation; the reason names are left to @task.V3.T17, which builds this
                check. Why: the closed code list already holds this refusal, and a new code would be
                a Diagnostics change. Reverse: add a code to @plan.Diagnostics.O2 with the user.

                Decision (agent, 2026-11-11): a Compiled with several malformations is refused; which
                of them the refusal lists is not guaranteed, since R2's every-violation rule binds a
                Construction and Runtime creation is not one. Why: no source asks for more, and the
                cases plant one malformation per Compiled. Reverse: extend R2 to Runtime creation
                with an Invariant, the user's call.

    R18  Wiring
        source  @plan.Runtime.O1.
        must    A machine entry's context is the default wiring for its actors; a shared ref may 
                override declared slots. The resolved wiring covers every declared slot with a 
                compatible provider; a gap or an incompatible provider is refused at admission 
                (Actors Spec R18). Call sites never supply wiring.

open
    Q1  Executable checks are not built.
        outcome  Phase 3 writes each test below as an oracle behind the Port, with its wrong 
                 runtime; until then every Requirement's evidence is open.

    Q2  IdentityFieldOptional has no prototype case or wrong runtime.
        outcome  Phase 3 adds one before relying on R7.

model
    Construction = any call of definition, machine, trait, subroutine or app.

    Violation = one rule broken at one field path; rule order is the order of R4 to R13 (proposed; 
        the plan says only "declaration then rule order").

    Slot = a named closure; its name is its definition path, such as 
        operations.pay.failure.CardDeclined.

    DataView = a Compiled with every Slot replaced by its name.

invariants
    I1  For every Construction: no actor, timer, storage access, service, loader or evidence exists afterwards that did 
        not exist before, and each machine(definition, callback) has invoked its callback exactly once. The count was 
        I2's, folded in 2026-11-11 (audit). [@R1]

    I3  A Construction that finds violations V throws one FlowError with diagnostics equal to V in declaration then 
        rule order, and returns no value. [@R2]

    I4  states(Compiled) == states(definition), events(Compiled) == events(definition) and operations(Compiled) == 
        operations(definition). [@R3, @R4]

    I5  For every memory field f: exactly one source among Flow.input, Flow.initial and optional absence. [@R5]

    I6  No default or computed initial is executed during Construction. [@R5]

    I7  creation(input) is a function of input alone: equal inputs give equal memory, and it reads no clock or 
        randomness. [@R6]

    I8  Restore, adoption and hydration never invoke creation, and run no default or computed initial for a field the 
        record has. Reworded 2026-11-11 (audit C24). [@R6, @R8]

    I9  On a value-named machine, every input field is required, has no default and encodes toa string. [@R7]

    I10  For every actor tree, the map from write operation to write contract is injective, counting each fragment 
         placement. [@R9]

    I11  Every unknown: target is a Flow.uncertain event or Flow.ignore. [@R9]

    I12  Every mapped fragment write lies under a path of root traits, .each copies and .resumable() traits only. [@R11]

    I13  Every authored name satisfies R12's predicate, and two names are equal only if their code units are equal. 
         [@R12]

    I14  In an App, machine id to machine is a function and injective, and operation, domain and entity ids are 
         pairwise distinct. [@R15]

    I15  Every function reachable in Compiled outside a Schema is a Slot, and the DataView holds no function outside a 
         Schema. Reworded 2026-11-11: ruling Compile Q3 (audit C4). [@R16, @R17]

    I16  machine() never emits a Compiled with an operation whose key fields are not a subset of its input fields, and 
         Runtime creation refuses such a Compiled. Reworded 2026-11-11 (audit C20). [@R17]

    I17  For every machine entry, resolved wiring is total over declared slots and each provider is compatible. [@R18]

composition
    flow
        Design note, proved by the prototype. The compiler is a typed front end that emits
        Compiled as plain data plus Slots; the runtime never reads a definition body
        (packages/flow-state-v3/prototypes/conformance/compile/, Compiled's shape in
        packages/flow-state-v3/prototypes/conformance/fixtures/compiled.ts). Tools read the data
        view only, so flow check and flow graph need no Runtime.

        Production (T16, proposed): src/definition.ts (definition, event, state and operation
        tokens), src/contract.ts (transaction, resource, outcomes) and src/machine.ts (machine)
        emit Compiled (src/core/compiled.ts) for a flat state list; each closure is a Slot named
        by its place (`states.PAYING.on.Confirmed[1].guard[0]`). Construction checks are only
        unknown targets and events so far (T17 owns the rest).

coverage
    @R1
        enforced_by  [@I1]
        open_by      [@Q1]

    @R2
        enforced_by  [@I3]
        open_by      [@Q1]

    @R3
        enforced_by  [@I4]
        open_by      [@Q1]

    @R4
        enforced_by  [@I4]
        open_by      [@Q1]

    @R5
        enforced_by  [@I5, @I6]
        open_by      [@Q1]

    @R6
        enforced_by  [@I7, @I8]
        open_by      [@Q1]

    @R7
        enforced_by  [@I9]
        open_by      [@Q1, @Q2]

    @R8
        enforced_by  [@I8]
        open_by      [@Q1]

    @R9
        enforced_by  [@I10, @I11]
        open_by      [@Q1]

    @R10
        enforced_by  [@I3], host checks read summaries only
        open_by      [@Q1]

    @R11
        enforced_by  [@I12]
        open_by      [@Q1]

    @R12
        enforced_by  [@I13]
        open_by      [@Q1]

    @R13
        enforced_by  [@I3]
        open_by      [@Q1]

    @R14
        enforced_by  [@I4], type tests
        open_by      [@Q1]

    @R15
        enforced_by  [@I14]
        open_by      [@Q1]

    @R16
        enforced_by  [@I15]
        open_by      [@Q1]

    @R17
        enforced_by  [@I15, @I16]
        open_by      [@Q1]

    @R18
        enforced_by  [@I17]
        open_by      [@Q1]

tests
    T1  Construct every reference definition, machine and app with spies on services, storage, clock and loaders; 
        expect zero calls and a callback count of 1 per machine. No prototype wrong runtime; phase 3 writes one that 
        acquires a service at construction. [@I1, @I6]
    T2  Construct a definition with three violations in different fields; expect one FlowError whose diagnostics name 
        all three, in declaration then rule order, with paths. No prototype wrong runtime; phase 3 writes one that 
        stops at the first violation. [@I3]
    T3  Each rejected form of R4, R5, R9, R12 and R13 is refused with its code: TwoDefaults, ImpureDefault, 
        ReservedStateName, UnknownNotUncertain, SharedContract, KeyFieldOptional. Reference: the prototype's front-end 
        pins (`P1-H` for ImpureDefault). Wrong runtimes for ImpureDefault: `p1h.default-runs`, 
        `a1.a-failed-default-is-a-value`. [@I3, @I5, @I6, @I10, @I11, @I13]
    T4  Create with an input whose Schema transforms; creation checks the type side and stores the value unchanged. 
        Case `R15-03`; wrong runtime `r15.creation-decodes-input`. [@I7]
    T5  Restore and adopt a record twice with spies on initial functions; expect zero creation calls. Restore a record 
        lacking an input field with no default; expect RestoreMissingInput (case `R12-DOORS`). [@I8]
    T6  Type tests: undeclared or foreign members, false from a guard, unfilled ports, writes to input fields, acting 
        fragment members outside their fragment, and a fragment callback whose target moves the host out of the 
        fragment's placement node (the type half of the cut Turn I8) fail to compile; reference literals infer without 
        assertions. [@R14, @I12]
    T7  App construction with a duplicate machine id, one machine under two keys, and two contracts with one id each 
        throws one FlowError naming both entries. [@I14]
    T8  Hand a Runtime a Compiled with a bare function, a key field outside input, and no events table; each is refused 
        at creation, before any actor. [@I15, @I16]
    T9  Equal identities compile from equal source on two hosts to equal data views. Compare them structurally, each 
        Schema by its JSON Schema document, since the Codec refuses a Schema as notPlain (audit C4). [@I15]
    T10  Wire a slot to a missing provider and to an incompatible one; admitting the actor refuses with the slot named, 
         before any turn (Actors Spec T14 covers the cycle). [@I17]
    T11  The machine adds nothing: a callback naming a state, event or operation the definition lacks is a type error 
         and, untyped, a construction error; Compiled's states, events and operations equal the definition's. No 
         prototype wrong runtime; phase 3 writes one that accepts an added state. [@I4]
    T12  Identity fields: a value-named machine with an optional, defaulted or non-string-encoded
            input field is refused IdentityFieldOptional; a fragment input field stays writable. 
                Phase
            3 writes this test and its wrong runtime (Q2). [@I9]
