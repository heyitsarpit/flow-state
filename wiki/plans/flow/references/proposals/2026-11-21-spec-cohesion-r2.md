---
review spec-cohesion-r2
status open 2026-11-21
description Finds four seams across the eleven concept designs to fix before Spec writing and one round of 15 questions.
---
# Cohesion of the eleven concept designs and the advisor consult (2026-11-21)

**Bottom line:** Spec writing can start after one round of 15 questions (section 6a). Before that round, four seams
need fixing in the designs. (1) Emit evidence has two homes, BC's `Act.Emitted` and TP's one `Turn`. (2) The test
verdict has two homes: TT's `run()` rejects on any breach and SC has `expectBroken`/`off` switches. (3) Parked
endings: FR drops them on `End`, but the consult and @review.spec-cohesion keep them as owed rows. (4) The `Made`
brand is a `WeakMap` in ET and a `Symbol.for` key in the consult.

The 35 ledger rows break down as 9 absorbed, 20 conflicts, 2 missing, 4 outdated and none superseded. Nine open
tags are already settled by the user's decisions (section 5).

Everything here is proposed. The advisor consult counts as proposals on equal footing with the designs; its
"accepted" marks are not user decisions (the user, 2026-11-21). The only user decisions are those in
@proposal.spec-handover "Decided by the user" and in the V3 log.

Source: a read-only pass over the eleven designs, @proposal.schedule-issues, @proposal.body-capture-settled, the
consult folder and the code. Four Haiku sidecars ran (log at the end).

## Abbreviations

- **First wave:** TM @proposal.spec-typed-machine, FR @proposal.spec-fragments, SR @proposal.spec-saved-records,
  RO @proposal.spec-reads-operations, DL @proposal.spec-data-layer.
- **Second wave:** BC @proposal.spec-boundary-channels, TT @proposal.spec-test-tooling, ET
  @proposal.spec-errors-trust, SC @proposal.spec-static-rules, UH @proposal.spec-ui-host, TP
  @proposal.spec-turn-parts.
- **Other records:** SI @proposal.schedule-issues, BCS @proposal.body-capture-settled, CO @review.spec-cohesion, HO
  @proposal.spec-handover.
- **Consult files**, in `advisor-consult-2026-11-20/`: holes (`2026-11-20-advisor-holes.md`), raw (`raw-throws`),
  life (`fragment-lifetimes`), calls (`machine-calls`), csr (`saved-records`), body (`body-types`).
- **Citations:** `X:n` is line n of that file. Code paths are under `packages/flow-state-v3/src/`.

## 1. Consult ledger

Each row gives the consult proposal, where the designs cover it, a verdict, and a recommendation where they
disagree. The question rows are holes:308-333.

| #   | Consult proposal                                                                                                               | Design lines                                                                                                 | Verdict and recommendation                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A turns rule with a subject is `turn({ on, check })`; `event` is typed from `on` (holes:308)                                   | SC:253-256 uses a plain object; SC:456-458 hopes to type it without a wrapper                                | **conflicts.** A plain entry in a body literal cannot relate `check`'s parameter to its sibling `on` (body:121). Recommend `turn`. Q2. |
| 2   | `Machine<D, Names>`: the second parameter carries rule names only (holes:310)                                                  | SC:376-383 has `Machine<D> & { rules }` and keeps `Machine<D>` fixed                                         | **conflicts.** Both capture names only and differ in shape. Recommend `Machine<D, Names>` with a default, given Q1. Q3.                |
| 3   | `const B` checked as `B & Exact<B, MachineBody<D>>`, the one body signature (holes:311)                                        | TM:7-8 and TM:90-91 say "never read back"; SC:371-373 agrees with TM; BCS:7-10 agrees with the consult       | **conflicts.** BCS shows the result of TM's spike was the shape it tested, not a TypeScript limit. Recommend C6 (HO item 2). Q1.       |
| 4   | T98 lands before T106 and T109 (holes:312)                                                                                     | ET:264-266 and ET PD5 (ET:327) move T98a only; the P5 Order (P5.task:17) puts T98 first in P5                | **conflicts** with the user's "T98 first in P5" (log 2026-11-20T13:04). Recommend ET's split. Q5.                                      |
| 5   | `Made` by `Symbol.for("flow-state/Made")` on a shared prototype, keeping the owner compare (holes:313)                         | ET:90, ET:107-109, ET:242 (R7 forgery test), ET:300 ("Decided", untagged)                                    | **conflicts.** Section 3.1. Q4.                                                                                                        |
| 6   | The testing route is gated in T98 (holes:314)                                                                                  | ET:264                                                                                                       | **absorbed.**                                                                                                                          |
| 7   | Save what a ref gave; derive defaults; keep ref-level `{ context }` (holes:315)                                                | No design text (SR:78 covers slots only)                                                                     | **missing.** Option A changes no API. Recommend A, as an implementation call in SR.                                                    |
| 8   | No renames now: a rename is a removal plus an addition (holes:317)                                                             | SR:206-208                                                                                                   | **absorbed.**                                                                                                                          |
| 9   | A schedule added to an active state arms at the wake (holes:318)                                                               | SR:210 ("full delay")                                                                                        | **absorbed.** SR does not state the limit that no entry time is saved; it adds that line.                                              |
| 10  | A renamed machine id is a stated limit: orphans discarded, lanes quarantined (holes:319)                                       | SR:186 sets them aside as `Retired`; DL:245 discards them                                                    | **conflicts** (discard against aside). Recommend SR's aside, so nothing is lost (CO 5).                                                |
| 11  | A node trait's or subroutine's subject is `resetOn` (holes:320)                                                                | FR:75-76 has the subject; FR:411 still defers open-item 21                                                   | **conflicts.** This adds `resetOn` to subroutines, a public API change. Recommend `resetOn`. Q7.                                       |
| 12  | Own exit while holding a lane: the ending parks for the address (holes:322; life:62-72)                                        | FR:57 ("`End` drops"), FR:104 `Frozen { parked }`, CO:30-31 (instance-owned row)                             | **conflicts.** Section 3.3. Q6.                                                                                                        |
| 13  | Keep `SharedContract` (holes:324)                                                                                              | FR:411 keeps item 22 deferred; SR:126                                                                        | **absorbed.**                                                                                                                          |
| 14  | `whenAbandoned` gets no reason (holes:325)                                                                                     | TP:89; FR's mapper                                                                                           | **absorbed.**                                                                                                                          |
| 15  | A release past its bound is a warning issue on the D25 bound (holes:326)                                                       | RO's R12 `ReleaseOverdue`; ET:214-221 `CleanupFailed` reason `overdue`; `host/close.ts:181` `CleanupOverdue` | **conflicts**: three names for one fact. Recommend M8.                                                                                 |
| 16  | Defer item 24; close item 26 as covered by R30 (holes:328; life:123)                                                           | FR:411-412 still defers 26                                                                                   | **conflicts.** Recommend closing 26 (a fan-out raise already reaches each copy).                                                       |
| 17  | Writes wait on the Host's offline signal (holes:329)                                                                           | RO:356-357 defers it; TT:106 models offline as loss                                                          | **conflicts.** This changes scope: it adds a lane phase. Q8.                                                                           |
| 18  | Never resume never-sent work now (holes:330)                                                                                   | RO:356-357                                                                                                   | **absorbed.**                                                                                                                          |
| 19  | Invalid input on a live resource: not placed, evidence only; a one-off lookup stays `Defect` (holes:331)                       | RO:271-273 (lookup `Defect`, `InvalidKey`)                                                                   | **missing** for live resources; the evidence names also differ (`InvalidKey`, `InvalidInput`). Implementation call (6b).               |
| 20  | Hidden re-sends are immediate only, after an applied-nothing failure; every delay goes to the machine (holes:332; calls:43-50) | RO:342 retries on `Schedule.exponential` inside the commit; RO:30 says nothing retries                       | **conflicts.** RO also contradicts itself. Q9.                                                                                         |
| 21  | No per-call deadline override (holes:333)                                                                                      | RO:328-330                                                                                                   | **absorbed.**                                                                                                                          |
| B1  | Strict envelope; collections decoded per entry (csr:12-17)                                                                     | SR:189-210: decode by Schema from Compiled, entries dropped one by one                                       | **absorbed.** SR's `onExcessProperty: "error"` against "dropped field" must be one rule in the Spec.                                   |
| B2  | One decode helper, `decodeExit(schema)` (holes:299-301)                                                                        | ET:135 `admit(schema, at)`; SR has its own step; `core/life.ts:169` already has an `admit`                   | **conflicts** (names). Recommend one helper in the core, used by ET and SR.                                                            |
| B3  | The copy keeps only plain objects; other objects stay leaves (holes:114-116)                                                   | ET:141-144 keep-list: functions, Schemas, made values, frozen Map, Set, Date                                 | **conflicts.** A copied `Duration` or `Option` fails its `is*` guard (holes:125-126). Recommend the consult's rule.                    |
| B4  | A restore gives new ids and fires no start (life:47-52)                                                                        | FR's R9; `core/incarnations.ts:423`                                                                          | **absorbed.**                                                                                                                          |
| B5  | An incarnation-held parked row names its incarnation "by the saved counter" (life:66-69)                                       | None                                                                                                         | **outdated by code.** No record holds an incarnation id (`core/record.ts:78-88`), and ids are minted again at boot.                    |
| H1  | Rules.plan, lines 29-34: entries may be `turn(...)`                                                                            | SC:253-256                                                                                                   | **conflicts**; follows Q2. Applies cleanly; not applied.                                                                               |
| H2  | Rules.plan, line 50: `turn` added to the NEW list                                                                              | None                                                                                                         | **conflicts**; follows Q2.                                                                                                             |
| H3  | Rules.plan, line 61: `SetLandsInBounds: turn({...})`                                                                           | SC:254                                                                                                       | **conflicts**; follows Q2.                                                                                                             |
| H4  | Rules.plan, line 79: `CartNotEmptyOnBegin: turn({...})`                                                                        | None                                                                                                         | **conflicts**; follows Q2.                                                                                                             |
| H5  | Rules.plan, line 113: `Machine<D, Names>` and `const B` with `Exact`                                                           | TM:90-91; SC:376-383                                                                                         | **conflicts**; follows Q1 and Q3.                                                                                                      |
| H6  | Rules.plan, line 263 (V1): `event` is typed from `on` inside `turn`                                                            | SC:457-458                                                                                                   | **conflicts**; follows Q2.                                                                                                             |
| H7  | P4.task T109 comment, "Decisions (the user …)" on answers 11 to 16                                                             | FR:411-412                                                                                                   | **outdated.** The anchor moved (`git apply --check` fails), and the comment calls proposals user decisions.                            |
| H8  | P5.task T106 comment: `turn` and names-only `Machine`                                                                          | SC:383                                                                                                       | **outdated.** The anchor moved; the content follows Q2 and Q3.                                                                         |
| H9  | P9.task T98 comment: lands before T106 and T109                                                                                | ET:264-266                                                                                                   | **outdated.** The anchor moved; the content follows Q5.                                                                                |

## 2. Cohesion of the second wave

Each mismatch gives both sides and a proposed resolution.

- **M1. Emit evidence.** BC:8, BC:146 and BC:159 add `Act.Emitted`. TP:68, TP:146-147 and TP PD1 (TP:363) add
  none: emits are `PartRun.emits` inside the one `Turn`. The shapes also differ: FR:88 is
  `{ address, instance, name, payload }`, UH:64 is `{ actor, name, value, instance, key }` and BC:146 is
  `{ actor, address, name, payload }`.
  - **Resolution:** TP wins. Public `Emitted` evidence is a projection of `Turned`, with one shape:
    `{ actor, address, name, payload }`. BC drops its step 3, and UH and FR cite BC's shape.
  - **Why:** one writer per record. The single graph and Stories read one record, and the CLI trace shows it
    unchanged.
- **M2. `Published`.** BC:25 says it "gains nothing"; TP:132 adds `why`. **Resolution:** TP's `why`. BC's props turn
  publishes with `why: "Other"`.
- **M3. Emit order.** BC's R5 (BC:277) records an emit before the turn's sends. TP:171-172 delivers sends at row 14
  and runs listeners at row 15.
  - **Resolution:** both hold once R5 is reworded. Emits are recorded in the `Turn`, before sends are delivered;
    listeners run at the step's end.
- **M4. Listener owner.** BC:63, BC:181 and BC:324 put the listener sets in `host/emits.ts` (T77a). UH:48 and UH:364
  put an emit queue in `react/listen.ts` (T30), and UH:230 calls `onEmit` from `publish`.
  - **Resolution:** `host/emits.ts` owns the sets and is called at row 15. React's `useOnEmit` subscribes through
    it, and `publish` calls nothing.
- **M5. Test verdict.** TT:168-178, TT:243 (R2) and D1 say `run()` rejects on any breach and that rules come from
  `flow.config.ts`. SC:246-260 declares rules in the body, and SC:343-351 has `expectBroken` and `off`.
  - **Resolution:** two rule sources feed one `verdictOf` that uses SC's switch table. Project run rules are in
    the config; machine rules come from `Compiled.rules`. "Any breach" means a breach that is not expected.
  - **Why:** Stories and `flow story run` give one verdict (Q10).
- **M6. T98's scope.** SR:14 and SR:81 call T98 "public values"; ET:14 and ET:264-267 call it construction trust,
  split into T98a and T98b. **Resolution:** ET's split. SR's public arguments are T98b's.
- **M7. Two `issuesOf`.** SI:154 and RO:139-146 each define one, and both read `incarnation.issues`. That
  contradicts "Derived issues" (HO:38).
  - **Resolution:** one `core/issues-of.ts`, created by T118. Each owner Task adds its own derivation: schedule,
    operation rows, entries, placements, releases and context slots. `StoredIssue` goes with the last one (ET:226-230).
- **M8. Overdue release.** RO R12 has `ReleaseOverdue`, ET:214-221 has `CleanupFailed` reason `overdue`, and
  `host/close.ts:181` has `CleanupOverdue`.
  - **Resolution:** a release that is still running past D25 is a derived `ReleaseOverdue` warning, and it clears
    when the release ends. A release that ended in failure is `CleanupFailed`. Delete `CleanupOverdue`; T100's
    catalog holds both codes.
- **M9. In-memory store.** TT:80-81 makes the Story store and `Fake.storage.layer` one function (T112). UH:257
  moves `layerMemory()` to `host/platform/memory.ts` (T28).
  - **Resolution:** one store in `platform/memory.ts`, built by T112, because T112 lands before T28. The fakes wrap
    it, and T28 adds only the IndexedDB option.
- **M10. React hooks.** BC:118 gives `useActor` and `useOnEmit` to T30. UH:345-349 and UH PD2 put `useActor` in T111.
  **Resolution:** follows Q15 (UH PD2).
- **M11. T77a's place.** BC:327 puts T77a before the turn-parts Task; TP:392 puts it after that Task's step 1.
  **Resolution:** TP's order. The turn-parts Task is the user's (HO:39).
- **M12. Props equality.** BC:36 and BC:204 use the core's `sameValue`; UH:197 re-renders on `Equal.equals`.
  - **Resolution:** the binding decides "props changed" with the core's `sameValue`, so the two never disagree.
    `reuse` keeps `Equal.equals` for selected values.
- **M13. Overloaded names.** `admit` has three meanings today (`core/life.ts:169`, `tx.env.admit`, the host hook),
  and ET:135 and DL:235 add two more. `settle` exists at `core/lanes.ts:307` and `core/context.ts:94`, and FR:150
  adds a third. `capture` means three things (ET:105, DL:83, SR:61). `Kind` means two (SR:149, ET:108).
  `Reason` means two (SR:172, ET:178).
  - **Resolution:** each Spec names its symbol once, against the code (6b).
- **M14. Fragments' table is broken.** FR 3.3 (FR:162-187) interleaves the slot table with the status table, so
  rows sit under the wrong headers. **Resolution:** the FR Spec rewrites both tables before any other text depends
  on them.
- **M15. Facts the code contradicts.** SR:87 says "format 5/6, existing", but `core/record-format.ts:10` has
  `FORMAT = 5`. ET:90 says marks are gone, but the code has string `"~flow"` and `"~token"` marks
  (`definition.ts:184`, `events.ts:100`) and no `Made`.
- **M16. Old Specs cited as live.** SI:15, TM:18, SR:16 and TT:74 cite @spec.Turn, @spec.Restore and
  @spec.StaticCli, which the user ruled superseded by code (HO:43-44). **Resolution:** each new Spec cites code
  and its own ids.
- **M17. Colliding ids.** PD1 to PD7, R7 to R10 and I1 appear in seven to nine designs each, and DL and UH both use
  R-E1, R-L1 and R-S1. **Resolution:** a Spec prefixes its own ids, and no Spec cites a design's PD number.
- **M18. CO resolutions the designs did not take up.**
  - CO 3: SR:102-103 still has no `instances` partition.
  - CO 4: FR:57 still drops parked endings.
  - CO 5: DL:245, DL:256 and DL PD5 still discard records and say `Dormant`.
  - CO 10: SR:203 says "Held, ends unknown `Restored`" where CO says `Defect`.
  - CO 15: FR:31 and FR:113 still say `Tracked`.
  - **Resolution:** each owner's Spec adopts the CO resolution, except CO 10. SR's unknown `Restored` is truer,
    because the write may have applied (6b).

## 3. The three advisor conflicts

### 3.1 The `Made` brand: `Symbol.for` or a `WeakMap`

Today, construction trusts copyable string marks, which a spread or a JSON round trip carries along:

```ts
// before (today, definition.ts:184): a copy keeps the mark
const forged = { ...realMachine }; // existing: "~flow" mark copied, accepted as Flow-made
```

The two options:

```ts
// A (ET:107-109): identity by membership; a copy has nothing to copy
const registry = new WeakMap<object, Internals>(); // NEW: made, madeOf
export const madeOf = (kind) => (value) => Option.fromNullable(registry.get(value));

// B (raw:150-154): one registered symbol on a shared prototype, as Effect's TypeIds
const MadeTypeId = Symbol.for("flow-state/Made"); // NEW
const MadeProto = { [MadeTypeId]: MadeTypeId }; // spread and JSON drop the prototype
export const isMade = (u: unknown) => typeof u === "object" && u !== null && MadeTypeId in u;
```

- **A:** cannot be forged. Two loaded copies of Flow (an SSR dedupe miss, a peer split) refuse each other's
  values, and the error points nowhere useful.
- **B:** follows Effect's convention and survives two copies of one version. A shape copy is still refused,
  because the prototype is not copied. Only a hand-built object with the prototype passes, and that is
  unsupported, as in Effect. The per-definition owner symbol (`definition.ts:422`) still stops cross-definition
  use.
- **Recommendation:** B, with ET's R7 reworded: "a shape copy is `WrongKind`; a value built on Flow's prototype by
  hand is unsupported". `Exact`'s leaf stops at the brand either way (body:105).
- **Effect on the rest:** neither option touches the graph or the CLI. Under B, Stories that build fixtures in a
  second bundle keep working.

### 3.2 T98's place

| Option | Order                                                                                                 | Cost                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A      | All of T98 before T109 and T106 (the consult)                                                         | Moves T98b's admission work, five red tests, into P4 ahead of the preview     |
| B      | T98 first in P5, after T109 (the user, log 2026-11-20T13:04)                                          | `turn`, `.each` and `.resumable()` are born with marks, and T98 rewrites them |
| C      | T98a (doors, `made`, the testing route) before T113's `derive.ts` and T109; T98b first in P5 (ET PD5) | One split Task; T98a is small and unblocks every feature                      |

- **Recommendation:** C. It keeps the user's P5 placement for admission and moves only the part every new public
  function needs.
- **Before C can apply:** T98's `blocked_by` (P9.task:119) lists T109, T110, T76, T77 and T100. T98a must drop all
  five except T100, which ET's step 1 puts first. Q5.

### 3.3 Fragment lifetimes: two holders against `settle`

These two designs answer different questions, so they merge:

- FR's `settle` (FR:150-190) decides which instances live and returns `Start`, `End`, `Freeze` and `Thaw` steps.
- The consult's holder rule (life:54-72) decides what each step does to work.

They really disagree in three places:

- **Parked endings.** FR:57 drops them on `End`. Under the consult they are owed rows: an incarnation-held row
  closes as evidence, and a subject-held row stays for the next incarnation at the address. CO 4 makes every row
  instance-owned.
- **The host's Owner.** The consult forks lookups and sessions under a fragment Owner per incarnation. RO:274-275
  forks every call under the Runtime's Owner. A shared read agrees in both (`work`, with only the wait held). They
  differ on one-off lookups.
- **The name.** `settle` collides with `lanes.settle` (`core/lanes.ts:307`).

```ts
// after (proposed): settle's steps feed one holder table; nothing is dropped
// existing: End, Freeze, Thaw, owed rows   NEW: Holder   renamed: settle -> reconcile
type Holder = "Incarnation" | "Subject"; // NEW: fixed by the work's kind, never by the placement
// End    x Incarnation: release; a parked row closes as evidence (Actors I17)
// End    x Subject:     untouched; endings park as owed rows by address; the next Start there adopts them
// Freeze x Incarnation: lookups and sessions released, each Interrupted parked for this incarnation
// Thaw   x either:      drains its parked rows in owed order
```

- **Recommendation:** adopt the merge. `reconcile` (FR's `settle`, renamed) owns instance status. The holder table
  owns release. Parked endings are owed rows keyed by address, and FR's `Frozen.parked` is deleted.
- **Changes to the earlier records:** this amends CO 4, so that address-keyed rows serve the subject. One-off
  lookups fork under the fragment Owner, and RO's Runtime Owner stays for shared calls.
- **Why:** `End` dropping an ending loses a write's result, which correctness forbids. Stories can assert the
  parked rows, and the CLI trace shows each one.
- **Owner:** T109, after the turn-parts Task. Q6.

## 4. Unowned seams

| Seam                                      | Facts                                                                                                                                                                                                                                                               | Proposed owner and why                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Resource entry store                      | None exists (DL:17-18). `staleTime` and `gcTime` are read nowhere (`contract.ts:298-299`). RO:423 claims the store.                                                                                                                                                 | RO's Task 2 (T21's entries). CO agrees, and only reads write the store.                                                                                                                                      |
| Persisted-resource record kind (`entry/`) | Four claimants: T21, T56 (P4.task:356), T92 and RO's Task 4 (RO:426). SR:149 keeps `Kind` closed.                                                                                                                                                                   | T92 owns the kind, the key and a body Schema built from the contract's `output` (RO 8.7). RO's Task 4 owns the restore meaning. T56 versions it like any other kind.                                         |
| One definition fingerprint                | SR:115-117 uses the shape only to name a reason. DL:262 and DL:356 use a digest to refuse a hydrate payload. UH:269 has `appFingerprint`.                                                                                                                           | T56 builds `shapeOf(compiled)` per machine. The app digest hashes those shapes, and T115 gates on it. The two failure meanings stay, because a payload from another build is not saved data.                 |
| Disposal order                            | `core/disposal.ts:152` (`consumersFirst`) is used at lines 57 and 74. Rows for fragments, entries, sessions and TabLock are spread over FR:28, RO:482, DL:126 and UH:245.                                                                                           | T109 owns the one table in `disposal.ts`: instances deepest first inside each identity's end. RO's Task 3 adds entries and sessions. T27 and T111 add TabLock, last.                                         |
| Mint restart against `InstanceId`         | Seeded ids are `kind-seed-n` with a fresh 128-bit seed per boot (`core/tx.ts:182-185`, `host/host.ts:25-27`; Stories per open, `host/testing/run.ts:132-140`). Activation and arming ids and DL's `Position` are bare counters that restart (`core/tx.ts:201-203`). | T109 mints `InstanceId` by `mint("inst")`, so FR's I3 holds by the seed. T92 adds the invariant that no saved body holds a bare counter. Positions on restored data are `Option` (CO 11). This closes CO 17. |
| Clock input                               | RO:226 (`now - at < staleTime`) and DL:262 read a time; `tx.env.now` exists (`core/tx.ts:47`).                                                                                                                                                                      | `tx.env.now` is the only clock in the core. RO's Task 2 owns the age arithmetic, and T115 reads it.                                                                                                          |
| Codes and findings                        | ET:168-178 (`CATALOG`) and SC:178-180 (a check table of about 90 rows) are two lists.                                                                                                                                                                               | T100's `CATALOG` owns every code. SC's rows cite catalog codes, and T22 adds rows only.                                                                                                                      |
| One `issues-of.ts`                        | M7.                                                                                                                                                                                                                                                                 | T118 creates it.                                                                                                                                                                                             |
| Streams                                   | DL:146-149 says T25's Spec still owes `delivers: "latest"`, reconnect and `Feed.live`. No design covers them (HO item 6).                                                                                                                                           | T25 writes its Spec first. No other Spec defines a stream record.                                                                                                                                            |
| Unnumbered Tasks                          | Designs cite "Turn parts", "Declared schedules", the four T21 Tasks, T24a and T24b, T77a and T77b, T98a and T98b. None exists in `wiki/tasks/V3/`.                                                                                                                  | The orchestrator creates them when the Specs land (HO "apply the Task changes last"). Specs cite them by title until then.                                                                                   |

## 5. Stale open tags

These open asks are already settled by user decisions. They are listed only, not edited.

- **TM Ask 1** (TM:420): settled by **Declared schedules** (HO:34-35; log 2026-11-20T16:56, Q2 A).
- **TM Ask 3** (TM:441), with TM:230-265 and TM:31's `Flow.keyed` text: settled by **No `Flow.keyed`** (log
  2026-11-20T16:57). That decision supersedes "Flow.keyed accepted" (log 2026-11-20T11:40). BCS:62 and BCS:83 use it
  too.
- **FR PD5** (FR:407): settled by **Task changes**, the turn-parts Task (HO:39-40; log 2026-11-20T16:56, Q3 A).
- **RO 8.2** (RO:503): settled by **Task changes** (T21 into four).
- **RO 8.5** (RO:512): settled by **Mapper shape** `(value, { input, key })` (log 2026-11-20T16:56, Q1 A). RO's
  recommendation contradicts it.
- **DL PD1** (DL:428): settled by **Task changes** (T24 split).
- **SI section 8, asks 1 to 5** (SI:337-341, untagged): settled by log 2026-11-20T15:33. The redesign was adopted,
  T118 builds it, T57 closes through it, and siblings go to T21 and T100. SI's status still says `proposed`.
- **SI:333** ("Context and OnContext … sound as they are"): contradicted by **Derived issues** (HO:38).
- **ET:338-339** (the caution that "derived everywhere" is in no record): it now is (HO:38; log
  2026-11-20T16:56, Q4 A).

These stay open: HO item 2 (C6), every consult proposal, TM Ask 2, and BC PD5 (the 16:56 Task decision covered
only the first five designs).

## 6. Draft decision round

### 6a. Questions for the user

Recommendation first in each. A question depends on an earlier one only where it says so.

1. **Typing: does `machine()` capture its body?** [decided: user 2026-11-21] [recommend A] (HO item 2; TM 3.1 against BCS)
   Why: accepted as recommended (A), as prior art. Reverse: the Spec's challenge step re-weighs it; a bug found there reopens it.
   - A: C6 adopts `const B` with `Exact` and `Machine<D, …>` carrying names.
   - B: TM's "checked, never read back".

   ```ts
   // before (TM:90): machine<D>(definition: D, body: BodyOf<NoInfer<D>>): Machine<D>
   // after (BCS): NEW B; existing D, MachineBody
   declare const machine: <D extends AnyDefinition, B extends MachineBody<D>>(
     definition: D, body: B & Exact<B, MachineBody<D>>) => Machine<D, RuleNames<B>>;
   ```

   - **For A:** it keeps all 269 refusals and closes `gaurd`/`pausd`, for 28% more check time (BCS:7-12).
   - **Still needed under A:** declared schedules, for `Snapshot<typeof Def>` and the saved key codec.
2. **Turns rule with a subject: `turn({ on, check })` or a plain object?** [decided: user 2026-11-21] [recommend A]
   Why: accepted as recommended (A), as prior art. Reverse: the Spec's challenge step re-weighs it; a bug found there reopens it.

   ```ts
   // before (SC:254): RefundKeepsTotal: { on: E.Refund, check: ({ event }) => … }   // event untyped
   // after: NEW turn   existing: on, check   user-defined: RefundKeepsTotal
   RefundKeepsTotal: turn({ on: E.Refund, check: ({ event, before, after }) => … }), // event typed
   ```

   No body signature types a sibling field from `on` (body:121). B leaves `event` as a union.
3. **Rule names on the type: `Machine<D, Names>` or `Machine<D> & { rules }`?** [decided: user 2026-11-21] [recommend A, given 1 A]
   Why: accepted as recommended (A), as prior art. Reverse: the Spec's challenge step re-weighs it; a bug found there reopens it.
   - **Under A:** an annotated `Machine<typeof X>` defaults its names, as Rules O3 says.
   - **B (SC:376-383):** adds a third type parameter on the function.
   - **If 1 is B:** take SC Ask 2's fallback, where rule tokens are checked at the Story.
4. **How is a Flow-made value recognised?** [decided: user 2026-11-21] [recommend B]
   Why: accepted as recommended (B), as prior art. Reverse: the Spec's challenge step re-weighs it; a bug found there reopens it.
   - A: a `WeakMap`.
   - B: `Symbol.for("flow-state/Made")` on a shared prototype, plus the owner compare.

   Code and trade-off: section 3.1.
5. **T98's place.** [decided: user 2026-11-21] [recommend C] Section 3.2.
   Why: accepted as recommended (C), as prior art. Reverse: the Spec's challenge step re-weighs it; a bug found there reopens it.
   - A: all of T98 before T109.
   - B: keep "T98 first in P5".
   - C: T98a before T113's `derive.ts` and T109, with T98b first in P5.

   C changes your 2026-11-20 placement for T98a only.
6. **Fragment lifetimes: merge `settle` with the two holders, so parked endings are owed rows by address?** [decided: user 2026-11-21]
   [recommend A] Section 3.3.
   Why: accepted as recommended (A), as prior art. Reverse: the Spec's challenge step re-weighs it; a bug found there reopens it.
   - A: the merge.
   - B: FR as written, where `End` drops parked endings.
7. **A node trait's or subroutine's subject is `resetOn`?** [decided: user 2026-11-21] [recommend A]
   Why: accepted as recommended (A), as prior art. Reverse: the Spec's challenge step re-weighs it; a bug found there reopens it.

   ```ts
   // before: subroutine({ id: "ThreeDSecure", … })                 // no subject: mapped writes refused
   // after: existing: subroutine, resetOn   NEW: resetOn on a subroutine's filling
   ThreeDSecure.fill({ resetOn: ({ memory }) => memory.intentId, … })  // writes keyed by the intent
   ```

   B keeps open-item 21 deferred, and mapped writes stay banned under node traits.
8. **Offline: do writes wait on a Host `online` signal?** [decided: user 2026-11-21] [recommend B]
   Why: accepted as recommended (B), as prior art. Reverse: the Spec's challenge step re-weighs it; a bug found there reopens it.
   - A: yes (calls:81-84). This adds a Host member and a lane phase before `OnWire`.
   - B: defer to a P5 Task, so a write sent offline stays a loss.
   - **Why B:** a waiting write is lost on reload anyway (consult 18), so A improves the user experience but does
     not make the result more correct.
   - **Reopen if:** a fixture needs a write that survives a flaky network.
9. **Retries inside a contract function: immediate re-sends only, delays in the machine?** [decided: user 2026-11-21] [recommend A]
   Why: accepted as recommended (A), as prior art. Reverse: the Spec's challenge step re-weighs it; a bug found there reopens it.

   ```ts
   // before (RO:342): Effect.retry({ schedule: Schedule.exponential("200 millis"), times: 2, while: isTransient })
   // after: existing: Effect.retry, O.x.retry   NEW: a flow check hint on a delayed retry in a commit
   Effect.retry({ times: 1, while: appliedNothing })   // backoff: the machine's O.x.retry with a schedule
   ```

   - **Why A:** under A, a cancel during a backoff is visible to the lane.
   - **B:** any `Effect.retry` is allowed.
10. **Test verdict.** [decided: user 2026-11-21] [recommend A]
    Why: accepted as recommended (A), as prior art. Reverse: the Spec's challenge step re-weighs it; a bug found there reopens it.
    - A: `run()` judges every run with SC's switch table (`expectBroken`, `off`).
    - **Rule sources under A:** run rules are in `flow.config.ts` and machine rules in the body. Unused words and
      leftover resources are breaches (TT D1 and D2 with M5).
    - B: keep `checked(run)`.
11. **CLI exits.** [decided: user 2026-11-21] [recommend A]
    Why: accepted as recommended (A), as prior art. Reverse: the Spec's challenge step re-weighs it; a bug found there reopens it.
    - A: `flow story run` exits 1 on a broken rule, and a definition that fails construction is a `check` error
      (exit 1).
    - B: keep @plan.CommandLine.O2, where nothing exits 1 on correctness and a load failure is exit 2.
    - Covers SC Asks 3 and 4.
12. **Boundary-channel API, as proposed?** [decided: user 2026-11-21] [recommend A]
    Why: accepted as recommended (A), as prior art. Reverse: the Spec's challenge step re-weighs it; a bug found there reopens it.
    - A: accept all of them:
      - BC PD1: `onProps` is `P.count.change({ when?, event })`.
      - BC PD2: a fragment emit's handler is `(payload, { key, keys })`.
      - BC PD3: `emits([...])` asserts the exact list.
      - BC PD7: an explicit `undefined` in `setProps` restores the default.
    - B: name the exceptions.
13. **Public surface trims, as proposed?** [decided: user 2026-11-21] [recommend A]
    Why: accepted as recommended (A), as prior art. Reverse: the Spec's challenge step re-weighs it; a bug found there reopens it.
    - A: accept all of them:
      - ET PD2: `textOfKey`, `call` and `make` leave the public face.
      - ET PD3: `render` and `renderAll` are exported.
      - TM Ask 2: `E.X.Type` is the payload, not T113's envelope.
      - RO 8.7: `persist: true` requires `output`.
      - TT D3: `app.reload({ as: SetupB })`.
    - B: name the exceptions.
14. **One notify per publication, and a second tab without persistence until it reloads?** [decided: user 2026-11-21] [recommend A]
    Why: accepted as recommended (A), as prior art. Reverse: the Spec's challenge step re-weighs it; a bug found there reopens it.
    - UH PD1 replaces @plan.React O3's "one notify per task"; UH PD3 sets the v1 scope.
    - B: keep O3.
15. **Second-wave Task boundaries.** [decided: user 2026-11-21] [recommend A]
    Why: accepted as recommended (A), as prior art. Reverse: the Spec's challenge step re-weighs it; a bug found there reopens it.
    - A: accept all of them:
      - BC PD5: split T77 into T77a and T77b, and T72 into toaster and menu.
      - UH PD2: T111 builds the whole binding, and T30 becomes channels and the hydrate overlay.
      - TT D4: coverage items move to T117, and fake-server items to T112.
      - ET: T98a and T98b.
      - SR D5: T92 is the codec and T56 owns the fate.
      - Section 4's owners.
    - B: name the exceptions.

### 6b. Implementation calls for the orchestrator

- TP PD1 to PD4: adopt. TP takes precedence over BC on emits and `Published` (M1, M2), and BC's R5 is reworded (M3).
- BC PD4 (a props turn publishes separately) and PD6 (a throwing handler is reported and stays): adopt.
- FR PD1 to PD4: adopt. FR's `settle` is renamed `reconcile` (M13), and FR 3.3's tables are rewritten (M14).
- SR D1 to D4: adopt. SR adds an `instances` partition (CO 3) and the limit for an added schedule (ledger 9).
  SR's "format 5/6" is corrected to 5 (M15).
- Held lane whose input does not decode: SR's "Held, ends unknown `Restored`" replaces CO 10.
- Machine id rename (ledger 10): SR's `Retired` aside. DL's orphan discard and DL PD5 follow CO 5 (`Unverifiable`).
- RO 8.1 (operation issues are views): adopt, under the user's "Derived issues". Built in one `issues-of.ts` (M7).
- RO 8.3 with ledger 19: an invalid lookup input ends `Defect`, and a live resource with invalid input is not
  placed. Both use the evidence name `InvalidInput`.
- RO 8.4 (`TimeoutError` from a write is unknown, and a type error in `E`): adopt.
- RO 8.6 with ledger 15: one `ReleaseOverdue` warning on D25 for reads and sessions; delete `CleanupOverdue` (M8).
- Ledger 7: save what a ref gave and derive defaults. No API change; the rule goes in SR.
- Ledger 16: close open-item 26 as covered by the fan-out raise; FR's deferred list drops it.
- Ledger B2: one core `decodeExit(schema)`. ET's entry decode and SR's body decode call it. ET's `admit` gets a
  name that does not collide with `core/life.ts#admit`.
- Ledger B3: the lift copies only plain objects and arrays; ET's keep-list goes.
- ET PD1 (`StorageFailure` everywhere) and PD4 (the CLI prints one `Defect`, no cause text): adopt.
- SC Ask 1: `TerminalLeft`, as @plan.Rules.O2 says. SC Ask 5: the CLI's source adapter.
- UH PD4 (props are part of creation before attach) and PD5 (Safari runs only with a display): adopt.
- DL PD6: adopt, with section 4's mint row. DL PD2, PD3, PD4 and PD7 wait for P5, as CO said.
- Section 4's owners: resource entry store, `entry/` kind, `shapeOf` and app digest, disposal table, `InstanceId`,
  clock input, `CATALOG`, `issues-of.ts`.
- The store lives in `platform/memory.ts`, built by T112 (M9). Props change is judged by `sameValue` (M12).
- Every Spec prefixes its ids (M17), cites code, not superseded Specs (M16), and names its symbols against M13.

## Sidecar log

Each finding was checked by a re-read of the cited lines or code before use.

- **Consult ledger** (21 answers and 9 hunks):
  - Accepted: rows 1-6, 8, 13, 14, 16-18, 20 and 21, the six Rules.plan hunks applying cleanly, the three Task
    hunks failing, and the consult's internal mismatches (holes:157-171 against life:170-177). All were re-checked
    with grep and `git apply --check`.
  - Changed: row 9, "partly" to absorbed (only the limit is unstated). Row 10, "not mentioned" to conflicts
    (SR:186 against DL:245). Row 19, "partly" to missing for live resources. Row 7 accepted as missing.
  - Changed: the "accepted" framing, to proposals, per the user's correction.
- **Wave mismatches** (about 75 items):
  - Accepted after reading both sides: 1.1, 1.2, 2.1, 2.2 (reworded as M3), 2.8, 2.15, 2.16, 2.17, 2.18 and 2.19
    (merged as M5), 3.1, 3.2, 3.4, the CO list in section 4 and the HO list in section 5.
  - Changed: the 6.x id collisions are kept as one naming rule (M17), not a defect each. 1.23 (`Story.app`
    against `Story.machine`) is a gap, not a clash: BC adds an entry point that TT's inventory lacks.
  - Not used, as low value for this round: 1.5-1.22 beyond M13, 3.10 and 3.11.
- **Claims against the code:**
  - Accepted, after reading: the mint at `core/tx.ts:182-203` and `core/world.ts:617`, the per-open seed at
    `host/testing/run.ts:132-140`, `FORMAT = 5`, `consumersFirst` at `core/disposal.ts:152`, the `settle` and
    `admit` collisions, and no `Made` or `Symbol.for` in `src`.
  - Not used (true, but off this round's seams): G9's count, DL:367's description of boot, and the `NotAdopted`
    dead variant.
- **Seams:**
  - Accepted: seams 1-5, 7, 8, 9, 14 (as section 3.2), 15, 16 and 18.
  - Rejected: 10's claim that ET claims `issues-of.ts`, since ET:60 calls issues a view and names no file.
  - Changed: 13 (read Owners). The consult already forks shared reads in `work`, so only one-off lookups differ
    (section 3.3).
  - Not verified, so not used: 19 (the F3 status against revisit.md:171).
