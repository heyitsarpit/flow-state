# Phase 2 completion audit

Status: current. The completion audit of roadmap phase 2 (plan merge and core Specs), 2026-11-09, by an
independent auditor (Opus) with four read-only Haiku sidecars. The plan merge itself was audited
and re-checked in `plan-merge-audit.md`; this audit takes that as given. The Specs under
`specs/core/` (commits 97277826..90d4ffa0), `spec-split.md`, `spec-log.md` and `spec-refcheck.pl`
had no previous check. Every finding below was read in the files by the auditor. Nothing here is a
user decision.

## Verdict: PASS-WITH-FINDINGS

Every Done-when item holds. The Specs are mostly faithful, scoped and lean. But five findings must
be fixed before phase 3 writes oracles from them: three cross-Spec contradictions, one guarantee no
host can meet, and wrong runtimes that are cited as evidence but cannot run. All five are text fixes
to the Specs, with plan wording from the plans or the prototype. None needs a rewrite.

## Done-when

| Item | Result | Evidence |
|---|---|---|
| Every touched `.plan` merged | holds | `plan-merge-audit.md` re-check PASS-WITH-FINDINGS (d08fa4d3). No plan has changed since 6c7c5f43/7f7afad2. |
| Every superseded decision marked | holds | `references/superseded.md` (515 lines), per amendment 12. |
| Specs for phases 3-4 only | holds, with over-design noted below | 10 Specs under `specs/core/`. Feature areas are listed in `spec-split.md` §"Written when their phase starts". |
| No plan text claims an undecided decision | holds for plans | The Specs do drop "(the runner's ruling)" tags from the plans (minor m14). |
| `workflow check` | passes | "Repository is valid." |
| `spec-refcheck.pl` | passes | "refcheck: ok". It checks only that ids occur as strings; it does not check that a mutant still applies (see B4). |

## Blocking findings (fix before phase 3)

**B1. Old-version lanes: WriteLanes contradicts Restore and the prototype.**
- `WriteLanes.spec:114-117` (R11): a lane "of an older identity version or an older key
  fingerprint is an old-version hold" that declines every commit `NotSent { OldVersion }`.
- `Restore.spec:69-74` (R6): an older *identity version*'s lanes are re-keyed to `key#identityTag`,
  "blocking nothing". Only an older *key fingerprint* is a hold.
- The plans carry the same split: `Operations.plan:227` against `Persistence.plan:178-185`.
- The prototype follows Persistence: `round-14/durable.ts:521-574` re-keys, and `lane.ts:639-668`
  declines only on the key fingerprint.
- Fix: drop "an older identity version" from WriteLanes R11 and I17. Log the plan conflict for the
  runner. The prototype is the main truth (amendment 11).

**B2. The delivery count contradicts itself across Turn, WriteLanes and Restore.**
- `WriteLanes.spec:238-240` (I15): "the count of Delivered for a is 1, plus one more only for a
  refused re-send capture."
- Restore I6 (`Restore.spec:148`) delivers `unknown { Restored }` once per *incarnation*.
- WriteLanes R10 itself redelivers after an outcome-mapper throw (`:109-111`).
- R16/I22 (`:158-164`, `:256`) deliver nothing on a releasing lane.
- R3/R4 make several endings evidence only (bare writes, Superseded).
- `Turn.spec:28-29` (R9) and I15 (`:269`) say an Unhandled or Denied event "publishes nothing, changes
  no revision". `Machines.plan:168-170` says an ending admitted at step one "keeps its lane effects
  and counts as delivered" even then, and lane-only changes publish (`:302`).
- Phase 3 would write an oracle that fails a correct runtime.
- Fix: state the count once, in WriteLanes: delivered *or* recorded as evidence. Name the
  exceptions: per incarnation for `Restored`, a redelivery after a refused turn, and nothing while
  releasing. Add the plan's exception to Turn R9/I15.

**B3. Attempt ids: "random" against "exceed every id on disk".**
- `WriteLanes.spec:58` (R5) says "Flow mints id, random".
- `WriteAhead.spec:108-109` (R12) and `:202` (I18) say ids minted after restore "exceed every id on
  disk". Random ids cannot do both.
- The prototype mints counters floored by boot (`round-14/durable.ts:333-336`, `step.ts:571`).
- AGENTS.md also rules out randomness in the core.
- There is a real-app concern too. The plan lets a money write key the server by the Attempt
  (`idempotency: "attempt"`, `Operations.plan:36-38`). A counter that is unique only per scope can
  collide across devices or users at that server, so a different payment would be deduplicated
  away.
- Recommended fix (runner's call): the id is unique across scopes (entropy supplied by the host
  through the mint, so the core stays deterministic under a seed), and is never reused within the
  scope. I18 then becomes "never equal to an id on disk", not "exceeds". Restore I3 already says
  that.

**B4. Seven cited wrong runtimes no longer apply, so they cannot kill.** Their edit strings are absent
from the current round-14 source (checked by script and by hand). `conformance/mutate.ts:61-64`
reports such a mutant as ROTTED. `mutants-r9b.ts:1` itself says the `mutants-r9.ts` list names code
D122 removed, "not rerun".
- `d114.decline-no-input`: WriteLanes.spec:366.
- `d118.let-go-keeps`: WriteLanes.spec:368. `lane.ts:87` is now `Kept: "nothing"`.
- `d123.keyless-cancel-nothing`: WriteLanes.spec:355.
- `d122.mail-fifo` and `d122.rota-forgets`: Actors.spec:488. `world.ts:456` was rewritten.
- `durable.head-first-at-restore`: Restore.spec:235.
- `durable.memory-decode-failure-ignored`: Restore.spec:253. `durable.ts:382` now takes three
  arguments.
- Fix: cite a live mutant for each guarantee, or write "no prototype wrong runtime" so that phase 3
  writes one.

**B5. A guarantee no host can meet: WriteAhead I12, "A dirty plain record lands within 5 s".**
- The plan says "nothing bounds a wait on storage (a stated limit)".
- A frozen page runs no capture, and Safari loses the last batch on tab close
  (`Persistence.plan:116-122`).
- An oracle with slow fake storage would fail a correct runtime.
- Fix: "a capture is *issued* within 5 s, or at once after hide, pagehide or a lane batch". Carry
  the stated limits into WriteAhead.

## Minor findings

These are plan guarantees the Specs dropped or blurred. They are fine to fix area by area as
phase 3 reaches each oracle: re-read the cited plan outcome before writing the oracle.

**Turn and Compile**
- m1. Turn R7 drops the lane views: guards, selects and updateMemory see pre-turn lanes plus the
  admitted ending; keys, when, placement selects and rows see the lanes with this turn's members
  applied (`Machines.plan:187-191`).
- m2. Turn R14 drops two rules (`Machines.plan:167-168`, `:273`):
  - the implicit unguarded `self` handler for an event listed in armOn or disarmOn, which changes
    Denied against Unhandled;
  - "armOn on a keyed schedule is a construction error".
- m3. Turn R17 drops "re-arming, disarming or exiting removes a waiting deadline" (`:278`).
- m4. Turn R16 drops several rules: restartOn per key, listRepair for a repeated key, and per-key
  dueAt persistence (`:270-274`).
- m5. Turn R18 says "one activation", but the plan says "one state or trait incarnation".
- m6. Turn R6 drops "re-evaluate resetOn into pending resets" at commit.
- m7. Turn R21 drops "whatever the transition cancels" and the flow-check error for a late handler
  that has no stay-put alternative (`Machines.plan:314-318`).
- m8. Turn R23 drops fragment slices: undefined while inactive, present while frozen (`:334-343`).
- m9. Compile R11 narrows "maps anything" to "maps endings". It also drops "elsewhere it may own
  reads, streams and bare writes" and the read surface outside the fragment (`Machines.plan:89-95`).
- m10. Compile `model` invents "rule order is the order of R4 to R13" (`Compile.spec:154`). Mark it
  proposed.

**Actors**
- m11. Actors R9 drops this rule: a new incarnation of an equal local identity disposes the older
  one and adopts its lanes (`Runtime.plan:129-131`).
- m12. Compile T10 refuses missing wiring at "construction or setup"; Actors R18 refuses it at
  admission (`Compile.spec:316` against `Actors.spec:169-171`).

**Writes, reads and persistence**
- m13. WriteLanes R5 drops "the commit author puts id on the wire; Flow sends nothing itself"
  (`Operations.plan:157-158`). As written, it reads as though Flow guarantees what goes on the wire.
- m14. The Specs drop the plans' "(the runner's ruling)" and "(agent-judged)" tags. Examples:
  - Restore R5 (overwrite), R7 (decided per record, the stated price of any structural change) and
    R8 (undeclared machine discard);
  - WriteAhead R12 (store contract);
  - Reads R12, which drops "this bound is the plan's own" for the 256 batch.
- m15. Proposed names are left unmarked:
  - Restore R8: HoldForgotten, OpRenamed, LaneRekeyCollision;
  - StaticCli R10: SharedContract, ReservedReason;
  - WriteLanes R3: ModuleDisabled, Abandoned.
- m16. Reads R10 drops "releasing one owner preserves shared work until the last owner leaves".
  Reads R8 drops "explicit requests use the caller's input". Reads R13 drops "a failed refetch keeps
  the look uncertain" and "a release before forced repair removes nothing".
- m17. Reads R2 says `1n` restores as `"$1n"`, but R3's list of accepted values omits bigint.
- m18. The transaction `idempotency` option is in no Spec (`Operations.plan:36-38`). It feeds
  check's money-write warning. `guarded` is entity material and belongs to phase 5.
- m19. Restore R5 has two problems. "Starts fresh" on an unreadable scope loses acknowledged
  Attempts. And I13 ("lanes are never dropped") needs that case as a stated limit.
- m20. WriteAhead and Restore never cite Codec. Codec R1 puts persisted records under its bounds,
  4,096 items per array among them. That puts a limit on real apps: memory holding a 5,000-item list
  never persists (UnencodableValue). State it in WriteAhead.

**Diagnostics**
- m21. Diagnostics R8 drops several plan rules (`Diagnostics.plan:201-204`):
  - Promise adapters and AbortSignal keep the full Cause;
  - Exit and Cause survive evidence acceptance;
  - operation failure, defect, interruption and unknown stay distinct.
- m22. Diagnostics R2 and T1 test closed `details.reason` values, but the plan defers those values
  (`Diagnostics.plan:232-234`).
- m23. InvalidTurn is a denial code (Diagnostics R4/I4). Yet Turn T6 and Actors R13 say a turn "is
  rejected with InvalidTurn and one issue". Say which Diagnostic code the issue carries.

**Test claims**
- m24. Some cited wrong runtimes target something other than the claim:
  - `p1h.default-runs` (Compile T1) removes the ImpureDefault refusal. It does not make construction
    run anything, so inertness (zero spy calls) has no wrong runtime.
  - `m1.key-order-matters` (Reads T2) edits `sameSet` in key-version comparison (`lane.ts:594`). It
    belongs to T3, not to key-text order.
  - `d74-*` and `d76-*` (Reads T9) edit `entities.ts`, the entity confirm path, not resource reads.
  - `o6.no-bound` (Actors T16) is killed by the wait-for-fibers case, not the 5 s bound.
- m25. These Invariants have no test citing them:
  - Turn I1, I2, I10, I11, I15, I25;
  - WriteLanes I1, I2, I4, I5, I10;
  - WriteAhead I2, I5, I8;
  - Restore I3, I9;
  - Compile I4, I9;
  - Actors I9.

  Turn I1/I2 and WriteLanes I1/I2 are core safety properties.

**Split and text**
- m26. The split promises that "each plan outcome lands in exactly one Spec", but three outcomes are
  sourced by two Specs: Machines.O1 (Compile, Turn), Runtime.O3 (Actors, Restore) and
  CommandLine.O5 (Compile, StaticCli). Two rules are duplicated as a result: OldVersionActor
  (Actors R11 and Restore R6) and `dispose({ forget })` (Actors and Restore R10). `transaction` is
  provided by both Reads and WriteLanes.
- m27. Line-wrap artifacts:
  - "State names is and child" (Compile.spec:98);
  - "Vin" (Compile.spec:167);
  - "exactlyonce" (Restore.spec:148);
  - "rewriteand" (Restore.spec:122);
  - "one;no" (Turn.spec:236);
  - "placeholder,InvalidKey" (Reads.spec:157);
  - stray mid-sentence breaks throughout.

## Over-design to cut (amendment 13)

1. **The unproved parts of Reads.** These are staleTime, gcTime, trailing refetch, setData, clear,
   placeholders, key bounds, the 256 batch and optimistic stacking. Reads Q2 says the prototype has
   none of them, and phase 3 is to write their oracles "from this Spec alone". Phase 4's goal is
   "what the prototypes proved". Recommended (runner's call): keep R5-R13's proven core, and move the
   unproved clauses into a "built later" open item, written when phase 4's operations module reaches
   them. Otherwise, record explicitly that phase 4 builds them unproved.
2. **The entity rules in WriteLanes R13.** These are the 4,096 many-key bound, the record-queue join
   and store-module ModuleDisabled. Keep only the lane-side hook (store effects publish before the
   ending is queued). The rest goes to the entity-store Spec in phase 5.
3. **Codec and Diagnostics.** Both are written with no pinned prototype case (Codec Q2; no
   FlowError codec in round-14). They are small and foundational, so keep them. But treat them as the
   least proven Specs and expect revision.

The composition notes ("design note, proved by the prototype") are short and cite prototype files.
That is within to-design's bounds. I found no other implementation detail stated as a guarantee.

## Core design across different apps

The core contracts hold up for very different apps. This was checked against a payments flow, a
long list editor, a polling dashboard, multi-step forms with subroutines and a chat-like feed
(streams deferred). The pure turn, FIFO mailboxes with rotation, the 64-follow-up cap, the honest
three-channel ending and restore without replay are each sound as stated. The exceptions are B3
(the Attempt id must be unique across scopes for server idempotency), B5 (no storage bound exists)
and m20 (the codec bound caps persisted list sizes). Actors R3 storage-first boot is not met for
certain, but Actors Q3 already holds the fallback.

## The Specs lead's sidecar log (`spec-log.md`)

The log is not a pure rubber stamp. It rejects one row with a reason (`edge.no-retry-cap`), changes
two, and confirms Reads' missing features by grep. It is thin in two places:
- "Existence" means `spec-refcheck.pl` found the id as a string. Nobody checked that a mutant still
  applies, which is how B4's seven dead mutants got through.
- "Kill read" confirmed that a mutant names its case. It did not confirm that the mutant breaks the
  property claimed, which is how the m24 mismatches got through. No row covers the
  `mutants-r8/r9/r9b` ids that WriteLanes, Actors and Restore cite.

Recommendation: extend `spec-refcheck.pl` with the applicability check in the auditor's scratch
script (`mutcheck.pl`, described below).

## Sidecar log

Four Haiku sidecars ran at effort high, read-only: (a) Compile, Turn, Actors, Codec; (b) WriteLanes,
Reads, WriteAhead, Restore; (c) Diagnostics, StaticCli, the split, cross-Spec consistency; (d) test
claims. The auditor also ran two scripts in scratch:
- a mutant-applicability check. It found 88 cited mutants that apply and 7 that do not, which went
  to B4;
- an untested-Invariant count, which went to m25.

| Sidecar | Finding | Result | Why |
|---|---|---|---|
| a1, a3-a10 | Turn and Compile drops | accepted, as m1-m9 | Each read against the Machines.plan lines cited. |
| a2 | Unhandled/Denied ending keeps its lane effects | accepted, as part of B2 | Machines.plan:168-170 read. |
| a11-a13 | Compile R11/R4/R14 narrowings | R11 accepted (m9); R4 and R14 rejected | R4's broadening is harmless wording. R14's token helpers are typing details for to-design. |
| a14-a17 | Actors drops | a16 accepted (m11). a14, a15 and a17 changed to "covered elsewhere or low value" | getSnapshot fallback and kill-before-capture are thin but not contradictory. |
| a18 | Invented rule order | accepted (m10) | |
| a19-a21 | `identityKey(ref)` and other derived names | rejected | Model names in a Spec's model section are notation, not API. |
| a22 | Actors R3 storage-first stated as a must | rejected | Actors Q3 carries the plan's open question and its fallback. |
| a23 | Delivery order: I14 against R10 | rejected | "Parked" there means two different sets: Interrupted endings parked for the identity at its end, and lane parked endings. Runtime.plan:122-124 against 135-137 agree. |
| a24 | WorkInFlight "kept read" | rejected | Low risk; model wording only. |
| a25 | Wiring timing | accepted (m12) | |
| a27 | React handles in Actors I5 | rejected | A cross-cite allowed by spec-split.md:92-93. |
| b1 | Random ids against the id floor | accepted, as B3 | Prototype durable.ts:333 and step.ts:571 read. Real-app collision reasoning is the auditor's. |
| b2 | Restore fresh-start drops Attempts | changed, to minor m19 | Applies only when nothing is readable. It is a stated limit, not a contradiction to fix. |
| b3, b5 | Delivery count | accepted, as B2 | |
| b4 | 5 s lands | accepted, as B5 | |
| b6 | Same id on the wire | changed, to m13 | Flow passes the Attempt. The plan's "author puts id on the wire" was dropped. |
| b7 | "Never reuses an Attempt identity" against a restored id | rejected | A restored Attempt is the same Attempt, not a reuse. |
| b8 | "No remote write is repeated" against user retry | rejected | R14 says "automatically" in the sentence before. |
| b9 | Cancel and timing | rejected | Over-reading. |
| b10 | Plain error as definite failure | rejected | A plain error is the Effect typed channel, which the author chooses. Throws and rejections are unknown (Defect), which is correct for fetch. |
| b11-b14 | Unmarked proposed names and dropped tags | accepted, as m14/m15 | |
| b15 | Key-less members under serialize | rejected | Spec R9 limits them to "that ending's own Attempt", which matches the plan. |
| b17 | SharedContract missing | rejected | It is in Compile R9 (Compile.spec:76). |
| b18 | Transaction idempotency | accepted (m18) | |
| b19 | Compensation recipe | rejected | A recipe, not a guarantee. |
| b20 | disposeActor/forget rules | rejected | Covered by Actors R20 (Actors.spec:185-191). |
| b21-b25, b28, b30, b32 | Assorted plan detail | b23 accepted inside m14. The rest rejected for a lean guide | |
| b26, b27, b29 | Reads drops | accepted (m16) | Read against Operations.plan:108-115, 78-90 and 325-333. |
| b31, b33-b37 | Phase-5 content | b36 accepted (over-design 2). The rest rejected as permitted cross-cites | |
| c1 | Diagnostics R8 drops | accepted (m21) | |
| c2 | Diagnostics.O2 is proposed | rejected | Every plan is status proposed. |
| c3 | Closed `details.reason` | accepted (m22) | |
| c4 | Unmarked names | accepted (m15) | Actors:152 is a second use in the same Spec, so that instance is fine. |
| c5 | Selection rules | rejected | StaticCli is lean on config; low risk. |
| c6 | Story commands in R1 | rejected | R1 defers them explicitly. |
| c7 | Warnings unowned | rejected | R10 and R11 cite the plan's list. |
| c8 | Recorded-position timing | rejected | Compile R1 does not forbid it, and it is entity material (phase 5). |
| c9 | idempotency/guarded | changed (m18) | guarded belongs to phase 5. |
| c10, c11 | Duplicate owners | accepted (m26) | Confirmed by a source-count script. |
| c12 | Codec not cited | accepted (m20) | |
| c13 | InvalidTurn | changed, to wording (m23) | |
| c14 | Delivery count | accepted (B2) | |
| c15 | Mapper throw | rejected as a contradiction | The plans distinguish the outcome mapper at admission from post-commit mappers. Clarity only. |
| c16 | Old-version lanes | accepted, as B1 | |
| c17 | One-off read lanes | rejected | WriteAhead R4 keeps parked Interrupted endings in the actor record. |
| c18 | Context wave | rejected | A return is not a boot restore. |
| c19 | Wiring timing | accepted (m12) | |
| c20 | Subject path in the lane key | rejected | The subject path is an attribute of the lane, not part of its key (Runtime.plan:137). |
| c21, c22, c24, c26, c27 | Term and scope quibbles | rejected | No behaviour conflict. |
| c23 | bigint | accepted (m17) | |
| c25 | Boot bound value | rejected | Deferred to build time (Runtime.plan Q2). |
| c28 | Typos | accepted (m27) | |
| d-A | All ids exist; Codec and Diagnostics unpinned | accepted | The Codec part is changed: round-14/codec/codec.ts exists, and the bounds are unpinned, as Codec Q2 says. |
| d3, d5, d16, d17, d19 | Mismatched targets | accepted (m24) | d74/d76 target entities.ts (mutants-r6.ts:75-78, 239-242). |
| d12, d13 | Rotted mutants | accepted, extended to 7 (B4) | |
| d18 | `lie:a3.like-row-hidden` survives | rejected | Stale. STATUS.md:1281 records the drain rebuilt and the lie killed (`drain.row-hidden`), and like.search.ts:94 is fixed. |
| d-C | Tests with no case | accepted | Each Spec admits these in its Q2. |
| d-D | Untested Invariants | accepted (m25) | Recounted by script. |
| d-E | No red-round log of kills | rejected as a finding | The red-round files predate these ids. Kill evidence lives in STATUS.md tables. |

Scratch scripts (not committed):
- `/private/tmp/claude-501/-Users-arpit-Developer-flow-state/7c804465-a799-49f4-a9d6-e0e809037e27/scratchpad/mutcheck.pl`
- `/private/tmp/claude-501/-Users-arpit-Developer-flow-state/7c804465-a799-49f4-a9d6-e0e809037e27/scratchpad/invcheck.pl`
