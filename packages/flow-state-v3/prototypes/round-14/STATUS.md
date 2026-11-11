# Round 14 status

The round-14 prototype runtime: the reference implementation for production (prototype code, never production code itself). Full round history: `git show 36f5cb16:packages/flow-state-v3/prototypes/round-14/STATUS.md`

Summarised 2026-11-09 from the full file. Names marked "proposed" in the history are still proposals.

## How to run

Commands run from `conformance/` (the `../round-14/` paths are relative to it). Every command needs a time bound and no stdin.

- Suite: `bun main.ts --round 14 --runtime ../round-14/adapter.ts --no-search` (add `--lock` to check the lock; `--hashes` prints the lines the lock log needs; `--only X` runs one case or job).
- The lock (`expected.lock`, `expected-changes.log`): every changed id needs its own log line with its own reason; a reason may appear on at most 3 lines (each reason used once). D113 hashes every harness file, so editing any harness file shows as "unlogged expectation changes" until logged and relocked. Two top-level runs at once are unsupported (C2).
- Full gate: `bun gates.ts --runtime ../round-14/adapter.ts --round 14 --budget 580` (default budget 600 s). `conformance/gates.ts` is the one scheduler: 26 jobs plus the `lifetime-falsify coverage` row, longest first, at most 8 slots and `MACHINE_MB` 16,000 MB declared at once, each job under its own watchdog. Jobs run with `FLOW_DEFER_UNKNOWN=1`; a job the load starved is rerun alone; exit 1 when any job fails. `mutate-one` and `types-check` run alone, after the rest (both write into `typed/`).
- Individual gates:
  - `bun mutate-one.ts --runtime ../round-14/adapter.ts` (`--serial`, `--search`, `--search-only`).
  - `bun graph-gate.ts --runtime ../round-14/adapter.ts`.
  - `bun falsify.ts --runtime ../round-14/adapter.ts --part suite1|suite2|suite3|tamper|mutants|lies|search` (`lies --parallel 4`; `--lie NAME` for one).
  - `bun lifetime-falsify.ts` (`--mutants a,b` runs only the named wrong runtimes, a prefix matches; `--parallel N`; `--slice k/n`). gates.ts runs slices 1/2 and 2/2 plus the coverage row: the intersection of the two never-red lists must be empty.
  - `bun mutate.ts --parallel N` (N <= 8; one copy and watchdog per mutant, control first; `--rss-mb` default 2000).
  - `bun ../round-14/checks/*.ts`, `bun ../round-14/cli/main.ts` (CLI pins), `tsc -p round-14/typed/tsconfig.json`.
  - `plants/blackbox.ts --commit <sha> --side old|new --tree <dir>` (the verdict plants, old c73ad862 against new 817fead9) and the `verdict plants` job.
- Env flags: `FLOW_CANON_CHECK=1` and `FLOW_COPIES_CHECK=1` (the `suite canon` and `suite copies` jobs; slow, run once per pass), `FLOW_NO_FREEZE=1` (turns the in-place guard off, measurement only), `FLOW_ALONE=1` (serial inside), `FLOW_DEFER_UNKNOWN=1`.
- Verdicts: one reading of a child's run (`conformance/verdicts/`). Nothing scored is unknown, not fail (R1); a child that ends with no answer and no throw is unknown (E16); a time or clock kill is rerun once alone and only that answer counts; memory kill limit is 2x the measured reference (R2). Reference and kill limits live in `limits.ts` (`SUITE` peak 1,700 / kill 3,400 MB, `SUITE_PARENT` 3,800, `MUTANT` 4,200, `SCRIPT`, `PROGRAM`, `GATE_ROWS`).
- Time bounds: `WORK_PER_CALL` 100,000 (a case that reaches it is a `work-bound` FAIL, deterministic); falsify's searches 120 s each (`SEARCH`); mutate-one's in-process searches 270 s; suite 240 s per job; falsify search and lifetime-falsify slices each under a 290 s limit. Every final-commit gate is meant to finish inside 10 minutes.

Latest numbers (end of Stage A close-out, 2026-11-09):
- `bun gates.ts ... --budget 580`: exit 0, 27/27 ok, 0 BAD, 0 unknown, 574 s wall (near its 580 s budget).
- Suite `--lock`: 1080/1080, recipients observed 46,103, no red count moved. (The gates line also printed "suite 2163"; unclear what that counts.)
- lifetime-falsify: 401 pass; slices 1/2 (200 wrong runtimes) 143 s alone, 2/2 (199) 143 s; 145 and 149 s in one gates run. falsify search 186 s of 290; falsify mutants 16 (with `b5.quiet-mark-unshown` red); falsify search 51; CLI pins 71; front-check 104 pass.
- Search pins: `chain` 9,700 states `[1,12,111,995,8581]` budget 12,000; `queue` depth 12 budget 6,000 inconclusive (6,000 states, depth 7 complete); `fragstore.row` depth 7, 60,000-state budget, 48,833 states `[1,6,28,113,471,2037,8766,37411]`; `odd` and `session` at depth 3; SEARCH-SESSION re-pinned at 6,967 states (depth 4, budget 8,000); SEARCH-REPAIR 3,119 (depth 4); `listen.version` and `listen.none` run at depth 4 within 4,000 states in the gate.
- Machine: 12 cores / 24 GB. Suite alone about 18 s, peak 1.0-1.3 GB per suite process (target 600 MB missed; limiters DRV-01's 2,160 live harnesses, R10-RUNTIME's 110k-step log, JavaScriptCore RSS at 3-4x live heap).

Process rules learned:
- Write and edit files with the Write/Edit tools; `sed`, `perl -pi`, python one-offs and `cat >` slipped in several times and had to be read back.
- Never `git stash` (in a worktree it shares the main checkout's stash list and once popped the user's `stash@{0}`).
- Before a gate run, grep every mutants file for a line you edited: a runtime edit moves anchors in older wrong runtimes, and a wrong runtime that no longer applies shows as "0 red" (or GREEN in a scratch runner), not as an error.
- A record kept at ready (`fromBoot`) differs from a record that ended before the reload (`v.retired` on disk): only the first has boot mail; the second's restored endings park on the lane in the turn (`turn.ts`).
- The next area should raise `--budget` or move the depth-7 search into its own job (the last run used 574 of 580 s).

## File map (as the history names them)

The history gives no formal map; these are its mentions.
- Runtime (`round-14/`): `adapter.ts` (entry, Inspection `inspect`), `turn.ts` (turns, `leavesWork`, key-less members, `ofVersion`), `lane.ts` (lanes, `cancelAll`, `replaceHead`, `sameVersion`, `stampOf`, `ofIdentity`, `parkAtDisposal`/`endPastDisposal`), `step.ts` (`finishDisposal`, `onForget`, ensure), `durable.ts` (records, restore, flush, `upgraded`, `shapeReset`, `renamedOp`, `placeLanes`, `RECORD_FORMAT`), `entities.ts` (the entity store: queue, repair, judge, marks, `guarded`, `.covers`, `.gone`), `sessions.ts` (streams, `dropAt`, `last`/`heard`), `record.ts` (record codec), `driver.ts` (boot queue, D87), `gate.ts` (the seal), `mailq.ts`, `compile/` (`ref.ts` versions and formats, `memory.ts` creation checks and `ImpureDefault`, `entity.ts`, `machine.ts`, `body.ts`, `core.ts`), `codec/codec.ts`, `cli/` (`check.ts` rules, `explain.ts`, `story.ts`), `typed/` (typed fixtures, `type-tests.ts`), `fixtures/` (hand-compiled, `multiplex.ts`).
- Harness (`conformance/`): `main.ts` (entry) over `suite.ts` (library), `drive.ts` (oracles, ledgers: rule 17 `due`/`told`/`parkedOwed`, oracles (h), (j)), `harness.ts`, `ctx.ts`, `fake-world.ts`, `reference/model.ts`, `watch.ts`, `limits.ts`, `verdicts/{core,read,runner,snapshot,spawn,state,verdict}.ts`, `search/` (`run.ts`, `chain.search.ts`, `fragstore.search.ts`, `like.search.ts`, `session.search.ts`, `listen`), `scenarios/*.scenario.ts` (round15, phase1h, phase1e, phase1s, phase1m, frag, round4 ...), `plants/{plants,blackbox,reader-check}.ts`, `checks/` (front-check, types-check, mailq-check, score-check, search-vacuity ...), `mutate.ts`, `mutate-one.ts`, `mutants.ts`, `falsify.ts`, `lifetime-falsify.ts`, `gate5s.ts`, `graph-gate.ts`, `gates.ts`.

## Stated limits (still standing)

Harness and gates:
- R4 (watchdog, accepted): (a) a process in uninterruptible sleep is never reaped (10 s grace, then read as killed, `unreaped` shown); (b) a `setsid` grandchild born and reparented between two 40 ms polls is never in the tree; (c) on macOS a foreign SIGKILL in the same tick reads as ours. Each can only make a run unknown or a kill ours, never a pass.
- C2: the cross-process alone lock is gone; alone reruns serialise inside one top process only.
- In-place-write guard (0a): plain objects are frozen (a write throws), arrays are fingerprinted and found at replay, not at the write; class instances, Map, Set, Date and MailQ are not guarded; array non-index properties are not; SEARCH-* harnesses are never replayed.
- A resource errno inside the scenario rewraps (round5 :183, round7 :305, round8 :782, round12 :151) reads as that case's FAIL, not unknown.
- `mutate-one` search items pass on their pinned verdict; only `failed` or `vacuous` is a kill; `inconclusive` is a `search-budget` note. B9 and B14 plants and B2-old and B24 are not built.
- FRAG-15 and SEARCH-ODD-SMALL assert `[verdict, depthCompleted]` on state bounds (R3), no wall-clock deadline.
- Harness oracles that read the runtime's own report: `checkMints` excuses a mint by a runtime wait for `disabled` (`ModuleDisabled`, as `checkClaims`); `Superseded`/`AbandonedFiber` still close a send; `boot` still resets; `quarantined(actor)` excuses per actor, not per lane (audit M2 item 16); `off(actor)` excuses an edited actor for the whole case.
- Only root sends are read by the rule 14 re-entry oracle; timers, answers, follow-ups, raised events and fragments leave the old reading.
- The fake world dedupes by request key (Stripe semantics), which PostgREST does not; its `applications` and `charged` ledgers still key by request key under `dedupe: false`.
- The search reach pin applies to the control only (not `isTop`).

Runtime and design (decision ids as the history gives them):
- Not built: LIFE-19, 20 (Hydrate, dehydrate), 25 (records cliff), 26 (context providers) (OD31); J (typed entity API); the ending phase (`stopped` input) and `NotAdopted`; `ScheduleLeadsToWrite` (flow check); `IdentityFieldOptional`, the read-only input pin (OD30 Q5), `InputIgnored`; `orphaned`; the context half of `ConflictingActorRef` (C160; S:44; the prototype has no `context` on a definition); the restored quiet mark's `fields` (rule 38, D:1026); the `concurrency: "cancel"` rule 29 `flow check` error; key-equality adoption for typed ops; `previous` beyond `retry`, `retryable`, `cancel`; rule 74's "ends by forget" for an old-version record.
- Story `detach` and `dispose` exist in the suite's harness steps only; `EndedWithWork` and the end's record list schedules and reads, not activities or sessions; Inspection's `uses.busy` omits mailbox depth, waiting deadlines and the unencodable block; `soon` and `warned` are outside the state hash; E step 2 pinned for a commit's context only; G: `typed/lab.ts` and `typed/pay.ts` call `catchTag` through `as never`.
- D221/U17 version compare: a custom filter's change is no new version (only a check's `representation` id and payload join the compare); a transformation whose two sides stay the same is no new version. Format 0 (bare name) compares by names only.
- Lanes written before format 3 carry no identity stamp or contract and bind to any identity of their name; records before format 4 carry no shape and never reset (they decode field by field and quarantine if unreadable).
- Migration: a memory field rename is a drop plus an add (compatible; old value lost but for `FieldDropped`); computed initials are stored in the prototype, so a Schema change to one resets; `explain --since` compares two releases, not the chain a record went through, and needs the deployed release's compiled data; shape stamps are compared raw across a format bump (latent, one format); a pure, deterministic transform cannot be enforced by Flow (an impure one breaks S11 replay).
- An old identity's unknown hold has no user exit: `cancel` reaches only the current identity's lanes and `forget` keeps holds whose op the release still has (Q17 area).
- Lane-per-operation in the runtime against 2.7.15's lane per contract: equal on every legal machine because two write ops on one contract is a `SharedContract` declaration error (B2, the lead's call).
- Rule 15 check `Rule15LateLeaves` is strict, reads only this op's lane and only `serialize`/`latest` writes (R8).
- `GuardContradicted` under-detects across a reload and is a tripwire, never a verification (rule 4.6); the CI probe is owed (`revisit.md`).
- A quiet given-up mark persists as long as the store (no eviction beyond the 4,096 cap, `UnsettledEvicted`); a quiet removal doubt shows nothing.
- Zero rows from a PostgREST `update` cannot be split into version, RLS or missing (`.gone` is by tag, never status).
- EventSource recipe: `open` alone does not register, so a quiet reconnect stays `Connecting` (the stated cost, 2.11.12.8); a rule 71 bad bookmark that is saved wrong and never resumed from is invisible to the wire check.
- Rule 15 lateness is enforced by the runtime's turn structure (`runTurn` drops the late flag before members run), not a check.
- M1 (CP7): the woken-at-ready D1 case edits the disk (LIFE-28 walk with the end landed); no fixture reaches an ended record also owed a parked ending.
- Record format 1 untouched lane is not rewritten (D111); the one bounded exception is Q20's `tx.rewrites`.

## Carried to the phase 3 conformance rewrite

Harness and gates:
- C1, the errno rule: catch sites that rewrap lose the code; reader-check needs recursive rules for them.
- C3, plant reasons and preconditions: B12a, B17 on old, the B15 race, the B11/B4/B9 reasons, the B5 119 and K numbers.
- `bare`'s depth-12 search budget (pinned inconclusive at 3,000 states).
- work-peak re-measured for the current search configurations.
- Search oracles that keep history outside the state hash (`deliveredOnce`, `keptNames`, `endedAgain`): a verdict depends on path order; read only what the hash carries, or add the history to the key.
- Stated OS limits above (uninterruptible sleep, `setsid` between polls, a foreign SIGKILL, ResolveMessage EMFILE).
- Partly-blind evidence and leftovers when `ps` fails; the `search-budget`/`search-reach` notes listed in mutate.ts's output.
- Migration ran against Flow's own record in the fake store, not a real storage API shape (IndexedDB structured clone, `localStorage` string): run it against a real store adapter.
- `listen.none` at depth 7 was inconclusive at a 200,000-state budget (251 s, no failure); the gate runs it at depth 4 within 4,000 states. A depth-7 completion needs a budget no gate's bound allows. (`listen.version` completes at depth 7 in 110,726 states, 159 s, but stays at depth 4 in the gate.)
- Harness excuses per actor, not per lane (audit M2 item 16, M1 finding 6).
- Weak cases, the rule built: C202's eviction by last write is not told apart from creation order (phase1s 252-266, 517-534); C168's restore after a crash before the removal ack has no case; C166's live-admission throw is tested on the reload path only (fixpass 202-214); C184's assertion checks only a non-empty message (phase1h 98-99); jitter determinism is checked only through replay; rule 70's wait per operation (below).
- Round7/8/9/9b literal lane and actor key templates (about 40 assertions; `ctx.ts` says a case naming a key pins the format).
- Entities (each needs a combination the suite does not build; wrong runtime named):
  - `a3b.resend-behind-settled` (rule 30: a settled hold's re-send while another settled hold is ahead must wait only behind live holders).
  - `a3b.keyed-from-first-entity` (two entities with different key fields, e.g. Ticket by `id`, Queue by `slug`).
  - `a3b.restored-counts-unsent` (rule 31: a restored guarded write's re-send succeeding over a stale base is no `GuardContradicted`, its `known` kept).
  - `a3b.keyed-cancel-names-the-ending` (rule 43: a keyed `cancel(k)` in an ending's handler names another key's lane). Its mutant in `mutants-audit-3b.ts` is anchored on a replaced line.
  - `audit-2.covers-ended-remembers` (Q3 A: a no-`.covers` session that ends forgets what it delivered).
  - `audit-2.rebase-any-base` (Q5 A: rebase only over the same base).
  - `1b.r15-lateness-transitive` (vacuous as written; re-express as `a2.lateness-transitive` reads it).
- Streams: T3's 256-entry bound across two operations (one operation's keys must not evict another's; needs two operations under `subscribe.each`); rule 70's wait per operation (two operations on one contract and key, one releasing, the other opening must not wait; needs a key change on one of two keyed operations); two writes that re-create an evicted entry (a Reset's notice admission, a value's move) take `filled: false`, not the field, against T3 (no case yet).
- Design items not built (Stage A close-out m7, m8, B3; also in `revisit.md` "Phase 3 carry list"): the not-built list above, plus the `SharedContract` "two placements of one writing fragment" case (a Compiled carries one op set per fragment; compile's `DuplicateOperation` refuses first), the widened `SharedContract` warning for `key: []` on a placement whose path is not empty (rule 51), and rule 13's `byReason` keys outside Flow's reasons (commit unknown tags are type-level; `unknownWhenLost` erases them, so only a never-unknown key is refused; front-check pins `NoResponse` compiling).
- Migration: a crash between the batch writing a moved lane under its new name and the batch deleting the old (an awaited write skips the old name's removal, `durable.ts` `flush`) leaves both on disk; the next boot moves the old onto the new name with no collision check.
- `forget`'s `goneOp` (step.ts) parses a quarantined lane's raw text without `upgraded`: a newer-format lane naming an op this release lacks could be dropped with `HoldForgotten`.
- U8: the boot-queue bound is tested at only two points (one `bootQueue: 3`, one `bootMs`); `structure`'s `seen.delete` has no mutant (no fixture has a shared Schema node inside one field).
- Production should tag formats from its first release (R7 finding: an untagged writer reads as format 1; a saved format newer than the running Flow is an old version for a version entry but quarantine for a whole record).

## Open findings and questions

No user question is left open in this file: `ENTITIES-QUESTIONS.md` (all A), `STREAMS-QUESTIONS.md` (Q1 `Feed.multiplex`, Q2 `FillsOtherKey`, built) and `MIGRATION-QUESTIONS.md` (Q1 answered A: automatic per definition, no manual version) are answered. The design-text items below were recorded for the plan merge; the file does not say they were merged, so verify against `machine-design.md` before keeping any.

Open for the design (runner or user):
- M4 call 2 (rule 73 as merged): a `Held` lane, with or without waiting commits, keeps nothing, so a Held offline write is not woken at ready and its waiting commits' `NotSent { Restored }` are not owed (R14-FIX-02). The design may change this.
- L4: `RestoreDiscarded` and `RecordUndecodable` name one event from two sides; the design should keep one name.
- Rule 17 names "every commit ends once"; 2.7.11's storage-refused re-send delivers a second ending for one Attempt (`unknown { StorageRefused }`). Name it in rule 17's text.
- Whether a re-entering self-transition (`target: self-state`) gives a new activation is load-bearing for rules 14 and 15; state it with them.
- The send table's "ended, persisted, record decodes: restored" applies after a dispose whose removal never landed (D80): a disposed identity can come back by a plain send after a crash. Say so where `disposeActor` is described.
- Rule 8's "refused turn" covers a refusal at admission (the outcome mapper throws); say so in 2.5 step 1.
- A stranded read, and a kept ending's one try per boot, leave no evidence when they go or are retried; name "stranded read released" and a refused kept try in Inspection or evidence.
- D77 is checked twice (`sealOp`'s `known` and `checkSlots`); keep both or drop one (no single-edit fault is visible).
- 2.7.13 row "Runtime disposal" contradicts itself on past-bound `unknown { Disposed }` vs a captured `InFlight` record restoring as `Restored`; built: both, by whether the kill precedes the final capture (finding 18). The row should say the head stays Held on disk with its `Disposed` ending parked. Rule 8, 2.5 and "no module starts work once disposal starts" (O6) should bind modules too, or the Module seam carry it.
- Rule 15: the lateness clause rests on turn structure (above); under `serialize`, `[cancel, cancel]` or a stay-put alternative is how a late ending gives work up (`flow check` could say so).
- 2.7.13/2.7.15 conflict with reset-at-boot and lack the new events (`RecordShapeChanged`, `FieldDropped`, `HoldWithoutRecord`, `OldVersionLane`) and `flow explain --since` (item 23); whether a field rename should reset ("incompatible" is a kept field under another Schema version, or a saved state or fragment gone).
- `HeldThisTurn` under `cancel`: say what a refused turn does (hold kept across the retry, kept ending after the second refusal).
- Rule 24 (refused ack under a waiting `latest` replacement) says `NotSent { StorageRefused }`; the table and R6 say `Superseded`.
- Live `cancelAll` order (queued commits' `NotSent { Cancelled }` first, the interrupted head's unknown last, R5) is the build's, not stated in rule 44.
- 2.2.2's "a default is evaluated per door, never computed once" cannot be observed under U12 B (a pure default is one value): keep as implementation freedom or drop.
- `previous[i].retryable` exists (ruled); duplicate `previous` entries are not refused.
- Streams: T5 and T1 disagree on `Waiting` (T5 sets `last` on a value, T1 discards a Waiting session's frames); which age a never-live connection's value has after `Connecting` then `down` (built: from `dropAt`, a registration ends the not-live period, C205); T3 "oldest out" built as last write; docs should say why `onopen` is not used, that an id-less EventSource message repeats the browser's last id, that a named event needs `addEventListener`, that a multiplexed key is registered once per server subscription (hub replays `Feed.live` to a late member), and that the `Feed.multiplex` hub lives in the app's Layer (one per page).
- Entities: `entity({ primaryKey })` and `idempotency` (C129) are data the prototype sets by hand in places; `targets` is new `Compiled` data; the readout should leave key fields out; a version field still gets a cell at a gap; `.gone` needs `.byKey` (flow check `GoneWithoutKey`).
- Record format: rule 74's "a format newer than the running Flow reads as an old version" is for a version entry; a whole record is quarantined. `dropAt` is kept with a `latest` bookmark (C205).
- A re-key (Q17's tag, a rename) is persisted only once the lane is written; the `forget` sentence in 2.7.13 should drop `forget` or say "for the lanes forget removes"; `forget` makes only a record's boot-queued endings evidence, other boot mail goes silently as `disposeActor` drops it (D6).

## Standing wrong-runtime files and gates

Each is a list of one-edit (occasionally two-edit) wrong runtimes spread into `mutants-lifetime.ts` (run by `lifetime-falsify`, each red on a named target case by assertion, a few by oracle (j)). `mutants.ts` (mutate.ts's list, slices of 16; list rot on `drain-not-waited`, `h2-json-only`) and `falsify.ts`'s lies are separate. `mutants-audit-*.ts` are the auditors' own, unedited.
- `mutants-lifetime.ts`: the main list (LIFE cases, `o6.*`, `d1.*`, `d3.*`, `m3.*`, `m4.*`, `m5.*`, `l1.*`, `id.*`, `boot.*`); control must be green and every case red on a target.
- `mutants-lifetime-pay16.ts`, `-pins-a.ts`, `-pins-b.ts`, `-misc.ts`: the 34 never-red cases (PAY-16 x12, REV8-PINS x18, FRAG-08, REV5-H5H6, LIFE-04, LIFE-24); `misc.*` also covers rule 15 queued-commit and rule 17 fragstore cases.
- `mutants-r15.ts`, `mutants-r15d.ts`: round 15 and 15b (rule 15 exemption, U13 disposal, U14 unbound lanes, U2 key-less cancel, U3 order, U8 boot queue, U17 versions and formats, `cancelAll`, `cancel` concurrency, `forget`, persist default, O2 local, O6 modules, reserved reasons).
- `mutants-p1h.ts`: phase 1 H (H1 `ImpureDefault`, H2 key versions, M2 old-version declines, R5-R12).
- `mutants-p1e.ts`, `mutants-a1.ts`, `mutants-a2.ts`, `mutants-a3.ts`, `mutants-audit-1.ts`, `-audit-1b.ts`, `-audit-2.ts`, `-audit-3.ts`, `-audit-3b.ts`: entities (D3 join, U10 marks, `guarded`, `.covers`, `.gone`, `delta`/`row`, `basedOn` rebase, repair count, rule 30 record release, rule 35 many bound, cap) and the audits of rounds 14-15b.
- `mutants-p1s.ts`, `mutants-as1.ts`, `mutants-as1b.ts` (with `mutants-audit-s1.ts`, `-audit-s1b.ts`): streams (identity with key, `each`, `IdleWithoutPing`, `last`/`heard`, `dropAt`, T3 bound, backoff and jitter, `Feed.multiplex`, EventSource, `FillsOtherKey`, `SelectedNoKey`).
- `mutants-p1m.ts`, `mutants-am1.ts`, `mutants-am2.ts` (with `mutants-audit-m1.ts`, `-audit-m2.ts`): record migration (`previous`, record formats 2-4, `RecordShapeChanged`, `FieldDropped`, `HoldWithoutRecord`, op rename, identity tags, Q17-Q20, `q1a.*`, `od53.*`).
- `mutants-closeout.ts`: stage A close-out (`b1.*` for the repair count, B1).
- Older anchored lists (`mutants-r5/r6/r8/r9.ts`): not all run by a gate; `mutants-r8.ts` `durable.saved-with-stamp` and `durable.memory-decode-failure-ignored` are anchored on lines since changed and left unedited.
- `falsify.ts` lies (81+ lies, 4 slices; e.g. `k.ghost-life`, `lie.dispose-start`, `lie.boot-says-disposed`, `lie.boot-drops-held`, `lie.held-released-unguarded`, `lie.self-release-faked`, `lie.turn-end-after-a-resend`, `lie.latest-as-cancel-by-name`, `lie.fake-newer-mint-under-cancel`, `lie.s1.*`, `lie.m1.quarantine-beside-old-hold`, `w.patch-in-place`, `w.row-in-place`): each must be red by a named oracle; `SEARCH_KILLS` holds the search kills (`s13.older-sent-after-newer`, `drain.old-base-wins`, `drain.uncertain-forever`, `drain.row-hidden`, `drain.row-empty`, `r71.bookmark-ahead`, `lie:s1b.r70-input-nonce`, `lie:s1b.r71-hidden-mark`, `lie:s1b.r71-any-epoch`, `lie:s1c.repair-wedge-says-inflight`, `b5.quiet-mark-unshown`).
- lifetime-falsify's case list includes `R15-01`..`03`, `REV7-M2`, `REV7-M8`, `P1-H`, `P1-E` (not `P1-E-CAP`, 6 s a run), `P1-S`, `P1-M`, `R13-KEYS`, `SURV-05`, `DRV-03`, `LIKE-03/05/06`.
- Plants: `plants/plants.ts` (73 standing items, green) and `plants/blackbox.ts` (Old 28/28, New 31/31 ok), `plants/reader-check.ts` (S1: green on the new tree, 179 findings on c73ad862's).
