# Design catch-up: inventory (phase 0b)

**Status: proposed.** Written 2026-11-07 by the phase 0b builder, for the roadmap's phase 0 ("machine-design.md is
brought up to the prototype"). Every decision in the sources below, grouped by design area, with one label each.
The change list that records them is [change-list.md](change-list.md); what it applies, and what waits for the
user's label round, is said there.

Sources, newest last where they differ:
- the prototype's decision record: `packages/flow-state-v3/prototypes/convergence-1.md` to `convergence-13.md`
  (D1-D228), `round-13/api-changes.md`, `round-13/review.md` (H1, H2, M1-M5), `HANDOFF.md`;
- `FOR-ARPIT.md` (`git show 04e314f4:packages/flow-state-v3/prototypes/FOR-ARPIT.md`), accepted by the user on
  2026-11-07 at every recommended answer: section 2 (calls 1-20), 4 (API change log), 6 (carry-over), 7 (Q1-Q8);
- the round-14 corrections approved by the user on 2026-11-07, written here **R14 D1-R14 D7** so they are never read as
  the prototype's D1-D7;
- machine-design.md's own OD28-OD31, which are newer than the prototype where they touch it.

Labels:
- **in**: already in the design (cited where);
- **newer**: newer than the design and recorded by the change list (decided, or agent-judged where marked);
- **conflict**: the design and the prototype disagree; the change list names the judge (user or agent);
- **phase 1**: newer, but its area (entities, streams, migration) is settled in phase 1, so it is not recorded now;
- **prototype-only**: harness, suite, driver or seam mechanics, not design. Those that production carries over go to
  the new conformance suite (phase 3) or the host adapter (phase 5), as FOR-ARPIT section 6 says.

Change-list entries are `E` numbers; user-judged conflicts are `U` numbers; both are in [change-list.md](change-list.md).

## 1. The turn, the mailbox and scheduling

| Decision | Label | Where, or why |
| --- | --- | --- |
| D1 one Runtime FIFO, follow-ups next | conflict, superseded by D122 | E19 records D122's order (FOR-ARPIT call 6 accepted) |
| D2 `send` runs synchronously when idle (owner's Q3 A, 2026-10-28) | prototype-only | a driver timing; the design's turn (2.5) is silent on it and needs nothing |
| D4 eligibility recomputed after every step | prototype-only | lane-table implementation |
| D5 generations on commands and inputs | prototype-only | the driver's fence; the design's arming ids (P11) already state the outcome |
| D6 driver: `runFork` + `addObserver` | prototype-only | host implementation |
| D13, D35 follow-up bound 64 and notify chain | prototype-only | Runtime bounds; `InvalidTurn` on a chain is rule 22's existing defect |
| D110 rate budget | superseded (D115, then D122) | |
| D115 pacing by depth | superseded (D122) | |
| D122 a slice, then a task; mail per actor in rotation; spins never stopped; `TurnStorm`, `AsksForever` | newer (decided: calls 5, 6, Q5 A) | E19, E20, E21 |
| D136 one notify per task | prototype-only | publication timing in the driver; React O3's notify is unchanged |
| D140 mail as a persistent queue | prototype-only | |
| FOR-ARPIT call 5, Q5 A (spins) | newer (decided) | E21 |
| FOR-ARPIT call 6 (per-actor order) | newer (decided) | E19, E20 |

## 2. Throws, refusals and kept endings

| Decision | Label | Where, or why |
| --- | --- | --- |
| D10 a throw in our own step aborts it | superseded (D27, then D46) | |
| D11 a throw in `resetOn`, `input` or a prediction is `InvalidTurn` | in | rule 22's defect rules and 2.5 step 5 |
| D27 hook throw disables the module; core throw fatal | superseded (D46) | |
| D31 a refused ending turn is not redelivered | superseded (D50) | |
| D46 one rule for a throw, by who threw; a module defect fails closed (`NotSent { ModuleDisabled }`); a core bug is fatal until reload; restore per record | conflict, user (U7) | a new Flow reason and a stated Runtime guarantee; the module seam is the entity store's (phase 1) |
| D50 a refused ending turn is redelivered once | newer (decided with call 10) | E01 |
| D57, D65, D77, D207 one gate; the sealed `Compiled`; every closure a Slot | newer (decided with call 14, agent-judged detail) | E23 (`Compiled` holds Slots); the seal's checks are prototype-only |
| D109, D118 a turn never loses a completion; `Kept` | superseded in form by D123 | |
| D123 what a turn refused twice stays with what owes it, and ends with that | newer (decided: call 10) | E01, E02 |
| D133 `fatal` must be named | prototype-only | suite |
| D138 a state named `self` or `__proto__` is refused (`ReservedStateName`) | newer, agent-judged | E26 |
| D147 a read mapper's throw or shapeless result ends `Defect` | newer (decided: call 8) | E07 |

## 3. Encoding at the doors

| Decision | Label | Where, or why |
| --- | --- | --- |
| D89 encoding never fails a turn: memory skips the batch; a commit that cannot encode declines | conflict, user (U6) | new behaviour and a reason name |
| D100, D108 one door, `encodable`; commit `NotSent { Unencodable }`, lookup `Defect`, a guard key denies | conflict, user (U6) | a new Flow reason |
| D114 a decline carries what the turn asked to send | conflict, user (U6) | part of the same door |
| D119 `canon` and `carried`; `1n` restores as `"$1n"` | newer (decided: call 19) | E27 |
| D120, D124 `InputFieldForm` lint and `inputNotCarried` | newer, agent-judged | E26 (a `flow check` finding name [P]) |
| D139 a `Symbol` or a value with no form is `UnencodableValue` | newer, agent-judged | E26 |
| D141, D143 the hash and replay see values | prototype-only | suite |

## 4. Write lanes and the lane table

| Decision | Label | Where, or why |
| --- | --- | --- |
| D3 queue order is mint order; a retry never rejoins; an entry leaves only when resolved or released (rules 29-31) | phase 1 (U11) | entity record queues; recorded with the entity round |
| D12, D40 forced repair bounded at 30 s | phase 1 (U11) | |
| D15 an unbound hold with a waiter yields after 5 minutes (`unknown { Abandoned }`) | phase 1 (U11) | blocks only through a record queue |
| D21 local lanes are not adopted | superseded by the design (OD31, R14 D5) | the design is newer: a local remount adopts lanes |
| D22 key-less members name the ending's own Attempt only (rule 43's second clause cut) | conflict, user (U2) | |
| D23 reads have no hold and no queue; latest wins | in | rule 42 |
| D28 `Attempt.phase` | prototype-only | the table's columns are the design's states |
| D43 `serialize`, `W` at most 64 | in | rule 21, 2.7.13 |
| D45 `Attempt.sent` | prototype-only | 2.7.13 already says an Attempt remembers whether it was ever sent |
| D48 a never-sent cancel or replace waits for its acknowledgement | newer, agent-judged | E05 |
| D72 boot forgets a stored ending only once delivered | prototype-only | Persistence O4's at-least-once restore already holds it |
| D78 restore re-derives a held lane's key | superseded by D221 for every typed contract | kept only for the suite's hand key closures (prototype-only) |
| D88 a quarantined lane keeps its id and hold; a commit declines; `cancel` clears; `orphaned` unbuilt | conflict, user (U4) | the design sends such a lane to `orphaned` (P19) |
| D107 restore delivers a lane's `W` endings first, then the head's unknown | conflict, user (U3) | changes rule 44's order |
| D217 a release that adds a key field declines beside the older lane | superseded by D221 | |
| D221 key fields required; a changed key is a new op version; old-version holds | newer (decided: calls 11, 12, Q1 A, Q2 A, round 13's H2 fix) | E08, E09 |
| D20 key-equality migration cut (to `orphaned`) | conflict, user (U4) | rule 46 adopts by key equality |
| D19 `allow` cut | conflict, user (U5) | scope: the design specifies `allow` throughout; the prototype never built it |
| D18 `basedOn` rebase cut | phase 1 (U11) | entity writes |

## 5. Persistence and the host

| Decision | Label | Where, or why |
| --- | --- | --- |
| D14 storage bounded at 10 s, refused | superseded (D30) | |
| D26 write-ahead is core | in | Persistence O6, rules 38, 46 |
| D30 silent storage means pending; evidence at 10 s | newer, agent-judged | E22 (the design never bounded storage; evidence only) |
| D49 a stall bound and sign; later left the public row | phase 1 (U11) for the record-queue half; storage half in E22 | |
| D73, D93 `retired` identities | superseded by OD31 (`disposeActor` removes the record) | |
| D80 plain memory coalesces at 5 s, flushed on hide (decided 2026-11-02) | newer (decided: call 4) | E22 |
| D83 per key a later write wins; batches atomic, in issue order | newer, agent-judged | E22 (the host's store contract) |
| D84 a batch touching a lane flushes now | newer (decided with call 4: "lane and send writes are not delayed") | E22 |
| D85 a strict marker before ready | prototype-only | an H3 experiment that did not close it |
| D86, D96 a first send is one batch; `acked` gone; `NotSent { Restored }` only for `W` | newer (decided: call 1, Q3 A) | E30 |
| D87 sends before boot queue until boot | conflict, user (U8) | 2.10.17.6 says `ActorAbsent` |
| D94, D95 an awaited write waits for its actor's plain batch; one plain write per key | newer, agent-judged | E22 |
| D97 a hidden page issues at once, backoff apart | newer (decided with call 4's hidden flush) | E22 |
| D99, D111 a record names its boot; ids never repeat | newer, agent-judged | E22 |
| D104, D105, D106 a wiped origin; named kills | prototype-only (suite); H3's finding is call 2 | |
| D145 a strict fake; servers prune keys | the fake: prototype-only. The author contract: newer, agent-judged | E04 |
| D146 a frozen page runs nothing; a discard is a kill | newer, agent-judged | E22 |
| D148 bfcache releases the lock; a return reloads | newer (decided: call 9) | E22 |
| FOR-ARPIT call 2 (business keys for money), Q6 A (`idempotency` on the contract) | newer (decided) | E04 |
| FOR-ARPIT call 3, Q4 A (a second tab's commit ends `NotSent { NoPersistence }`, D26 in round 7) | newer (decided) | E03 |
| FOR-ARPIT section 6, Safari's four host requirements | newer (decided carry-over) | E22 |
| FOR-ARPIT section 6, run costs and suite carry-over | prototype-only | phase 3 |

## 6. Memory, input and identity

| Decision | Label | Where, or why |
| --- | --- | --- |
| D61 a quarantined actor record is the whole actor | in | rule 8's last clause, rule 46, 2.7.13 |
| D82 `memory.restore` slot | superseded (D214) | |
| D137 an actor key names one machine (`ActorMachineMismatch`) | superseded by the design (OD30: identity is the machine plus its input) | |
| D200 `Flow.absent` | superseded (round 11: `Schema.optionalKey`) | the design already uses `Schema.optionalKey` (2.2.2) |
| D214 memory as fields; the restore rule for a field a record lacks | newer (decided with call 13) | E10; the `Compiled` half is E23 |
| D219 creation checks a present input by its type side, no transforming decode | conflict, user (U9) | 2.2.2 says "decode the input" |
| D222 one default per field, at creation and restore; `TwoDefaults` | newer (decided: call 13) | E10 |
| round 13's H1 (a default computed once and shared) | newer (decided fix) | E10; its tension with creation's purity is U12 |
| R14 D1 an end parks `failure { Interrupted }` per stopped read | newer (approved) | E13 |
| R14 D2 only the latest arming waits | newer (approved) | E14 |
| R14 D3 a return mints a new incarnation id | newer (approved) | E15 |
| R14 D4 the ref form fixed per machine in the types; `ConflictingActorRef` for persist/context only; identity encoded with its Schemas | newer (approved) | E11, E12 |
| R14 D5 a local remount within its grace reuses the actor | newer (approved) | E16 |
| R14 D6 after `disposeActor`, endings stay on the lane record | newer (approved) | E17 |
| R14 D7 an undecodable record reads `quarantined`; an ensure starts fresh, `RecordUndecodable` | newer (approved) | E18 |

## 7. Contracts, services, `Compiled` and the public API spelling

| Decision | Label | Where, or why |
| --- | --- | --- |
| D7 the reification criterion | prototype-only | |
| D8 `timeout` on operations, per send (`unknown { TimedOut }`, `failure { TimedOut }`) | conflict, user (U1) | rule 25 and 2.7.17 (OD31) put timeouts in the Effect |
| D9, D25, D42, D51, D63, D68, D69, D81 the module seam | prototype-only | entities and streams sit behind it; phase 1 |
| D16 entities optional, behind a seam | in | 2.8 and the user's constraint |
| D17 an interpreted table only where cells are uniform | prototype-only | |
| D24 fragments keep operations | in | rule 49 |
| D44 `Compiled.uses` | prototype-only | |
| D90, D91 world table; a thin typed path | prototype-only | |
| D121 the server's key as data | newer (decided: Q6 A) | E04 |
| D194 no runtime codec for `Compiled` | newer (decided: call 14) | E23 |
| D195-D198, D205 typed fixtures, `--swap`, whole output | prototype-only | |
| D199 fragments declare `operations` | in | rule 49 |
| D201 `unknown` by reason | in | rule 13 (a record by tag, OD23 Q36) |
| D202 key-less `idle` as a guard | in | rule 43 |
| D203, D212 `labFollowUps`, `labHostOp` | prototype-only | named seams, not API |
| D204 raises `E.<child>.<Event>` with `.key` and `.from` | in | 2.2, rule 9 |
| D206 a Slot's path is its place | newer, agent-judged | E23 |
| D208, D209, D210 module members, `domain` and `streams` in `Compiled`'s shape; `idleMs` | prototype-only | not the design's entity or stream API; phase 1 |
| D211, D213 services as contract data; `servicesFor` | newer (decided: call 15; the roadmap's Q2 B) | E08 |
| D215, D216 one key source; `events` required | newer, agent-judged | E23 |
| D218 a fragment's type carries its requirements | in | rule 57 |
| D220 the compile prototypes; `UnknownNotUncertain` | the name: newer, agent-judged | E26 |
| D223 `Compiled` carries a fragment's declarations and event payloads | newer, agent-judged | E23 |
| FOR-ARPIT section 4: placement in the definition, `states` as an ordered list, `trait()` and `subroutine()`, `.each({ of, max })`, `.resumable()`, `retry(k)` and `retryable(k, { times })`, `resource({ lookup })`, `unknown` by tag, `Schema.optionalKey`, an exit as a target | in | each "after" spelling is the design's own (2.2, 2.3, rules 9, 13, 41, 43, 2.7.13); the prototype converged on the design in round 12 |
| FOR-ARPIT section 4: services, defaults, key fields | newer (decided) | E08, E09, E10 |
| FOR-ARPIT section 4: `Compiled` (D223) | newer, agent-judged | E23 |
| FOR-ARPIT section 4: Stories (D224) | decided: the design stands (Q8 A) | E24 |

## 8. Fragments

| Decision | Label | Where, or why |
| --- | --- | --- |
| D52 fragments are one tree of incarnations | in | 2.5, rules 1, 51-54 |
| D62 the bookmark lives on the incarnation | in | rule 71 |
| D64 a thaw checks `resetOn` first | in | section 7 item 2 |

## 9. Entities and streams (phase 1)

| Decision | Label | Where, or why |
| --- | --- | --- |
| D39 a re-send waits for its record's forced repair | phase 1 | |
| D41 "contested" cut | superseded (D47), then phase 1 | |
| D47, D55, D58, D59, D60, D66, D67, D74, D75, D76 positions, the judge, versions, stubs | phase 1 | replaced by `round-9/entity-proposal-2.md`, which phase 1 builds |
| D53 per-key money ledger | prototype-only | suite oracle |
| D70, D71 sessions | in, in part (rule 70; Streams T4's turn pace); the rest phase 1 | |
| FOR-ARPIT call 7, Q7 A (rule 32: two levels of doubt, no clock) | conflict, user (U10) | OD28 P1 (the design, the same day) keeps "a later write's success still clears it" |
| D16, D42, D81 the store seam | prototype-only | phase 1 |

## 10. Stories, the CLI and tooling

| Decision | Label | Where, or why |
| --- | --- | --- |
| D92 `flow check` and static `flow explain` read `Compiled`, run no callbacks | in | 2.10.14 ("read its steps without running a Runtime"), CommandLine O5 |
| D224 the Story API as built | decided: prior art; the design's 2.10 stands (call 16, Q8 A) | E24 |
| D225 `flow trace <id>` | newer (decided: call 17) | E25 |
| D226 `flow graph`, one edge per alternative | newer (decided: call 18) | E25 |
| D227 the graph gate | prototype-only (phase 3 carries it) | E25 says what the graph promises |
| D228 the lie gate, targeted | prototype-only (call 19 accepted; phase 3) | |
| FOR-ARPIT section 6, CLI output for people | newer (decided carry-over; outputs accepted in phase 5) | E25 |
| round-13/api-changes.md, Stories and fakes rows | decided: prior art (Q8 A) | E24 |
| round-13/api-changes.md, `turn` evidence and `Lane.keyFields` | runtime, not public: prototype-only, except the version stamp in E09 | |

## 11. The suite and harness (prototype-only)

All prototype-only; phase 3 rewrites the suite and carries what FOR-ARPIT section 6 lists. D29, D32, D33, D34, D36, D37,
D38, D53, D54, D56, D79, D98, D101, D102, D103, D112, D113, D116, D117, D125, D126, D127, D128, D129-D135, D142, D144,
the fake half of D145, D149, D149b, D150-D193 (the ending ledger, the reference model, the boot oracles, the lies),
D195-D198, D205, D227, D228. FOR-ARPIT call 20 (the ending check's limits L1-L15) is accepted as the suite's stated
limits; its L3 (no order across actors) follows from E19.

## 12. From round 14's final review (added at the coordinator's request, 2026-11-07)

Labelled by the roadmap's judge rule. R14R numbers are this list's order.

| Item | Label | Where, or why |
| --- | --- | --- |
| R14R 1 Runtime disposal: within the bound the ending is parked; after the bound the reason is undefined (Runtime O6, 2.7.13's row and the reasons table disagree; not `Interrupted`) | conflict, user (U13) | a Flow reason name |
| R14R 2 incarnation boundary: does a reload mint new ids for live restores and records kept at ready; does R14 D3 renew nested fragment incarnations | newer, agent-judged | E34: "`Restored` means a new incarnation" (rule 73, C126) already makes a reload a new incarnation; the ruling applies it to every incarnation the record restores |
| R14R 3 ready after R14 D6: parked endings with no record stay parked until an ensure; nothing is created at ready; a kept record holding a `Held` hold is named | newer, agent-judged | E35, a reading of 2.7.17's Ready and its stated limit on `Held` offline writes |
| R14R 4 `disposeActor` durability: a crash before its capture brings the record back | conflict, user (U14) | a durability guarantee: state a limit, or flush the removal |
| R14R 5 waiting commits behind a `Held` head at ready: owed or not | in | rule 73 and 2.7.17's Ready: not owed; the prototype is being changed back. The design's behaviour is the better one: those `W` entries were never sent, their `NotSent { Restored }` reaches the next use, and waking every such actor at ready restores screens nobody opened |
| R14R 6 R14 D7 and 2.7.17's state table: `Quarantined` is terminal; an undecodable record needs its own state, left by a fresh ensure or `forget`; `RestoreDiscarded` | newer, agent-judged (follows the approved R14 D7) | E18, E36 |
| R14R 7 rule 74's versions: the encoded side only, or type and encoded; Schemas compared structurally, ignoring annotations | newer, agent-judged (the user's Q1 A, applied to actor versions) | E09, E37 |
| R14R 8 `persist` is per ref in the API, per identity in effect: who wins | conflict, user (U15) | API shape |
| R14R 9 R14 D1's `Interrupted` on every path that brings an ended identity back, and its order against rule 44 | newer, agent-judged (completes the approved R14 D1) | E13 |

## 13. Counts

| Source | Items | Recorded (E) | Already in | Prototype-only | Superseded | Phase 1 | Conflicts (U) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1-D228 (230 ids with D149b), counted by hand, within about 3 | 230 | 46 | 17 | 128 | 15 | 15 | 9 |
| FOR-ARPIT calls 1-20 | 20 | 17 | 0 | 2 (19's D228, 20) | 0 | 0 | 1 (call 7) |
| FOR-ARPIT Q1-Q8 | 8 | 7 | 0 | 0 | 0 | 0 | 1 (Q7) |
| FOR-ARPIT section 4 rows | 13 | 5 | 8 | 0 | 0 | 0 | 0 |
| FOR-ARPIT section 6 items | 4 | 2 | 0 | 2 | 0 | 0 | 0 |
| R14 D1-D7 | 7 | 7 | 0 | 0 | 0 | 0 | 0 |
| Round 14's final review, R14R 1-9 | 9 | 5 | 1 | 0 | 0 | 0 | 3 |

The D counts are by the labels above, each id once by its main label; a conflict that is also superseded in part
counts as a conflict. U11 (the entity group) and U12 (a default's purity) have no single D id.
