# Plan merge log (phase 2, roadmap v12, amendment 11)

The merge lead's record of the phase 2 plan merge: one section per plan, in the roadmap's order. Each section lists
the edits (before, after, the decision behind each), the superseded sentences and where each is marked, the
conflicts found (with the recommended answer, the judge and how reversible it is), and the sidecar results used.

Source of truth: `references/explorations/machine-fragments/machine-design.md` (OD1-OD54; section 5's rows, cited
here as P*n*, C*n*, T*n* and "fragments row"). Where the design and the prototype
(`packages/flow-state-v3/prototypes/round-14/`, STATUS.md) disagree, the prototype wins unless that breaks a design
guarantee (amendment 11). Nothing here is decided by the user unless the design records it so; runner and agent
rulings and proposed names are marked in the plans as the design marks them.

## Conventions used in the plans

- **Superseded sentences** are kept, quoted, in a closing `Superseded:` paragraph of the outcome that held them, each
  with a pointer to its replacement (the section 5 row, or the OD). Nothing superseded is deleted silently.
- **Pointers** name the design row only (C*n*, P*n*, T*n*, "fragments row", OD*n*); no invariant or rule number is
  needed to read the contract, since each plan states the rule's content itself.
- **Status marks.** User decisions carry no mark. Runner or agent rulings say "(the runner's ruling)"; names the user
  has not confirmed say "(proposed name)". `status proposed` on every plan is unchanged.
- **Wording.** Plans keep their own sentences where the design does not touch them, and keep content the prototype
  never reached.

## Falsification of the gate (`workflow check`)

Run 2026-11-09 on a scratch copy of `workflow/` (plus the one spec path `workflow/spec.index` names) in the session
scratchpad, never in the repository:

| Copy | Change | `workflow check` exit | Result |
| --- | --- | --- | --- |
| clean | none | 0 | "Repository is valid." |
| broken structure | `verification` renamed `verificatoin` in Machines.plan | 1 | `UNKNOWN_PLAN_FIELD` at the renamed field and each V entry |
| broken reference | `@plan.Runtime.O6` changed to `@plan.Runtime.O99` in Machines.plan prose | 0 | **not caught** |

Finding: `workflow check` validates plan structure, not `@plan.X.Y` references inside prose. The merge therefore runs
a second check after every plan, a read-only Perl script in the scratchpad that resolves every `@plan.X.Y` and local
`@Y` against the plans' entry ids; it fails on the O99 copy (exit 1, "missing @plan.Runtime.O99") and passes on the
repository. Both checks pass after every plan below.

## Sidecars

Three Haiku research sidecars (effort high, read-only), started before the first plan. Each result was read line by
line against the cited files before use.

| Sidecar | Slice | Result |
| --- | --- | --- |
| S1 | merge 5's amendments by target (`merged/entity-analysis/proposal.md` 6.4) against EntityDomains, CommandLine, Inspection, Package | 22 rows; used per plan below |
| S2 | prototype vs design (`round-14/STATUS.md`) | divergence table; checked per plan below |
| S3 | named diagnostics in the design, and names in Diagnostics.plan and CommandLine.plan | inventory; used for Diagnostics and CommandLine |

S2's general result, **accepted** after checking: every divergence it lists in STATUS.md either names the design row
that later took it in (OD49-OD54, C162-C216, all amended inline in the design) or is a stated limit or a "not built"
item. The design already records them, so merging from the design does not merge stale text where the prototype went
further. Items STATUS.md lists as "not built" stay in the plans as contract (the prototype never went there), and
are named in each plan's section below where they touch it.

## Machines

Rows merged: fragments rows (Machines O1 x5, O2 x2, O3, O4, O8), P5, P6, P7, P8, P11, P21, C12, C13, C14, C37-C41,
C54-C58, C90, C114, C121, C123, C124, C137, C139 (pointer), C145, C156, C157, C160, C162, C164, C170, C175, C184,
C185, C211 and C213 (pointers to Persistence O5). C19 and C20 were already superseded or deleted in the design.

| # | Outcome | Before | After | Decision |
| --- | --- | --- | --- | --- |
| M1 | title | "...states, turns, guards, schedules, activities and reactions" | adds "fragments" | fragments rows |
| M2 | O1 | "A definition requires id, states and events." | adds internalEvents, memory, traits, operations, context, persist (default false), subroutine and `Flow.state` nodes | fragments row; C37; C160; C175 |
| M3 | O1 | events/internalEvents records only | adds `Schema.Struct` payload checks refused at admission, `Flow.uncertain` and `UnknownNotUncertain` | fragments row; C145 |
| M4 | O1 | "Optional input and memory are Schema field records. Nonempty memory requires initial({ input }) ... Original input is unavailable thereafter." | memory field modifiers (`Flow.input`, `Flow.initial`, `Flow.private`), one source, one default (`TwoDefaults`), pure defaults (`ImpureDefault`, proposed), type-side creation check, read-only machine input, `IdentityFieldOptional` (proposed), restore of missing fields | fragments row; C121; C137; C156; C157; C184 |
| M5 | O1 | "Optional operations is a flat record of operation or entity-domain handles." | `operations: ({ E }) => ({ ... })`, one write operation per contract per actor, `O` exported, select typed at its transition | C37 |
| M6 | O1 | (none) | fragments: trait and subroutine contracts, ports, summary, placement, `.resumable()`, `.each`, `resetOn` with null/undefined, one namespace, fragment operations scope, `Fragment.O`, release on leave | fragments rows; C54; C114 |
| M7 | O1 | reserved names "is and child, and top-level root" | adds `self`, `__proto__` (`ReservedStateName`) and construction errors list, pointing to CommandLine O5 | C145; rule 12 |
| M8 | O1 | "duplicate activity or schedule names reject"; "Activity parameters may read earlier activities' lanes, parents before children; cyclic dependencies reject." | duplicate schedule names only; placement selects read after memory and lanes | C40 |
| M9 | O2 | "token.is(snapshot) includes descendants" | "token.is(snapshot or state)"; state-token guard elements; history | fragments row; P5 |
| M10 | O2 | "target is required and is this machine's token or "self"" | omitted target means "self" | C123 |
| M11 | O2 | re-entry wording | re-entry naming the handler's own state is a new activation; "self" keeps it | C164 |
| M12 | O2 | (none) | subroutine entry, exits and abandonment; callbacks never leave the placement node | fragments row |
| M13 | O3 | "An accepted transition computes updateMemory before action parameters; both read the pre-turn snapshot and event." ... "One invalid action rejects the whole turn" | the normative turn algorithm and the before / before-walk / after memory views and lane reads; defect rules kept | fragments row; C13 |
| M14 | O4 | "A guard receives { event, state, memory, context, activities }" | adds `schedules`, `operations`; `Flow.Denial`; `idle`, `retryable`, `get`; `Fragment.O` reads | fragments row; C38; C55 |
| M15 | O4 | check "uses the same handler, alternative and fallthrough rules" | runs the turn's steps 2-6, publishing nothing; `InvalidTurn`, `NotInState` | fragments row |
| M16 | O5 | "Entry arms a schedule; exit cancels it." | `armOn`, `disarmOn`, `Flow.entry`, delayed constructs, implicit schedule trigger | P7; C56 |
| M17 | O5 | "restartOn ... establishes a silent baseline" | baseline from the activating turn's after memory | P8 |
| M18 | O5 | "if its declaring activation ended before handling, it is discarded" | each arming has an id | P11 |
| M19 | O5 | (none) | keyed schedules | C14; C39 |
| M20 | O5 | "On restore or resume, a Duration preserves its deadline and fires once if overdue" | adds returns after an end and returning uses; schedules wait while unused | C124; OD45 |
| M21 | O6 | "activities: { name: O.x.subscribe(params, { outcomes?, placeholder?, when? }) }" and the finite-action / subscription outcome lists | placements list, `subscribe.each`, `DuplicatePlacement`, `VerbMismatch`; endings mapped on the operation | C40; C57; C90; C1; C5; C6 |
| M22 | O6 | (none; Operations O2 had "State exit does not cancel finite work") | the owner test, late turns, pending work, stay-put rule, `flow check` error, accepted risk (runner's ruling) | C12; C162; C164; C170; C185 |
| M23 | O7 | (none) | one FIFO mailbox with sends, endings, timers; one wave on a return | P21; OD31 |
| M24 | O8 | "activities (named lanes, undefined when not running). It has no input, methods, timers or public revision." | fragment slices, keyed lists, `schedules`, `operations`, private fields omitted outside, quarantined lifecycle reading; "no input, methods or public revision" | fragments rows; P6; C41; C58; R14 D7 |
| M25 | V1-V7 | verification lines | extended to the merged contract (no V removed) | follows M1-M24 |

Counts: 25 edits; 15 superseded sentences marked (O1: 6, O2: 2, O3: 2, O4: 2, O5: 5 rows merged into 4 marks, O6: 5,
O8: 2; counted per quoted sentence).

Conflicts:
- **MC1, agent-judged, applied.** The design says a definition's `persist` sits on `definition(...)` (U19 A, OD51),
  while the prototype's STATUS.md recorded `persist ?? true` before Q5 A. Q5 A (OD50) and the prototype now agree on
  `false`. Recommended: `false`, opt in on the definition. Judge: the user (Q5 A, decided). Reversible: one default.
- **MC2, agent-judged, applied.** The snapshot's `lifecycle` keeps the plan's `disposing` beside the design's
  `quarantined` reading for an undecodable record; the design's "ending" state (2.7.17) has a terminal snapshot and
  does not rename `disposing`. Recommended: keep `disposing`. Judge: the runner (wording). Reversible: one word.

Prototype check (S2): H1's `ImpureDefault` is built (accepted, merged as proposed name); "a default evaluated at each
door" is an implementation freedom (OD51), so the plan omits it. U9's creation check lives only in the typed front
end in the prototype; the plan states the contract, not where it lives. No other STATUS.md item touches Machines.

Process note: the 100-column wrap of this plan's new paragraphs was applied by a scratchpad Perl script rather than
by Edit; the content is exactly what was written with Write. Later plans are wrapped by Write and Edit only.

## Operations

Rows merged: C1-C7, C9-C13 (C8 replaced), C15, C21-C23, C29, C31-C36, C68, C86-C89, C112, C113, C116, C126, C128-C130,
C133-C135, C138, C142, C146, C150, C153, C154, C158, C162 and C170 (pointers to Machines O6), C165, C166, C171,
C172, C177, C180, C183, C186, C187, C191, C193, C196, C199, C201-C206, C209, C212, C214, C215, P15, P20. C16 and
C20 were superseded or deleted in the design.

| # | Outcome | Before | After | Decision |
| --- | --- | --- | --- | --- |
| O-1 | title | "Operations: reads, commits, streams and activity lanes" | "contracts, reads, commits, write lanes and streams" | C33; C35 |
| O-2 | O1 | descriptor shapes with `key?`, `result`, `params` | contract shapes: `input`, `output`, required `key`, `services`, `progress`, `idempotency`, `guarded`, `previous`, stream fields | C31; C86; C129; C135; C138; C193 |
| O-3 | O1 | contexts with `signal` | no `signal`; Effect's own signal | C116 |
| O-4 | O1 | `concurrency` "reject, cancel, allow or serialize" | reject, latest, cancel, serialize | C153 |
| O-5 | O1 | `key(params)` projector | key field list, `KeyFieldOptional`, `KeyOmitsInput`, canonical text (`"$1n"`), fingerprint in the version | C31; C135; C142 |
| O-6 | O1 | (none) | `ReservedReason` (proposed) | C177 |
| O-7 | O2 | finite lookup settles as success/failure/defect/interrupt | two channels; `Defect`, `Interrupted` on failure; one lane per one-off read operation, latest delivered | C5; C29; C32 |
| O-8 | O2 | "State exit does not cancel finite work..."; "Actor disposal ends delivery."; "Mappers receive values only." | owner test (Machines O6); end parks `Interrupted`; `(value, { input, key })`; `Flow.ignore`; `UserClosure`; `.gone` pointer | C6; C12; C112; C133; C143; C196 |
| O-9 | O3 | five outcomes | three channels, classifier, Flow's reasons (with `NoPersistence`, `OldVersion`, `Unencodable`, `Disposed`, `ModuleDisabled`, `Abandoned`) | C1; C2; C3; C130; C135; C154; C158; C191; C209 |
| O-10 | O3 | commit options `{ optimistic?, writes?, outcomes? }`; select reads pre-turn | `optimistic` only; `writes` on the operation; select reads after | C13; C15 |
| O-11 | O3 | concurrency sentences, `allow`, overflow with `AdmissionOverloaded` | the write lane table: states, `W`, cells, promotion, invocation after the turn, hold, kept endings, `SharedContract` | C10; C22; C33; C134; C153; C214 |
| O-12 | O3 | (none) | members, key-less addressing | C7; C150; C171; C172 |
| O-13 | O3 | "Every invoked commit delivers exactly one outcome." and silent cancel before invocation | ends once, counted per ending; evidence list; mapper throw redelivered | C11; C165; C166 |
| O-14 | O3 | `O.x.retry(select, options)`, known-settled, `InvalidAttempt` | `retry(k?)` in `Held` only | C7; C23 |
| O-15 | O3 | restore sentences | one batch with its turn; `unknown { Restored }` once per incarnation; parked ending restores as itself; reset keeps writes; old-version holds and `previous[i]` | C126; C128; C167; C212; C135; C214; C215 |
| O-16 | O3 | (none) | compensation recipe; late handler may commit | P20 |
| O-17 | O3 | domain write publication "together before its event" | publication at settlement; `Overloaded` bounds; join at head; `ModuleDisabled` | C21; C22; C187; C191; C199 |
| O-18 | O4 | stream text, `DuplicateStreamSession`, "Equal values are silent" | rewritten from the streams rules: contract fields, sessions, signals, `Feed.callback`, `Feed.multiplex`, outcomes, bookmark, `fills`, reconnect, dropAt | C87; C201-C206 |
| O-19 | O5 | `pending`; failure/defect/interrupt removal; unknown invalidates | `predicted`; three channels; unknown keeps marked and refetches once; `Released` | C4; C27; C113 |
| O-20 | O6 | `snapshot.activities.<name>`; "Transactions have outcomes, never lanes."; stream tags | `s.operations.<name>`; write rows; transactions have lanes; stream rows | C35; C41; C27; C88 |
| O-21 | O7 | signal abort; cancel of queued and running commits; silent cancel; disposal waits | fiber interrupt; cancel by Attempt; acknowledgement wait; `cancelAll`; release on leave; disposal invokes nothing new | C11; C36; C43; C68; C116; C146; C158; C171; C180; C183; C186 |
| O-22 | V1-V10, Q1 | verification and deferred list | extended; Q1's stream buffering decided by Streams T4 and T6, host-signal wiring by C116 | C89; C116 |

Counts: 22 edits; 52 superseded sentences marked (O1: 7, O2: 8, O3: 21, O4: 6, O5: 3, O6: 6, O7: 6, counted per
quoted sentence; several quote two sentences together).

Conflicts:
- **OC1, agent-judged, applied (small API name, the runner decides under amendment 9).** The plan's
  `descriptor.get(snapshot, params)` has no design counterpart for resource entries (the design renames descriptors
  to contracts, and C72 removes `descriptor.get` only on Story checkpoints). Recommended: keep the read, renamed
  `contract.get(snapshot, input)`, marked proposed. Judge: the runner. Reversible: one name.
- **OC2, agent-judged, applied.** Resource lane tags keep `Defect` and `Interrupted`: C5 and C29 move a read's
  defect onto the failure channel for mapping, but no row changes the resource lane's tags. Recommended: keep both
  (the row shows what the mapped ending shows). Judge: the runner. Reversible: one sentence.
- **OC3, agent-judged, applied.** O5's write-batch bound (256 expanded identities, `AdmissionOverloaded`) is not in
  the design (only its Open section names the code); the prototype never built `setData`/`invalidate` batches.
  Recommended: keep (the plan keeps content where the prototype never went). Judge: the runner. Reversible: one
  sentence.
- **OC4, placement only.** C146, C180 and C186 name Operations O2 but are write-lane rules; merged into O7 with the
  other cancel rules. C162 and C170 (Operations O2) are carried by Machines O6 with a pointer from O2.

Prototype check (S2): STATUS.md's "not built" items stay in the plan as contract: concurrency `cancel` on a
predicting write (a `flow check` error, CommandLine), `byReason` keys outside Flow's reasons (B3: the type-level half
carried to phase 3). `emit.fail(e, key)` is marked as the runner's addition (OD53 (7)). The prototype's
"lane keyed by operation name" is reconciled by B2 (`SharedContract`), as merged.

## Runtime

Rows merged: P21, C42, C43, C59, C91, C92, C104-C106 (C106 as a pointer for O2's bootstrap), C109, C117, C118, C132,
C134, C136, C138, C139, C143, C144, C148, C149, C155, C158-C161, C166, C168, C173, C174, C176, C178, C179, C181.
Rule 73 (2.7.17) and rule 74 (2.7.19) are stated in O3 in full.

| # | Outcome | Before | After | Decision |
| --- | --- | --- | --- | --- |
| R1 | O1 | (none) | `machine()` is the compile; `Compiled` data plus Slots; refusals at Runtime creation (agent-judged internals marked) | C139; OD41; OD46 |
| R2 | O1 | "Durable identity is app id, machine id and actor id" | "...and the actor's identity" | C117 |
| R3 | O2 | services Layer for adapters | typed by the machines' R; contracts' `services`; boot refuses by name | C138 |
| R4 | O2 | step 4 "install restored and hydrated actors" | records stay records until reached, except identities owed an ending; record-format upgrade and shape reset at step 2 | C106; C210; C211 |
| R5 | O2 | (none) | boot send queue, `StorageFailure` past the bound | C155 |
| R6 | O3 | `actorRef(machine, id, { persist?, retain?, context? })`, array ids | two ref forms, identity encoding, `persist` on the definition, `ConflictingActorRef` for context only | C117; C144; C160 |
| R7 | O3 | ensure with input, `InputIgnored` | no ensure takes input; restore from the Runtime's copy; `getSnapshot` readings | C117; C143; C144 |
| R8 | O3 | retain sentences (five) | rule 73: uses, work in flight, schedules wait, grace, end, return, undecodable records, local remount | C104; C143 |
| R9 | O3 | "No outcome, schedule, issue or send from an old incarnation ever reaches a new one." | write lanes adopted by identity and subject path; nothing else crosses | C42; C59 |
| R10 | O3 | (none) | versions: type and encoded sides, `representation`, format tags, older formats, format 0, newer format; `OldVersionActor` (proposed) | C161; C174; C181; C120 |
| R11 | O4 | FIFO sentence | queue order, follow-ups (64), rotation, idle send, slices, spins, `TurnStorm`, `AsksForever` | P21; C132; C136; C148; C149 |
| R12 | O4 | `SendTargetAbsent` sentences (two); snapshots completion | send table; subscription completion and waiting as a use | C105 |
| R13 | O4 | "Stream values coalesce"; "Facts from an ended activation are discarded by design" | deliveries bounded by pulls; discard with evidence | C91 |
| R14 | O4 | (none) | refused deliveries kept | C134; C166 |
| R15 | O5 | "keyed into the actor id" | "keyed into the actor's identity"; one wave on a return; context consumer is a use | C117; OD31 |
| R16 | O6 | "invoked commits are allowed to settle"; "after 5 seconds a commit still in flight becomes unknown with its Attempt" | disposal invokes nothing new; `NotSent { Disposed }`; parked within the bound; `unknown { Disposed }` past it; hold-leaving ending last; kill before/after final capture; no module starts work | C43; C158; C176; C179 |
| R17 | O6 | `disposeActor` sentence | flushed removal, unbound lanes, crash before acknowledgement | C159; C168 |
| R18 | O6 | (none) | `forget` in full; `HoldForgotten` (proposed, the runner's) | C173; C178 |
| R19 | O6 | (none) | sessions release within 5 s (`ReleaseOverdue`) | C92 |
| R20 | V1, V4, V7 | "unambiguous id parts"; "first input wins with a diagnostic"; "retain expiry on the TestClock" | identity encoding; ref-form type errors; the grace, Strict Mode, chains, waiting schedules | C109; C118; C144 |

Counts: 20 edits; 24 superseded sentences marked (O1: 1, O2: 2, O3: 12, O4: 6, O5: 1, O6: 4, V: 3; less overlap).

Conflicts:
- **RC1, agent-judged, applied.** `ConflictingActorRef` for `context` is the design's (C160) but the prototype never
  built the context half (STATUS.md CP5: "has nothing to fire on"). Recommended: keep it in the plan (contract the
  prototype never reached). Judge: the runner. Reversible: one sentence.
- **RC2, agent-judged, applied.** The plan's "Ensure while disposing returns at once a handle that reads the
  pre-attach snapshot and binds the new incarnation after cleanup" is replaced by 2.7.17's ending state and
  `getSnapshot` readings, which the design states as amending Runtime O3. Judge: the runner. Reversible: one
  paragraph.

Prototype check (S2): not built in the prototype, kept as contract: `NotAdopted` and the ending phase (`stopped`
input), LIFE-19/20/25/26, `IdentityFieldOptional`, the read-only input pin, the context half of
`ConflictingActorRef`. The prototype's per-door default evaluation and the B1 repair bound do not touch Runtime.

## Persistence

Rows merged: fragments row (Persistence O2), P5, P15, P19 (cut), C17, C23, C44-C48, C60-C62, C85, C86, C93-C95,
C106, C120, C128, C130, C131, C135, C142, C144, C151, C152, C154, C155, C159-C161, C167, C168, C173-C176, C178,
C179, C181, C200, C202, C210-C214.

| # | Outcome | Before | After | Decision |
| --- | --- | --- | --- | --- |
| P-1 | goal | "within one app, scope and version" | "within one app and scope" | C211 |
| P-2 | O1 | `persistence?: { version }`; "version is a required nonempty string and matches exactly" | no app-wide or manual version; per-record checks | C211 (the user's Q1 A) |
| P-3 | O2 | `actorRef(machine, id, { persist: true })` | `definition({ id, persist: true })`, default false; local actors never persist | C120; C160; C175 |
| P-4 | O2 | "pending writes follow their actor"; stream `persist` | lane records (contents, raw parked endings, pending mapped outcomes); bookmark partition | C17; C44; C60; C86; C93 |
| P-5 | O2 | survive list | adds keyed timers, history, resumable slices, `.each` copies, reset values, identity encoding, canonical key text | fragments row; P5; C60; C142; C144 |
| P-6 | O3 | disposed actors disappear; retain-expired record; bound rejects without eviction; coalescing | lanes in captures; end-step encoding; drop fresh-start records first; 5 s interval and immediate lane batches; store contract; `StorageSilent`; frozen page; ids never repeat; record formats; forget; resets keep writes | C45; C61; C106; C131; C159; C168; C173; C176; C178; C202; C210; C212 |
| P-7 | O4 | restored actors active; ensure ignores input; retain clock | records stay records until reached, owed identities restored live | C106; C120; C144 |
| P-8 | O4 | saved outcomes delivered in saved order | pending reset first; per lane: parked endings, `NotSent { Restored }`, then `unknown { Restored }`; parked ending restores as itself; kill before the first batch | C46; C62; C128; C151; C167; C179 |
| P-9 | O4 | stream restore sentences | latest and every restore rows | C94 |
| P-10 | O5 | `RestoreDiscarded`; no partial restore; undeclared machine id; dormant record discard | per-record restore; formats; quarantine; overwrite at first save (the runner's ruling); partitions; versions; old-version records and lanes; saved-shape resets; `FieldDropped`; lane quarantine; renames; boot queue | C47; C95; C120; C135; C143; C152; C154; C155; C161; C174; C181; C210-C214 |
| P-11 | O6 | ack before invocation; failed ack via interrupt; crash restores unknown; `retry(attempt)` | one Attempt; once per Attempt per lane record, one batch with the turn; `StorageRefused`; `unknown { Restored }` or the parked ending; `retry(k?)`; `basedOn` | P15; C17; C23; C48; C128; C167; C200 |
| P-12 | O7 | lock "independent of version" | back-forward cache rule; `NoPersistence`; cancel capture order | C85; C130; C131; C211 |
| P-13 | V3, V4, V6, V7, V9 | verification lines | extended to the merged contract | follows P-1 to P-12 |

Counts: 13 edits; 33 superseded sentences marked (O1: 2, O2: 4, O3: 6, O4: 7, O5: 7, O6: 4, O7: 1, plus additions
noted).

Conflicts:
- **PC1, agent-judged, applied.** C47 discards a removed machine's actor records "with that machine id's lane
  records, as evidence"; C152 (the user's U4, OD48, later) quarantines a lane "whose operation is gone", keeping its
  hold, and OD50 Q1 A says nothing but its owner's cancel drops a hold (OD51 adds `HoldForgotten` at `forget`).
  Recommended: the actor records are discarded with a diagnostic, and the lane records are quarantined as lanes whose
  operation is gone, because a removed machine's operations are gone and the later user decision covers the case.
  Judge: the runner (a reading of the user's U4; no new guarantee). Reversible: one sentence.
- **PC2, agent-judged, applied.** The plan's dormant-record rule ("discards only that record ... the feature opens
  fresh") is replaced by the undecodable-record quarantine (R14 D7, C143) for consistency with every other record.
  Judge: the runner. Reversible: one sentence (also LazyFeatures O3).
- **PC3, for the user's read (already listed as call 13 in progress.md).** O5 states the runner's ruling that any
  structural Schema change to a stored field resets the record (OD54 (9), Q19), with its price. Not a new conflict;
  marked as the runner's ruling in the plan.

Prototype check (S2): the per-record reset, record formats 1-4, `FieldDropped`, `HoldWithoutRecord`, re-keying and
`OpRenamed` are built (OD54) and merged. Not built, kept as contract: the restored quiet mark's fields (rule 38), the
crash between two moves of a rename. Migration runs only against Flow's record in the fake store (carried to phase 3).

## EntityDomains

Rows merged: C4, C22-C28, C30, C67, C84, C99, C113, C115, C133, C169, C176, C187-C200, C207, C208, rule 26 (the
split), and merge 5's EntityDomains amendments (`merged/entity-analysis/proposal.md` 6.4).

Sidecar S1 (merge 5's amendments): **accepted** rows 1-7, 9, 9b, 10 and 12 after reading 6.4 (lines 759-834) and the
plan's cited lines myself; **rejected** row 11 ("a write whose key is recorded as many never takes the default lane
key"): the default lane key no longer exists, since every contract states its key (C28, OD15), so the sentence would
name a removed concept; rule 34's `many` exemption is merged instead. Row 8 (the first-sighting sentence stays):
**changed**, the plan never had that wording; the first-sighting rule from row 7 is merged.

| # | Outcome | Before | After | Decision |
| --- | --- | --- | --- | --- |
| E-1 | O1 | registration sentence | factories, operations registered twice, fragments register for their actor, the split of shared data and workflow; `output` Schema | merge 5; C67; rule 26 |
| E-2 | O1 | conditions `where (eq, ...)`; absent optional input | operator list, yes/no/maybe, Type-side input rule | merge 5 rows 1, 2 |
| E-3 | O1 | order check | Effect's `Order`, skipped pairs never `HiddenOrder` | merge 5 row 3 |
| E-4 | O1 | "predicts runs again at write start"; construction-time impurity check | recorded positions, field functions, frozen inputs, `checkReplays`, allowlist lint | merge 5 row 4 |
| E-5 | O1 | `Entity.patch(key, fields)` | field functions, many keys, key values, `patch` for predicts only, `delta`/`row`, domain write key warning | merge 5 row 5; C28; C115; C198 |
| E-6 | O1 | replay and judge | field-function replay, uncomputed fields, the judge (`Stale`, `Schema.toEquivalence`), per-record retirement | merge 5 rows 6, 9b; C195 |
| E-7 | O1 | "on its old or new values; a missing condition field matches"; "Reconnect" | existence-aware matching; stream gaps | merge 5 row 7; C99 |
| E-8 | O1 | write endings paragraph | Attempt's ending; failure without repair; NotSent list; unknown and forced repair; `Released`; restored reason | C4; C24; C113; C176; rule 30 |
| E-9 | O1 | (none) | repair bound with no timer, news, `RecordHeld`, yield of an unbound hold (`Abandoned`, proposed) | C190; C207; C189 |
| E-10 | O1 | "The record stays uncertain until a later write to it succeeds or the machine reconciles the Attempt." | mark rules, `guarded`, `.covers` hiding, the 4,096 cap | C25; C192-C194 |
| E-11 | O1 | `O.x.retry(select)`, known-settled | `retry(k?)` in Held; narrowed rebase | C23; C188 |
| E-12 | O1 | queue paragraph | join at the head of the lane, drafts, send order and its price, `ModuleDisabled` | C24; C187; C191 |
| E-13 | O1 | creates paragraph | draft pattern; `.gone` tombstones | C26; C196 |
| E-14 | O1 | (none) | listen: unversioned frames, `.covers`, gap marking, no collection-wide version | C169; C197; C208 |
| E-15 | O1 | `{ data, pending, uncertain, unconfirmed }` | `predicted`; read mapper throw | C27; C133 |
| E-16 | O2 | `Entity.get(snapshotOrCheckpoint, ...)`; `Entity.queue` | snapshot reads; `cp.entity`; queue records with reasons; new evidence names | C30; C72; C84 |
| E-17 | O4 | `propertyTest(domains, options)` | `domainPropertyOptions(domains, inputs)`; stream faults; quietness | C73; C84; C99 |
| E-18 | O5 | whole-write rejection with `AdmissionOverloaded` | `NotSent { Overloaded }` for that write; drafts counted; many bound | C22; C199 |
| E-19 | V1, V3 | "source check rejects conditionals and impurity"; "partial failure repair" | merge 5's V1; definite failure without repair, bound, marks | merge 5 row 12; C4 |

Counts: 19 edits; 27 superseded sentences marked (O1: 20, O2: 2, O4: 1, O5: 1, V: 2, plus additions).

Conflicts:
- **EC1, agent-judged, applied.** The plan's `where` keyword: merge 5's row 1 rewrites "Conditions use where (eq,
  ...)" as "Conditions use eq, ...", but the plan's other sentences (inputs in `where`, `orderBy`, ...) keep `where`
  as the clause name, and `Entity.where` stays in `alsoChanges`. Recommended: keep `where` as the clause, with the new
  operator list. Judge: the runner (wording). Reversible: one word.
- **EC2, agent-judged, applied.** `entity({ id, fields, primaryKey, version })` (C198, Q4 A) lists `version`
  unmarked, while `flow check` warns on `listen` over an unversioned entity and unversioned frames are a stated case
  (C169). Recommended: keep `version?` optional. Judge: the runner. Reversible: one mark.

Prototype check (S2): built and merged as decided (OD52, OD53): D3, the rebase, the judge, the repair bound (B1),
`guarded`, `.gone`, `.covers`, `delta`/`row`, the cap. Not built in the prototype, kept as contract: the typed entity
API (J, C115), the restored quiet mark's fields, field functions and the allowlist lint (merge 5). STATUS.md's
finding 1 ("the design disagrees with itself" on 2.8.5's example) is resolved by the OD52 amendment in 2.8.5, as
merged.
