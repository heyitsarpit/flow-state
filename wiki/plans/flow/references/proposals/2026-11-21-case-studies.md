---
review case-studies
status open 2026-11-21
---
# Case studies: where schedules, record trust and type safety got stuck (2026-11-21)

**Bottom line:** in all three cases the algorithm was the root cause, and in the first two the process let it survive
four review rounds. Each design let a store hold a contradiction: schedules stored an issue apart from the timer state
it reported on, and records stored identity twice and spread one Attempt over separate records. Each fix removed one
contradiction the latest review had built, and the next review built another. The process caught every one before
release, so it worked as a net. It failed as a gate in three ways: building started before any state inventory existed,
the test alphabets came from bugs already found instead of from the state, and "convergence" was done by the same lead
within 14 to 74 minutes of the review that triggered it, so it gathered the checks into one place without removing
the freedom. The user's diagnosis (process mostly right, algorithms wrong) holds for the reviews and the failure
limit. It does not hold for the order of work or the oracles: section 4 lists what to keep and what to change.
The type case (section 3) is the same freedom in types: a type Flow holds is dropped at `machine()` and at `Compiled`,
then written again by hand (42 annotated mappers, 41 production casts), so a fact has two sources. It differs in
one way: T104's carrier-by-carrier fix converged (four blocking findings, four, then PASS), while what no seam
carries (the body's schedules, the snapshot, hand copies) is still open: 7 gaps (3.4).

Everything here is a finding or a proposal; nothing is decided. It is written for the leads of
@proposal.algorithm-round (section 4's process notes).

## Conventions

- Times are UTC. Commits are on `flow-rewrite` unless named. Compaction removed the review texts from the live
  records: T57's are in `git show 3a84b878:wiki/tasks/V3/P4.task` (about lines 566-1342), T20's in
  `git show 1faeec1ea:wiki/tasks/V3/P3.task` (lines 603-1105) and T92's in `git show d92e802f:wiki/tasks/V3/P4.task`
  (lines 663-1210).
- T104's review texts are in `git show 3a84b878:wiki/tasks/V3/P4.task` (about lines 4240-5010). Type-case counts
  are `rg` and `git grep` runs at HEAD `dcf8f2b2`; each says what it counted.
- "Missed because" quotes the reviewer's reason the tests missed a finding (the Epic's R17 rule).

## 1. Schedules: T57 to T118

### 1.1 What it set out to do

@task.V3.T57 built the remaining schedule forms: `paused` with named reasons, keyed timers, `armOn` and `disarmOn`
by token, Effect Schedules stepped by the host, and a computed negative delay treated as zero. Its own False pass
line predicted the trap: "a schedule tested only with one key or one pause reason". It ran from requirements
(2026-11-20T08:10Z) to the failure limit (15:15Z), about seven hours.

### 1.2 Round by round

| Round                          | Found                                                                | Changed                                              | Why it did not hold                                                  |
| ------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| Requirements review (08:32Z)   | B1-B7: restore re-runs a series, made-up firings, no 2^31 step rule  | Red at `5a65b35a`, built at `986337d3`               | Held. The algorithm was designed during the build, as "calls"        |
| Lead self-review (10:00Z)      | Keyed `disarmOn` stopped nothing; a throwing step killed the Runtime | Fixed at `0595ecc6`                                  | Each one a new case; evaluation order spread over passes             |
| Close review 1 (10:28Z)        | Disarm vs restart in one turn; `tests/rules/records.ts:35` vacuous   | `100d2a34`: disarm wins, owed checks, `recoveredBy`  | `recoveredBy` was itself wrong (next row)                            |
| Close review 2 (11:47Z)        | B1 restart while held with a throwing reason runs; B2 issue cleared  | Convergence: table `a5590157` (1,926 rows, 817 red)  | The table covered one occasion and one key                           |
|                                | by a check that never ran; B3 three R12 Stories still `it.fails`     | One `decide` per occasion, `d5a4f7b5`, `59938df6`    | Issues were still stored and rebuilt; the blind redesign was skipped |
| Close review 3 (13:22Z)        | B1 an idle timer forgets its reasons; B2 one key's firing clears     | `53a6ce47`: `decide` owns issues by schedule and key | One writer per occasion is not one owner over time                   |
|                                | another key's issue (four issue writers outside `decide`)            | Idle reasons saved; second-key table                 |                                                                      |
| Close review 4 (`108d00cf`)    | B1 a hold restored without `paused` stays held forever; B2 an arming | Failure limit (15:15Z); the user moves both to T118  | Same class: a stored residue forgets or keeps a condition wrongly    |
|                                | issue replaced by another check's throw, then cleared                | T57 done at `02130bfc`                               |                                                                      |
| T118 requirements (`cb96125f`) | A reload after a `restartOn` throw loses a firing (no baseline       | Rulings `91f9fd01`: save the baseline (format 6);    | Open: the rulings are not built and the oracle still encodes the old |
|                                | saved); `it.fails` lets every row stay red                           | no `it.fails` in schedule tests                      | rule (1.4)                                                           |

### 1.3 Root cause

The freedom: a lasting condition (this timer is unarmed, this check is failing) was stored as the residue of the
event that began it, in `Incarnation.issues` beside the timers. Every later occasion then had to rebuild, from that
occasion alone, whether each old residue still stood (`issuesAfter`). @proposal.schedule-issues section 1 names it
"one rule implemented twice" on top of "several writers to one state". A second freedom fed it: facts a later
decision reads were not saved (idle `pausedBy` until `53a6ce47`; the `restartOn` baseline still), so a reload
rebuilt them from nothing.

Why one fix could not close it: each round improved the rebuild by one dimension (clear only slots that ran, key
the slot, one writer per occasion) and kept the rebuild. The tables tested one occasion, and the class exists only
across occasions and reloads, so no table row could show it. T118's three-step sequence test, which spans
occasions and reloads, found seven red classes in one run (`c7635b2a`).

### 1.4 What finally changed, and what is open

The user accepted Fable's redesign (@proposal.schedule-issues, adopted at `12646df8`): no stored schedule issue;
each timer holds its checks' last outcomes (`Checked`) and an explicit `Arming` union with `Refused`; issues are read
from them. @task.V3.T118 carries it. The sequence test and T57's B1 and B2 are landed inverted; the build has not
started. Open, from @review.algorithm-review section 1.6: S-1 (the saved baseline has no codec or restore rule),
S-2 (what a re-entered activation inherits), S-3 (a fresh timer's first `restartOn` throw), S-4 (three writers of
`arming` outside `decide`), S-5, S-7, S-8. The oracle encodes the overturned rule: `tests/turn/schedule-ledger.ts`
lines 188-195 drop every baseline at restore "since none is saved", so the 365 red rows test the old rule.

### 1.5 Process view

- **Caught:** every bug, before release. Each review replayed its finding as a scratch Story, red for the stated
  reason. Planted faults were caught by `faults --only`. Blind table derivations agreed on 33 of 38 and 33 of 36
  rows; the T118 blind derivation found the issue-order gap (16:01:46Z).
- **Missed, and why:**
  - One-occasion alphabet. Review 3's B2 was "missed because the table has one key and reads only the first timer";
    review 4's B1 because the restore-after-edit cases "never remove pause reasons", and its B2 because "both tables
    are one occasion". The table's axes came from the round-2 findings (same-turn inputs), not from the state.
  - Weak assertions. The heater test "asserts one issue, not its slot" (review 2 B1). `tests/rules/records.ts:35`
    accepted any object, so Codec I7 never failed (review 1). The Ring test cannot tell a refused turn from a
    committed one (review 3).
  - `it.fails` passes on any failure (T118 Blocking 2), a defect already routed on 2026-11-16 in T20's P2 note.
  - The oracle is a 375-line second model, not the promised five-line ledger, and it was not updated when a ruling
    changed the rule (@review.algorithm-review section 1.4).
  - The Spec as oracle moved under the build: Turn R14's "a bad computed delay refuses the turn" was rewritten to
    the build's behaviour after review 3 (13:23:17Z ruling). Done with two traces, so defensible, but it shows the
    Spec was not yet a design.
  - Convergence skipped policy-convergence's blind redesign (13:01:14Z: "the user's ruling fixed the structure"),
    and review 3 flagged the skip. The state inventory came only in fix round 4 (13:28:25Z), after convergence.
- **Algorithm, process, or both:** both, with the algorithm first. Evidence for the algorithm: the bug list
  stopped growing only when the stored residue went (SI); T118's state inventory at its start (16:01:46Z) named the
  freedom in one comment. Evidence for the process: no step required that inventory before the build (`986337d3`
  carries the algorithm as "calls, each reversible"), and the convergence step that should have forced a fresh
  design was skipped.

### 1.6 Lessons for an algorithm designer

1. **Inventory before code.** For every state, list each writer across all occasions over time, not per occasion.
   Check: the design names one writing function per field. (T57's inventory came after convergence; T118's,
   written first, found the freedom at once.)
2. **Never store what you can derive.** A condition that lasts belongs to state that lasts; a report of it is a
   view. Check: no saved or stored field is a function of other fields plus the definition. (`Incarnation.issues`.)
3. **List every fact a later decision reads and say how it survives a reload:** saved with a codec, or re-derived.
   Check: one row per read in the state inventory. (Idle `pausedBy`, `53a6ce47`; the `restartOn` baseline, T118
   Blocking 1; a held run under a build without `paused`, review 4 B1.)
4. **Check across occasions.** The exhaustive check's alphabet includes reload, definition edit and at least two
   instances, taken from the inventory. Check: every writer and every occasion appears in the alphabet. (The one-key,
   one-occasion table at `a5590157` against T118's sequence test.)
5. **Keep the oracle independent and small.** State invariants (owed implies armed or an issue shows) apart from any
   model, and update the oracle before the code when a ruling changes a rule. (`schedule-ledger.ts:188-195`.)
6. **Converge by removing the freedom, not by gathering code.** Check: name the freedom and show the type that can
   no longer express it. (`d5a4f7b5` put every pass in one `decide` but kept the stored issues; it failed twice.)

## 2. Record trust: T20 to T92

### 2.1 What it set out to do

@task.V3.T20 built restore: reload, owed endings delivered at boot, record format tags, quarantine of unreadable
records and `forget`. Its trust work, from the 2026-11-18 resume, required that a record under a bad name or key
is quarantined and reported, never started. @task.V3.T92 followed: decode saved records through Schemas built from
the compiled app, with branded identifiers, each fact stored once, and a generated corrupt-one-field test.

### 2.2 Round by round

T20 had two classes. The first, record size bounds, ran 2026-11-16: review `9fcf63a2` found a hang (a commit
admitted on its input alone withholds its identity), fix `873bd680`, review `70472fdb` found the next growth path
(a head going Held adds a byte). Convergence named the class "a record's bound is judged once, at one moment,
while the record keeps changing" and built `88de0f6a`. The user then dropped the caps (D23 to D26, `51a8270eb`,
`12730fd21`); cutting scope closed the class.

The second class, trust, ran 2026-11-18, each fix 15 to 20 minutes after its review:

| Round                       | Found                                                                   | Changed                                         | Why it did not hold                                  |
| --------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| Review `17ec5c6db` (05:36Z) | `decodeName` passes any `~` name, so local-named records restore        | `5a06cfd36`: `~` refused, rule WriteAhead I3    | Fixed one name shape; "samples two name shapes only" |
| Review `593610836` (06:06Z) | Nothing compares a record's key with the name inside it                 | Convergence `7ff639758` (06:20Z): one           | One check function, still a hand list of fields      |
|                             | ("every fixture record's key equals its content name")                  | `identityIn` check in `decodeRecords`           |                                                      |
| Review `2e211305b` (06:34Z) | Lane key text unchecked (dropping both lane checks passes the suite);   | `bcdaef15b`: a field list, one plant each       | The list was of fields someone thought of            |
|                             | undeclared-machine owed rows; the reload sweep compares skips with      |                                                 |                                                      |
|                             | themselves                                                              |                                                 |                                                      |
| Review `8c0446d9a` (07:05Z) | Context bindings name identities the boot creates, unchecked            | Failure limit, stop `04d55c1c8`                 | A body field, not on the list                        |
| T92 requirements `9d885613` | 7 blocking: corrupt-one-field mutates content, never keys; no null or   | Fix round `1d2e1566`, build `60627ca2`          | The generator inherited the hand list's blind spots  |
|                             | type swap; exemptions wider than the held class                         | (format 4, branded Schemas)                     |                                                      |
| Close review `01a3eb6c`     | 4 blocking: main's record under the guest key restores as guest;        | Fix round `59dff388`                            | Each a contradiction format 4 could still hold       |
|                             | repeated owed rows double an ending; Spec text left losing              |                                                 |                                                      |
| Fix review `759785f6`       | A lane-less owed row with an Attempt makes up an ending; a deep         | Convergence `6c729dbf` (red), `bf18e67f`:       | Per-row: validity also spans rows and records        |
|                             | format-1 record stops the boot                                          | one tagged Schema per row kind, encode = decode |                                                      |
| Close review `2edcb74b`     | A definite ending followed by another row of the same Attempt boots and | Failure limit, `d92e802f`; deferred             | "One Attempt, ended once" is a boot-wide fact        |
|                             | delivers both (WriteLanes I16)                                          | (`cd564c30`)                                    |                                                      |

### 2.3 Root cause

The freedom: the record format could hold contradictions, and what counted as valid was defined by the reader's
checks rather than by what the writer emits. Identity was stored in both key and content; one Attempt's facts were
split between its lane record and owed rows; the decode accepted shapes and then checked meaning by hand
(`machine`, `name`, `operation`, `lane` were `Schema.String`, T92's description). Every review forged one more
contradiction the format could hold and the checks did not list.

Why one fix could not close it: a list of forbidden cases is never complete; only a list of allowed ones is. The
convergence at `bf18e67f` made that switch per row (decode accepts only what an encode produces), the right idea
at the wrong scope: the last finding was an order of two rows of one Attempt, and T92's 07:01:26Z trap notes that a
per-record decode cannot tell an Answered success beside a Held head. Validity is a relation over the whole store.
Under that, no threat model was decided: "forged-but-valid" records stayed `it.fails` pending the user's ruling
(07:01:28Z), so reviewers could forge without bound.

### 2.4 What finally changed, and what is open

T20 closed with the bindings blocker parked as an inverted Restore R5 test (`1faeec1ea`, done `7fa5f34b3`). T92's
format 4 is on branch `t92-format-4` (tip `d92e802f`, 55 package files, +4,019/-934 against `fef46251`); the user
deferred it and `cd564c30` restored code and Specs to `fef46251` (log note 2026-11-19T00:38:20Z). The branch is an
ancestor of `flow-rewrite`, so it is history, not pending work. Its 07:01:22Z comment says the next attempt
"questions the record format itself (eliminate contradictory states by structure)". Open: one `Identity` parser,
`AttemptId` and lane-id brands, the never-ending read-operation lane, the threat model (Restore Q4), a boot-wide
"one Attempt, ended once" check, and an encode-decode round-trip test (Codec I7 claims round-trip; none exists).
The Fable consult on trust boundaries (records with @task.V3.T98's public values) waits.

### 2.5 Process view

- **Caught:** every finding replayed red in a scratch Story; blind sidecars found T92's blocking items (the
  lane-less row, the deep record, the ending-then-row). The failure limit stopped two patch loops.
- **Missed, and why:**
  - Hand-picked samples. Each "missed because" names a dimension no sample varied: two name shapes; keys always
    equal to content names; no lane records in `shop/borrowed-records`; no forged body field. Each was fixed by
    adding that one dimension.
  - The generator had the same blind spot. The corrupt-one-field test mutated content, never keys, with no nulls or
    type swaps (T92 requirements B2, B3), and one row at a time, never combinations (close review 3).
  - Vacuous checks. The double-reload sweep "compares the skips with themselves" (`2e211305b` B-3). Restore R5's
    `it.fails` "passes on any failure". A planted fault was equivalent twice (T20 05:17:51Z; T92 07:01:26Z).
  - Exemptions widened on weak evidence: the held class was widened citing `src/host/ledger.test.ts`, which did not
    support it (close review 1, finding 2).
  - The Spec as oracle: Codec I7 encoded a bug (`mayHaveApplied`, T20's Risk); T92's Spec edits left losing text
    in two reviews.
  - Convergence came fast and from the same lead: 14 minutes in T20 (06:06Z to 06:20Z), 33 in T92 (23:36Z to
    00:09Z).
- **Algorithm, process, or both:** both, with the algorithm first. The format allowed contradictions, and a check
  cannot close a set that has no edge. The process gap was upstream: no threat model and no list of the shapes the
  writers emit before the build, so reviews served as the specification, one forgery at a time.

### 2.6 Lessons for an algorithm designer

1. **Define the valid store from the writers.** List every shape each writer emits and every relation between
   records; the decode accepts exactly those. Check: the decode Schema is the encode Schema. (`bf18e67f`, reached
   only at the sixth review.)
2. **Store each fact once.** Check: no field is determined by the key or by another record. (Identity in key and
   content: `593610836`; the guest-cart rename, `01a3eb6c`.)
3. **State store-wide invariants and check them where the whole store is visible.** Check: each invariant names
   the scope that sees it: one row, one record, or the boot. ("One Attempt, ended once", `2edcb74b`.)
4. **Decide the fault model before the design:** torn write, older release, hand edit, or forgery, and which ones
   must quarantine. Check: a section naming each with its outcome. (Restore Q4, still held at the stop.)
5. **Mutate along every axis.** A generated corruption test mutates keys as well as content, nulls, type swaps, row
   order and cross-record pairs. Check: the mutation list is derived from the format, not from past findings. (T92
   requirements B2 and B3; close review 3.)
6. **Weigh cutting scope.** When a class recurs on a feature without a real-world need, cut the feature. (Record
   caps, D23 to D26.)

## 3. Type safety: T68 to T113

### 3.1 What it set out to do

The user made type safety part of every algorithm design: the whole package type safe and cohesive, every type
derived from what it depends on, so a user cannot meet a partial or hand-written type. @task.V3.T104 states the
goal for what crosses a module seam: every type "is as narrow as what the producer holds, so a typo or a wrong value
fails to compile", and every cast is removed or kept as a verified boundary. @task.V3.T113 states it for user code:
"no handler, fragment, helper, mapper or snapshot read types an event, memory, ending or key by hand". The work ran
in three pieces: T68's compile-time promises (2026-11-16), T104 (2026-11-19 to 2026-11-20, 46 commits name it) and
T113 (draft, nothing built). Section 3.4 lists what is still open.

### 3.2 Round by round

Each line is a Task, review or spike: found; changed; why it did or did not hold. Times are the Task comments' UTC.

1. **T68 (`547e1062`, 2026-11-16).** Found: type-error promises had no check. Changed: `definition.compile.ts` and
   `machine.compile.ts`. Held for the promises listed and no further: the cases came from promises, not from the
   types that cross each seam.
2. **T103 (`424085b2`, 2026-11-19).** Typed `read(ref)` as `Snapshot<D>`. The user then found `snapshot.operations`
   untyped beside typed state and memory, and an amendment followed (`4050c5b4`, 13:15Z). Did not hold: one field at a
   time; the next untyped field was found by the user, not by a check.
3. **Two surveys (`67342b56`, `9ea8144d`, 2026-11-19).** @review.type-coverage: standard tools find nothing, since
   the gaps are `Values`, `string`, `never` and unchecked excess keys, not `any` (type-coverage 99.86%).
   @review.type-gaps-deep: 9 families, 21 seams (14 lossy), 34 new gaps (31 probe-confirmed), 236 casts (74 removable
   now). Held: the survey found the freedom (a carrier drops a narrow type) and T104 was rewritten to it (`6de3b434`).
4. **T104 requirements review (`aa6ae676`, 15:52Z).** ISSUES, four blocking: type tests one-sided, two tests that can
   never flip, survey gaps with no requirement, a false recorded limit (`captureMs`). Fixed at `c315d386`. All 98
   `wrong` lines compiled, which is why each refusal needed a positive beside it.
5. **T104 build (`b6ee3679` to `082cb950`).** Eight carriers landed: contract (`Bound`), snapshot view, app, evidence
   names, endings, definition brand, id brands, exact shapes (`f1eb6e60`, `91762ce5`, `c12282ef`, `c0359aed`,
   `647ace06`, `927501b5`, `3c1b791d`), then the cast sweep (`e2e9da75`, `09a0e670`). Held per carrier. F9 body
   exactness (`ExactBody` over an inferred body) was tried and reverted: it moved every body error to the enclosing
   key and stopped refusing a null handler. Left as "a TypeScript limit" (`tests/types/excess-keys.test-d.ts:62`).
6. **T104 close review 1 (`c09e16cf`, 20:48Z).** ISSUES, four blocking: nine fault plants gone stale, public words
   still handing out text (`turnsOf`, `Request.endpoint`, `Cut.inspection`, `forkReloads`, `WriteHandle.get`, ...),
   `decline` recorded closed while taking `why: string`, type tests one-sided again. Fixed at `2dcd3cf4`, with
   `flow-state/paired-refusals` and a stale-plant check. Held: the second review passed.
7. **T104 close review 2 (`aec9bcb6`, 21:54Z).** PASS, nothing blocking; routed `paired-refusals` holes, erased
   siblings and `unsettledWrites<Ds>`, fixed in `c5d6ae21`. Held for what it listed (3.4 lists what it did not).
8. **T57 type spike (`819281df`, 2026-11-20T10:49Z, 15 minutes of a 45-minute cap).** Depth-2 widening, typed
   context and a typed `key` solved with `BodyOf<NoInfer<D>>` and `Flow.keyed`. `pausedBy` in the snapshot was not:
   `const B`, `NoInfer` on the return, a conditional return and curried `machine(D)(body)` were rejected. Routed as
   `today` pins to T109 (`c8006277`), then to T113 (`c675cf46`, `14c308ee`). `Flow.keyed` was dropped by the user at
   16:57Z. Did not hold: the typing was owed by three Tasks in one day.
9. **Typed-machine design, @proposal.spec-typed-machine (2026-11-20).** Eight `machine()` shapes tried; verdict "the
   body is checked, never read back", so schedule names, keys and pause reasons are declared on the definition (Ask
   1, answered A by the user 2026-11-21). Did not hold in its premise (next line); the declaration part stands.
10. **Body-capture spike, @proposal.body-capture-settled (2026-11-20).** `B & Exact<B, MachineBody<D>>` behind
    today's conditional refuses 13 of 13 spike bodies on the real package, keeps all 269 `@ts-expect-error` lines and
    costs 28% more check time (0.92 s to 1.18 s). The design's "TypeScript limit" was a property of the shapes tried.
    Tagged decided in @review.spec-cohesion-r2 section 6a (Q1); not built.
11. **T113 (`c675cf46`, widened `14c308ee`).** A survey of about 100 hand-typed parameters and 6 copied types;
    phantom `.Type`, contract-typed mappers and a lint guard are its acceptance. Draft: no `derive.ts` exists.

### 3.3 Root cause

The freedom: a type Flow already holds is dropped at one step and written again by hand, so one fact has two
sources, the declaration and the copy or the cast. It has three carriers:

1. **The body is checked and then thrown away.** `machine` (`src/machine.ts:271`) takes
   `body: BodyOf<NoInfer<D>>` and returns `Machine<D>` (`src/definition.ts:586`), which holds nothing of the body.
   A fact authored only in the body (schedule names, keys, pause reasons) cannot reach the snapshot
   (`src/host/snapshot.ts:66,75`). Three runs called this a TypeScript limit (rounds 5, 8 and 9); round 10
   disproved it with a constrained `B`. Inferred: every earlier run tested a free `B` and was time-boxed.
2. **Shared erased intermediates.** `Bound`, `Compiled`, `Values` and `Ending` (T104's description). 17 of the 41
   production casts give an erased type as their reason (for example `src/machine.ts:125,131,167,172`,
   `src/contract.ts:246,255`, `src/host/snapshot.ts:244`): the core erases, the edge re-asserts.
3. **Hand-written copies where inference already reaches.** Nothing refuses the annotation, so the copy drifts:
   42 `.from((x: {...}) =>` annotations, 31 lines with `why: string`, 32 hand-typed `{ readonly memory|event: {...} }`
   parameters in fixtures and tests (`rg`, HEAD), and `byRepo` written twice
   (`fixtures/sync/machines/sync.ts:52`, `fixtures/lanes/machines/clients.ts:9`).

4. **Designed untyped, typed later.** The core was written against `Values`, `string` and `unknown` (T16, 2026-11-11,
   `5206dd7d`), and generics arrived at the edge afterwards. Rows and the trade-off are in 3.3a.

A further cause is tooling: no standard gate sees these gaps (round 3), so only reviews with two-sided probes found
them, one batch at a time.

### 3.3a Where the erased core meets the typed edge

Each row: type at `file:line`; introduced by (`git log -S`, first hit); typed later by; casts it forces (reason
text of the 41 disables); a derived-from-D version. Line numbers at HEAD `dcf8f2b2`.

1. **`Values`** (`src/core/compiled.ts:32`; also `Incarnation.memory`, `src/core/world.ts:212`). T16 (`5206dd7d`).
   T103 (`424085b2`) and T104 (`91762ce5`) typed `Snapshot<D, View>` with a conditional on `Erased<D>`
   (`src/host/snapshot.ts:54`), which falls back to `Values`. Casts: 5 (`src/handles.ts:29`, `src/machine.ts:172`,
   `src/host/snapshot.ts:244`, `src/contract.ts:246,255`). Derived: `Compiled<D>` holding `MemoryOf<D>`.
2. **`state: string`** (`Incarnation.state`, `src/core/world.ts:209`). T16. `Snapshot.state` is `LeavesOf<D["states"]>`
   (`snapshot.ts:54`, T104). Casts: 0 of its own; it rides the one snapshot cast at `snapshot.ts:244`. Derived: a
   leaf union carried by the machine.
3. **`operation: string`** in the guard, commit and lookup steps (`src/core/compiled.ts:55,57,78,80,84,87`).
   T16. `Snapshot.operations` is keyed by `keyof D["operations"]` (`snapshot.ts:62`, T104 `91762ce5`; T103 had it
   untyped); the rows stay `ReadonlyMap<string, Row>`. Casts: 0 own, same snapshot cast. Derived: the key union from D.
4. **Slot returns and sends** (`Slot<(input) => Values>`, `Send.to/event: unknown`, `compiled.ts:55-89`). T16.
   Typed at the edge by `tokens.ts` generics. Casts: 5 (`src/machine.ts:125,131,167`, `src/flow.ts:251`,
   `src/compile-body.ts:196`). Derived: each slot typed by its event and memory.
5. **`output: unknown`** (`compiled.ts:158,212`, `src/core/world.ts:161`). T57 (`986337d3`). An Effect `Schedule`
   step's output, so `unknown` is honest at the core. Casts: 0. Derived: the series' output type, only if a reader
   needs it.
6. **`restartOn => unknown`** (`compiled.ts:233`). T57; the edge declares the same `unknown` (`src/tokens.ts:274`).
   Casts: 0. Derived: nothing; the core only compares it.
7. **`Ending<V = unknown>`** (`src/contract.ts:56`). T104 (`c12282ef`), generic at birth; `Compiled` stores it erased.
   Casts: 1 (`src/compiled-parts.ts:22`). Derived: `Compiled<D>` keeping the ending's `V`.
8. **`Bound<K, R = unknown, I = Values, Ky = Values>`** (`src/contract.ts:120`). T16 (the erased defaults are
   inferred to be as old). Casts: 2 (`src/host/driver.ts:53`, `src/host/run-promise.ts:50`, the erased `R`); the
   `I`/`Ky` ones are in row 1. Derived: `R` carried by the machine.
9. **Test tooling over erased runs** (`src/host/testing/fake.ts:136`, `generate.ts:941,1207`, `sweep.ts:352`). Casts: 4.

By erasure, 5 + 5 + 1 + 2 + 4 = 17 casts give an erased core type as their reason; the other 24 are Effect type limits,
brands, wrappers and run-time records (for example `src/core/boundary.ts`, 7). Ten of the 17 are in `src/` files outside
`host/`.

Trade-off. An erased core is a deliberate choice for a pure, synchronous turn: one runtime shape for every machine and
no per-machine type work on a 0.2 ms path. The evidence shows seams, not one boundary: the casts say "the one call
boundary" (`contract.ts:246`, `snapshot.ts:244`, `contract.ts:255`) or "restored here", but they sit in 9 files across 5
erasures, and the snapshot restores state, operations and memory together while the guard, slot and driver restores
are separate. Inferred: no design said where erased meets typed, so each edge Task (T103, T104, T57) added its own
restore. Only the snapshot is a true single point; the rest are repeated re-assertions of one fact.

Why fixing seams one by one did not close it:

- T104's lens (a seam, then its carrier, once) was right for what crosses a seam and it converged: four blocking
  findings, four, then PASS. A fact authored in the body crosses no seam. It is lost inside one call, so the lens
  never reached it, and T104 recorded body exactness as a limit instead.
- New facts arrive after the sweep and arrive wide. Keyed schedules and pause reasons landed in T57 the day after
  T104 closed, typed `ScheduleKey` and `ReadonlyArray<string>`. Production cast disables went from 31 at T104's close
  (`2dcd3cf4`) to 41 at HEAD (`git grep`). Inferred: later Tasks added erased restores (for example `src/flow.ts:251`,
  `src/compile-schedules.ts:241`).
- Each review replays the instance it was shown. Close review 1 found about a dozen public words T104 had not
  listed, since the carrier fixes covered the families, not the exports.
- No Task owned "a snapshot field's type derives from the declaration", so it moved T57, T109, T113 (round 8).

### 3.4 What changed and what is open

Changed: the nine families' carriers (rounds 5 to 7); `Snapshot<D, View>`; branded ids; `tests/types/` holds 22
`*.test-d.ts` files with 215 `@ts-expect-error` lines (269 package-wide); `flow-state/paired-refusals` at 0; the
type-aware `no-unsafe-*` rules at 0; test-side cast disables fell from 15 to 4; a stale plant now turns
`tests/faults.test.ts` red.

Open (counts from `rg` and `git grep` at HEAD `dcf8f2b2`):

1. **The body type is not captured** (`src/machine.ts:271`; `src/derive.ts` does not exist). Four `wrong` lines still
   compile (`tests/types/excess-keys.test-d.ts:69,93,99,104`); `gaurd` in an alternative and `pausd` in an unkeyed
   schedule compile too (@proposal.spec-typed-machine section 1, item 5; no pin found). C6 is tagged decided; unbuilt.
2. **A snapshot's schedules are `Timers` and `pausedBy` is `ReadonlyArray<string>`** (`src/host/snapshot.ts:66,75`;
   inverted pin `tests/types/schedules.test-d.ts:297`). Declared schedules (Ask 1 A) would close it; unbuilt.
3. **A send mapper reads `key` as `ScheduleKey`**, an unkeyed one too, though the runtime passes `undefined`, so
   `key.id` compiles and throws (`src/tokens.ts:223,236,298-300`; pin `tests/types/schedules.test-d.ts:58`). T113.
4. **Hand-typed copies, no phantom `.Type`, no lint guard** (counts in 3.3; `byRepo` at the two paths above). T113.
5. **Free text where Flow holds names:** `owed[].reason` (`src/host/inspect.ts:97`) and `Ended.reason`, which mixes
   contract failure tags with `Decline` (a T104 trap; its line is not located here). Recorded; no Task found.
6. **Recorded limits:** a brand is a subtype of `string`, so `attempt === text` compiles; hand-built `Step` data is
   public and checked at run time only (T104 traps and builder's call).
7. **`Compiled` still erases definition types** (`src/core/compiled.ts:409`). No design yet.

That is 7 open gaps and 41 production casts. A cast here is a line with a `typescript/no-unsafe-type-assertion`
disable; `as const` is not counted. The 2026-11-19 survey's 236 casts (plus 60 other forms) do not compare with it
(inferred: the survey counted every assertion, not only disabled lines). By file: `src/core/boundary.ts` 7 (6 cite an
Effect type limit), `src/machine.ts` 4, `src/core/tx.ts` 3, `src/host/testing/fake.ts` 3, the rest one or two each.

### 3.5 Process view

- **Caught:** every gap the surveys listed was probed two-sided; every review replayed its finding red; the
  requirements review showed that all 98 `wrong` lines compiled before the carriers existed; the nine stale plants
  were found by a script, not by a test.
- **Missed, and why:**
  - One-sided refusals. A `@ts-expect-error` alone passes for the wrong reason. Found at the requirements review
    (blocking 1) and again at close review 1 (blocking 4); the guard came only at the second hit (the
    orchestrator's threshold of 2, close review 1 rulings), and had five holes of its own (close review 2, closed
    `c5d6ae21`).
  - Tests that cannot flip. `tests/types/evidence.test-d.ts:149` conflicted with `Cut.calls` staying wide, and the
    `attempt === actor` line trips only if a type changes that the design did not state (requirements review, 2).
  - Wide parameters pass every call site. g23 (`decline`, `why: string`) was recorded closed because "its check was
    `nub run check` over the call sites, which a `string` parameter always passes" (close review 1, blocking 3).
  - Recorded limits taken as true: the `captureMs` limit was false (requirements review, 4), and the excess-key limit
    (`excess-keys.test-d.ts:62`) was disproved on the real package in round 10.
  - A type test cannot see a wrong ending. F9's rewrite of a `Flow.input` field was found by a Story
    (`tests/actors/memory-writes.test.ts`) and fixed at run time first (Turn R8); the type half is still owed.
  - `today` pins pass while the gap exists. Two remain (`schedules.test-d.ts:58,297`); @review.algorithm-review section
    2.9 says two pins assert the opposite of the declared-schedule rules R5 and R6.
  - Tooling: type-coverage, `noPropertyAccessFromIndexSignature` and the `no-unsafe-*` rules reported nothing through
    a Flow API (round 3).
- **Algorithm, process, or both:** both, with the architecture first. The body is checked and dropped, and `Compiled`
  erases, so hand copies and casts were the only way to reach the types. The process gap was that the typing of a
  new feature had no owner in the design (round 8) and the spikes that said "limit" were never counter-run.

### 3.6 Lessons for an algorithm designer

1. **Give every fact one source and derive each reader from it.** Check: the state inventory has a column "type at
   each reader", and a reader with a hand annotation or a cast is a finding. (`src/machine.ts:271`; the 42
   annotated mappers.)
2. **A claimed TypeScript limit needs a run on the real package, with the constrained form.** Check: the spike lists
   every shape tried, including `B extends Shape` checked as `B & Exact<B, Shape>`, its time box and its refusal
   counts. (Round 8's 15 minutes and round 9's eight shapes against round 10's C6.)
3. **List the erased intermediates and who restores each.** Check: a table of casts by the erasure they undo, and a
   design that removes the erasure. A cast count that grows after the sweep is a finding. (17 of 41; 31 to 41.)
4. **Every type test is two-sided and can flip.** Check: a positive exact assertion on the same parameter, and the
   design line that turns each `today` pin; `paired-refusals` at 0. (Requirements review 1 and 2; close review 1 (4).)
5. **Test a wide parameter with a wrong value, not by compiling its callers.** Check: for each `string`, `Values` or
   `unknown` in a public signature, a probe that a misspelling fails, or a reason it is a real boundary. (g23;
   `owed[].reason`, `src/host/inspect.ts:97`.)
6. **A feature lands with its derived types, or the design names who owns them.** Check: the design's type section
   lists each new fact's source and reader types; no "owed to a later Task". (The `pausedBy` and `key` pins moved
   T57, T109, T113; the snapshot is still wide.)
7. **Say where the erased core meets the typed edge, once.** Check: the design names the one function that restores
   each erased type, and a second restore of the same type is a finding. (3.3a: 17 casts, 9 files, 5 erasures.)

## 4. Across the three cases

### 4.1 Shared patterns

1. **A store that can hold a contradiction.** A stored issue against timer state; identity in key against content;
   an owed row against a lane head. Both broke "store facts, derive views".
2. **Validity spans more than the check sees.** Schedules were correct per occasion and wrong across occasions;
   records were valid per row and wrong across rows and records.
3. **Restore is where both broke.** Schedules restored facts that were never saved; records restored facts that
   were never checked. A reload is an occasion of the algorithm and belongs in its table.
4. **Convergence gathered code and kept the freedom.** One `decide` with stored issues; one `identityIn` with a
   hand field list; one Schema per row with cross-row validity. Each came within 14 to 74 minutes of its review,
   from the same lead, shaped by the latest findings: the case-by-case outcome the user's "design by convergence"
   rule warns about.
5. **Test alphabets came from bugs, not from state.** Every "missed because" names a missing axis, and each was
   added alone.
6. **Weak oracles.** `it.fails` passing on any failure appears in T20 (Restore R5), T92 (Q4) and T118 (Blocking 2),
   though routed as a defect on 2026-11-16; vacuous rules and sweeps; an oracle encoding an overturned rule; Spec
   text encoding a bug or edited to fit.
7. **A fact with two sources, in types.** The schedules' stored issue, the identity in key and content, and the type
   Flow drops and a hand copy restores are one pattern: a fact stored or typed twice. The type case's carriers are
   `machine()` (`src/machine.ts:271`), `Compiled` and `Values`.
8. **Weak oracles, in types.** A one-sided `@ts-expect-error` passes for the wrong reason, a `today` pin passes while
   the gap stands, and `nub run check` over call sites cannot see a `string` parameter (3.5). It is pattern 6 again, and
   the guard (`flow-state/paired-refusals`) came only at the second hit.
9. **Where the freedom was named as a carrier, the loop converged.** T104 fixed each carrier once and passed its
   second close review; the schedules and records loops patched instances. The open type gaps are the ones no carrier
   was named for (3.4, 1 to 3).
10. **Erased by design, typed per edge.** The type case's fourth carrier repeats the schedules' and records' "restore"
    (pattern 3): the core stores erased, each edge restores for itself (3.3a).

### 4.2 Clusters at risk

Clusters are those of @proposal.algorithm-round section 5.

| Cluster                  | Schedules case               | Record-trust case            | Type-safety case            |
| ------------------------ | ---------------------------- | ---------------------------- | --------------------------- |
| 1 Schedules and          | Directly: S-1 to S-8, the    | Restored timers: `refused`   | Directly: `Timers`,         |
| occasions                | ledger oracle                | marker, undeclared reasons   | `pausedBy` and the send     |
|                          |                              | (S-7)                        | key (gaps 2, 3)             |
| 2 Turn walk, boundary    | Same-turn order; one rule at | -                            | Each new snapshot field     |
| channels, fragments      | every scope (X-2)            |                              | (fragments, props, emits)   |
|                          |                              |                              | needs a derived row, not a  |
|                          |                              |                              | new type parameter          |
| 3 Records, data layer,   | Format 6, the baseline codec | Directly: format, identity   | Branded ids at the record   |
| saved format             |                              | once, store-wide invariants  | boundary; `owed[].reason`   |
|                          |                              |                              | text (gap 5)                |
| 4 Reads and operations,  | A throw in user code changes | Directly: fault model, T98's | Carriers done in T104;      |
| errors and trust         | only its own check           | public values                | `Ended.reason`, wide brands |
|                          |                              |                              | (gaps 5, 6)                 |
| 5 UI host, test tooling, | `it.fails`, oracles,         | Mutation generator, sweep    | Directly: C6, `derive.ts`,  |
| static rules, typed      | sequence-check tooling       | vacuity                      | hand copies, casts,         |
| machine                  |                              |                              | type-test guards            |
|                          |                              |                              | (gaps 1, 4, 7)              |

### 4.3 Process: keep and change

Keep:

- Reviews that replay each finding as a red scratch Story and say why the tests missed it.
- Red first, planted faults with `faults --only`, and blind derivation of sample rows from the rules.
- The failure limit: it stopped both loops; without it each would have added more cases.
- Bounded exhaustive sequence checks over the state (T118's 8,000 rows).
- Type work by carrier: a seam map, one carrier fixed once, two-sided type tests with `paired-refusals`, and probes on
  a copy of the real package (T104; the body-capture spike).

Change (proposed):

1. **Design before build.** No build until the state inventory, the writers over time, the saved-fact list, the
   fault model and the transition table are written and reviewed. This round's deliverable does that; keep it as
   the rule after this round.
2. **Alphabets from the inventory.** Every exhaustive or generated check takes its axes from the inventory (all
   writers, all occasions including reload and definition edit, at least two instances), and the review checks
   that mapping.
3. **Oracles.** Invariants stand apart from any model; inverted tests assert the specific failure, never a bare
   `it.fails`. The defect recurred in three Tasks, so by the Epic's rule it becomes a run rule or lint.
4. **Convergence by a fresh agent.** The redesign goes to an agent given the problem and the findings, not the
   draft (the user's rule for from-scratch agents), and is never skipped. It must name the freedom and the
   structure that removes it.
5. **Types in the design, per fact.** The design's type section lists each fact's source and the type at every reader,
   the erased intermediates and the casts they force, and a spike on the real package for any "TypeScript limit". It
   is a gate before the build, not an owed item for a later Task (3.6, rules 1 to 3, 6).
6. **A cast budget.** Production `no-unsafe-type-assertion` disables are counted at each Task's close, and a rise
   needs a design line naming the erasure (31 at T104's close, 41 at HEAD).
7. **Type tests that can flip.** Every pin names the carrier or rule that inverts it; wide `string` parameters are
   probed with a wrong value, not by compiling callers (3.6, rules 4 and 5).
8. **History pointers that resolve.** The V3 log's "History in git at a9ed4037" (2026-11-18T19:14:32Z) points to a
   log-only commit; T20's history is at `1faeec1ea`. Left for the orchestrator; not changed here.

## 5. Sidecar log

Four Haiku sidecars (effort medium, read-only). Each finding was checked against the commits and records above. The type
case (section 3) used no sidecars: every count in it was run by its owner with `rg` or `git grep` and says what it
counted.

| Sidecar | Finding                                                                   | Result   | Why                                                                |
| ------- | ------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| 1 T57   | Nine rounds with commits and times                                        | Accepted | Matches `3a84b878` P4 comments and `git log`                       |
| 1       | Pause reasons lost across three occasions; issues cleared by wrong source | Accepted | Reviews 2, 3, 4 at 11:47Z, 13:22Z, 15:14Z                          |
| 1       | "Spec edited to fit the build" (R14)                                      | Changed  | True, but done by a two-trace ruling (13:23:17Z); reported as such |
| 1       | Blind sidecar overstated (six of six, then five of six)                   | Accepted | 10:00:28Z and its 10:00:36Z correction; minor, not used            |
| 1       | Seventeen and nine plants re-pointed weaken evidence                      | Rejected | Re-pointing was re-run and caught; no finding shows a weak plant   |
| 2 T118  | Requirements, review findings, rulings, open holes                        | Accepted | Matches P4 T118 comments and @review.algorithm-review 1.4, 1.6     |
| 2       | SI front matter date differs from its adoption commit                     | Accepted | Not material here; not used                                        |
| 2       | Wrote a scratch file at `/tmp/x`                                          | Accepted | The file exists (431,975 bytes); a breach of the read-only brief   |
| 3 T20   | Rounds, convergence `7ff639758`, limit at `8c0446d9a`, stop `04d55c1c8`   | Accepted | Matches `1faeec1ea` P3 comments and `git log`                      |
| 3       | `a9ed4037` is log-only; the pointer leads nowhere                         | Accepted | `git show a9ed4037` touches only `V3.log`                          |
| 3       | Failure limit is 2 after convergence (`epic.task:121`)                    | Accepted | Read                                                               |
| 3       | Codec I7 encoded a bug                                                    | Accepted | T20's Risk; resolved by R-1 (Codec I7 won, the field went)         |
| 4 T92   | 24 branch commits, rounds and convergence                                 | Accepted | `git log fef46251..t92-format-4`                                   |
| 4       | Branch is an ancestor of `flow-rewrite`                                   | Accepted | `merge-base --is-ancestor` exits 0; `cd564c30` restored the code   |
| 4       | Three `Schema.String` fields left at `d92e802f`                           | Accepted | `record.ts` lines 53, 199, 213                                     |
| 4       | 23 `it.fails` at both `fef46251` and `d92e802f`                           | Accepted | Counted with `git grep`                                            |
| 4       | `3a84b878` does not hold T92's reviews                                    | Rejected | Its P4.task holds them (from line 2033)                            |
| 4       | No `no-id-text` disables at `d92e802f`, against the 13:44:29Z comment     | Rejected | The comment is dated after the branch tip; no contradiction        |
