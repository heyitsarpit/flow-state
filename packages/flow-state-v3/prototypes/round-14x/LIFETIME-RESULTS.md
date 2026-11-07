# Rule 73 on round 13's runtime: "a shared actor lives while it is used"

Status: **experiment.** This builds rule 73 and 2.7.17 as `machine-design.md` now writes them (decided, OD27, with Q1-Q5; C104-C111) on a copy
of round 13. It never becomes production code. Marks: [ran], [read], [reasoning].

## Commands and results (final tree) [ran]

| Gate | Command, from `packages/flow-state-v3/prototypes/conformance/` | Result |
| --- | --- | --- |
| Suite | `bun main.ts --round 14 --runtime ../round-14x/adapter.ts --no-search` | **774/774**; output alone 0; unlogged none; removed none; stale lock 0; catalog none; recipients as written; exit 0; peak 1.73 GB |
| Lock | the same with `--lock` | written after comparing, nothing unlogged |
| Round 13 on this suite | `… --runtime ../round-13/adapter.ts` | 758/774: the 13 LIFE cases throw (no uses), ORDER-01 has no `SendTargetAbsent`, REV7-M2 drops one input fewer, FRAG-15 differs by output |
| Lifetime falsify | `bun lifetime-falsify.ts --runtime ../round-14x/adapter.ts` | control 13/13; all 13 wrong runtimes red |
| falsify | `bun falsify.ts --runtime ../round-14x/adapter.ts --part suite1 / suite2 / suite3 / mutants` | each `ok` |
| Lies, targeted | `… --part lies` (`--parallel 8`) | 75 of 75 red on their recorded cases; none fell back to the whole suite; 254 s |

Baseline before any change: round 13, 761/761, lock clean.

## The runtime (round-14x vs round-13: +94 −1 lines)

- **`step.ts` (+80):**
  - `busy` counts mail and follow-ups for the actor, and a write lane whose head is not `Held` or that has waiting commits. Nothing else counts.
  - A level-triggered `lifetime` pass runs after every step, as dispatch does (D4). A counted actor with 0 uses that is not busy gets a `grace/<actor>` timer (`graceMs` = 100, React O3's), with the deadline as its generation, so no id is drawn. Any use or work disarms it.
  - `onGrace` disposes through the existing dispose, which keeps a persisted record and the Runtime's copy.
  - `onAttach` and `onRelease` change the count. An ensure puts a shared actor under the rule with 0 uses (OD27 Q2). A boot restores every shared actor at 0.
  - A send to an absent target restores it from the Runtime's copy and delivers after what the restore adopted. Otherwise it is dropped with `SendTargetAbsent { reason: "NotPersisted" }`.
  - Local actors are never counted.
- **`world.ts` (+11):** `World.uses`, the `grace` timer kind, `attach` (with `existing`) and `release` inputs, `Bounds.graceMs`.
- **`adapter.ts` (+3 −1):** `ensure` is a bare ensure; `attach` and `release` on the port; `dispose` is unchanged.
- **`driver.ts`:** unchanged from round 13. The first run's next-task sweep is gone.
- **`mutants-lifetime.ts`:** 13 wrong runtimes.

`disposeActor` and `forget` were not added: no case needs them (see below).

## The suite

- **`harness.ts`:** an `attach` step and a `release` step; `release` replaces `detach` (Story.release, Q4). `Instance.attach` may be `existing`-only.
- **`drive.ts`:** the suite's `ensure` step attaches the suite's own consumer, once per actor, because an ensure alone is no use (Q2). `release` and `dispose` end it. A reload re-attaches each held actor that has a record, as remounting components would: it attaches onto what the boot restored and ensures nothing. A send to a disposed persisted actor is a restore, not a ghost.
- **`broken-adapter.ts`:** `bogusIssue` breaks `attach` too.
- **`falsify.ts`:** a child's memory bound is 2,000 MB (it was 1,700). FRAG-15's search now reaches 4,067 harnesses instead of 3,306, because the grace timers and use counts make more states distinct. The suite peaks at 1.73 GB, under the user's 2 GB limit.

## Cases rewritten or deleted

- **No case was deleted, and the 22 that dispose a busy actor were not rewritten.** The design keeps Stories' `dispose(ref)`: "Rebind is `dispose()` then `ensure()`", and `dispose(ref, { how: "now" })` is `disposeActor`. Q4 says "`dispose(ref)` keeps its meaning". So the suite's `dispose` step has a public counterpart, the Story rebind, and those cases still test it. Rule 73 changes only what happens without it.
- **ORDER-01** sends to an absent, non-persisted `c3`. It now names `SendTargetAbsent` and reads `{ reason: "NotPersisted" }` (C105). It used to be silent `unbound` evidence.
- **REV7-M2/the-queue-has-a-bound:** `bootQueue` goes from 2 to 3. The re-attach at the reload takes a boot-queue slot, as a remount's would; it is still one drop.
- **FRAG-24 and R10-BOOT-ORDER** need no change. The dispose that waits on a slow load is the explicit rebind, and the re-attach happens before it.
- **The first run's mode C (69 reads after a reload)** is gone. The harness re-attaches what the suite had attached.
- **LIFE-01..05** were rewritten to the design (`release`, the grace, the narrowed use list). LIFE-05 was wrong in the first run: Notes is persisted. A parked ending is not a use, the actor goes, and the next incarnation's copy hears the ending once (rule 44).

## New cases (LIFE-06..10) and fail-then-pass [ran]

Expected results come from the design text, by hand. On round 13 each throws, because the runtime has no uses. On round-14x each is green, and each is red on at least one wrong runtime:

| Case | Pins | Red on |
| --- | --- | --- |
| LIFE-06 | a Held lane is no use: the actor goes, the hold is unbound, the next incarnation hears `unknown { Restored }` once | held-is-a-use |
| LIFE-07 | an armed schedule is no use: the actor goes, the record keeps the deadline, the overdue one fires once at restore | schedule-is-a-use, disposal-drops-record, restore-from-initial |
| LIFE-08 | a send during the grace is mail, so a use: the same incarnation hears it, and the grace starts over | mail-not-a-use, no-grace |
| LIFE-09 | a send to an absent non-persisted target is `SendTargetAbsent { NotPersisted }` and creates nothing | send-absent-silent |
| LIFE-10 | a pre-attach handle reads the Runtime's copy: no publication shows `initial` memory | restore-from-initial, disposal-drops-record |
| LIFE-04 (grace) | release, advance 99 ms, attach: the same incarnation; past 100 ms: disposed | no-grace |

Two more wrong runtimes, `ensure-is-a-use` (Q2) and `grace-never-ends`, each turn 12 cases red.

## How each update was handled

- **Q1:** `SendTargetAbsent` carries `reason`. Only `NotPersisted` is reachable: there are no lazy entries here (so never `NotAdopted`), and the Runtime's copy is held decoded (so never `RecordUndecodable`).
- **Q2:** a bare ensure is no use. The harness's `ensure` step attaches the suite's own consumer.
- **Q4:** `release` is its own input and step, and it disposes nothing. `dispose` is still the explicit rebind.
- **Q5** (Inspection's `uses` per actor): not built. The prototype counts consumers and computes `busy`; it has no subscription, context or pending-ensure kinds.
- **Restored actors start the grace from ready:** a boot puts them at 0 uses. The grace starts once their restored endings have turned, unless a consumer re-attaches.

## Under-specified, or wrong when built

1. **A persisted target with no record at all** (never created): none of the three reasons fits. I chose `NotPersisted`.
2. **"A send to a target that is disposing queues for its next incarnation"** has no window here: disposal is atomic in one step. During the grace the actor is live, and a send is mail, a use (LIFE-08). The clause needs a defined disposing phase, perhaps module or session teardown.
3. **What a remount after a reload does when the record is quarantined.** A real component would ensure and get a fresh actor. Thirteen quarantine cases (REV4-H3 ×12, HIGH-02), and six more by output, say "no actor until asked". I chose a re-attach that waits on an absent actor as a pending use and ensures nothing. That is close to a pre-attach handle, but 2.7.17 does not say whether such a handle creates the actor.
4. **Parked-for-path endings of a non-persisted shared actor at disposal.** Rule 44 makes an ending evidence "with no live actor incarnation" and no record. It does not say what happens to endings already parked while the actor was alive. Round 13 keeps them for the next incarnation; I left that unchanged and unpinned.
5. **The grace with no task boundary.** Strict Mode survives even a 0 ms grace here, because the timer fires in a later task (the `no-grace` mutant leaves LIFE-04's Strict Mode variant green). The 100 ms matters only for route changes.
6. **Stories' `dispose()` (the rebind) has no host counterpart.** Runtime O3 lists only `disposeActor` and `forget`. The suite's 22 busy-dispose cases test a Story-only step.
7. **Memory:** the grace timer and use counts enter the state hash, and a state-space search grows by about 23%. Excluding them from search hashing would be a design call.

## First run (superseded)

That run built the proposal before rule 73 was written:
- uses with a next-task sweep;
- work in progress that also counted schedules, kept fires, reads and parked endings;
- send-restores.

It found 22 cases that dispose a busy actor, 2 that dispose behind a slow load, and 69 reads after a reload with no re-attach. Commit `eea597fb`.
