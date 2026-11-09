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

- **Superseded sentences** were first kept, quoted, in a closing `Superseded:` paragraph of the outcome that held
  them. *Changed 2026-11-09, by the user's instruction ("everything that is superseded should be extracted out into a
  separate superseded items file"):* all of them now live in `workflow/plans/flow/references/superseded.md`, grouped by
  plan and entry, each with its replacement and commit; the plans carry no superseded text and read as the current
  contract only. Nothing superseded is deleted silently. (The word "Superseded" still appears in plans as the name
  of an evidence kind.)
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
- **MC1, the user's decision (label corrected by the fix pass), applied.** The design says a definition's `persist` sits on `definition(...)` (U19 A, OD51),
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
| P-2 | O1 | `persistence?: { version }`; "version is a required nonempty string and matches exactly" | no app-wide or manual version; per definition (the user's Q1 A), decided per record (the runner's ruling, OD54 (8)) | C211 (corrected by the fix pass) |
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

## Inspection

Rows merged: fragments row (Inspection O1), C30, C51, C64, C78-C80, C100, C111, C122, C141, C159, C173, C178,
C190, C194, C201, C204, C206, C209, C211, C212, and merge 5's Inspection amendments (S1 rows 18-22, **accepted**
after reading 6.4 and Inspection.plan lines 16-20, 86-90, 155-161 myself).

| # | Outcome | Before | After | Decision |
| --- | --- | --- | --- | --- |
| I-1 | O1 | Model contents | from the compiled data view; actions name their operation; fragments, copies, summaries; operations with contract, verb, concurrency, key, services; domains as recorded with predicted field names, `many`, guarded targets | fragments row; C139; merge 5; C193 |
| I-2 | O1 | per-actor "activity bindings, pending commits, issues and retain"; "transactions and stream sessions in flight" | work, placements, incarnations, uses, lanes by identity with binding, releasing, holds, kept and parked endings; per-session facts and flags; given-up marks, `stalled: "record"`; identity naming | C51; C64; C78; C100; C111; C122; C159; C173; C178; C190; C194; C204; C206 |
| I-3 | O2 | (none) | pointer: unencodable values never fail a turn | C154 |
| I-4 | O4 | event kinds | adds ending, lane, life, callback, exit, listRepair, drop, session, delivery, predictionFault, Story kinds; run-wide sequence and tab; evidence and boot-report names | C79; C100; C111; merge 5; C209; C211; C212 |
| I-5 | O4 | Trace fields with `persistenceVersion`; "unknown carries reconcileRequired" | no `persistenceVersion`; unknown carries its reason; `flow trace` pointer | C211; C2; C141 |
| I-6 | O5 | redaction | fake truth and request inputs as digests; `via` never redacted; `output` | C80; C31 |
| I-7 | O6 | "transactions" section; `persistenceVersion` in comparison | write lanes and endings; no `persistenceVersion` | C51; C79; C211 |
| I-8 | D1, D2 | (none) | the lint's reading of source is not a representation; one type-facts adapter, fail closed for both | merge 5 |
| I-9 | V2 | verification | lanes, uses and incarnations | follows I-2 |

Counts: 9 edits; 13 superseded sentences marked (O1: 5, O4: 4, O5: 2, O6: 2).

Conflicts:
- **IC1, agent-judged, applied.** Inspection's Model and the design's `Compiled` data view (C139: "tools read its data
  view"). Recommended: the Model is read from each machine's compiled data view; `inspect(app)` and D1 stand.
  Judge: the runner (an internal representation; OD46 marks `Compiled`'s contents agent-judged). Reversible: one
  sentence.
- **IC2, agent-judged, applied.** The Trace's `persistenceVersion` field and identity check presume Persistence's
  app-wide version, which the user's Q1 A removed (C211). Recommended: drop it from the Trace, import and
  comparison (the fingerprint already covers the Model). Judge: the runner (follows a user decision). Reversible: one
  field.

Prototype check (S2): not built in the prototype, kept as contract: `uses.busy`'s mailbox depth and waiting deadlines
(CP5), the trace export (the prototype has `flow trace` only). Built and merged: the session flags, `FillsOtherKey`,
`IdleWithoutPing`'s condition (OD53 (14)).

## Diagnostics

Rows merged: C83, C103, C121, C125, C132, C145, C154, C157, C184 (the rows naming Diagnostics), and every code the
other merged plans now name (C18, C65, C75, C87, C143, C152, C177, C193, C209, C211-C215), so the closed vocabulary
stays closed.

Sidecar S3 (the named-diagnostic inventory): **accepted** as a location table after checking each design-defined
name used here against the design by grep and against the merged plans. *Corrected by the fix pass:* the names the
plan carried before the merge (`InvalidConfiguration`, `SchemaValidation`, `HydrationRejected`, `DuplicateFixture`,
`InvalidUsage`, `UnknownSelector` and others) are not in the design; they are kept as plan content, and the earlier
"all present" claim was wrong as written. **Changed:** S3 listed `ModuleDefect`
(design line 9786, OD52 (22)) as a runtime issue; the design names it only in a decision's prototype note, not as
contract, so it is left out (ModuleDisabled, the `NotSent` reason, is the contract). **Rejected:** S3's suggestion
that `DuplicateSession` has no severity; the design calls it a warning in rule 70 and S11, as merged.

| # | Outcome | Before | After | Decision |
| --- | --- | --- | --- | --- |
| D-1 | O1 | (none) | diagnostics are not endings; Flow's reasons, evidence kinds and denial codes are values | C1; C2; rule 17 |
| D-2 | O2 | `InputIgnored` | removed | C144 |
| D-3 | O2 | `ConflictingActorRef` "the same options" | the same context | C160 |
| D-4 | O2 | `InvalidAttempt` | removed | C23 |
| D-5 | O2 | `DuplicateStreamSession` | `DuplicateSession` and the stream findings | C87; C103 |
| D-6 | O2 | `RestoreDiscarded` | `RecordUndecodable`, `RecordShapeChanged` and the quarantine and migration names | C143; C152; C211-C215 |
| D-7 | O2 | (none) | construction-error and `flow check` names; runtime issues and evidence; Story errors with reasons; `UnencodableValue` | C18; C65; C75; C83; C121; C125; C132; C145; C154; C157; C177; C184; C193; C209 |
| D-8 | O2 | `SendTargetAbsent` | with `details.reason` NoRecord, RecordUndecodable, NotAdopted | C105 |
| D-9 | O3 | "forwarded AbortSignal cancellation" | Effect's own signal | C116 |

Counts: 9 edits; 6 superseded sentences marked (O2: 5, O3: 1).

Conflicts:
- **DC1, agent-judged, applied.** The plan's vocabulary list mixes `FlowError` codes with evidence names
  (`DehydrateCommitInFlight` was already there). Recommended: keep one closed list, adding the evidence and issue
  names the design defines, each marked by kind where it is not a failure (evidence, development warning). Judge:
  the runner. Reversible: a regrouping.
- **DC2, agent-judged, applied.** `DuplicateFixture` and `AdmissionOverloaded` (mailbox and write batch) are not in
  the design but are where the prototype never went. Kept. Judge: the runner. Reversible: two lines.

Prototype check (S2): `ScheduleLeadsToWrite`, `IdentityFieldOptional` and `UnboundedBridge` are not built; kept as
contract, as the design lists them.

## CommandLine

Rows merged: fragments row (CommandLine O5), C18, C65, C69 (ids), C70 and C75 (the run never yields), C81, C101,
C125, C139, C141, C145, C163, C170, C177, C182, C185, C193, C209, C215, C216, T2, T3, T4, and merge 5's CommandLine
amendments (S1 rows 13-17, **accepted** after reading 6.4 and CommandLine.plan lines 22-25, 95-139 myself; row 15's
`flow check --watch` merged as written; its "(the editor path, pending the owner's 9.8)" left out as a pointer to an
open question outside the plans).

| # | Outcome | Before | After | Decision |
| --- | --- | --- | --- | --- |
| CL-1 | O1 | command list with `trace summarize`, `diff --base` | `trace <story-id> [--at]`; `trace diff` with the export; no `diff --base`; output for people | C141; OD43; the user, 2026-11-02 |
| CL-2 | O1 | describe and list sentences | plan-only describe; `story list --coverage` | C81; T2 |
| CL-3 | O1 | graph via Inspection O6 | edge rules (one edge per alternative, marks, unseen) | C141 |
| CL-4 | O1 | static explain | lane key and cardinality, stream lines, schedule paths, covers, domain-write lines; `explain <release> --since <release>` (proposed) | C18; C101; C125; C197; C216; merge 5 |
| CL-5 | O2 | "Only story run starts application work."; interruption stops later commands | adds trace; no mid-run handler; story run's report and exit 2 | C70; C75; C81; C141 |
| CL-6 | O4 | trace summarize | artifact queries with the export; explain over lane, ending, store and session evidence | C141; 2.10.14 |
| CL-7 | O5 | "without running application callbacks"; warning list | compiled data view and recording proxies; the full error, warning and info lists; strict late-turn error; check --watch; key-order lint | fragments row; C18; C65; C81; C101; C125; C139; C145; C163; C170; C177; C182; C185; C193; C209; C215; T2-T4; merge 5 |
| CL-8 | O6 | `defineConfig({ apps: [{ app, stories }] })`; ids within an app; revision diff | top-level stories, `tsconfig`; ids across the configuration; revision diff cut | C69; C81; merge 5; the user, 2026-11-02 |
| CL-9 | Q1 | "warning slugs and static-analysis implementation" | static analysis for domains decided (one adapter with Inspection D2) | merge 5 row 17 |

Counts: 9 edits; 13 superseded sentences marked (O1: 5, O2: 3, O4: 1, O5: 3, O6: 3, less overlap).

Conflicts:
- **CLC1, applied as the user's decision, for the user's read.** `diff --base <git-revision>` and `trace diff`: the
  user cut both on 2026-11-02 (the CLI keeps check, explain, graph, story and trace; recorded in the session memory,
  not in the design), while the design's later OD43 (the user, 2026-11-07) says "a trace file, `diff` and `--actor`
  come with Inspection O4's export". Recommended and applied: `diff --base` cut (the design never mentions it after
  2026-11-02, and `explain --since` covers release comparison); `trace diff` and artifact selectors kept, tied to the
  export, as the later OD43 says. Judge: the user (both are the user's words; the later one wins where they meet).
  Reversible: one line each. **Corrected by the fix pass:** the audit found that OD43's entry itself does not re-add
  `diff` (only 2.10.14's body text does), so `trace diff` was re-added without a user record. The runner ruled it
  cut; the 2026-11-02 scope is now recorded as OD55, and CommandLine O1 cites it.
- **CLC2, the user's decision (label corrected by the fix pass), applied.** `flow stories --coverage` (the design's
  T2, C81) versus `flow story list --coverage` (the user's 2026-11-02 CLI scope, now OD55). Applied: `story list
  --coverage`. Judge: the user. Reversible: one name.
- **CLC3, agent-judged, applied.** CommandLine O2's interruption sentences presumed a handler during a run; the
  design's run never yields, so none is installed (2.10.14, SA RV3 L5). Applied: interruption is handled before or
  after a run. Judge: the runner (follows decided Stories rules). Reversible: one paragraph.

Prototype check (S2): built: `flow check` rule 15 (strict, own lane only, as stated), `SharedContract`,
`GoneWithoutKey`; not built and kept as contract: `ScheduleLeadsToWrite`, the stay-put false positive's refinement,
`UnboundedBridge`, the allowlist lint.

## Testing

Rows merged: fragments row (Testing O1, replaced by C69), C16 (superseded), C53, C63, C69-C77, C110, C122, C140, T1.
The design marks the Stories rows "all proposed, following the decisions cited"; the decisions behind them (SC1-SC5,
W1-W43) are recorded as owner-confirmed, and OD42 (the user) says 2.10 is built as designed, with the prototype's
Story spellings as prior art. The plan follows 2.10.

| # | Outcome | Before | After | Decision |
| --- | --- | --- | --- | --- |
| T-1 | title | "...checkpoints, models and property tests" | "...checkpoints and property tests" | C69 |
| T-2 | O1 | `story.app`, `story.machine` with `services?`; ids within an App; `run({ signal?, frames? })`; the command list | `Story.app`, `Story.machine`, `Story.fragment`; ids across the configuration; data-form steps; a Story holds no checks; `run()` | C63; C69 |
| T-3 | O1 | "App ensure(ref, options?) follows Runtime O3"; "send never creates" | ensure and detach as uses, no input; dispose and forget; send may restore; the address | C110; C122; C144; rule 65 |
| T-4 | O2 | `process()`, `advanceTo`, `advanceToNextTimer` | every step settles (microtask scheduler, K hops, finish the world, `HostTimeWait`), turn limit per instant, `advance` forms, `together`, engine dependence | C70 |
| T-5 | O3 | fixtures replacing services | fakes: `Fake.server`, wire words, one result shape, provenance, binding failures, `StoryFakeError`, `Fake.storage`; "fixtures cannot inject" kept | C53; C71 |
| T-6 | O4 | frames per command with collapse; checkpoint reads through `checkpoint.actor`, `pending`, `descriptor.get`, `Entity.get`, `Entity.queue` | publication frames, step cuts, no collapse, truncation; reads `state` ... `now`, `cp.read`, `cp.inspection.work`, `cp.entity` | C72; C27 |
| T-7 | O5 | `model`, `getShortestPaths`, `getSimplePaths` | removed, kept as a marked stub with the outcome id | T1; C77 |
| T-8 | O6 | `propertyTest(domains, options)` | `propertyTest(story, { ... })`, steps as data, plain properties, `PropertyTestFailed`, truncation as Fail, quiet phase kept, `domainPropertyOptions` | C73 |
| T-9 | O7 | tabs sharing storage; dehydrate exception | fakes and `Fake.storage` shared; in-transit requests survive `closeTab`; hydration source in the destination's world; `reload` | C53; C74 |
| T-10 | O8 | cancellation sentences and flag | no signal; the error list; earliest error primary | C75 |
| T-11 | O9 | highlight | addressed event; closed tab; fragment Stories not playable | C76 |
| T-12 | V1-V9, Q2 | verification and deferred lists | V5 removed (stub kept); V1, V3, V4, V6, V8 amended; model items removed from Q2 | C77; T1 |

Counts: 12 edits; 28 superseded sentences marked (O1: 9, O2: 3, O3: 2, O4: 4, O5: 1 block, O6: 4, O7: 4, O8: 3,
O9: 1, V: 5, Q: 1, less overlap).

Conflicts:
- **TC1, agent-judged, applied.** C73 lists `length?` beside `runs?` but gives no defaults; the plan's "runs and
  steps ... defaulting to 50 and 40" now has `steps` as the step forms. Recommended: `length` takes steps' old default
  (40), `runs` keeps 50, marked as the runner's reading. Judge: the runner. Reversible: one number.
- **TC2, agent-judged, applied.** Removing Testing O5 and V5 outright would delete IDs; kept as stubs marked removed,
  with the superseded text quoted, so no ID is reused and no sentence disappears silently. Judge: the runner.
  Reversible: delete the stubs.

Prototype check (S2): Story `detach`/`dispose` were built only in harness steps (CP5); the plan keeps 2.10's
contract. The prototype's Story spellings are prior art (OD42).

## React

Rows merged: fragments rows (React O2, React O4), C27, C35, C41, C52, C66, C105, C108, C119, C137, C143, C144, C147,
C157.

| # | Outcome | Before | After | Decision |
| --- | --- | --- | --- | --- |
| RE-1 | O2 | "one fresh local actor handle per component incarnation" | fresh memory and state, lanes adopted by local identity | C52 |
| RE-2 | O2 | "Declared input must have its exact type."; "Shared input never resets an existing actor" | value-named refs take no input, `useActorByRef(ref, {})`; refs carry no input | C119; C144 |
| RE-3 | O2 | "missing or disposed means null" | a lookup of an identity with a record returns the record view | C108 |
| RE-4 | O2 | "initial(input) memory"; "initial must be pure" | memory from `Flow.input`, `Flow.initial`, computed initials; one pure default per field; the pre-attach copy read | fragments row; C137; C157; C108; C143 |
| RE-5 | O2 | "do not mark optimistic writes pending" | "predicted" | C27 |
| RE-6 | O3 | `SendTargetAbsent` through a disposed handle | the send table; subscription completion | C105 |
| RE-7 | O3 | grace, "Work continues during grace", retention, retain across hiding | uses from passive effects; the in-flight exception and remount rule; activities run and schedules wait; persist or hold a use outside the hidden subtree | C108; C143 |
| RE-8 | O3 | (none) | buffer flushes after lane deliveries; one notify per task | C52; C147 |
| RE-9 | O4 | selectors read activities; "Transactions have no view reader."; `descriptor.get` | schedules, operations, `Fragment.O.x.get`, private fields omitted; write lanes are rows; `contract.get` | fragments row; C35; C41; C66; OC1 |
| RE-10 | V3, V4 | verification | lane-delivery order; uses, work in flight, remount | C52; C108 |

Counts: 10 edits; 18 superseded sentences marked (O2: 8, O3: 7, O4: 4, V: 1, less overlap).

Conflicts: none new. `contract.get` follows OC1 (Operations).

Prototype check (S2): React's effect timing (Strict Mode, Suspense, Activity) is a stated limit needing browser tests
(2.7.17); kept as V4.

## Package

Rows merged: fragments row (Package O1), C82, C102, C138, T1, and merge 5's operators (the design's own import line,
2.8.2, imports `eq`, `asc`, `desc` from the root, so "`Condition`" in the fragments row names the group, not a
namespace). S1 found no 6.4 row for Package: **accepted**.

| # | Outcome | Before | After | Decision |
| --- | --- | --- | --- | --- |
| PK-1 | O1 | flow-state name list | adds `trait`, `subroutine`, `Flow` (members listed, with `Flow.ignore`, `Flow.state`, `Flow.entry` from 2.6), `Outcome`, `Feed`, operators `gt`, `gte`, `lt`, `lte`, `isNull`, `or`, `not`; services Layer typed by R | fragments row; C102; C138; merge 5 |
| PK-2 | O1 | flow-state/testing list with `story`, `model` | `Story`, `Fake` (and its members), `propertyTest`, `domainPropertyOptions`, `defineConfig`, `StoryFrame`, `StoryPlayer`, `definePresentation`, `PropertyTestFailed`; no test-runner adapter (proposed) | C82; T1 |
| PK-3 | O1 | (none) | `flow-state/internal/testing` is not a supported route | C82 |
| PK-4 | O3 | removed surfaces | adds `model` and `story`; `PropertyTestFailed` as the testing route's one error class | C82; T1 |

Counts: 4 edits; 2 superseded sentences marked (O1: 2).

Conflicts:
- **PKC1, agent-judged, applied.** C82 exports the error class `PropertyTestFailed`, while Package O3 removes
  "the separate error classes" and Diagnostics D1 says capability-specific error classes are not public APIs.
  Recommended: follow C82 (a Stories decision, W25 and W38 behind it): it carries a property test's result, not a
  Flow failure, and is the testing route's only class. Judge: the runner (a reading of a decided row). Reversible:
  make it a `FlowError` code instead, one line in three plans.

## FlowState

No section 5 row names FlowState. Edits keep it consistent with the merged plans and with the approved roadmap.

| # | Where | Before | After | Decision |
| --- | --- | --- | --- | --- |
| FS-1 | goal | "Testing — Stories, fixtures, checkpoints, models and properties" | "Stories, fakes, checkpoints and property tests" | T1; C71; C77 |
| FS-2 | O1 | "Rebuild packages/flow-state-rewrite in place." | build in `packages/flow-state-v3/src/` with the prototype as reference; `flow-state-rewrite` frozen | the roadmap (approved 2026-11-07), AGENTS.md |
| FS-3 | O2 | S7 "Story, fixture, checkpoint and model infrastructure" | without models, with fakes | T1; C77 |
| FS-4 | D1 | compiled structure | `machine()` is the compile, booted by the Runtime | C139 |
| FS-5 | V7 | "@plan.Testing.V2 to V5" | V2 to V4 and V8; V5 removed | C77 |

Counts: 5 edits; 2 superseded sentences marked (O1, O2).

Conflicts:
- **FSC1, applied as the user's decision.** O1 named `packages/flow-state-rewrite` as the build target; the user's
  approved roadmap names `packages/flow-state-v3/src/`, and AGENTS.md freezes `flow-state-rewrite`. Not a design
  row, but a plan sentence that claims what the user since replaced. Judge: the user (already decided). Reversible:
  one sentence.
- **Not changed, noted.** The build stages S1-S11 predate the roadmap's phases 3-9; they do not contradict it (they
  order work inside phases 4 and 5) and the design does not touch them, so they stay.

## LazyFeatures

Rows merged: C50, C105 (LazyFeatures O2), and the consequences of C143, C152 and C211 (PC1, PC2).

| # | Outcome | Before | After | Decision |
| --- | --- | --- | --- | --- |
| L-1 | O2 | "An actor's send(ref, ...) never adopts or creates its target ... SendTargetAbsent, with details.adopted false" | never adopts a lazy entry or creates an actor, may restore; `NotAdopted` | C105 |
| L-2 | O3 | (none) | dormant lane records, undecoded and uninvoked, with parked endings | C50 |
| L-3 | O3 | "or a version change discards the scope" | removed | C211 |
| L-4 | O3 | dormant record discarded at adoption | quarantined; a fresh ensure, `RecordUndecodable`, lanes adopted; Persistence O5's checks at adoption | C143; PC2 |
| L-5 | O3 | orphans discarded | actor records discarded, lane records quarantined | C152; PC1 |
| L-6 | O3 | "the actor receives its unknown outcome when adopted" | "unknown { Restored }" | C126 |

Counts: 6 edits; 4 superseded sentences marked (O2: 1, O3: 3).

Conflicts: none new (PC1, PC2 carried from Persistence).

Prototype check (S2): dormant lazy records exist in the prototype only as lane records parked for a later ensure; the
lazy loading itself was never built, so the plan keeps its content.

## ServerRendering

Rows merged: C49, C96, C97, C98, C107, and C40 and C31's renames (placements, `output`).

| # | Outcome | Before | After | Decision |
| --- | --- | --- | --- | --- |
| SR-1 | O1 | (none) | dehydrate's Runtime holds a use on each shared actor until capture or rejection | C107 |
| SR-2 | O2 | (none) | `every` sessions never open on a server; their services by a layer, or exempt | C98 |
| SR-3 | O3 | "latest stream values and counts", "pending-commit facts", "each activity binding" | a latest row's last and baseline, the partition, the position Schema in the digest; write lanes never hydrated; placements | C49; C96; C97; C40 |
| SR-4 | O3 | "An in-flight commit becomes unknown with its attempt ... the actor's unknown outcome owns reconciliation." | `DehydrateCommitInFlight` evidence naming actor, state and instance path; no client lane; the stated limit | C49 |
| SR-5 | O3 | sensitive omission | a sensitive position is omitted and owes one notice; "no result Schema" reads output | C97; C31 |
| SR-6 | O5 | "Existing stream lanes win."; "Streams open new sessions while displaying their transferred latest values."; "Shared actor retention starts at activation." | removed; rows start Connecting with last shown; Hydrate's hold | C96; C107 |
| SR-7 | V3, V5 | settle and replay Stories | a ticker and a chat feed; no client lane for a commit in flight | C49; C96 |

Counts: 7 edits; 10 superseded sentences marked (O1: 1 pointer, O3: 5, O5: 3, V: 1).

Conflicts:
- **SRC1, agent-judged, applied.** C49's "Replaces" quote runs on into "client or persisted actors beat hydrated
  copies", but its rule and 2.7.13's SSR row concern write lanes only ("lanes are never hydrated from the server;
  only resource entries are"); actors still hydrate and merge under O5. Recommended: keep O5's actor precedence.
  Judge: the runner (a reading of the row against 2.7.13). Reversible: one paragraph.

## Summary

All 14 plans merged, one commit each, `workflow check` and the reference check passing after every plan.

| Plan | Edits | Superseded sentences marked | Conflicts |
| --- | --- | --- | --- |
| Machines | 25 | 15 | MC1, MC2 |
| Operations | 22 | 52 | OC1-OC4 |
| Runtime | 20 | 24 | RC1, RC2 |
| Persistence | 13 | 33 | PC1-PC3 |
| EntityDomains | 19 | 27 | EC1, EC2 |
| Inspection | 9 | 13 | IC1, IC2 |
| Diagnostics | 9 | 6 | DC1, DC2 |
| CommandLine | 9 | 13 | CLC1-CLC3 |
| Testing | 12 | 28 | TC1, TC2 |
| React | 10 | 18 | none |
| Package | 4 | 2 | PKC1 |
| FlowState | 5 | 2 | FSC1 |
| LazyFeatures | 6 | 4 | (PC1, PC2 carried) |
| ServerRendering | 7 | 10 | SRC1 |
| **Total** | **170** | **247** | **25, all applied** |

Held for the user: none. *Corrected by the fix pass:* the first merge did re-add `trace diff`, which the user had
cut; the fix pass cut it again (CLC1, B2). No other merge needed a large public API change or a guarantee change
the user had not decided.
For the user's read: PC3 (any structural Schema change resets a record, the runner's Q19 ruling, already call 13 in
progress.md) and CLC1 (`diff --base` cut by the user's 2026-11-02 CLI scope, `trace diff` kept with the export by
the later OD43).

Not placed in a plan:
- C127 targets `references/design/multi-tab.md`, a design document, not a plan.
- Merge 5's row 11 (the default lane key for `many` writes) names a concept C28 removed; rejected.
- Rule 8's "proposed, for the user's read" evidence for a refused kept try and a released stranded read, and the
  proposed lint for a stranded read with no recurring schedule: proposals, not decisions, so no plan states them.
- `ModuleDefect` (named only in OD52's prototype note).
- 2.7.13's "as built, not ruled" note (OD54 (c)): a fresh ensure of a new identity overwriting an old-version
  record; open in the design, so the plans keep "removed by forget" only.

## Fix pass (audit)

From the independent merge audit (`plan-merge-audit.md`, FAIL on B1-B8), with the runner's rulings. Same rules as the
merge; `workflow check` and the reference check passed after every plan touched.

| Item | Ruling | What changed |
| --- | --- | --- |
| B1 | per-record reset is the runner's narrowing of Q1 A (OD54 (8)) | Persistence O1 and O5 say "per definition (the user's Q1 A), decided per record (the runner's ruling)"; log P-2 corrected |
| B2 | `trace diff` cut by the user's 2026-11-02 CLI scope | machine-design.md gains **OD55** (the user, 2026-11-02) recording the scope; CommandLine O1 lists only the kept commands and cites OD55; the `trace diff` command and its O4 paragraph are quoted as superseded; CLC1 corrected |
| B3 | mark PC1, PC2, EC2 in plain words | Persistence O5 and LazyFeatures O3 say "the runner's ruling" with the reason; LazyFeatures no longer cites PC1/PC2; EntityDomains O1 marks `version?` |
| B4 | the design never touches them, so restore | Operations O3 restores "Invalid success writes apply nothing and report InvalidWrite; the commit still succeeds" and the no-overwrite rule; Diagnostics' pointer now resolves |
| B5 | one lane identity | "(identity with its version, contract id, key)" in Operations O3 (lane and its superseded note) and Persistence O2 |
| B6 | flags as the design treats them | Diagnostics gains the stream session flags as diagnostic records; `ReleaseOverdue` is a flag in both Diagnostics and Inspection |
| B7 | mark every unconfirmed name | first use marked proposed in each plan: `SharedContract`, `RecordUndecodable`, `RepairOverdue`, `RecordHeld`, `UnsettledEvicted`, `ModuleDisabled`, the Inspection boot-report names, `IdleWithoutPing`, `contract.get`; MC1 and CLC2 relabelled the user's |
| B8 | read list | progress.md: header refreshed; entries 7, 8, 9, 11, 14, 15, 16 completed (reason, evidence, reversal; 11's numbering; 14's R6, R7, R10 content); new entries 18 (OD49 (11)), 19 (OD54 (c), (b), (d)), 20 (the OD52/OD53 as-built guarantees); a new "phase 2 plan merge" section listing every conflict with the audit's judgement |
| minor 1 | owner plans name their codes | Runtime O3 `EndedWithWork`, Runtime O5 `ContextCycle`/`MissingContextProvider`, Persistence O5 `LaneRekeyed`, CommandLine `InvalidUsage`/`OutputFailed`/`ConfigLoadFailed`, ServerRendering O1 `DehydratePersistentSetup`; Diagnostics' denial-code pointers split by owner; `StoryInvalidCommand` points to Testing O8 |
| minor 2 | PKC1 in Diagnostics | Diagnostics D1 names `PropertyTestFailed` as the one exception |
| minor 3 | restore decided content | Runtime O4: a decline is kept and blocks nothing; no fallback alternative and no API; a boot forgets a stranded read; the stated gap |
| minor 4 | wording | Machines' `IdentityFieldOptional` sentence; CommandLine "to be accepted by the user in phase 5"; "second-tab refusal" replaced in FlowState and Persistence V7; FlowState names fragments; "activities" read "placements" in Runtime, React, ServerRendering |
| minor 5 | pointers | Machines' "rule 22" replaced by @O3; Inspection's `flow trace` points to CommandLine O2 |
| minor 6 | labels | MC1, CLC2, P-2 |
| minor 7 | log claims | S3's claim and the summary's claim corrected above |
| minor 8 | quote or restate each | Operations (5), Machines (2), Runtime (1), React (2), EntityDomains (1), CommandLine (1): each restated in the contract or quoted with its row |
| minor 9 | Specs settle the design-level ones | `StoryTurnLimit`'s reasons and `StoryFakeError`'s reasons now in Testing; the other three (dehydrate settling vs time, hydration rejection vs rethrow, Hydrate's owner) are carried to the Specs |

Disagreements with the audit: none on substance. One note: `SharedContract` is marked proposed as the read list's
entry 10 asks, though its meaning was decided earlier (F2).

**Superseded text extracted (the user's instruction, after the fix pass).** Every `Superseded:` paragraph, and
Testing V5's old text, moved to `references/superseded.md`: 270 items (split at each pointer), each checked by a
read-only scratchpad script to appear in that file exactly as often as it appeared in the plans, and in no plan
afterwards. Testing O5 and V5 stay as stubs to keep their ids. Each plan's diff is deletions only, apart from
Operations O6's `contract.get` wording (its inline "renamed from descriptor.get" pointer removed) and Testing V5's
stub line. `workflow check` and the reference check pass. machine-design.md's own inline markers are untouched.
