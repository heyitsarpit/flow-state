spec Host
status        proposed
basis         Pre-coding analysis, to follow as best-guess guidance and revisable whenever building shows it wrong;
              each change and its reason is recorded in wiki/specs/specs.log.
location      packages/flow-state-v3/src/host
provides      publish, final, quiescent, subscribe, deliver, transition, storyCompiled, verdictOf, Story.app,
              closeTab, openTab
derives_from  [
              @plan.React.O2,
              @plan.React.O3,
              @plan.Runtime.O6,
              @plan.Persistence.O6,
              @plan.Testing.O1,
              @plan.Testing.O2,
              @plan.Testing.O3,
              @plan.Testing.O6,
              @plan.Testing.O8,
              @plan.Rules.O4,
              @plan.CommandLine.O2,
              @plan.CommandLine.O3
              ]

requirements
    R1  No reader gets a world no finished chain produced
        source  @plan.React.O2, @plan.Persistence.O6.
        must    No reader (screen, store, inspection) is given a world that owes mail: no half-served fan-out. The host
                publishes once per slice that leaves no mail owed, and a slice that ends with mail owed publishes and
                captures nothing. Snapshots are read from the memo only, never from the world. A capture (save, wake,
                hide) takes a `Quiescent`, and a hide drains the owed mail synchronously first. At stop, readers get
                the last publication marked stopped.

    R2  A screen re-renders only when what it reads changed
        source  @plan.React.O2.
        must    A snapshot listener of an actor is called once per publication and only when that actor's snapshot
                value changed; an unrelated actor's turn re-renders nothing. `getSnapshot` returns the same object
                until a publication changes it, and allocates nothing. The comparison is made against the last
                published snapshot, before the write.

    R3  An emit's listener sees a screen state at or after its turn
        source  @plan.React.O2.
        must    An emit is delivered once, after the publication that contains its turn and after every snapshot
                listener of that publication, in turn order; never older, never twice. A turn's emit is delivered
                **even when no snapshot changed.** [decided: user 2026-11-22] Why: at the publication, a listener that
                reads the snapshot sees its turn. Reverse: per step, where a listener may read the previous publication.

    R4  A Runtime that stopped or was disposed tells its readers once
        source  @plan.Runtime.O6, @plan.React.O3.
        must    Stop and dispose tell every reader exactly once (every snapshot carries `lifecycle`), and then no
                listener runs again. An actor whose memo entry is removed has its listeners told once and cleared.
                `final` runs once per Runtime.

    R5  A write the page could not confirm is treated as maybe landed
        source  @plan.Persistence.O6, @plan.Testing.O8.
        must    A batch in flight when a tab dies takes one fate word, `abort` (the Safari measurement) or `land`, and
                the app is judged under both. The dead page is never answered. The reload sweep runs every Story at
                every position in both fates.

    R6  No saved mark is lost while the Runtime lives
        source  @plan.Persistence.O6.
        must    Every accepted mark is waiting, flying or landed; a refused batch is retried and its marks go to the
                next batch; a hide issues every waiting mark; a waiting batch always has a way out (a ticket, a due
                time or the end of the flying batch). A hidden page skips the backoff at most once per run of
                refusals.

    R7  Two tabs of one app never both write the store
        source  @plan.Testing.O3, @plan.Runtime.O7.
        must    At most one live open of an app and scope holds the lock; a second open boots `Second` and makes no
                store call. A Story opens, closes and addresses tabs by name; a step on a gone or unopened tab is a
                script fault.

    R8  No Story route skips the verdict
        source  @plan.Testing.O1, @plan.Rules.O4.
        must    A Story that breaks a rule fails, however it was run: by `run()`, a generated run, a sweep or
                `propertyTest`. The verdict is one pure function of the finished run. `run()` resolves only when the
                verdict passed. `runRules` is required on `Story.app`, `Story.machine` and `Story.fragment`; the one
                unjudged runner is internal. A plain Runtime test judges nothing, and no Runtime or `app()` reads a
                rule: a test that wants rules is a Story.
                **No Runtime judge** [decided: user 2026-11-22] Why: rules are optional and judged only by Story tooling
                (@proposal.external-rules). Reverse: a Runtime switch that judges outside Stories.
                Superseded by the user's 2026-11-22 decision (@proposal.external-rules): "A test that breaks a rule
                fails, whoever wrote it and however it was run" for a plain Runtime test, and `Story.app` alone
                requiring the rules.

    R9  A failure names the rule, the first step and its evidence, and replays
        source  @plan.Testing.O6, @plan.Testing.O8, @plan.CommandLine.O2.
        must    A failing run carries its verdict, the run and its partial trace; the text form and the test agree.
                A failing generated Story, printed, replays from its text alone: nothing it did lives in the
                generator.

    R10  The tooling's cost grows with the steps and the changes
        source  @plan.Testing.O2, @plan.Testing.O6.
        must    Per step the test tooling's work is O(what the step changed): no scan of the call log, the batches or
                inspection per pull, and no step times history.

    R11  An expected break is matched
        source  @plan.Rules.O4.
        must    An `expectBroken` entry may narrow to a step, an actor or a predicate. It passes when it matches at
                least one break of its rule; every break of an expected rule that no entry matches fails; a bare rule
                **matches every break of the rule.** [decided: user 2026-11-22] Why: an inverted Story must name the
                break it expects. Reverse: a rule id only.

    R12  Machine rules are judged by `verdictOf` over the finished run, and a throwing check changes only itself
        source  @plan.Rules.O4.
        must    After a Story run, every published incarnation and every turn in its evidence is checked against the
                rules placed at its state; a check that returns false is a `Broken`, one that throws is `RuleThrew`
                naming the rule. An `off` rule's check is never called. A value with no rules has none to check.
                **No live judge** [decided: user 2026-11-22] Why: only Story tooling judges rules, so the Runtime keeps 
                no judge, no
                `last` map and no `RuleBroken` evidence (@proposal.external-rules). Reverse: the live judge.
                Superseded by the user's 2026-11-22 decision (@proposal.external-rules): "Machine rules are judged
                live", by a judge the driver runs between a step and its sink, with `RuleBroken` records.

    R13  The CLI's exit is a function of the verdict
        source  @plan.CommandLine.O3.
        must    `flow story run` exits 0 on passed, 1 on broken rules, `neverBroke` or unfinished, and 2 on a script
                fault, a rejected run or a usage error; `flow trace` prints the verdict under the trace.

    R14  `propertyTest` runs every seed
        source  @plan.Testing.O6.
        must    Every seed runs unless a script fault rejects at once; the test rejects after the last seed iff some
                seed did not pass, **listing every failure.** [decided: user 2026-11-22] Why: stopping at the first
                failure hides other rules' failures. Reverse: stop at the first failing seed.

    R15  No identity with a record or an incarnation reads as none
        source  @plan.React.O2.
        must    The memo's key set is every identity `snapshotIn` returns `some` for in the published world:
                incarnations, records, quarantined and ended identities. There is no fallback read.

open
    Q1  Nothing is built, and the package sequences of `tests` are not written. The executable model checked the tables 
        of the first revision; the revised ones (several flying batches, the hidden retry, the quiet capture,
        matched `expectBroken`, the edge's three changed cells) were re-run only for the edge.
        outcome  The model of the three tables is kept in the package's tests as plain functions and re-run on every
                 table edit; each check is written when its slice is built. All coverage stays open_by until then.

    Q2  The React spike (renders per publication, Strict Mode, transitions) is not run: no binding exists. Which 
        version one render reads across actors (one external store over the version, or per actor) is not chosen.
        outcome  Blocks acceptance of the React cost claim (`realization`, Cost); owned by @task.V3.T111.

    Q3  Whether the `pagehide` fork's first slice creates the IndexedDB transaction before freeze.
        outcome  A browser-tier check only (@task.V3.T27).

    Q4  Publication liveness under unbounded input: if inputs outpace the drain, mail stays owed and nothing publishes.
        outcome  Accepted as overload; no bound designed.

    Q5  A snapshot input added outside the table in `model` (Snapshot inputs) is caught only by `PublicationDrift` in 
        Story runs.
        outcome  Stated; `Changes` owns the writers.

    Q6  The public event a view sends for `refetch`, and how a view addresses a fragment's public event 
        (`Mail.Event.at`), have no full design. Blocks build for @task.V3.T122.
        outcome  Owned here, the one home: the fragment address is `EventOf<D>`'s `{ slot, key }` (Offers); the
                 `refetch` event is designed here before @task.V3.T122 builds.

    Q7  Generated runs and `quieting` with several tabs (per-tab views, whether samples draw tabs).
        outcome  Generated runs stay single-tab until it is designed.

    Q8  The mutation generator for `Records`' alphabet is one world word, `Fake.storage.mutate(kind)`; its applier and 
        the sweep are @task.V3.T112's.
        outcome  Owned there; the alphabet is `Records`'.

    Q9  The reach flags `cancelsAcknowledging`, `retainsUnknown` (`fixtures/manifest.ts:13-14`) and the exported names 
        of the Story helper types have no row in this Spec.
        outcome  Added to @task.V3.T97's work; minor.

    Q10  The edge keeps `Out.waiting` and `Out.at` as `Option`s under I20; the lifecycle is not fully a tagged union.
        outcome  A stated trade; the invariant is model-checked, not typed.

    Q11  The hide drain blocks the page for the owed chain's length; no measure of a long chain at `pagehide`.
        outcome  Bench, browser tier.

    Q12  The calls on this design are listed in the companion (its section 6) with their traces.
        outcome  **Internal rules** [decided: agent orchestrator 2026-11-22] internal rules, as this Spec states them: 
                 a publication is
                 a slice that leaves no mail owed; `Out.touched` and `lifeChanged` in the core; a `Later` mark during
                 backoff waits; the binding's props before attach are creation's; a capture reads only a world with
                 no mail; a hide issues behind a flying batch; a hung store holds disposal until its bound. Why: each
                 B fails its trace in the companion (a stale render at 100 of 150; lost follow-ups on reload; METHOD
                 lost under both fates). Reverse: the companion's B for that item.
                 **User's calls** [decided: user 2026-11-22] the user's calls, all as recommended (A): the run rules 
                 module (`Types`
                 Q5), emits once per publishing slice (R3), the `pagehide`-first reload and the `inflight` word,
                 every seed running in `propertyTest`, the verdict record, and matched `expectBroken`. Why: the
                 reasoning in the companion. Reverse: the companion's B for that item.

    Q13  Rules read private memory, which the public `Published` snapshot hides, and are judged after the run:
        `verdictOf` must read the run's internal incarnation records, not the public face. Unverified.
        outcome  Verified in @task.V3.T114's first slice; if the evidence lacks a record a rule reads, `storyCompiled`
                 **asks the step for it.** [decided: agent writer 2026-11-22] Why: the live judge saw the incarnation
                 directly and the evidence-only judge does not (@proposal.external-rules). Reverse: judge live.

model
    Publication = the host's one act of telling readers: compare each touched actor's new snapshot against the last
        published one, write the memo, tell the listeners, deliver the emits. One per slice that leaves no mail owed.

    Slice = one `run()` of the driver: it drains the inbox, including every input queued while it runs (a call that
        settles synchronously, a listener's send). `Serve`, timers, answers and clicks arrive in later tasks and start
        new slices. "Mail owed" is `world.mail.size > 0` in any life, not `owesServe` (false outside `Open`, so a
        `Booting`, `Inert`, `Failed` or `Disposing` world with mail would otherwise publish).

    Quiescent = a world with no mail, obtained only through `quiescent(world, at)`. `publish` and `Capture` take one.

    Tab = a page of a Story with its own Runtime over the Story's one world (store, fake servers, time, locks);
        `TabLife = Shown | Hidden | Dying | Gone`, with an open number.

    Death = the one occasion on which a tab ends. Its Dying window is the synchronous run of the hide listeners and
        nothing else: no clock settle, no `Serve`, timer or answer task runs after it, as a frozen page runs none.

    Fate = the word a death gives every batch of that open still `Held`: `abort` (records unchanged, the page is
        never answered; the Safari measurement, `prototypes/safari/RESULTS.md` items 2 and 4: 0 of 12 and 0 of 6
        landed) or `land` (the batch applied in order, the page never hears it; Chrome).

    Verdict = a record of four independent facts, not a tagged union: `broken` (checked rules only, sorted by step;
        the first is primary), `neverBroke`, `unfinished`, `inconclusive`. A run can be unfinished and have broken a
        rule before the limit, and both are reported. `passed` is derived: all four empty. A script fault is not a
        Verdict.

    StoryCompiled = the one function every Story route starts through (`src/host/testing/`): `Story.app`,
        `Story.machine`, `Story.fragment`, generated runs, the reload and pair sweeps and `propertyTest`. It walks
        every value the run can hold (the app's machines, the Story's subject, every placed fragment at any depth),
        refuses two values of one id with different rules (`RulesDiffer`), proves each ruled value's `terminals` once
        (memoised per value; a `TerminalLeft` fails the verdict as a `Broken` of the tooling rule `TerminalLeft`), and
        records the run's rule sets and its values with no rules on the `StoryRun`. `verdictOf` judges those sets over
        the evidence after the run. (@proposal.external-rules)
        **Terminal proof** [decided: user 2026-11-22] Terminals are proved at Story start. Why: a terminal of a value 
            only a test runs is
        otherwise never proved. Reverse: the Runtime's judge.
        **One route** [decided: agent specs lead 2026-11-22] The one route and `RulesDiffer`. Why: one route, so no 
            Story skips the
        rules, and two rule sets under one id would make the verdict depend on the walk's order. Reverse: each
        constructor walks for itself; the last value wins.

    RuleSources = tooling rules (`UnusedWord`, `CleanupLeft`, `PublicationDrift`, `RuleThrew`, `TerminalLeft`; named in
        `testing/verdict.ts`, judged by `verdictOf` over the run); project run rules (one rules module that both
        `flow.config.ts` and `Story.app` import, `tests/rules/list.ts`, no test-runner import; judged by `verdictOf`
        over the run and its `RunIndex`); machine rules (the `.rules(build)` of the values the run holds; judged by
        `verdictOf` over the run's evidence, after the run, in Stories only, the user's 2026-11-22 Story-only judging).
        **Rules module** [decided: agent specs lead 2026-11-22] The rules module as the one list. Why: both the config 
            and `Story.app`
        import it. Reverse: run rules on the app.
        Superseded by the user's 2026-11-22 decision (@proposal.external-rules): machine rules "(the body,
        `Compiled.rules`; judged by the Runtime's judge, live, and read as `RuleBroken`)".

    StateInventory = Each state has one owner and one writer.
        S1  Publication: `Published = { version: Version; at: number }`. Owner `host/publication.ts` `publish`.
            Readers handles, binding, Stories, inspection. Not saved.
        S2  Snapshot memo: `Map<ActorKey, { inside: Snapshot; outside: Snapshot }>`. Owner `publish`. Readers
            `getSnapshot` (outside), `read(ref)` and inspection (inside). Not saved.
        S3  Unpublished: `Unpublished`. Owner the driver's `drain`. Reader `publish` (empties it). Not saved.
        S4  Publication life: `Open | Final`. Owners `publish`, `stop`. Readers `subscribe`, `publish`. Not saved.
        S5  Snapshot listeners: `Map<ActorKey, Set<() => void>>`. Owner `subscribe` and its unsubscribe. Reader
            `publish`. Not saved.
        S6  Emit listeners: sets per actor. Owner `host/emits.ts`. Reader `emits.deliver`. Not saved.
        S7  Edge phase: `EdgePhase`, its pending inside the phase. Owner `host/edge.ts` `transition`. Readers
            `settled`, inspection. Not saved (the marks are).
        S8  (cut) The judge's last incarnations, `Map<ActorKey, Incarnation>`, owner `host/judge.ts`. Superseded by the
            user's 2026-11-22 decision (@proposal.external-rules): `verdictOf` folds the run's evidence with a local
            `last`, so no state outlives the pass.
        S9  Tab, per Story tab: `TabLife` with its open number. Owner `testing/run.ts` `tabs`. Readers the fake
            store, servers, locks. Not saved.
        S10 Batch, per fake store write: `Held | Landed | Refused | Aborted | Unheard`. Owner `platform/memory.ts`
            via the fake. Readers `left`, rules, `inflight`. Saved: the records it landed.
        S11 Lock, per app and scope: `Free | Held(tab, open)` in the fake `Locks`. Owner the fake `Locks`. Reader
            Runtime boot (`Ownership`). Not saved.
        S12 Sweep run phase: `CellRun`. Owner `testing/sweep.ts` `tryCell`. Reader `cellOf`. Not saved.
        S13 Draw cursor: `{ position; left; queue; waiting: Option<Wait> }`. Owner `testing/generate.ts` `sourceOf`.
            Reader the generated Story. Not saved (the Story text is).
        S14 Fake world counters: per endpoint call count, per store batch index. Owner `testing/fake.ts`, where
            `log.push` is. Readers the generator, rules, `View`. Not saved.
        S15 A run's rule sets and its values with no rules, on the `StoryRun`: Owner `storyCompiled`. Readers
            `verdictOf`, `ruleCoverage` (exported from `flow-state/testing`, the Story route's package export). Not 
                saved.
        S16 Proved terminals, per ruled value: a memo. Owner `storyCompiled`. Reader `storyCompiled`. Not saved.
        Not state: the verdict (derived from the finished run), the outcome table, `left` (a read of S9 to S11 and the
        Owners at the end), the Model and the `Turn` (`Changes`').

    CallbackInputs = No callback here reads a clock directly; `Published.at` is the slice's `env.now`, the time every
        snapshot of that version was derived at (`Operations`' overdue and age views read it through the core).
        a snapshot listener (`subscribe`): none; it reads `getSnapshot()`, the memo of the version it was told about
        `getSnapshot`: none; returns `Option<Snapshot<D, "outside">>` from S2, never from the world
        an emit listener (`onEmit`): `(payload, { key, keys })` for a fragment emit, `(payload)` at the root;
            `version` to the binding only
        an invariant rule's `check`: `{ state, memory, props, operations, schedules }` of one publication, taken from
            `project(incarnation)` (the outside view, `Flow.private` dropped), read by `verdictOf` from the run's
            evidence [proposed: the user's decided list in
            the rules plan; only a turns rule also reads `context`]
        a turns rule's `check`: `{ event, before, after }`: the `Turn`'s trigger, decoded; `project` of the previous
            and this incarnation
        a project run rule's `broken`: the finished `StoryRun` and its `RunIndex` (by actor, by kind, built once)
        a fixture server handler: the decoded request; the fake clock's `now` through Effect `Clock` only
        `useView`'s selector: the memo snapshot

    Types = Existing/new/changed are marked.
        // src/host/publication.ts (NEW). Version: branded; Quiescent: only the drain's end makes one.
        export type Version = number & Brand.Brand<"Version">
        export type Published = { readonly version: Version; readonly at: number }
        declare const quiescent: unique symbol                 // module-private: no other file can build one
        export type Quiescent = { readonly [quiescent]: true; readonly world: World; readonly at: number }
        // quiescent(world, at): Option<Quiescent>  -- the only door: none while world.mail.size > 0, in every life
        export type Unpublished = {
            readonly touched: ReadonlySet<ActorKey>; readonly turns: ReadonlyArray<Turn>; readonly all: boolean
        }
        export type PublicationLife = Data.TaggedEnum<{ Open: {}; Final: { readonly version: Version } }>
        // publish(q: Quiescent, p: Unpublished): Published  -- the only writer of S1, S2, S4
        // final(q: Quiescent, p: Unpublished): Published    -- stop and dispose; compares every memo entry
        // finalFromMemo(lifecycle): Published               -- stop, when the world owes mail

        // src/core/world.ts (CHANGED: `Out` gains touched and lifeChanged; `tx.ts` imports it)
        export type Out = {
            world; evidence; commands; readonly touched: ReadonlySet<ActorKey>; readonly lifeChanged: boolean
        }

        // src/host/edge.ts (CHANGED: flags to one phase; each phase owns its pending, so Quiet holds none)
        export type Waiting = {                            // never empty: a mark, a ticket or keys to retry
            readonly marked: boolean; readonly tickets: ReadonlyArray<Ticket>; readonly again: Marks
        }
        export type EdgePhase = Data.TaggedEnum<{
            Quiet: {}
            Marked: { readonly at: number; readonly waiting: Waiting }            // `at` is the one due time
            Out: { readonly flying: NonEmptyReadonlyArray<Carried>; readonly waiting: Option.Option<Waiting>
                readonly at: Option.Option<number>; readonly hiddenRetried: boolean }
                // NEW `hiddenRetried`: the flag has a home while a batch flies; flying is in issue order
            Backoff: { readonly until: number; readonly waiting: Waiting; readonly hiddenRetried: boolean }
            Closed: {}
        }>
        export type Carried = { readonly tickets: ReadonlyArray<Ticket>; readonly marks: Marks } // keys the capture 
            wrote

        // src/host/testing/steps.ts (CHANGED: Tab is named by the Story; the reload fate is one word)
        export type Tab<T extends string = "main"> = { readonly name: T; readonly open: number }
        export type Inflight = "abort" | "land"
        // Step gains: closeTab { tab; inflight }, openTab { tab }; every actor step carries { tab }; reload keeps
        // { reattach; inflight } with heldWrites renamed.

        // src/host/testing/verdict.ts (NEW). R: the union of rule ids, typed from the run rules' literals and the
        // rule tokens of the values (`<definition id>.<Name>`).
        export type Broken<R extends string = string> = {
            readonly rule: R; readonly step: number; readonly tab: Tab<string>
            readonly at: string       // NEW [proposed]: the placement beside the rule, e.g. Desk/Editor/uploads[a]
            readonly evidence: ReadonlyArray<TraceRecord>; readonly summary: string
        }
        export type Switch<R extends string> = {
            readonly expectBroken: ReadonlyArray<Expect<R>>; readonly off: ReadonlyArray<R>
        }
        export type Verdict<R extends string> = {
            readonly broken: ReadonlyArray<Broken<R>>      // checked rules only, sorted by step; [0] is primary
            readonly neverBroke: ReadonlyArray<R>          // expectBroken rules with no match, on a finished run
            readonly unfinished: Option.Option<"Turns" | "Settle">
            readonly inconclusive: Option.Option<Horizon>  // generated runs only
        }
        export type Rule<R extends string> = {
            readonly rule: R; readonly broken: (run: StoryRun, index: RunIndex) => ReadonlyArray<Broken<R>>
        }
        // passed(v) = all four empty. A script fault is not a Verdict: run() rejects StoryScriptFault.
        export type Expect<R extends string> = {           // an expected break, matched, not any break of R
            readonly rule: R; readonly step?: number; readonly actor?: ActorRef; readonly where?: (b: Broken<R>) => 
                boolean
        }
        // Errors: StoryFailed { verdict, run } is NEW; today's StoryFailed (a script fault) is renamed
        // StoryScriptFault; StoryTurnLimit folds into StoryFailed with verdict.unfinished, keeping its evidence in run.

    SnapshotInputs = `snapshotIn` reads these sources; each is written only through `tx.draft`/`put`/`drop` or a named
        tx function, and the tx marks the reading actor in the same function, as `dirty` is marked today.
        `incarnations`: key is the actor key. Marked by every incarnation write (today's `dirty`).
        `records`, `quarantined`, `ended`: actor key, or record key to its actor. Marked by `put`/`drop` on those
            fields.
        `lanes`, `lanesOfActor`: lane to its owning actor. Marked by every lane write (today's `moved`).
        timers (the schedules view): the incarnation's timers. Marked by an incarnation write.
        issues: the incarnation's outcomes. Marked by an incarnation write.
        context values: the consumer's incarnation (`live.context`). Marked by the consumer's incarnation write (the
            wave).
        `life`: every actor. Marked by `setLife`: `lifeChanged`.
        `put`/`drop` take the field; a field in this list cannot be written through them without a key-to-actor
        function (a typed map `SnapshotField -> (key) => ActorKey`), so a new writer of a snapshot source marks by
        construction. A field outside the list is not a snapshot input (`PublicationDrift` checks the list).

    PublicFaces = `EvidenceOf<D>` (`Types`): the public `Published` is `{ actor; version; why; snapshot:
        Snapshot<D, "outside"> }` built by `project` from the internal `{ actor, incarnation, why }`, with `why`
        `"Begin" | "Turn" | "Other"` (an end is `Finished`); the public `Turn` is `{ actor; event: EventOf<D>; from;
        to }`; a fragment's public event address is `{ slot; key }`. The internal records stay erased. `Rule.rule` is
        typed: project rules declare their ids as `const` literals; machine rules use the tokens of `Machine<D,
        N>["rules"]`, whose ids are `<definition id>.<Name>`; tooling rules are `"UnusedWord" | "CleanupLeft" |
        "PublicationDrift" | "RuleThrew" | "TerminalLeft"`. A switch naming an id
        outside the union **does not compile.** [decided: user 2026-11-22] `Published` carries the incarnation and `why`
        has three values, shared with `Changes` Q5. Why: one record a rule reads. Reverse: a fourth `why`.

invariants
    I1  Every publication and every capture reads a world with no mail; at stop readers get the last publication marked 
        stopped. [@R1, @R4]

    I2  `getSnapshot(a)` returns the same object until a publication changes `a`'s snapshot value. [@R2]

    I3  In one publication a listener of `a` is called at most once, and iff the memo entry of `a` became a new object. 
        [@R2]

    I4  When an emit listener runs, the memo holds the publication that contains its turn. [@R3]

    I5  After `Final` no listener runs and the version never changes; `final` runs exactly once per Runtime. [@R4]

    I6  The version rises by one per publication that changed a snapshot and never otherwise. [@R2]

    I7  While life is Open and inputs stop, once every `Serve` ran the memo equals `reuse(memo, snapshotIn(world))`. 
        [@R1]

    I8  Edge: flying batches answer in issue order; while not Closed, phase `Out` iff a batch is in flight; a second 
        batch flies only after a hide or a passed `at`, and a ticket is issued when the last flying batch lands.
        [@R6]

    I9  Edge: until Closed, every accepted mark is waiting, flying or landed; a refused batch's marks are in the next; 
        at a hide every waiting mark is issued. [@R6, @R5]

    I10  Edge: a refused batch, or a mark arriving in `Backoff`, is re-issued at once at most one time per run of
        refusals while hidden: a hidden re-issue sets `hiddenRetried`, `Backoff` and the next `Out` carry it, and a
        landed head clears it. From `Backoff` no other batch issues before `until`, except a ticket. `Closed` is
        terminal. [@R6]

    I11  A batch of a dead open is `Landed` or `Aborted` by the fate word and never answered to the dead page. [@R5]

    I12  At most one live open of an app and scope holds the lock; a `Second` open's edge is `Closed`: no store call.
        [@R7]

    I13  `verdictOf` is a pure function of `(run, rules, switch)`; an `off` rule's check is never called. [@R8]

    I14  An `expectBroken` entry passes iff a break matching its rule, step, actor and `where` occurred, on a finished,
        quiet run; every break of an expected rule that no entry matches fails. [@R11]

    I15  Adding a broken record to a checked rule never makes a failing verdict pass; a script fault rejects before
        any verdict. [@R8]

    I16  `propertyTest` runs every seed unless a script fault rejects at once, and rejects iff some seed did not
        pass. [@R14]

    I17  A printed failing Story, run with no generator, breaks the same primary rule. [@R9]

    I18  Per step, the tooling's work is O(what the step changed): no scan of the call log, batches or inspect per
        pull (the drift check excepted). [@R10]

    I19  Edge liveness: from `Backoff`, with a mark every C/2 and no more refusals, a batch issues by `until`. [@R6]

    I20  In `Out`, a waiting batch with no ticket has an `at`. [@R6]

    I21  A rule check that throws changes only its own check: it is reported as `RuleThrew` naming the rule, never as
        the expected break. [@R12]
        **Superseded wording** (reworded 2026-11-22, [decided: agent specs lead 2026-11-22]): "it is `RuleBroken` with
        `threw: true`, reported as `RuleThrew`". Why: the `RuleBroken` record is gone with the live judge. Reverse:
        restore the record.

    I25  Every Story route starts through `storyCompiled`: a run holding two values of one id with different rules is
        refused before its first step, and each ruled value's terminals are proved once. [@R8]
        [proposed] I25 and I26 are the specs lead's rows for the user's Story-only judging and terminals at Story
        start; Why: each turns one decided rule into a checkable fact. Reverse: drop the rows.

    I26  Judging reads the finished evidence only: no Runtime, driver or `app()` holds or reads a rule, a `last` map or
        a `RuleBroken` record. [@R8, @R12]

    I22  The CLI's exit code and JSON `status` are a function of the verdict and the run's end alone. [@R13]

    I23  `run()` resolves iff the verdict is passed; every other end rejects `StoryFailed { verdict, run }` or, for a
        script fault, `StoryScriptFault`. [@R8, @R9]

    I24  The memo's key set equals the set of identities `snapshotIn` returns `some` for; `getSnapshot` of any other
        identity is `none`. [@R15]

operations
    publish(q: Quiescent, p: Unpublished) -> Published
        ensures  The only writer of S1 and S2: compares, then writes, then notifies, then delivers emits. One call
                 per publishing slice. [@R1, @R2, @R3]

    final(q: Quiescent, p: Unpublished) -> Published
        ensures  Once, at `Stopped` or `Disposed`: `publish` with `all`, then `Final`; listeners cleared. [@R4]

    getSnapshot(actor) -> Option<Snapshot>
        ensures  A memo read, O(1), allocating nothing; never from the world. [@R1, @R2]

    subscribe(actor, tell) -> (() => void)
        ensures  O(1); after `Final` returns a no-op and never calls `tell`. [@R4]

    deliver(version: Version, turns: ReadonlyArray<Turn>) -> void
        ensures  `host/emits.ts`, called by `publish` step 5 and never anywhere else; each listener in its own
                 `Result.try`. [@R3]

    storyCompiled(story) -> Result<CompiledStory, RunRejected>
        ensures  Walks every value the run can hold; refuses `RulesDiffer`; proves each ruled value's terminals once;
                 records the rule sets and the values with no rules on the run. The only start of a Story route. [@R8]

    transition(phase, occasion, hidden: boolean) -> { phase; issue: Option<Waiting> }
        ensures  Pure; the edge performs `issue`. The one table of the edge. [@R6]

    storyApp(setup, options) -> StoryApp
        ensures  The public `Story.app(setup, { id, fixtures, world, runRules })`. Takes the run rules that name
                 the config's judging; `compiledOf` is called here and at Runtime start, and every Story route starts
                 through `storyCompiled`.
                 [@R8]

    run() -> Effect<StoryRun, StoryFailed | StoryScriptFault | RunRejected>
        ensures  Judged: resolves only on `passed`. [@R8, @R9]

    runUnjudged(...)
        ensures  Internal route only (the sweep, `propertyTest`, the CLI); not exported from the package. [@R8]

    verdictOf(run, index, runRules, switch) -> Verdict
        ensures  Judges the run rules, the tooling rules and the run's machine rules over the evidence, each rule's
                 `broken` in its own `Result.try` (`RuleThrew`). [@R8, @R12]

    propertyTest(samples, { profile, seeds }) -> Effect<Report, PropertyTestFailed | StoryScriptFault>
        ensures  Every seed runs. [@R14]

    sequencesOf(atoms, depth)
        ensures  Unchanged.

algorithm
    The tables below are the one statement of each rule; the pseudo-code at the end restates them. Where a table and

    the pseudo-code differ, the table binds.

    Publication, one table over the driver's slice. The pending record S3 accumulates every step's `touched` and

    `Turn`s; `lifeChanged` sets `all`.
        slice end: mail owed, life Open. Publication life Open. Nothing published, nothing captured; S3 kept;
            `Serve` scheduled once (one named task).
        slice end: mail owed, life not Open (`Booting`, `Inert`). Open. Nothing; the mail is served once the life
            admits `Serve`.
        slice end: no mail owed, S3 empty. Open. The edge's deferred capture, if any; in a test run, the drift check.
        slice end: no mail owed, S3 not empty. Open. `publish`: compare, write, notify, `emits.deliver`; S3 emptied;
            then the deferred capture.
        slice end: world life `Disposing` (mail cleared at its start). Open. `publish` as above: every snapshot's
            `lifecycle` changed (`lifeChanged`).
        slice end: world life `Disposed`, or `Failed` (boot failed). Open. `final`: every memo entry compared (`all`),
            notify, deliver, then `Final`; listeners cleared.
        slice end: a step, the admit hook or `publish` threw (`stop`). Open. `final` over the memo: each published
            snapshot with `lifecycle` set to stopped; then `Final`.
        any. Final. Nothing; the inbox is cleared, later inputs are dropped by the life table, no `Serve` is armed.

        A snapshot carries `lifecycle`, derived from `world.life` (`snapshot.ts:182`), so a life change changes
        every actor's snapshot and `final` always tells every reader once.
        At stop the last committed world may owe mail, so it is never shown: readers get the last publication marked
        stopped. Mail owed at disposal is cleared by the core (`core/disposal.ts:64`), so the disposing world is
        quiescent. Before its close, a disposing Runtime's last save is the core's `disposal.write`, a ticketed write
        (the edge's accept Now), so disposal drops no mark; after a stop, an edge issue reaches `input(Capture)`,
        which the life table drops, until the close interrupts the edge's tasks.
        `publish` runs its compare inside `Result.try`; a throw there (a defect in a snapshot) is `stop`, and the memo
        is unchanged because the write comes after the compare. `stop` does nothing when life is already `Final`.

    The capture is a reader too. The store must never be given a world the screen would not be given: `Input.Capture`

    takes a `Quiescent`. The edge's `issue` does not call `input(Capture)` directly; it asks the driver, which

    captures at the next slice end with no mail owed, after that slice's publication. A hide cannot wait for a later

    task (the page may freeze), so the hide row first drains the owed mail synchronously: it steps `Serve` until no

    mail is owed, ignoring `drainYield` (the loop guard still bounds a chain), and only then captures, inside the

    same listener call. So save, wake and hide all capture a finished chain, in the browser and in a Story alike.

    Coverage of the memo. The memo's key set is every identity `snapshotIn` returns `some` for in the published

    world. The boot slice has `lifeChanged`, and `all` iterates the memo's keys and the world's identity keys, so the

    first publication seeds every recorded identity; afterwards an identity gains or loses a source only by a write

    that marks it. `getSnapshot` of an identity outside the key set is `none` because `snapshotIn` is `none` for it:

    there is no fallback read.

    Per-actor end: an actor whose memo entry is removed (`forget`, `disposeActor` with nothing left) has its

    listeners told once in that publication and then cleared.

    `publish(q, p)`, in this order and nothing between:
        1. For each actor in `p.touched` (memo keys union world identity keys when `p.all`):
            `next = reuse(memo[a], snapshotIn(q.world, machines, a))`. Equality is the core's `sameValue`
            (`core/slots.ts:91`): `state` and `memory` by reference first, then `sameValue`; derived fields
            (`context`, `issues`, `schedules`) by `sameValue` over their plain data (a `Diagnostic` by its code, path
            and details); `operations` per row, keyed by lane, so an unchanged lane row keeps its object. `reuse`
            returns the old object when every field is equal, otherwise `next` with each equal field's (and row's)
            old reference. The entry's `outside` is `project`ed once from the new `inside` (private fields dropped),
            so `getSnapshot` allocates nothing.
        2. `changed` = the actors whose `next !== memo[a]`; an actor whose `snapshotIn` is `none` is removed from the
            memo and counts as changed.
        3. If `changed` is not empty: `version + 1`, and every `memo[a] = next`. This is the only write of S1 and S2.
        4. Each listener of each changed actor, once, each in its own `Result.try`; a throw is one host report. The
            listener set is copied before the loop, so a listener that unsubscribes and subscribes again is not
            re-called.
        5. `emits.deliver(version, p.turns)`: in turn order, after every snapshot listener. A turn's emit is
            delivered even when no snapshot changed; its version is then the current one.
        6. A listener's send is queued (the driver is still running) and served by the next slice of the same task.
        The compare reads only the memo and the new snapshot, so it happens before the write by construction. The
        release alarm needs nothing here: it is a core alarm whose firing step records `Published` for the holders
        (touched), and `stepEnds` is the last row of the core's `step`, not a host call.

    Occasions that do not compare: one rule. Every comparison is against the last published memo, never against the

    previous slice or step. An occasion that does not publish changes nothing any reader sees, and keeps its pending

    record; the next publishing occasion compares everything since.
        a slice ending with mail owed: skips the whole publication; compared by the slice that empties the mail
        a hidden page: skips nothing (it still publishes)
        a boot, restore or wake (`Begin`): skips nothing, `Begin` touches its actor; compared by the boot slice's
            publication
        a tab's death (Story) or a page freeze (browser): skips everything after the hide's drain and capture;
            compared by the next open's boot: a new Runtime, an empty memo, the store's records
        a capture asked while mail is owed: skips the capture; done at the slice end that empties the mail, or by the
            hide's synchronous drain
        stop: skips owed mail; `final` compares every memo entry once
        `verdictOf`: no live compare; it folds the finished evidence per `Turn`, against the actor's last `Published`
            incarnation, after the run

    Emits. `host/emits.ts` owns the listener sets. The driver calls `deliver` from `publish`'s step 5, so once per

    publishing slice, not once per step. A turn in a slice that owes mail waits in S3 with its publication. React's

    `useOnEmit` keeps its queue in the binding: the queue is its own external store whose value is its own sequence

    number, so a queued emit re-renders its listener even when no snapshot changed and even when React skipped a

    publication's version; delivery is in the passive effect of the commit that read that sequence. `deliver`'s

    `version` serves ordering and inspection only. No version is stored on an emit. Two turns in one publication

    deliver in turn order, both after the memo holds the later one. The evidence sink still runs per step, so

    inspection sees a turn before its emit is delivered. At stop, the owed turns were never shown, so their emits are

    never delivered (the turn has no screen state).

    The edge: one phase, one table. Each accept adds to the phase's `waiting` (a `Later` accept sets `marked`, with

    due `now + C`; a `Now` accept adds its ticket); tickets the capture step refused are answered false at once, in

    every phase, with no phase change. `issue` takes `waiting` into one batch: it asks the driver for a quiet capture

    (above), whose `Write` command carries `Carried = { tickets, marks }` to the store; an empty write list answers

    landed. `issue` cancels `wake`. One keyed task `wake` holds the only timer, armed on entering `Marked{at}` or

    `Backoff{until}` (or `Out` with an `at`) and replaced by the next arm, so a stale timer cannot fire; today's two

    keys `WAKE` and `RETRY` (`edge.ts:27-28`) become this one. `hidden` is the host's `hidden()`, read when a row

    asks. With `captureMs: 0`, C is 0, so every `Later` accept is due at once and issues.
        Phases: Quiet; Marked{at, waiting}; Out{flying, waiting, at, hiddenRetried}; Backoff{until, waiting,
            hiddenRetried}; Closed.
        accept Later
            Quiet: Marked{now+C}; hidden: issue
            Marked: Marked{min(at, now+C)}; hidden: issue
            Out: waits; `at = min(at, now+C)`; hidden: issue behind `flying`
            Backoff: waits; hidden and not `hiddenRetried`: issue
            Closed: ignored
        accept Now (a ticket)
            Quiet: issue
            Marked: issue
            Out: waits; issued when the last flying batch lands
            Backoff: issue
            Closed: ticket answered false
        `wake` fires
            Quiet: unreachable
            Marked: issue
            Out: issue behind `flying` (its `at` passed)
            Backoff: issue
            Closed: unreachable
        hidden
            Quiet: Quiet
            Marked: issue
            Out: `waiting` some: issue behind `flying` at once; none: no change
            Backoff: not `hiddenRetried`: issue, `hiddenRetried`
            Closed: unreachable
        shown: no change in any phase
        head landed
            Out: head's tickets true; `hiddenRetried` false; others flying: Out with the rest; none flying: `waiting`
                none: Quiet; a ticket waits, or `at` passed, or hidden: issue; else Marked{at, waiting}
            Closed: ignored
            other phases: unreachable (answers come only from flying batches)
        head refused
            Out: head's tickets false; its marks join `again`, and `at` becomes `min(at, now + C)` (`now + C` when
                none); others flying: Out; none flying: a ticket waits: issue, `hiddenRetried` unchanged; else
                hidden and not `hiddenRetried`: issue with `hiddenRetried` true; else Backoff{now + C, waiting,
                hiddenRetried}
            Closed: ignored
            other phases: unreachable
        close (services end)
            Quiet: Closed
            Marked: Closed; tickets false
            Out: Closed; every flying and waiting ticket false; answers ignored
            Backoff: Closed; tickets false
            Closed: unreachable

        Several batches in flight: the store contract lands batches in issue order (`store.ts`, case 3 of
        `storeContract`), so issuing behind a flying batch is safe, and answers come head first. Today's edge holds at
        most one (`edge.ts:92`); the second one is issued only by a hide or a passed `at`, so the usual case is
        unchanged. At a death every flying batch takes the fate word in order.
        Hidden skips the backoff once per run of refusals: a hidden page may freeze within seconds, so a refused
        batch, or a mark arriving in `Backoff`, is re-issued at once at most one time while hidden (see I10). A shown
        page waits the interval, as today's retry does (`edge.ts:119`).
        A `Second` Runtime (`Ownership`) starts `Closed`: the core records no `Persist` for it. A ticket is answered
        only by the batch that carried it. `Interrupted` (`edge.ts:200`) happens only at close, which is the `close`
        row. `settled()` is `Quiet`. A batch out past `storageSilent` is a derived inspection row, not a state.
        A hung store: a batch that never answers keeps `Out`, and disposal's ticket waits behind it; disposal still
        ends at `disposalBound` (the core's `Timer.Bound`, `core/disposal.ts:89`), and the close row then answers the
        waiting tickets false, so `dispose()` completes with **the overdue reported.** [decided: agent orchestrator
        2026-11-22]
        Departures from today: a `Later` mark during a shown `Backoff` waits for the retry instead of cancelling it
        (`edge.ts:75-76`); **a hide issues behind a flying batch.** [decided: agent orchestrator 2026-11-22]
        Why: the store contract orders several flying batches, so issuing behind one is safe. Reverse: a hide waits for
        the batch in flight.
        The three changed cells (head landed, head refused, accept Now, all in `Out`) and `hiddenRetried` are one
        family, "a waiting batch with no way out"; its one point is I20, and the cells are what it forces.

    Tabs, page death and the fate of unanswered writes. The Story's world is one value; each tab is a page with its

    own Runtime over it. Every actor step names its tab (default `"main"`); `openTab(name, build)` returns the

    builder for that tab, as Playwright's `context.newPage()` does. Time: each open keeps its own `tabClock`

    (scheduler and `TestClock`, `clock.ts:19-55`); the world owns the one instant, and `advance` moves every live

    open's `TestClock` to it, in tab-opening order. A fake server's handler and its `late(d)` sleep on the calling

    open's clock; a dead open's clock never moves, so its pending answers never run. `checkpoint` and `read` take a

    tab (default `"main"`); checkpoint names are unique across tabs.
        hide: Shown: Hidden, hide listeners run. Hidden: script fault `AlreadyHidden`. Gone: script fault
            `TabClosed`. No such tab: script fault.
        show: Shown: script fault. Hidden: Shown. Gone: script fault `TabClosed`. No such tab: script fault.
        closeTab(t, { inflight }): Shown: Dying, hide listeners run (drain, capture), then death. Hidden: Dying (no
            second hide), death. Gone: script fault. No such tab: script fault.
        any step while Dying: not reachable: Dying lasts one step and no task runs in it.
        reload(t, { inflight }): Shown or Hidden: `closeTab`, then the same name's next open, Shown. Gone: script
            fault. No such tab: script fault.
        openTab(t): Shown: script fault `TabOpen`. Hidden: script fault. Gone: the next open, Shown. No such tab:
            open 1, Shown.
        advance(d): the one clock moves; every live tab's timers fire; a Gone tab's clock never moves.

        Death, the one point of handling for family "page death and unanswered writes": inside the Dying window the
        hide row drains the owed mail and captures, and the store write is invoked synchronously: the edge's fork
        runs its first slice before returning (`runForkWith` evaluates at once), so the fake store sees the batch
        inside the window. A batch whose store call was invoked inside the window is held for the death. Then every
        batch of that open that is `Held` (by a word or by Dying), in issue order, takes the fate word:
            `abort` (default): records unchanged; no answer (`Aborted`); matches Safari, where a `pagehide` batch
                never lands.
            `land`: the batch applied in order; no answer (`Landed`, unheard); matches Chrome, where it lands and
                the page never hears it.
        Then the open's calls and writes become `Unheard`, its listeners are cleared, its lock is released, and its
        Owners are ended; a task still alive once its Owner's end has finished goes to `left` (an interrupted timer
        does not). The reload sweep runs every Story at every position in both fates, with `expectBroken` dropped from
        the forks (a fork before the expected step cannot break it; a Story that expects a break is judged as written
        only); today's `heldWrites` is this word renamed, and today's crash semantics (no hide listener) is gone: a
        reload runs `pagehide` first, as a browser does. A crash with no `pagehide` is
        **`closeTab(t, { inflight, hide: false })`.** [decided: user 2026-11-22] Why: today's reload is a crash with no
        `pagehide` flush ever exercised. Reverse: keep crash semantics.

        Locks: a fake `Locks` in the world. `openTab` while another live open holds the app's lock boots `Second`: no
        store call; the death of the holder frees it; a `Second` stays `Second` until its own reload. The browser's
        bfcache return is a host rule (`pageshow` with `persisted` reloads), proved in the browser tier, so the Story
        has no `freeze` word, and the Safari lock mode (a lock dropped on freeze) is not simulated in Stories, only
        in the browser tier.

    The verdict. `verdictOf` is the one judge of a run: project run rules, tooling rules and machine rules alike.
        judged  = rules minus sw.off                  -- an off rule's check is never called
        ran     = judged.flatMap(r => Result.try(() => r.broken(run, index))
            .getOrElse(e => [Broken("RuleThrew", { rule: r.rule, cause: e })]))  -- a throw is its own break
        machine = the fold of `The machine rules' judge` over run.evidence, with the run's rule sets minus sw.off; each
            check in its own `Result.try`, a throw is a Broken of rule "RuleThrew" naming the rule -- never the expected
            break
        left    = TerminalLeft of the values `storyCompiled` proved, as Broken of the tooling rule "TerminalLeft"
        found   = ran ++ machine ++ left
        matches(e) = every b in found with b.rule = e.rule and fitting e.step, e.actor, e.where
        checked = (found minus the union of every matches(e)).sortBy(step, then rule)
            -- other breaks of an expected rule still fail
        verdict = {
            broken:       checked,
            neverBroke: run.end is Finished and horizon is Quiet ? sw.expectBroken.filter(e => matches(e) is empty) : 
                [],
            unfinished:   run.end is Limit(reason) ? some(reason) : none,
            inconclusive: run.horizon is Quiet ? none : some(run.horizon),
        }
        switch against a rule's breaks:
            checked (default): none: passes; at least one: fails, every break listed, the earliest primary
            `expectBroken`: none: fails `neverBroke`, on a finished, quiet run; at least one: the matching break
                passes, any other break of the rule fails
            `off`: not judged, its check never runs
            in both lists: refused when the Story is built
        An Expect matches every break of its rule that fits its `step`, `actor` and `where`. The Story passes only when
        each Expect matches at least one break and each break of an expected rule is matched by at least one Expect. A
        bare rule keeps the decided meaning: it breaks at least once. A rule that breaks twice passes a bare Expect,
        and two Expects **may match the same break.** [decided: user 2026-11-22] Why: the sweep drops the entry from
        forks, where a break cannot happen before its step. Reverse: a rule id only.
        A written Story's run has `horizon: Quiet` by definition; only generated runs have another horizon. A Story
        inverted for a known bug names at least the step, so a break at `Begin` on another actor no longer satisfies
        it; an `expectBroken` with only a rule id is allowed and prints a warning in the verdict text.
        `run()` resolves only on `passed`; otherwise it rejects `StoryFailed { verdict, run }`, with the run and its
        partial trace, so `flow trace` and `--trace-output` print it after a failure. A script fault (a release with
        nothing held, a step on a gone tab) rejects `StoryScriptFault` before any verdict.
        `UnusedWord` in generated runs: they drop unused words before judging, as today (`generate.ts:847`), so the
        rule never sees them; `lenient` goes. A cleanup that failed after a dispose stopped waiting (`run.ts:636-637`,
        a script fault today) is a `CleanupLeft` breach naming its cause. On a run that ended at a limit,
        `CleanupLeft`'s breaks are marked partial in the verdict text.
        `CleanupLeft` reads `left`, built in `finish`, which disposes every live tab's Runtime and then closes it:
        calls still waiting whose caller never aborted, batches and loads not answered, listeners attached, stores
        open, and each Owner's tasks still alive after that Owner's end finished (`owners.ts` holds a `FiberMap` per
        Owner). Reading the Owners replaces counting `TestClock` sleepers: every sleeper is a task.
        `PublicationDrift` (the guard for `model`'s Snapshot inputs): in a Story run, at every slice end with no mail
        owed, published or not, for every key in memo keys union world identity keys and not in `touched`,
        `reuse(memo, snapshotIn(world))` returns the memo object. A writer that forgets to mark, or a new actor that
        was never published, fails it. Its cost is O(identities) per quiet slice, in Story runs and sequences only;
        generated and stress runs check it at checkpoints (traded against I18). The result is recorded as evidence,
        so the rule stays a function of the finished run.
        The handed run rules join Flow's list: snapshot issues equal `issuesOf` of the same `Published` record's
        incarnation (`Operations`; it reads the public `Published.snapshot`); every saved record round-trips
        (`Records`' I1 and I2), reading batch values, which the fake's batch log keeps beside `keys`
        (`fake.ts:586-598`); and the turns rules read `Turn`.

    The machine rules' judge. One fold inside `verdictOf` (`host/testing/verdict.ts`; `Operations`' `owners.ts#judge` is
        a different function and keeps its name), run once over the finished run's evidence, never between a step and
        its sink; `last` is a local of the fold, **not stored state.** [decided: user 2026-11-22] 
            (@proposal.external-rules)
        Why: only Story tooling judges rules; the live judge, its `last` map and the `RuleBroken` evidence kind are cut.
        Reverse: the driver's live judge. Superseded by the same decision: "run by the driver between a step and its
        sink". The rule sets are the run's (`storyCompiled`), matched to evidence by definition id, with the placement
        (`Desk/Editor/uploads[a]`) named beside the rule in the `Broken`. Per record of the evidence, in order: the
        record in the batch, the invariant rules placed at the actor's state, the turns rules on the turn's edge:
        `Published` with `why` Begin: invariants checked with `project(incarnation)`; turns none; `last[actor] =
            incarnation`
        `Turn` then its `Published`: invariants checked; turns checked with `{ event, before: project(last), after }`;
            then `last = incarnation`
        `Published` with `why` Other: invariants checked; turns none; `last = incarnation`
        `Turn` with no `Published`: invariants none (nothing changed); turns checked with `after = before` (a rule "X
            must change state" breaks here)
        `Turn` then `Finished`: invariants none; turns checked with `after = project(ended snapshot)`; then the `last`
            entry removed
        `Finished` without a `Turn`: none; the `last` entry removed
        A fragment copy is its own fold key: `last` is keyed by actor and copy (`uploads[a]`), and a turns rule skips
        a copy's entry, its reset (`resetOn`) and its exit: the copy's `Begin` and a reset set `last` with no turns
        check, and its exit removes the entry with none (@plan.Rules.O7: there is no before or after of one copy).
        **Fold key per copy** [decided: agent specs lead 2026-11-22] Why: more correct, and it follows the decided 
            Plan. Reverse: fold by
        actor alone and judge a copy's entry and exit as turns.
        A `check` that returns false is a `Broken { rule, actor, step, at }`; one that throws is `RuleThrew` (a throw
        changes only its own check). There is no Runtime setting: Stories and the CLI always judge, and a Story's switch
        `off` list keeps those checks from being called. `last` belongs to one Runtime's evidence: a reload starts
        empty, and the first record after it is a `Begin`.

    `propertyTest`. Seed result: passed: counted. Not passed: recorded; shrunk only if it is the first failing seed

    for its key: the primary broken rule, else the unfinished reason, else the inconclusive horizon, else the first

    never-broke rule. Script fault: the whole test rejects `StoryScriptFault` at once (the generator or a sample is

    wrong). After the last seed: resolves `Report` if every seed passed; else rejects `PropertyTestFailed { failures

    }`. Every seed runs: the seed list is the contract, and a rule broken only at seed 7 must show beside seed 2's.

    Shrinking stays per first failure, so cost grows with distinct failures, not seeds.

    The CLI result table.
        `flow story run`, passed: exit 0.
        `flow story run`, broken rules, `neverBroke` or unfinished: exit 1.
        `flow story run`, script fault: exit 2.
        any command, `RunRejected` (`compiledOf` raised), `ConfigLoadFailed`, usage: exit 2.
        `flow check`: the types Spec's rows; built by @task.V3.T22, not here; exit 0, 1 or 2.
        `inconclusive` exists only in generated runs, which the CLI does not run. `flow trace` prints the verdict
        under the trace, so the text form and the test agree. `RunRejected` today wraps a script fault
        (`cli/main.ts:14, 49`); it now means only `compiledOf` raised, and a script fault is its own row. The JSON
        `status`: passed is `completed`, a failed verdict `failed`, unfinished `incomplete`; `equal` and `different`
        belong to trace comparison, not to a run. `story describe`, `graph` and `explain` are @task.V3.T22's commands
        over the Model; no row here builds them.

    The sweep and the generator. Sweep (`sweep.ts:176-265`): the five flags of one cell become one phase.
        Phases: Replay{prefix}; Given{stood}; AwaitRefusal{before}; Fired; Quiet{outcome}.
        prefix done: Replay: Given (fault steps queued).
        fault steps empty: Given: Quiet; outcome NoWrite.
        not stood: Given: Quiet; outcome NotReplayed.
        fault given: Given: Fired, or AwaitRefusal for a storage refusal.
        refusal counted: AwaitRefusal: Fired.
        nudge (held write): AwaitRefusal: Fired if a write is held; the nudge is kept otherwise.
        quiet done: Replay: Quiet; NotReplayed (the Story ended before the fault position). AwaitRefusal: Quiet;
            outcome NotFired. Fired: Quiet; Reached.
        script fails: Replay, Given, AwaitRefusal, Fired: Quiet; outcome NotReplayed.
        `Quiet` carries the outcome only; "stood" is "the prefix replayed to the fault position"; a nudge that does not
        fire stays queued for the next pull (`sweep.ts:233` dropped it). The lane phase list is named `LANE_PHASES` to
        keep it apart from `CellRun`. The outcome is derived from the final phase, never from flag pairs.
        `LANE_PHASES` is derived from the lane phase type's tags, so a new phase is swept. The prefix runs once per
        phase and each of the seven faults forks from its saved end (`run.ts:618` `save`), not seven replays.
        Generator (`generate.ts`): `timers`, `landOnReload`, `offline`, `offlineLeft`, `online`, `armed`, `drawOf` and
        `rest` go. Late, reordered and offline become draws of the world words (`late(d)`, `never()`, `duplicate()`,
        `network.offline` with its `advance`), whose timing the fake world runs on the tab's clock. What stays is S13:
            type Wait = { readonly until: number; readonly then: "Think" | "Gap" }   // one waiting reason at a time
            type Quieting = Data.TaggedEnum<{
                Draining: {}; Counting: { readonly rounds: 0 | 1 | 2 }; Done: { readonly why: "Quiet" | "Limit" }
            }>
        A failing generated run's printed Story then replays by its text alone, since nothing it did lives in the
        generator. `QUIET_LIMIT` stays as today's measured bound until the bench says otherwise.

    Pseudo-code.
        -- host/driver.ts
        input(i): inbox.push(i); if not running: run()
        run():
            running = true
            try:
                loop:
                    while (i = inbox.shift()):                           -- a ring index, not Array.shift
                        out = Result.try(step(world, i, env))              -- failure: stop(defect); return
                        ev  = out.evidence ++ slowWork                      -- no judge: `verdictOf` judges
                        admit(ev)                                          -- a throw: stop(fault); rethrow after the 
                            loop
                        world = out.world
                        pending.touched U= out.touched; pending.turns ++= turnsOf(ev); pending.all ||= out.lifeChanged
                        sink(ev)                                           -- each sink in its own Result.try
                        perform(out.commands)                              -- releases first, then starts
                    if life is Final: break
                    q = quiescent(world, clock.now())                    -- none while world.mail.size > 0
                    if isDisposed(world.life) or isFailed(world.life):
                        if q is some: final(q, pending) else finalFromMemo(stopped)
                        Deferred.done(disposed, void); break               -- the disposal signal, today per step
                    if q is none: if owesServe(world): work.fork("serve", yieldNow, () => input(Serve)); break
                    if pending not empty: publish(q, pending); pending = empty
                    if captureAsked: captureAsked = false; input(Capture(q))   -- the edge's deferred issue
                    if inbox empty: break                                -- a listener may have sent: serve it now
            finally:
                running = false

        hideDrain():                                     -- the hide row, inside the listener call; forks nothing
            while world.mail.size > 0 and life admits Serve: step(Serve)   -- the synchronous step and `perform`
            edge.hidden()                                  -- its capture finds the world quiet
            -- `run()` alone owns `running`; `input` gains no option, and `Serve` has no no-yield form

        stop(defect):
            if life is Final: return
            world = stopped(world); inbox.clear()
            finalFromMemo(lifecycle: stopped); Deferred.done(disposed, die(defect))   -- the owed world is never shown

        -- host/publication.ts
        publish(q, p):
            keys = p.all ? memo.keys() U identityKeys(q.world) : p.touched
            changed = Result.try(() => keys.flatMap(a => {       -- compare; a throw: stop(defect) and return at once
                next = Option.map(snapshotIn(q.world, machines, a), s => reuse(memo.get(a), s))
                return same(next, memo.get(a)) ? [] : [[a, next]] }))
            if changed nonempty:
                version += 1
                for [a, next] of changed: next is some ? memo.set(a, next) : memo.delete(a)
            for [a] of changed: for tell of [...listeners.get(a)]: Result.try(tell) else report
            emits.deliver(version, p.turns)
            return { version, at: q.at }

        final(q, p): publish(q, { ...p, all: true }); life = Final; listeners.clear(); inbox.clear()
            -- the disposing world has no mail (cleared at Disposing); a failed boot's world has none either
        finalFromMemo(lifecycle): changed = every memo entry with lifecycle replaced; version += 1; write; notify;
            life = Final; listeners.clear()      -- no emits: the owed turns were never published

        -- host/testing/run.ts, death of a tab
        close(tab, inflight, hide = true):
            if hide: tab.life = Dying; for l of tab.listeners: l() -- drain, capture, issue; store calls invoked now
            -- no clock settle: no task of this open runs after the listeners (a frozen page runs none)
            for b of store.batches(open of tab, status Held) in issue order: inflight == "land" ? store.land(b) : 
                store.abort(b)
            fakes.unheard(open); tab.listeners.clear(); locks.release(open)
            work.end(open's Owners); left.add(their leftovers); tab.life = Gone

composition
    flow
        Offers `publish`, `final`, `quiescent`, `Quiescent`: the one publication, the one door to a world with no
        mail; `Capture` and the hide drain take it.
        Offers `getSnapshot`, `subscribe`: the memo reads the binding's hooks and the handle use.
        Offers `emits.deliver`: the one delivery of emits, called by `publish` only.
        Offers `transition`: the edge's one table.
        Offers `storyCompiled`, `verdictOf`, `Story.app`, `run`, `closeTab`, `openTab`, `Fake.storage.hold`: the
        tooling the Stories and the CLI use.
        Offers the public `Published<D>` and `Turn<D>` faces (the one owner; they carry `Types`' `EvidenceOf<D>`), 
            `EventOf<D>` with a fragment event's address `{ slot,
        key }`, and the exit table of the CLI.

        Needs `Changes`: `Out.touched` and `lifeChanged`, written by the function that writes each fact, as its index
        rule says; the `Published` and `Turn` records this Spec's public faces are built from; props before attach are 
            `Input.Create`'s props, after
        attach `Input.Props`, judged by `sameValue`; `Capture` takes a `Quiescent`. A hidden page is not a use change
        in v1: React Activity's cleanup is a `Release`, the page's visibility is not
        **Hidden page** [decided: user 2026-11-22: not a core input; a throttled wake fires each overdue timer once]. 
            `Changes` and
        this Spec both edit `driver.ts` (`perform`, the sink, `Wake`): one Task lands the turn rows first, then the
        slice end.
        Needs `Operations`: the release alarm publishes through this table with no host code (its step records
        `Published`); `stepEnds` runs as the core step's last row, once per step; inspection lists `releasing` with
        ages (@task.V3.T49's Model); the abort-ignoring service and the read generator are fixture services under
        `fixtures/services/` (@task.V3.T112's); the issues run rule is in `algorithm` (the verdict). The public event
        a view sends for `refetch` is this Spec's (Q6).
        Needs `Records`: the run rule for I1 and I2 reads the fake store's batches (records as written); the
        mutation generator is a storage world word `Fake.storage.mutate(kind)` applied before an open; which fate a
        reload takes is this Spec's word. A capture never reads a world with mail, so `Records` needs no change; the
        batch log keeps values for its round trip.
        Needs `Schedules`: the breach id of an inverted row is `StoryFailed.verdict.broken[0].rule`; the recount reads
        it with a small reporter in `tests/`, not in `src/`. The host stepper by arming id stays in
        `owners/schedule-steps.ts`. The memo for `issuesOf` is not S2: that memo is keyed by the owner's map identity,
        inside the core, and stays with `Schedules` and `Changes`.
        Needs `Types`: `Story.app` and Runtime start call `compiledOf`, its only callers; `Broken.rule` is `R`, the ids
        of the rule tokens of `Machine<D, N>["rules"]` and the config's literals; `RulesDiffer` is a `Types` row of
        stage `story`, raised by `storyCompiled`; `project` is the publication's and `read(ref)`'s restore;
        `Finding.location` is shown by the CLI only.

        Unchanged here: the binding's attach and detach, its channel rules, the lock rules of the browser tier and
        the test-tooling rules about `Fake` services; `Tab<T>` and `Dying` add only the trace codec rows.
        Tasks (no scope changed): @task.V3.T111 builds publication, the binding and the edge with its three changed
        cells; @task.V3.T112 owns the world (tabs, death, locks fake), the one store and the mutation applier;
        @task.V3.T114 owns the verdict with the machine-rule fold, `storyCompiled`, `propertyTest` and the CLI
        table; @task.V3.T97 owns the sweep, the generator, `seam.ts`, the reach flags and the Story helper type
        names; @task.V3.T117 owns the cost rows; @task.V3.T27 owns the real lock and `pageshow`; @task.V3.T30 owns
        emit delivery in React; @task.V3.T127 owns emits at the root.

rules
    quiet    A reader (publish, capture, hide) takes a `Quiescent`; no code path builds one but `quiescent`
    memo     A snapshot is read from the memo; the compare is against the memo, before the write; the write is the
             only write of S1 and S2
    once     `publish` runs once per publishing slice; `final` once per Runtime; each listener in its own `Result.try`
    emit     Emits are delivered by `publish` step 5 and nowhere else; owed turns at stop are never delivered
    edge     One phase, one table, one keyed `wake`; no flag outside the phase; a ticket is answered only by the
             batch that carried it
    death    One occasion, one fate word for every `Held` batch of the dead open; the Dying window runs no task
    verdict  One function of the finished run; `run()` resolves only on `passed`; the unjudged runner is internal
    judged   Rules are judged only by `verdictOf`, over the finished evidence, in Story routes that start through
             `storyCompiled`; no Runtime, driver or `app()` reads a rule
    throw    A throw in a listener, an emit listener or a rule check changes only its own check
    cost     Counters and cursors owned by the fake world, written where the fact is written
    inbox    A ring index, not `Array.shift`; the clock settle a ring index and a cancelled-set

realization typescript
    One store: `platform/memory.ts` is the one fake store (it closes with its scope and refuses after); the fake
        wraps it. `left` is read from the Owners.
    Idiomatic Effect at the edges: keyed forks for `wake`, retry and `serve`; `FiberMap` for `left`; no hand-rolled
        timer. The driver's inbox and the edge's one wake are synchronous structures beside Effect's `Queue` and
        `Schedule`, because a slice runs to its end without yielding. [proposed]
    Casts. `snapshot.ts:236` (`asOutside`) is replaced by `project` (`Types`' one outward restore). The test-tooling
        casts are kept, each justified: `sweep.ts:352` casts `options.properties` to the erased search's `Check`, as
        `generate.ts:1207` does; `generate.ts:941` and `generate.ts:1207`: the search runs erased runs of the samples'
        own definitions; `run.ts:640`: `Object.fromEntries(checkpoints)` typed as `StoryRun<Names>["checkpoints"]`
        (`project` does not touch it); `fake.ts:136`, `fake.ts:764`, `fake.ts:768`: a server's handler map is erased by
        endpoint name, restored at its one call; `src/test/loose.ts:8` is out of this area (six tests unrelated to
        `seam.ts`).
    `seam.ts` goes: the nine host unit tests move to Stories or the binding's port (`acquire` returns the release;
        `send`; `whenReady`) on the internal route, the same port React uses, plus public `dispose({ forget })`.
    Core style. Everything outside `src/host/` stays plain TypeScript (`Result`, `Option`, `Data`, `Schema` only).
    Cost. Sizes: A actors, T touched actors per slice, L listeners of touched actors, S steps of a run, E endpoints,
        K calls so far, B batches so far, P sweep phases (8), F faults (7).
        `getSnapshot`: O(1), no allocation (today a new snapshot per call).
        a publishing slice: O(T x snapshot + L); `final` O(A) once.
        `PublicationDrift` (tests only): O(identities x snapshot) per quiet slice in Story runs; at checkpoints only in
            generated and stress runs.
        hide: O(owed mail) to drain, then the capture.
        the machine-rule fold: O(records x rules placed at the actor's state), once per run, over the evidence, from
            the rule sets' per-state index built once by `storyCompiled`.
        generator, per pull: O(1) (today O(E x K) at `generate.ts:512`, `fake.ts:475`, and an O(B) eager view): counters
            in the fake, a lazy view; arming is gone.
        generated run: O(S) (today O(S^2 x E)).
        sweep, per cell: prefix once per phase, F forks; reach read from an evidence cursor, O(new records) (today the
            prefix is replayed F times and inspect runs 1 to 3 times per pull).
        reload sweep (`forkReloads`): O(S^2) steps (inherent: each position runs its suffix); the fake store a
            persistent map, so a save is O(1) (today a full store copy per position).
        clock settle: a ring index and a cancelled-set, O(tasks) (today `splice`/`shift` and `includes` plus `splice`,
            `clock.ts:24-34`).
        checkpoint `cut()`: unchanged (`indexDrift(world)` over the whole world): a checkpoint is rare; not hot.
        driver inbox: a ring index, O(1) (today `Array.shift`, O(n)).
        run rules: a `RunIndex` built once per run, O(N); each rule reads its slice (today each filters
            `run.evidence`, `select.ts:186`).
        `propertyTest`: every seed; one shrink per distinct primary rule.
        Hot-path allocations: one `Published` and one array of changed actors per publishing slice; one snapshot
        object per changed actor; nothing per step on the host beyond today's evidence batch.

coverage
    @R1    enforced_by [@I1, @I7]                        open_by [@Q1, @Q4, @Q11]
    @R2    enforced_by [@I2, @I3, @I6]                   open_by [@Q1, @Q2]
    @R3    enforced_by [@I4]                             open_by [@Q1]
    @R4    enforced_by [@I5]                             open_by [@Q1]
    @R5    enforced_by [@I11]                            open_by [@Q1, @Q3]
    @R6    enforced_by [@I8, @I9, @I10, @I19, @I20]      open_by [@Q1, @Q10]
    @R7    enforced_by [@I12]                            open_by [@Q1, @Q7]
    @R8    enforced_by [@I13, @I15, @I23, @I25, @I26]    open_by [@Q1]
    @R9    enforced_by [@I17, @I23]                      open_by [@Q1]
    @R10   enforced_by [@I18]                            open_by [@Q1]
    @R11   enforced_by [@I14]                            open_by [@Q1, @Q12]
    @R12   enforced_by [@I21, @I26]                      open_by [@Q1, @Q13]
    @R13   enforced_by [@I22]                            open_by [@Q1]
    @R14   enforced_by [@I16]                            open_by [@Q1, @Q12]
    @R15   enforced_by [@I24]                            open_by [@Q1, @Q5]

tests
    T1  Levels. (1) The executable model: the three tables (publication, edge, tabs) as plain functions, every sequence 
        up to the depths of T2, I1 to I24 after each step, kept in the package's tests. (2) Story sequences
            in the package: `sequencesOf` over the alphabet, run on the real driver and fakes, the expected value 
                computed
            from the tables in the test. (3) React, in a real React 18 and 19 with Strict Mode on and off: renders per
            publication. (4) Tooling, in the package: a printed failing Story re-run with no generator breaks the same
            primary rule (I17); the CLI's exit code and JSON `status` over every verdict and run end (I22); `run()`
            resolves on a passed verdict and rejects on every other end (I23); the memo's key set against
            `snapshotIn` over the Publication alphabet (I24).
            [@I1, @I2, @I3, @I4, @I5, @I6, @I7, @I8, @I9, @I10, @I11, @I12, @I13, @I14, @I15, @I16, @I17, @I22, @I23,
            @I24]
    T2  Alphabet and size. Publication: click(a), click(a, fan-out 150), click(b), a listener that sends, a synchronous 
        settle, stop, dispose, next task; depth 4, 8^4 = 4,096 sequences. Edge: accept Later, accept Now, capture
            refusal, wake, hidden, shown, head landed, head refused, close (enabled cells); depth 6, at most 9^6 = 
                531,441
            in the model, depth 4 in the package. Publication with the edge: fan-out click, hide, wake, close, next 
                task;
            depth 4, 625 sequences: no capture ever reads a world with mail. Tabs: hide, show, closeTab abort, closeTab
            land, reload, openTab second, storage hold, advance, send; depth 3, 729 per fixture with two tabs. Verdict 
                and
            `propertyTest`: end (4) x horizon (5) x switch (3) x breaks (0, 1, 2) for 3 rules, seed lists of length 1 to
            3: 14,580 and 399. [@I1, @I8, @I9, @I10, @I11, @I13, @I14, @I16]
    T3  Cost check. The fake world exposes its counters (S14): reads of the call log, the batch log and `inspect` per 
        step. A test runs one generated Story at S and 2S steps and asserts the reads per step are equal; it fails on
            today's `generate.ts:512` and `sweep.ts:80`. [@I18]
    T4  Liveness. I19 is run in the model and as a package sequence with a mark every C/2 against a store refusing 
        once. [@I19]
    T5  Oracle. Derived from the rows: the model computes the expected publications, notifies, phases, records and 
        verdicts from the tables alone; a run that matches the code but not the table is a finding, never a pass.
            [@I1, @I8, @I13]
    T6  Story `shop/fan-out-render`: a cart change heard by 150 consumers, one listener on the 150th. Wrong ending: the 
        listener's first read shows the 150th stale (a publication per drained slice). Expected: the listener is
            told once, and at that time all 150 snapshots are new. [@R1, @R2, @I1, @I3]
    T7  Story `shop/back-twice-close`, under both fates: the reopened flow is at PAY or METHOD and never anywhere else. 
        Wrong ending: SLOT (the stale-batch ending a single in-flight batch would allow). `storeSetup`
            captures at once (`fixtures/shop/app.ts:116`), so the Story holds the batch (`Fake.storage.hold()`); without
            the hold nothing would be in flight at `closeTab`. [@R5, @R6, @I9, @I11]
    T8  Planted faults (`tests/faults.ts`), each caught by `nub run faults`, with the test that must catch it: publish 
        at every slice end ignoring owed mail (the fan-out Story; I1 sequences); write the memo before
            comparing (I3: the compare sees no change, nobody is told); `getSnapshot` reads the live world (I2 sequence
            with a sink that reads); deliver emits per step, before `publish` (I4); a tx writer that does not mark
            `touched` (`PublicationDrift`); a `Later` accept cancels the backoff (I19: the retry starves under a mark
            every C/2); capture issued while mail is owed (the publication-with-edge sequences; a fan-out Story with a
            hide); the death settles the clock before fating (`back-twice-close` with a fan-out before the close, under
            `land`); hide does not issue behind a flying batch (`back-twice-close`: METHOD lost under `land`);
            `expectBroken` matches by rule only (an inverted Story whose break happens at another step); a project rule
            throws and rejects `run()` (`RuleThrew` names the rule); a refused batch drops its marks (I9); the death
            leaves the `pagehide` batch landed under abort (the Story's abort ending); a dead open's answer delivered
            (I11); `run()` returns on a break (the leak Stories); `verdictOf` skips `expectBroken`'s never-broke (I14);
            `propertyTest` stops at the first failing seed (I16 with a rule broken only at the last seed); the
            machine-rule fold calls an `off` rule (I13 with a check that throws); a waiting batch with no ticket and no
            `at` (I20); a throwing rule reported as the expected break (I21: `RuleThrew` names the rule); a memo kept
            for an identity `snapshotIn` returns `none` for (I24: `getSnapshot` of it is not `none`); a Story route
            that starts without `storyCompiled` (a sweep fork with no `RulesDiffer` check, I25); two builds of one id
            in one run, or a bare value beside its ruled form, not refused (I25); a ruled value's terminals not proved
            at Story start (I25: a `TerminalLeft` Story); a driver that holds a `last` map or emits `RuleBroken` (I26).
            [@I1, @I2, @I3, @I4, @I9, @I11, @I13, @I14, @I16, @I19, @I20, @I21, @I24, @I25, @I26]
    T9  Fixtures. Transfers' `hideFlush` and `hiddenRefusing` (`fixtures/transfers/stories/visibility.ts:30-103`: hide 
        issues once; a refused hidden batch retries at once, a single time); `tests/stories/storage.test.ts:58-80` and
            `tests/write-lanes/payment-leave-and-reload.test.ts:184-216` (abort gives CARD with no charge, land gives
            UNSURE, nothing sent: both fates, now named); session's `workspaceHide` (hide twice: one batch, the Hidden
            row); wizard's `reloadedPastHold` (a reload is a death and a boot). No fixture runs two tabs today;
            `shop/back-twice-close` is the first. [@R5, @R6, @R7]
