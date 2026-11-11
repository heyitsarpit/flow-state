# Plan to Task coverage check (proposed, 2026-11-11)

**Bottom line (proposed):** of 265 public features and behaviours in the Plans' outcomes, 123 have no Task that
names them. 48 have no core Spec and no Task (G). 75 are covered by a core Spec only through a Task named after an
internal module (S and S0), almost all of them T17 "Compiled and the compiler" or T18 "Lane, step and turn".
Flow.input is one of these: Compile R5 to R8 and Actors R5 state it, but no Task names it, and production lacks it.
Three whole areas have no Task: lazy features, Inspection (the `flow-state/inspect` route) and the package routes.
A fourth, Reads "built later" (staleTime, setData, invalidate, placeholders and more), is set by `spec-split.md` for
"phase 4, when the operations module reaches them", but no P4 or P13 Task names it. Another 23 rows (N0 and S0)
have no Invariant or case that checks them, among them history (Turn R4), the snapshot shape (Turn R23) and the
Definition Schemas and E.X (Compile R14). Everything below is proposed. Scope changes are the user's.

**Why now:** the user found that Flow.input is absent from production and from every Task, and asked for the
board to be checked against the Plans before production goes further.

**Read first:** `workflow/specs/spec-split.md` ("Written when their phase starts"), the Tasks in
`workflow/tasks/V3/P4.task` to `P15.task`, `packages/flow-state-v3/conformance/not-yet.ts`,
`fixture-catalogue-2026-11-11.md` ("Features found by the Plan check").

**Risk:** "named" is a judgement on terse Task text. A Task named after a user-facing area (fragments, streams,
entity store, Stories, React bindings) counts as naming the features its cited Plan outcomes list. A Task named
after an internal module (the compiler; lane, step and turn) owns only through its Spec, which is how Flow.input
went missing.

## How to read the table

- **Own** (who builds it in production):
  - **N**: a Task names it, by feature, by area or by its Invariant id in a comment;
  - **N0**: named, but no Spec Invariant or case checks it;
  - **S**: a core Spec requirement covers it, and a module-named Task builds that Spec, but no Task names it
    (unowned by the brief's rule);
  - **S0**: as S, and no Invariant checks it either;
  - **G**: no core Spec and no Task (unowned).
- **Builds** is the production Task. **Checks** is the Spec rule and Invariant that judge it. A not-yet owner is
  given where `not-yet.ts` lists one. A P5 Task builds and checks its own slice. Spec names are abbreviated: Cmp
  Compile, Trn Turn, Act Actors, WL WriteLanes, Rd Reads, WA WriteAhead, Rs Restore, Dg Diagnostics, Cd Codec,
  SC StaticCli.
- **Today**: what `packages/flow-state-v3/src/` has at `b732d003`: yes, part or no. It was read from `index.ts`,
  `flow.ts`, `definition.ts` and `host/runtime.ts`.
- The Plan column drops the prefix: `Machines.O1` is @plan.Machines.O1. Sidecar listings were checked against
  the Plan text; rows that came from a sidecar and did not hold were dropped or reworded.

## Counts

| Section | Rows | N | N0 | S | S0 | G | Unowned |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Machines | 74 | 21 | 7 | 33 | 9 | 4 | 46 |
| Runtime | 34 | 4 | 0 | 27 | 2 | 1 | 30 |
| Operations | 51 | 35 | 2 | 3 | 0 | 11 | 14 |
| Persistence | 23 | 22 | 1 | 0 | 0 | 0 | 0 |
| EntityDomains | 13 | 11 | 0 | 0 | 0 | 2 | 2 |
| React and ServerRendering | 13 | 12 | 0 | 0 | 0 | 1 | 1 |
| LazyFeatures | 7 | 1 | 0 | 1 | 0 | 5 | 6 |
| Inspection | 9 | 1 | 0 | 0 | 0 | 8 | 8 |
| Diagnostics | 6 | 6 | 0 | 0 | 0 | 0 | 0 |
| CommandLine | 15 | 9 | 2 | 0 | 0 | 4 | 4 |
| Testing | 9 | 8 | 0 | 0 | 0 | 1 | 1 |
| Package | 11 | 0 | 0 | 0 | 0 | 11 | 11 |
| **Total** | 265 | 130 | 12 | 64 | 11 | 48 | 123 |

Counted from the tables below by script. Unowned is S plus S0 plus G.

## The most important gaps

1. **Author-facing definition features (S, T17):** Flow.input, computed Flow.initial, Flow.private, the Definition
   Schemas, E.X validation, compound states and Flow.state traits, and context slots. Production has none of these
   except constant Flow.initial. T17's acceptance ("the Compile and Diagnostics cases pass") can be met without
   them where no case reaches them, because Compile R10, R13 and R14 have no Invariant.
2. **Actor identity by value (S, T18; check T9):** actorRef's value form, createActor, the `snapshots`
   subscription, getSnapshot's fallbacks and runPromise. `actorRef` takes a name only (`host/runtime.ts:58`).
3. **Lazy features (G):** @plan.LazyFeatures.O1 to O5 have no Task. `spec-split.md` lists them as a phase 5
   area, but P5's description and Tasks omit them. Compile R15 defers them to "the lazy-features Spec when it is
   written".
4. **Inspection (G):** inspect(app), inspect(runtime), sinks with capacity, trace export and import, redaction
   and renderers have no Task. Only `flow trace` (T29) and `flow graph` (T22) touch them.
5. **Reads built later (G):** staleTime, gcTime, trailing refetch, setData, invalidate, clear, write batches
   (256), placeholders, contract.get, key bounds and InvalidKey, focus and connection triggers, and optimistic
   stacking. `spec-split.md` puts them in phase 4. No P4 or P13 Task names them.
6. **Package (G):** the six routes, the server-route conditions and the ServerOnlyImport stub, peer ranges,
   `sideEffects`, removed surfaces, Dispatch Desk, React 18 and 19 installs, and **Gecko**. @plan.Package.O4
   names Chromium, Gecko and WebKit, but every browser Task names only Chrome and Safari.
7. **History and snapshot shape (S0):** Turn R4 says only "behave as the source states", and Turn R23 has no
   Invariant, so nothing checks S.X.history or the snapshot's fields.

## The full table

### Machines

| ID | Feature | Plan | Builds | Checks | Today | Own |
| --- | --- | --- | --- | --- | --- | --- |
| M01 | definition and machine inert; callback once with S E O | Machines.O1 | T17 | Cmp R1, I1 | part | S |
| M02 | one FlowError, every violation, declaration/rule order | Machines.O1 | T17 | Cmp I3 (T17) | part | N |
| M03 | definition fields: internalEvents, traits, context... | Machines.O1 | T17 | Cmp R4, I4 | part | S |
| M04 | state tree: leaves, compounds, { NAME: Sub } | Machines.O1 | T17 | Cmp R4, Trn I1 | no | S |
| M05 | Flow.state(children, { traits }) wrapper | Machines.O1 | none | none | no | G |
| M06 | payload Schema.Struct checks refused before guards | Machines.O1 | T17 | Cmp R14, none | no | S0 |
| M07 | Flow.uncertain; UnknownNotUncertain | Machines.O1 | T17 | Cmp R9, I11 | part | S |
| M08 | Flow.input: creator memory, Input type, identity basis | Machines.O1 | T17 | Cmp R5, I5 | no | S |
| M09 | Flow.initial constant and computed (input, constants) | Machines.O1 | T17 | Cmp R5, I5, I6 | part | S |
| M10 | Flow.private: owner only, omitted from outside types | Machines.O1 | T17 | Trn R23, none | no | S0 |
| M11 | one source per field; TwoDefaults | Machines.O1 | T17 | Cmp R5, I5 | no | S |
| M12 | ImpureDefault found by reading the Schema | Machines.O1 | T17 | Cmp R5, I6 | no | S |
| M13 | Flow outermost: Schema modifier over a marker is a type | Machines.O1 | none | none | no | G |
| M14 | pure creation: type-side check, once per incarnation | Machines.O1 | T17 | Cmp R6, I7, I8 | no | S |
| M15 | identity fields read-only, required; IdentityFieldOpt. | Machines.O1 | T17 | Cmp I9 (T17) | no | N |
| M16 | fragment input writable; restore defaults; RestoreMiss. | Machines.O1 | T17 | Cmp R8, I8 | no | S |
| M17 | context slots: Provider.select(selector) | Machines.O1 | T17 | Cmp I17 (T17) | no | N |
| M18 | operations ({ E }) => ...; SharedContract | Machines.O1 | T17 | Cmp I10 (T13) | part | N |
| M19 | definition exports O; selects typed at the transition | Machines.O1 | T17 | Cmp R14, none | part | S0 |
| M20 | config mirrors the tree; onContext on the root only | Machines.O1 | T17 | Cmp R4, I4 | part | S |
| M21 | nodes declare on, activities, schedules, fillings | Machines.O1 | T17 | Cmp R4, I4 | part | S |
| M22 | handler(path, h) and guard(path?, g) helpers | Machines.O1 | none | none | no | G |
| M23 | trait(declaration, body), subroutine(declaration, body) | Machines.O1 | T21 | Cmp R10, none | no | N0 |
| M24 | hostEvents, fragment internalEvents | Machines.O1 | T21 | Cmp R10, none | no | N0 |
| M25 | ports Flow.Guard, Flow.Callback, Flow.Exit, optional | Machines.O1 | T21 | SC R10 (T22) | no | N |
| M26 | whenAbandoned | Machines.O1 | T21 | Trn I11 | no | N |
| M27 | inferred fragment summary; hosts checked against it | Machines.O1 | T21 | Cmp R10, none | no | N0 |
| M28 | placement: root traits, Flow.state traits, subroutines | Machines.O1 | T21 | Cmp R10, none | no | N0 |
| M29 | T.resumable() freezes | Machines.O1 | T21 | Cmp I12 (T17) | no | N |
| M30 | T.each({ of, max, by? }); key and item reserved | Machines.O1 | T21 | Trn I35 (T8) | no | N |
| M31 | resetOn by Equal.equals; null means not placed | Machines.O1 | T21 | Cmp I12 (T17) | no | N |
| M32 | fragment write scope | Machines.O1 | T21 | Cmp I12 (T17) | no | N |
| M33 | acting members only in the declaring fragment | Machines.O1 | T21 | Cmp R11, none | no | N0 |
| M34 | key-less O.x.cancel in whenAbandoned releases lanes | Machines.O1 | T21 | WL R16 | no | N |
| M35 | shape rejections: unknown fields, _tag, duplicates... | Machines.O1 | T17 | Cmp R4, I4 | part | S |
| M36 | ReservedStateName; ten segments; name bytes and C0 | Machines.O1 | T17 | Cmp I13 (T13) | part | S |
| M37 | machine adds nothing; static targets; writes via actions | Machines.O1 | T17 | Cmp R3, I4 | part | S |
| M38 | static errors: unfilled ports, two state changers... | Machines.O1 | T22 | SC R10 (T22) | no | N |
| M39 | literal inference with no assertions or generics | Machines.O1 | T17 | Cmp R14, none | part | S0 |
| M40 | Definition Event, State, Input, Memory, Snapshot Schemas | Machines.O1 | T17 | Cmp R14, none | part | S0 |
| M41 | E.X validates, throws InvalidEvent; no-arg constructors | Machines.O1 | T17 | Cmp R14, none | part | S0 |
| M42 | one active leaf; S tokens; token.is with descendants | Machines.O2 | T18 | Trn I1 (T8) | part | S |
| M43 | state token in a guard array, read structurally | Machines.O2 | T18 | Trn R12 | no | S |
| M44 | token.child(snapshot); S.root.child(snapshot) | Machines.O2 | none | none | no | G |
| M45 | S.X.history, S.X.history.child(s) | Machines.O2 | T18 | Trn R4, none | no | S0 |
| M46 | on: target, guard, updateMemory, actions, raise, notify | Machines.O2 | T18 | Trn R2, I2 | part | S |
| M47 | first passing alternative; fallthrough; child refusal | Machines.O2 | T18 | Trn I2, I3 | part | S |
| M48 | "self" vs re-entry; boundary exit and entry order | Machines.O2 | T18 | Trn I4-I6 (T8) | part | S |
| M49 | subroutine entry, exit fillings, abandonment | Machines.O2 | T21 | Trn R4, none | no | N0 |
| M50 | one turn: raises, notifies, fillings, one publication | Machines.O3 | T18 | Trn R5, I9 | part | S |
| M51 | pending reset runs as its own turn first | Machines.O3 | T18 | Trn I10 | no | S |
| M52 | before and after memory views | Machines.O3 | T18 | Trn R7, I12 | part | S |
| M53 | rejected turn; issue-only snapshot; callback defects | Machines.O3 | T18 | Trn I14, I16 | part | N |
| M54 | one Clock per turn; determinism | Machines.O3 | T18 | Trn R11, I17 | yes | S |
| M55 | guard arguments; true or deny(code, context?) | Machines.O4 | T18 | Trn R12 | part | S |
| M56 | GuardDefect for any invalid return; false a type error | Machines.O4 | T18 | Trn R12 | part | S |
| M57 | updateMemory receives operations (get only) | Machines.O4 | T18 | Trn R12 | part | S |
| M58 | check(snapshot, event): Allowed, Denied, Unhandled | Machines.O4 | T18 | Trn I18 (T18) | no | N |
| M59 | schedules: disarmOn, keys, E.X.from metadata, dueAt | Machines.O5 | T18 | Trn R14, I21 | part | S |
| M60 | multi-step Effect Schedule; restartOn | Machines.O5 | T18 | Trn I33, I34 | no | N |
| M61 | equal deadlines separate turns; stale firings dropped | Machines.O5 | T18 | Trn I20, I32 | part | N |
| M62 | keyed schedules: one timer per key | Machines.O5 | T18 | Trn I35 (T8) | no | S |
| M63 | fire only while used; resume and restore rules | Machines.O5 | T18 | Trn I22, I23 | part | S |

Machines O6 to O8 continue under the same IDs:

| ID | Feature | Plan | Builds | Checks | Today | Own |
| --- | --- | --- | --- | --- | --- | --- |
| M64 | subscribe and subscribe.each placements; when | Machines.O6 | T21 | Trn I24 (T8) | no | N |
| M65 | DuplicatePlacement, VerbMismatch | Machines.O6 | T21 | SC R10 (T22) | no | N |
| M66 | freeze releases placements; thaw places again | Machines.O6 | T21 | Trn R18, none | no | N0 |
| M67 | value fires only on a changed confirmed value | Machines.O6 | T21 | Trn I25 (T21) | no | N |
| M68 | lane-only change published without handlers | Machines.O6 | T18 | Trn R19 | part | S |
| M69 | owner test; late routing; LateMayNotLeave | Machines.O6 | T18 | Trn I26, I27 | part | S |
| M70 | onContext: silent baselines, one wave on return | Machines.O7 | T18 | Trn I28 (T18) | no | N |
| M71 | snapshot fields: state, memory slices, context, issues | Machines.O8 | T18 | Trn R23, none | part | S0 |
| M72 | keyed lists; absent entries; no input or revision | Machines.O8 | T18 | Trn R23, none | part | S0 |
| M73 | deeply frozen; identity kept; no live-lane reads | Machines.O8 | T18 | Trn I29, I30 | part | S |
| M74 | issues cleared by own source; none inherited | Machines.O8 | T18 | Trn I31 (T18) | no | N |

### Runtime

| ID | Feature | Plan | Builds | Checks | Today | Own |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | app entries: Machine, { machine, context? }, lazy | Runtime.O1 | T17 | Cmp R15, I14 | part | S |
| R02 | app errors: two keys one machine, colliding identities | Runtime.O1 | T17 | Cmp I14 (T13) | part | S |
| R03 | Compiled data view; Slots named by place | Runtime.O1 | T17 | Cmp R16, I15 | part | S |
| R04 | Runtime refuses a malformed Compiled | Runtime.O1 | T17 | Cmp R17, I16 | part | N |
| R05 | wiring defaults on entries, overrides on refs | Runtime.O1 | T17 | Cmp I17 (T17) | no | N |
| R06 | runtimeSetup(...).construct() inert | Runtime.O2 | T18 | Act I1 (T9) | part | S |
| R07 | services Layer typed by R; boot refuses missing service | Runtime.O2 | T21 | Act I2 (T9) | part | N |
| R08 | one ready(); a waiter's interrupt is its own | Runtime.O2 | T18 | Act R2, I3 | part | S |
| R09 | bootstrap order: ownership, storage, services, install | Runtime.O2 | T18 | Act R3, I4 | part | S |
| R10 | bootstrap failure; RuntimeNotReady; dispose during boot | Runtime.O2 | T18 | Act I5, I6 | part | S |
| R11 | runtime.runPromise with installed services | Runtime.O2 | T18 | Act R1 | no | S |
| R12 | runtimeSetup repairSlots and audit options | Runtime.O2 | none | none | no | G |
| R13 | actorRef value form: Flow.input fields are the identity | Runtime.O3 | T18 | Act R5, I7 | no | S |
| R14 | form fixed per machine in types; literal singleton name | Runtime.O3 | T18 | Act R5, none | part | S0 |
| R15 | identity encoding: Schemas, field-name order, strings | Runtime.O3 | T18 | Act I7 (T9) | no | S |
| R16 | ConflictingActorRef | Runtime.O3 | T18 | Act R6 | no | S |
| R17 | createActor; local identity by Equal.equals | Runtime.O3 | T18 | Act R6, I8 | no | S |
| R18 | ensureActor creates or restores; failure leaves nothing | Runtime.O3 | T18 | Act I9 (T9) | part | S |
| R19 | handle: send, getSnapshot, snapshots; follows identity | Runtime.O3 | T18 | Act R7, R17 | part | S0 |
| R20 | uses, work in flight, 100 ms grace, EndedWithWork | Runtime.O3 | T18 | Act I10, I37 | part | S |
| R21 | return: new incarnation, deliveries, adopted endings | Runtime.O3 | T18 | Act I13, I14 | part | S |
| R22 | lanes follow identities and subject paths | Runtime.O3 | T18 | Act I15, I17 | part | S |
| R23 | identity versions; OldVersionActor | Runtime.O3 | T20 | Act I39, Rs I12 | no | N |
| R24 | FIFO mailbox; 64 follow-ups; rotation | Runtime.O4 | T18 | Act I19-I21 | part | S |
| R25 | send runs at once when idle; slices yield a task | Runtime.O4 | T18 | Act R13 | part | S |
| R26 | TurnStorm and AsksForever evidence | Runtime.O4 | T18 | Act R13 | no | S |
| R27 | 1,024 cap; AdmissionOverloaded; endings never dropped | Runtime.O4 | T18 | Act I22, I23 | no | S |
| R28 | refused delivery kept, redelivered once | Runtime.O4 | T18 | Act I24 | part | S |
| R29 | send table: SendTargetAbsent, restore on send | Runtime.O4 | T18 | Act R16, I25 | no | S |
| R30 | complete cuts; snapshots subscription semantics | Runtime.O4 | T18 | Act I26 | part | S |
| R31 | context waves: cycles, missing provider, diamonds | Runtime.O5 | T18 | Act I27, I28 | no | S |
| R32 | disposeActor, forget, BlockedByDependents, HoldForgotten | Runtime.O6 | T18 | Act I29, I32 | part | S |
| R33 | Runtime disposal bounds; unsettledWrites; CleanupFailed | Runtime.O6 | T18 | Act I30-I38 | part | S |
| R34 | isolation; foreign handles; IdentityExhausted | Runtime.O7 | T18 | Act I34 | part | S |

### Operations

| ID | Feature | Plan | Builds | Checks | Today | Own |
| --- | --- | --- | --- | --- | --- | --- |
| P01 | resource(...) contract | Operations.O1 | T21 | Rd I1 (T12) | part | N |
| P02 | transaction(...) with concurrency | Operations.O1 | T16 | WL R7 (T7) | yes | N |
| P03 | transaction progress Schema and row field | Operations.O1 | T21 | Rd R14 | no | N |
| P04 | idempotency option; money-shaped write warning | Operations.O1 | T21 | SC R11 | no | N |
| P05 | guarded: true | Operations.O1 | T24 | slice | no | N |
| P06 | previous: [{ key }]; PreviousIsCurrent | Operations.O1 | T21 | WL I17 (T7) | no | N |
| P07 | stream(...) contract | Operations.O1 | T25 | slice | no | N |
| P08 | contract ids unique per App | Operations.O1 | T17 | Cmp I14 | no | S |
| P09 | input and output; Void; persisted reads need output | Operations.O1 | T21 | Rd R1 | part | N |
| P10 | services required on every contract | Operations.O1 | T21 | Act I2 | part | N |
| P11 | typed errors never cross boundaries | Operations.O1 | T17 | Dg R9, I9 | part | S |
| P12 | staleTime and gcTime validated; zero and Infinity | Operations.O1 | none | Rd Q2 | part | G |
| P13 | key: top-level input fields; KeyFieldOptional | Operations.O1 | T21 | Rd I2; T22 | part | N |
| P14 | canonical key text; fingerprint in the version | Operations.O1 | T21 | Rd I2, I3 | part | N |
| P15 | key bounds (16, 256, 8,192 bytes); InvalidKey | Operations.O1 | none | Rd Q2 | no | G |
| P16 | invalidate and clear by partial key | Operations.O1 | none | Rd Q2 | no | G |
| P17 | ReservedReason | Operations.O1 | T22 | WL I4 | no | N |
| P18 | shared entries; one in-flight lookup per entry | Operations.O2 | T21 | Rd I8 (T12) | part | N |
| P19 | O.x.lookup; newer lookup supersedes | Operations.O2 | T21 | Rd I9 (T12) | part | N |
| P20 | freshness by staleTime | Operations.O2 | none | Rd Q2 | no | G |
| P21 | O.x.refetch(k?); one running and one trailing | Operations.O2 | none | Rd Q2 | no | G |
| P22 | subscribe starts a request only when missing | Operations.O2 | T21 | Rd R8, none | no | N0 |
| P23 | focus and connection triggers; offline blocks nothing | Operations.O2 | none | Rd Q2 | no | G |
| P24 | no automatic retry of a failed lookup | Operations.O2 | T21 | Rd R8, none | part | N0 |
| P25 | read endings; Defect, Interrupted; UserClosure | Operations.O2 | T21 | Rd I20 (T12) | part | N |
| P26 | Flow.ignore as a mapping value | Operations.O2 | T21 | Cmp I11 | no | N |
| P27 | .gone(tag) with .byKey | Operations.O2 | T24 | slice | no | N |
| P28 | holds and gcTime collection | Operations.O2 | none | Rd Q2 | no | G |
| P29 | commit from an accepted action; three channels | Operations.O3 | T16 | WL I1-I3 (T7) | yes | N |
| P30 | O.x.commit(select, { optimistic? }) | Operations.O3 | T21 | Rd I15 (T12) | part | N |
| P31 | outcomes(mapping, { writes }); InvalidWrite | Operations.O3 | T21 | WL I24 | part | N |
| P32 | Outcome classification; StillUnknown | Operations.O3 | T16 | WL I3 | yes | N |
| P33 | Flow reasons (ModuleDisabled, Abandoned missing) | Operations.O3 | T18 | WL I4 | part | N |
| P34 | Attempt fields; basedOn | Operations.O3 | T16 | WL I6, I7 | part | N |
| P35 | lane cells for reject, latest, cancel, serialize | Operations.O3 | T16 | WL I8-I11 | yes | N |
| P36 | retry, retryable, RetryLimit, promotion | Operations.O3 | T16 | WL I9, I26 | yes | N |
| P37 | kept ending blocks its key; keyed member rules | Operations.O3 | T18 | WL I14, I15 | part | N |
| P38 | old-version holds; Unencodable; NoPersistence | Operations.O3 | T18 | WL I17, I18 | part | N |
| P39 | NotSent mapped only where it can occur (check) | Operations.O3 | T22 | SC R10 | no | S |
| P40 | domain store effects before the ending; record queues | Operations.O3 | T24 | WL I19 (T24) | no | N |
| P41 | streams: sessions, reconnect, idleTime, ReleaseOverdue | Operations.O4 | T25 | slice | no | N |
| P42 | Feed.live, down, ping, callback, multiplex, more, gone | Operations.O4 | T25 | slice | no | N |
| P43 | every and latest outcomes; missed; fills; bookmark | Operations.O4 | T25 | slice | no | N |
| P44 | setData(select) | Operations.O5 | none | Rd Q2 | no | G |
| P45 | write batches: validate all, atomic, 256 identities | Operations.O5 | none | Rd Q2 | no | G |
| P46 | optimistic: visible = confirmed + live, ending decides | Operations.O5 | T21 | Rd I15-I17 | no | N |
| P47 | optimistic stacking; uncertain after refetch failure | Operations.O5 | none | Rd Q2 | no | G |
| P48 | rows: identity, write row fields, O.x.get total | Operations.O6 | T21 | Rd I19 (T12) | part | N |
| P49 | resource tags Pending to Interrupted; stream row | Operations.O6 | T21 | Rd R14 | no | N |
| P50 | placeholder({ previous, input }); contract.get | Operations.O6 | none | Rd Q2 | no | G |
| P51 | cancel, cancelAll, release on leave, cleanup | Operations.O7 | T16 | WL I20-I23 | yes | N |

### Persistence

| ID | Feature | Plan | Builds | Checks | Today | Own |
| --- | --- | --- | --- | --- | --- | --- |
| Q01 | persistence and scope options; off means no storage I/O | Persistence.O1 | T19 | WA I1 (T10) | part | N |
| Q02 | KeyValueStore required (type error); StorageFailure | Persistence.O1 | T19 | WA R2, none | no | N0 |
| Q03 | layerIndexedDb({ database? }); in-memory adapter | Persistence.O1 | T28 | slice | no | N |
| Q04 | persist: true; resource persist; refs carry none | Persistence.O2 | T19 | WA I3 | part | N |
| Q05 | what survives (history child, .each counters, bookmark) | Persistence.O2 | T19 | WA I4 | part | N |
| Q06 | what never survives | Persistence.O2 | T19 | WA I6 | part | N |
| Q07 | consistent capture; NonDurableContextProvider | Persistence.O3 | T19 | WA I7-I9 | part | N |
| Q08 | atomic scope; 5 s coalescing; flush on hide, pagehide | Persistence.O3 | T19 | WA I10, I12 | part | N |
| Q09 | scope bounds 4,096 records and 16 MiB | Persistence.O3 | T19 | WA I13 | no | N |
| Q10 | store contract; StorageSilent at 10 s | Persistence.O3 | T19 | WA I14 | part | N |
| Q11 | frozen page and discard; Safari close loses last batch | Persistence.O3 | T28 | real Safari | no | N |
| Q12 | records stay records; owed identities restored live | Persistence.O4 | T20 | Rs I1 (T11) | part | N |
| Q13 | context and resets at restore | Persistence.O4 | T20 | Rs I19 | no | N |
| Q14 | delivery order at restore | Persistence.O4 | T20 | Rs I5-I8 | part | N |
| Q15 | restored data stale; gcTime from ready; no input by key | Persistence.O4 | T20 | Rs I9 | no | N |
| Q16 | record formats; quarantine; RecordUndecodable | Persistence.O5 | T20 | Rs I10, I11 | part | N |
| Q17 | versions at boot; LaneRekeyed; UnboundLane | Persistence.O5 | T20 | Rs I12, I13 | no | N |
| Q18 | saved-shape resets; FieldDropped; HoldWithoutRecord | Persistence.O5 | T26 | Rs I14 | no | N |
| Q19 | lane quarantine; OpRenamed; LaneRekeyCollision | Persistence.O5 | T20 | Rs I15 | no | N |
| Q20 | storage failures; dispose({ forget: true }) | Persistence.O5 | T20 | Rs I16-I18 | no | N |
| Q21 | acknowledge before send; StorageRefused | Persistence.O6 | T19 | WA I15 | yes | N |
| Q22 | honest uncertainty after a crash | Persistence.O6 | T19 | WA I17 | part | N |
| Q23 | Web Lock owner; SecondTabNoPersistence; no locks API | Persistence.O7 | T27 | WA I19 (T10) | no | N |

### EntityDomains

| ID | Feature | Plan | Builds | Checks | Today | Own |
| --- | --- | --- | --- | --- | --- | --- |
| E01 | entity, domain, read, write, listen; duplicate ids | EntityDomains.O1 | T24 | slice | no | N |
| E02 | .one, .list, .byKey, .gone, .derivedFrom, Entity.pick | EntityDomains.O1 | T24 | slice | no | N |
| E03 | where operators, serverMatches, yes/no/maybe, Order | EntityDomains.O1 | T24 | slice | no | N |
| E04 | orderBy, HiddenOrder, pagedBy, entry.more, hasMore | EntityDomains.O1 | T24 | slice | no | N |
| E05 | predicts, patch, delete, alsoChanges, checkReplays | EntityDomains.O1 | T24 | slice | no | N |
| E06 | listen(...).as, delta, row, covers | EntityDomains.O1 | T24 | slice | no | N |
| E07 | judge, repair, forced repair, RecordHeld, RepairOverdue | EntityDomains.O1 | T24 | slice | no | N |
| E08 | uncertain marks; guarded proofs; UnsettledEvicted | EntityDomains.O1 | T24 | slice | no | N |
| E09 | Entity.get, Domain.entry.get, cp.entity, evidence | EntityDomains.O2 | T24 | slice | no | N |
| E10 | hydration of entities; lazy domains join at admission | EntityDomains.O3 | T24 | slice | no | N |
| E11 | propertyTest(story, domainPropertyOptions(...)) | EntityDomains.O4 | none | none | no | G |
| E12 | audit mode; HiddenFilter, UndeclaredEffect | EntityDomains.O4 | none | none | no | G |
| E13 | repairSlots; repair order; 64 per record queue | EntityDomains.O5 | T24 | slice | no | N |

T24's description says "from @plan.EntityDomains as merged", but it cites only O1 and D1, so O2, O3 and O5 count
as named only weakly.

### React and ServerRendering

| ID | Feature | Plan | Builds | Checks | Today | Own |
| --- | --- | --- | --- | --- | --- | --- |
| F01 | FlowProvider setup or runtime; scope change; Strict Mode | React.O1 | T30 | slice | no | N |
| F02 | useActor, useActorByRef, pre-attach handle, ForeignRef | React.O2 | T30 | slice | no | N |
| F03 | attach after commit; 64 buffered sends; Activity | React.O3 | T30 | slice | no | N |
| F04 | useView, useNow; private fields omitted | React.O4 | T30 | slice | no | N |
| F05 | errors in views; hooks never suspend | React.O5 | T30 | slice | no | N |
| F06 | React 18 and 19 installs | Package.O4 | none | none | no | G |
| H01 | dehydrate(setup, prepare, { within, maxBytes }) | ServerRendering.O1 | T30 | slice | no | N |
| H02 | bounded settling; three capture retries | ServerRendering.O2 | T30 | slice | no | N |
| H03 | payload content, maxBytes, sensitive omitted | ServerRendering.O3 | T30 | slice | no | N |
| H04 | Hydrate; first render matches | ServerRendering.O4 | T30 | slice | no | N |
| H05 | merge rules; persisted beats hydrated | ServerRendering.O5 | T30 | slice | no | N |
| H06 | request tokens, scope isolation | ServerRendering.O6 | T30 | slice | no | N |
| H07 | App Router, streaming render, hydrateRoot | ServerRendering.O7 | T30 | slice | no | N |

The three open server-rendering points in `spec-split.md` (dehydrate and deadlines, HydrationRejected against an
error boundary, and who owns Hydrate) are not in T30's text.

### LazyFeatures

| ID | Feature | Plan | Builds | Checks | Today | Own |
| --- | --- | --- | --- | --- | --- | --- |
| L01 | lazy entry { id, load, context? }; failed load retries | LazyFeatures.O1 | none | none | no | G |
| L02 | adoption by ensure or create; EntryMismatch; retryable | LazyFeatures.O2 | none | none | no | G |
| L03 | send to an unadopted entry: SendTargetAbsent NotAdopted | LazyFeatures.O2 | T18 | Act I25 (T9) | no | S |
| L04 | dormant records; orphans; RecordUndecodable on adoption | LazyFeatures.O3 | none | none | no | G |
| L05 | load after ready (10 s); EntryLoadFailed; Hydration... | LazyFeatures.O4 | none | none | no | G |
| L06 | Stories never call load | LazyFeatures.O4 | T29 | slice | no | N |
| L07 | inspect(app) loads all; check validates; lazy warnings | LazyFeatures.O5 | none | none | no | G |

### Inspection

| ID | Feature | Plan | Builds | Checks | Today | Own |
| --- | --- | --- | --- | --- | --- | --- |
| I01 | inspect(app): Model, appFingerprint | Inspection.O1 | none | none | no | G |
| I02 | inspect(runtime): passive cut of work, lanes, sessions | Inspection.O1 | none | none | no | G |
| I03 | one bounded canonical codec | Inspection.O2 | T20 | Cd I1-I6 | no | N |
| I04 | attachInspector: capacity, drain, snapshot, clear, once | Inspection.O3 | none | none | part | G |
| I05 | evidence kinds and sequence; Story tab field | Inspection.O4 | none | none | part | G |
| I06 | trace.export, trace.import validation, 4,096 cap | Inspection.O4 | none | none | no | G |
| I07 | redaction: hmac, sensitive, per-Runtime key | Inspection.O5 | none | none | no | G |
| I08 | render(model, format); projections; comparisons | Inspection.O6 | none | SC R5 (graph) | no | G |
| I09 | stream-session flags (ValuesWhileDown ... FillsOtherKey) | Inspection.O1 | none | none | no | G |

### Diagnostics

| ID | Feature | Plan | Builds | Checks | Today | Own |
| --- | --- | --- | --- | --- | --- | --- |
| D01 | FlowError _tag, code, diagnostics, cause, evidence | Diagnostics.O1 | T17 | Dg I1 (T17) | part | N |
| D02 | Diagnostic with Schema: classification, path, help | Diagnostics.O1 | T17 | Dg I2 (T17) | no | N |
| D03 | denial codes and reserved reasons | Diagnostics.O1 | T17 | Dg R4 | part | N |
| D04 | the closed code list, each code with its owner | Diagnostics.O2 | T17 | Dg I5-I7 | part | N |
| D05 | cleanup failures appended; Cause stays in process | Diagnostics.O3 | T17 | Dg I8, I9 | no | N |
| D06 | safe rendering | Diagnostics.O4 | T17 | Dg I10 | no | N |

D04 is owned for the vocabulary only. Each code is emitted by the Task that builds its feature, so the codes of G
rows (EntryLoadFailed, InspectorAlreadyAttached, ServerOnlyImport and the others) are unowned with them.

### CommandLine

| ID | Feature | Plan | Builds | Checks | Today | Own |
| --- | --- | --- | --- | --- | --- | --- |
| C01 | graph: edges by source place; late, shadowed, unseen | CommandLine.O1 | T22 | SC I2 (T13) | no | N |
| C02 | static explain, domain --read | CommandLine.O1 | T22 | SC R6, none | no | N0 |
| C03 | explain <release> --since <release> | CommandLine.O1 | T22 | SC R6, none | no | N0 |
| C04 | explain --trace <artifact> --at <checkpoint> | CommandLine.O1 | none | none | no | G |
| C05 | story list, describe, run; trace --at | CommandLine.O1 | T29 | slice | no | N |
| C06 | story list --coverage | CommandLine.O1 | none | none | no | G |
| C07 | --project-root, --app; InvalidUsage before loading | CommandLine.O1 | T22 | SC I3, I12 | no | N |
| C08 | safe trace output: --trace-output, --overwrite, atomic | CommandLine.O2 | T29 | slice | no | N |
| C09 | JSON envelope; statuses; exit codes 0, 1, 2, 130, 143 | CommandLine.O3 | T22 | SC I4-I6 | no | N |
| C10 | outputs for people: locations, story-like trace | CommandLine.O3 | T31 | the user | no | N |
| C11 | trace selectors --actor, --attempt, --read, --entity | CommandLine.O4 | T29 | slice | no | N |
| C12 | check rules, warnings and infos; check --watch | CommandLine.O5 | T22 | SC I7, I8 | no | N |
| C13 | lint autofix orders category keys | CommandLine.O5 | none | none | no | G |
| C14 | flow.config.ts, defineConfig, discovery, project safety | CommandLine.O6 | T22 | SC I10, I11 | no | N |
| C15 | installed binary resolves the consumer's package | CommandLine.O6 | none | none | no | G |

### Testing

| ID | Feature | Plan | Builds | Checks | Today | Own |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | Story.app, Story.machine, Story.fragment and all steps | Testing.O1 | T29 | slice | no | N |
| T02 | run() and StoryRun; addresses | Testing.O1 | T29 | slice | no | N |
| T03 | determinism: seeded ids, clock, settle caps, advance | Testing.O2 | T29 | slice | no | N |
| T04 | fixtures as Layers; Fake.server, Fake.storage, controls | Testing.O3 | T29 | slice | no | N |
| T05 | frames, checkpoints, StoryFrame, 10,000 frame cap | Testing.O4 | T29 | slice | no | N |
| T06 | propertyTest, fault steps, shrink, PropertyTestFailed | Testing.O6 | none | none | no | G |
| T07 | tabs, payloads, serverView, lazy entries in Stories | Testing.O7 | T29 | slice | no | N |
| T08 | cleanup order; earliest error primary | Testing.O8 | T29 | slice | no | N |
| T09 | StoryPlayer, definePresentation, controls | Testing.O9 | T29 | slice | no | N |

### Package

| ID | Feature | Plan | Builds | Checks | Today | Own |
| --- | --- | --- | --- | --- | --- | --- |
| K01 | six routes via exports; ESM only; no deep import | Package.O1 | none | T39 | no | G |
| K02 | root export list (Feed, operators, entity, Outcome...) | Package.O1 | none | none | part | G |
| K03 | server route conditions; stub throws ServerOnlyImport | Package.O1 | none | none | no | G |
| K04 | root imports no React, server, Node, testing, inspect | Package.O1 | none | none | part | G |
| K05 | Effect peer exactly 4.0.5; React optional peer 18, 19 | Package.O2 | none | none | no | G |
| K06 | sideEffects: false; importing constructs nothing | Package.O2 | none | none | no | G |
| K07 | packed declarations keep inference; isolated decls | Package.O3 | none | T33 | no | G |
| K08 | removed surfaces and error classes; no aliases | Package.O3 | none | none | part | G |
| K09 | InvalidConfiguration with replacement help | Package.O3 | none | none | no | G |
| K10 | Dispatch Desk and seven entity examples, packed | Package.O4 | none | none | no | G |
| K11 | Chromium, Gecko and WebKit runs | Package.O4 | none | none | no | G |

`spec-split.md` puts Package routes in "phase 9", which in the Epic is hardening and budgets. T39 runs the
packed-consumer check only at release, but @plan.FlowState.O2 wants it at every stage gate.

## Proposed scope additions, by Task

Each line is a proposed addition for the user's yes. Nothing has been edited in a Task or a Plan.

**T17 Compiled and the compiler**
- Name the author-facing features in its acceptance: M03 to M16, M19 to M21, M35 to M37, M39 to M41 and R01 to
  R03. That means Flow.input, computed Flow.initial, Flow.private, the Definition Schemas, E.X and InvalidEvent,
  payload checks, compounds, Flow.state traits, context slots and app entries, each passing a case on production.
- Add Invariants for Compile R10, R13 and R14 (a Spec revision), and own handler(), guard(), Flow.state and the
  "Flow outermost" type rule (M05, M13, M22), which no Spec states.

**T18 Lane, step and turn**
- Name actor identity and lifetime: actorRef's value form and identity encoding, createActor, `snapshots`,
  getSnapshot's fallbacks, runPromise, ConflictingActorRef, context waves, the send table, admission bounds,
  disposal APIs and IdentityExhausted (R06 to R34).
- Name the turn features: compounds, history, raise and notify, disarmOn, keys, schedule metadata and the snapshot
  shape (M42 to M63, M68, M69, M71 to M73).

**T8 Turn area (suite)**
- Add Invariants and cases for Turn R4 (history: target the last active child, history.child, data back only
  through placement or resumable) and R23 (snapshot fields, keyed lists, private omitted). Add token.child (M44).

**T9 Actors area (suite)**
- Add a value-named machine fixture, so that Actors I7 and Compile I9 run through ensureActor(actorRef(machine,
  value)), together with ConflictingActorRef and createActor's Equal.equals identity.

**T21 Fragments and operations**
- Name the Reads "built later" list (P12, P15, P16, P20, P21, P23, P28, P44, P45, P47, P50) and write its Spec
  section first, as `spec-split.md` says. Or split it into a new P13 Task, "Reads freshness and writes", the user's
  call.
- Add an Invariant for Reads R8 (P22, P24).

**T19 Persistence edge**
- Add an Invariant for WriteAhead R2: the KeyValueStore type rule and untyped missing storage (Q02).

**T22 CLI**
- Add cases for StaticCli R6, static explain and `--since` (C02, C03), and own lint autofix (C13).

**T24 Entity store**
- Cite @plan.EntityDomains.O2 to O5 in Read first. Own audit mode, HiddenFilter and UndeclaredEffect (E12) and
  runtimeSetup's repairSlots and audit options (R12).

**T29 Stories**
- Add propertyTest and domainPropertyOptions (T06, E11; `spec-split.md` puts Testing O6 in this area).
- Add `story list --coverage` (C06), `explain --trace` (C04) and trace.export and trace.import (I06).

**T30 React and Next.js**
- Add the React 18 and 19 installs (F06), the server route's conditions and the ServerOnlyImport stub (K03), and
  the three open server-rendering points.

**New P5 Task: Lazy features**
- Build @plan.LazyFeatures.O1 to O5 (L01, L02, L04, L05, L07) with its Spec first. It needs the Port's lazy
  loader, which the fixture catalogue counts at about 60 lines.

**New P5 Task: Inspection**
- Build the `flow-state/inspect` route: inspect(app) and inspect(runtime), sinks with capacity, evidence kinds,
  traces, redaction and renderers (I01, I02, I04 to I09), with its Spec first.

**New P10 Task (before T39), or an addition to T39: Package routes**
- Build the six routes, peers, `sideEffects`, removed surfaces and InvalidConfiguration help (K01 to K09), and
  run the packed-consumer check from T23 onward (@plan.FlowState.O2).

**T35 and T32 (browsers and apps)**
- Add Gecko to every real-browser run (K11), or amend @plan.Package.O4 with the user. Decide whether Dispatch
  Desk and the seven entity examples (K10) are P6 apps or are cut from the Plan.

**T47 fixtures**
- Add the conformance-reachable rows to the catalogue: see "Features found by the Plan check" in
  `fixture-catalogue-2026-11-11.md`.

## Sidecar results

Four Haiku sidecars each listed one slice of the Plans, with grep hits in the Tasks and in `src/`. Every row used
here was checked against the Plan text.

- **Machines, FlowState, Package, LazyFeatures: accepted, changed.** The FlowState stage rows were dropped, since
  they describe process, not features. Grep hits such as "P3.task:614" were not taken as ownership, because
  ownership was judged from Task text and `spec-split.md`.
- **Runtime, Operations, Pending: accepted, changed.** The compensation recipe and "no timeout reason" were
  dropped as non-features. The Pending amendments (D1 to D4) fold into M68, R28 and R33.
- **Persistence, EntityDomains, React: accepted.** Rows were grouped by outcome.
- **ServerRendering, Inspection, Diagnostics, CommandLine, Testing: accepted, changed.** The roughly 150 code rows
  were folded into D04, and each code is owned by its feature's row. `check --watch` is in StaticCli after all
  (C12), not a gap.
