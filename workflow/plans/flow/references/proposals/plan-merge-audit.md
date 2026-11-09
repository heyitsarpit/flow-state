# Plan merge audit (phase 2, independent)

Auditor: an independent Opus agent that did not do the merge, with four Haiku sidecars (effort high, read-only).
Scope: the 14 plans at `1183c948` (merge `75a73b84..1183c948`) against `machine-design.md` (OD1-OD54, section 5),
the prototype (`round-14/STATUS.md`), `plan-merge-log.md`, and the user's words in `progress.md`. Date 2026-11-09.
Nothing in this file is decided by the user; every recommendation is the auditor's.

## Verdict: FAIL (fixable in one bounded text pass; no re-merge)

The merge is broad and mostly faithful: 436 `@plan` references resolve, `workflow check` passes, and about 45
sampled superseded quotes sit where the log says they do, with correct pointers. But phase 2's own Done-when items
fail in a few places: plan text attributes a runner reading to the user, a command the user cut comes back
unmarked, one block of contract is deleted without a quote, runner rulings carry no mark, and the merge's
conflicts reach no read list. Fix B1-B8 before Specs. Every fix is a few lines. The minor findings can be done in
the same pass or carried into the Specs.

Gates run by the auditor: `workflow check` returned "Repository is valid." A reference check of the auditor's own
(`refcheck.py` in the session scratchpad) checked 436 `@plan.X.Y` and local `@Y` references and found 0 dangling.
It was falsified on a scratch copy with `@plan.Runtime.O99` and failed as expected (1 missing).

## Blocking findings (fix before Specs)

**B1. The per-record reset is attributed to the user.** Persistence.plan:31-33 says "per-record checks with no
app-wide or manual version (C211; the user's Q1 A, OD54)". Persistence.plan:221-226 states the per-record reset
with no mark. The user's answer was per definition ("that definition's saved memory and state are discarded";
progress.md Log 2026-11-09, `MIGRATION-QUESTIONS.md`). Per record is the runner's narrowing: OD54 (8) says so
(machine-design.md:9896), and read-list entry 1 says "narrows your Q1". The same attribution appears in
plan-merge-log.md P-2.
Fix: "per definition (the user's Q1 A), decided per record (the runner's ruling, OD54 (8))" in both places.

**B2. `trace diff` comes back, though the user cut it (CLC1).** CommandLine.plan:10-11 lists
`trace diff <left|-> <right|->` unmarked. The user's 2026-11-02 CLI scope cut both "`flow diff --base` and
`trace diff`". The plan cites that scope for `diff --base` only (CommandLine.plan:54, :242) and leaves out the
`trace diff` half. The basis for keeping it is one sentence in the 2.10.14 body (machine-design.md:5648-5649). The
OD43 entry itself (machine-design.md:9562-9563) says only `flow trace <story>`, `flow graph` and output for people.
Call 17, which OD43 accepts, says "There's no trace file format yet" (FOR-ARPIT at `04e314f4`, row 17). So no
user record puts `trace diff` back. Re-adding a feature the user removed is a large change under amendment 9.
Fix: hold it. Either cut `trace diff` (and say the export has no CLI diff) or mark it "(proposed, held for the
user)". Put it on the read list. Also record the 2026-11-02 CLI scope in the repo (design OD or progress.md),
because today it exists only in private session memory (`cli-kept-small.md`).

**B3. Runner rulings carry no mark, which by the log's own convention (plan-merge-log.md:19-20) reads as the user's
decision.**
- Persistence.plan:245-247: a removed machine's actor records are discarded and its lanes quarantined (PC1).
- Persistence.plan:247-249: a dormant record is quarantined (PC2).
- EntityDomains.plan:31: `version?` is optional (EC2).
- LazyFeatures.plan:80-81 cites "PC1"/"PC2", which are merge-log ids. A plan reader cannot resolve them without
  the log. Replace them with the C rows and the runner's-ruling mark.

**B4. A block of contract was deleted silently.** The pre-merge Operations.plan:101-104 (at `75a73b84^`) said:
"Invalid success writes apply nothing and report InvalidWrite; the commit still succeeds. A success write never
overwrites data that landed after the commit started; it marks that entry stale instead". Neither sentence is in
the merged plan, quoted or carried. The log has no row for them, and Diagnostics.plan:103 still sends
`InvalidWrite` to Operations O3. Success writes still exist (C15: `writes` on the operation), and the prototype
never went here. So this is content the merge had to keep.
Fix: restore both rules in Operations O3, or quote them with a pointer to whatever replaces them.

**B5. The lane identity is stale in two plans and contradicts itself in one.** C214 / OD54 (7) defines a lane as
"(identity with its version, contract id, key)". Operations.plan:248 and Runtime.plan:139 say that. But
Operations.plan:188, Operations.plan:273-274 (the replacement text) and Persistence.plan:61 still say "(actor
identity, contract id, key)".

**B6. Diagnostics' closed vocabulary leaves out the stream flags.** Diagnostics.plan:51-53 says "a code outside this
list is a defect", and Diagnostics.plan:192 says C103's names were added. The design (machine-design.md:5424) makes
2.11.13's flags `diagnostic` records, and Inspection.plan:43-45 lists them. None of these appears in Diagnostics:
`ValuesWhileDown`, `RegistrationChurn`, `ProofWithoutPosition`, `PingsWithoutLive`, `IdleWithoutPing`,
`DeliveryDenied`, `FillsUntouched`, `FillsOtherKey`. `ReleaseOverdue` is a flag in Inspection and the design but an
"issue" in Diagnostics.plan:113.

**B7. Proposed names appear as final.** Read-list entry 10 says none of these is confirmed, yet these plans never
mark them:
- `RepairOverdue`, `RecordHeld`, `UnsettledEvicted` (EntityDomains.plan:165, 170, 196, 290);
- `RecordUndecodable` (Diagnostics, Inspection, LazyFeatures, Persistence, Runtime);
- `LaneRekeyCollision`, `OpRenamed`, `HoldWithoutRecord`, `UnboundLane`, `LaneRekeyed`, `IdleWithoutPing`
  (Inspection);
- `SharedContract` (Machines, Operations, CommandLine);
- `contract.get` (React.plan:109, 120).

Fix: mark each name at its first use in each plan.

**B8. The merge's conflicts reach no read list.** Amendment 11 says merge decisions are "recorded for the user's
read", and the user asked on 2026-11-08 to be told of "any public api changes" (progress.md:480). The read list
has no phase 2 entries; the conflicts appear only in one Log line (progress.md, 2026-11-09 "phase 2 merge done").
Amendment 11 also asks for "an independent reviewing agent" to judge each merge decision. The log records
"Judge: the runner" (the merge lead) on every agent-judged conflict, and no independent judge. This audit's table
below is the first independent judgement. See "Read-list gaps" for the entries to add.

## Minor findings

1. **Diagnostics owner pointers name plans that never state the code.** A reader cannot learn the contract from the
   cited owner:
   - `EndedWithWork` points to Runtime O3 (Diagnostics.plan:97); neither Runtime nor CommandLine names it.
   - `LaneRekeyed` points to Persistence O5 and Runtime O6 (Diagnostics.plan:135); only Inspection names it.
   - `MissingContextProvider` and `ContextCycle` point to Runtime O5, which describes them without the names.
   - `InvalidUsage`, `ConfigLoadFailed` and `OutputFailed` point to CommandLine, which doesn't name them.
   - `DehydratePersistentSetup` points to SSR O1, which makes the case a type error.
   - `StoryInvalidCommand` points to Testing O1 and O4; it is in O8.
   - The denial codes point to Machines O4: `InFlight` and `LateMayNotLeave` are in Machines O6, `RetryLimit` is in
     Operations O3, and `Uncertain` and `NothingToResend` are not in Machines at all.
   - Diagnostics.plan:33-35 calls `NothingToResend` and `InFlight` "records, not codes" and then lists both as
     denial codes.
2. **PKC1 left Diagnostics behind.** Diagnostics D1 (Diagnostics.plan:230-231) still says capability-specific error
   classes are not public APIs, while Package exports `PropertyTestFailed` (and `Fake.Lost`/`Refused`/`Closed`
   classes, per C82). Fix: add the exception to D1.
3. **Runtime O4 (Runtime.plan:207-215) drops decided content from 2.7.x.** Missing: "no fallback alternative and no
   API for it" (decided, call 19, OD47); "a decline is kept on its key's lane and blocks nothing"; "a boot forgets a
   stranded read"; and the stated gap (no evidence for a kept try or a released stranded read, OD49 (11)). The
   stated gap is a limit, not a proposal, so it belongs in the plan even though its proposed fix does not.
4. **Wording defects.**
   - Machines.plan:47, "(IdentityFieldOptional, proposed name, otherwise)", is garbled.
   - CommandLine.plan:15-16, "the user accepts the exact outputs in production", reads as already accepted. Write
     "to be accepted by the user in phase 5".
   - FlowState.plan:15, :26, :86 and Persistence V7 say "second-tab refusal", but the second tab runs without
     persistence (Persistence.plan:327-330).
   - FlowState.plan:14 leaves fragments, traits and subroutines out of Machines.
   - Runtime.plan:117, :122, :301, React.plan:80 and ServerRendering.plan:50 still say "activities", which C40
     renamed to placements.
5. **Pointer convention breaks.** Machines.plan:133 and :361 cite "rule 22". Inspection.plan:139 points `flow trace`
   to CommandLine O4 (trace queries), but the command is in CommandLine O1/O2.
6. **Labels.**
   - MC1 is labelled "agent-judged" but its judge is "the user (Q5 A)".
   - CLC2 is labelled agent-judged, but `story list --coverage` is the user's own 2026-11-02 wording. The outcome is
     right; the label is inverted.
   - Log P-2 repeats B1's attribution.
7. **Merge-log claims that don't hold.**
   - S3 is "accepted ... each name used here against the design by grep (all present)" (log:341-342). Many
     Diagnostics names are not in the design, for example `InvalidConfiguration`, `SchemaValidation`,
     `HydrationRejected`, `DuplicateFixture`, `InvalidUsage`, `UnknownSelector` (0 hits each). They are pre-merge
     plan names, which is legitimate to keep, but the log's verification claim is false as written.
   - The summary's "No merge needed a large public API change ... the user had not decided" (log:582) is
     contradicted by B2.
8. **Removed without a quote (paraphrase or drop).** The auditor's script (`silent.py` in the scratchpad) found 45
   pre-merge sentences with no 5-word overlap in the merged plans. Most turned out to be paraphrased carry-overs or
   covered by an ellipsis quote. These still need a look, because no quote marks them:
   - Operations: "Neither restore nor hydration invokes a commit."; "Runtime disposal of a persisted actor saves them
     instead"; "Late completion of replaced work cannot deliver another outcome or affect a later actor incarnation";
     "Flow mints a unique id; adapters receive it for remote idempotency"; "Boundary transfer without result follows
     @plan.ServerRendering.O3".
   - Machines: "State changes, activity changes, schedule arming and the complete action batch validate before
     publication"; "'self' changes no state and restarts no work, including at the root".
   - Runtime: "Disposing and then ensuring the same ref creates a new incarnation".
   - React: "Reattach before expiry keeps the actor ..." and "React Activity hiding beyond grace disposes local
     actors".
   - EntityDomains: "Uncertain (...) forces the loader and every holder to refetch ...".
   - CommandLine: "Cancellation and cleanup evidence follow @plan.Testing.O8".

   Each is either still true (restate it) or replaced (quote it with its row).
9. **Ambiguities the Specs must settle.** These are design-level or pre-merge, not caused by the merge:
   - ServerRendering.plan:37 ("future schedules do not delay settling") against Testing.plan:261-262 (`dehydrate`
     moves time "deadline by deadline").
   - React.plan:124-127 ("admission failures ... rethrow") against ServerRendering.plan:117-121 (hydration
     rejection only reports and falls back).
   - Testing's `StoryTurnLimit` has no `details.reason` in Diagnostics.plan:158.
   - `StoryFakeError`'s reasons (Diagnostics.plan:164-165) are not named in Testing O3.
   - `Hydrate`'s contract lives only in ServerRendering O4, though Package lists it under `flow-state/react`.

## The 25 conflicts

| Id | Merge label | Auditor | Why |
| --- | --- | --- | --- |
| MC1 | agent-judged; judge the user | agree (relabel) | `persist` false on the definition is Q5 A / U19 A. It is a user decision, so the label "agent-judged" is wrong. |
| MC2 | runner | agree | Wording only; 2.7.17 doesn't rename `disposing`. |
| OC1 | runner, small API | agree | `contract.get` follows the descriptors-to-contracts rename. Mark it proposed in React too (B7). |
| OC2 | runner | agree | No row changes the resource lane's tags. |
| OC3 | runner | agree | The 256 bound is pre-merge plan text (old Operations.plan:143-144), kept where the prototype never went. Not a new ruling, but the plan should say "not in the design". |
| OC4 | placement | agree | Placement only. |
| RC1 | runner | agree | C160 is design contract the prototype never reached. |
| RC2 | runner | agree | 2.7.17 says it amends Runtime O3. |
| PC1 | runner | agree on substance; **mark it** (B3) | A consistent reading of the user's U4: no new guarantee. It must carry "(the runner's ruling)" and go on the read list. |
| PC2 | runner | agree on substance; **mark it** (B3) | Follows R14 D7 / C143 (OD45, user-approved). Same marking gap. |
| PC3 | for the user's read | agree | Already marked in Persistence.plan:228; read-list entries 2 and 13. |
| EC1 | runner | agree | Wording. |
| EC2 | runner | agree; **mark it** (B3) | `version?` optional is implied by C169 and the `flow check` warning, but C198 shows it unmarked. |
| IC1 | runner | agree | `Compiled` contents are agent-judged (OD46). |
| IC2 | runner | agree | Follows the user's Q1 A (no app-wide version). |
| DC1 | runner | agree | Regrouping. The list is still incomplete (B6). |
| DC2 | runner | agree | Pre-merge content, kept where the prototype never went. |
| CLC1 | applied as the user's decision | **disagree; should have been held** | `diff --base` cut: agree. `trace diff` kept: the user cut it on 2026-11-02, and no later user record (the OD43 entry, call 17) re-adds it. The re-adding sentence is the design writer's 2.10.14 body text. See B2. |
| CLC2 | runner, small name | agree (relabel) | The user's own 2026-11-02 words. Judge: the user. |
| CLC3 | runner | agree | Follows the decided "the run never yields". |
| TC1 | runner | agree | Marked in Testing.plan:243 as the runner's reading. |
| TC2 | runner | agree | Stubs keep ids and quote the removed outcome. |
| PKC1 | runner | agree; fix Diagnostics D1 (minor 2) | C82 is a decided Stories row (W25, W38). |
| FSC1 | the user | agree | The approved roadmap plus AGENTS.md. |
| SRC1 | runner | agree | Checked: the pre-merge O3 never held "client or persisted actors beat hydrated copies" (old ServerRendering.plan:57-60). The phrase is O5's actor precedence. C49's rule and 2.7.13's SSR row concern lanes only. |

Should have been held: CLC1's `trace diff` half. Nothing else is a large public API change or a guarantee change
the user did not decide.

## Read-list gaps (progress.md, "Calls for the user's read (added 2026-11-09 ...)")

Missing entries:
1. **A phase 2 section** (B8). It needs:
   - CLC1's `trace diff` (held);
   - PC1 (a removed machine's lanes quarantined) and PC2 (dormant records quarantined, not discarded);
   - OC1 `contract.get` (proposed);
   - OC3, the plan-only 256-identity batch bound;
   - EC2 `version?` optional;
   - TC1 `length` 40;
   - PKC1, an exported error class;
   - IC2, Trace's `persistenceVersion` dropped;
   - FSC1, the build target.

   The Log line names five of these, with no reason, evidence or reversal.
2. **OD49 (11)**, marked "Proposed, for the user's read" in the design (machine-design.md:568-571, :9652): evidence
   for a kept ending's try per boot and for a released stranded read. It is not on the list.
3. **OD51 (4) R6**: a refused acknowledgement of a replaced head ends `Superseded`. It is missing. Entry 14 labels
   the format item "R6/R7", but it is R7 alone, and it gives R10 as "as recorded in OD51" with no content.
4. **OD54's open item (c)**: a revert meets release 2's overwrite of release 1's old-version record, so "removed by
   `forget`" is not the only removal (machine-design.md:9938-9941). It is a data-overwrite case; entry 11 carries
   only (a). Items (b) and (d) are latent and worth one line.
5. **OD52/OD53 "as built" guarantees** that are on no entry:
   - a gap marks the version field;
   - a `.one` answer replaces the whole row;
   - a quiet removal doubt reads unconfirmed;
   - an unbound sent hold yields with `Abandoned`;
   - two placements of one operation and key share one slot.
6. **Label errors.** Entry 11 lists "(4) `FieldDropped`", but it is OD54 (3); (4) is `HoldWithoutRecord`, which with
   (5) Rejected-before-OldVersion is unlisted. Entries 2-4 use the runner's audit numbers Q17-Q20, which can read
   as the user's question numbers.
7. **Reason, evidence or reversal missing.** Entries 7, 8, 9, 14, 15, 16 and most of 11 lack one or more of the
   three. Entry 9 has no evidence or reversal; entry 14 has none of the three. The header (progress.md, "phase 2's
   plans will be written from them") is stale.

Not gaps (checked and rejected):
- Stage A's n2 (two placements of one writing fragment compile silently) is a not-built check. The plans keep the
  design guarantee (Machines.plan:57, Operations.plan:208), so no call is involved.
- Close-out m3 is a dangling pointer, not a call.
- `KeyOmitsInput` and `VerbMismatch` are accepted under OD24's delegated approval.

## The merge lead's sidecar log

- **S1** shows real scrutiny: one row rejected with a reason (row 11 names a removed concept) and one row changed.
- **S2's** general "accepted" covers every STATUS divergence in one sentence. The auditor's spot checks agree on the
  cases sidecar (a) raised: STATUS finding 10 is superseded by R9, and the rule-15 narrowness is stated in
  CommandLine. But S2 found nothing on the lane-identity and InvalidWrite drops (B4, B5), which its slice did not
  cover.
- **S3's** "all present" claim is false as written (minor 7). Its "changed" and "rejected" items are real.

Overall: S1 fine. S2 and S3 were partly rubber-stamped, with broad claims accepted in a sentence.

## Sidecar log (this audit)

Four Haiku sidecars (effort high): (a) Machines, Operations, Runtime, Persistence; (b) EntityDomains, Inspection,
Diagnostics, CommandLine; (c) Testing, React, Package, FlowState, LazyFeatures, ServerRendering and cross-plan; (d)
the user's words and the read list. The auditor read every cited line before using a finding.

| Finding (sidecar) | Result | Why |
| --- | --- | --- |
| a1 lane identity stale | accepted, B5 | Read Operations.plan:188, 248, 273; Persistence.plan:61; Runtime.plan:139; C214. |
| a2 forget of a live actor diverges from the prototype | rejected | STATUS.md:830 "Phase 1 update (R9)": finding 10 is superseded; forget disposes a live actor first, as the plan says. |
| a3 Machines omits rule 15's own-lane limit | rejected | Stated at CommandLine.plan:164, where the check lives. |
| a4 Runtime O4 limits dropped | changed, minor 3 | Confirmed against machine-design.md:555-571; minor, since the rule stands. |
| a5 C206 details | rejected | Jitter and the 1,024 bound are in Operations.plan:321, 329; `backoff` in `Compiled` is agent-judged internals. |
| a6 Machines.plan:47 garbled | accepted, minor 4 | Read. |
| a7 PC1 unmarked | accepted, B3 | Read Persistence.plan:245-249 and the log's convention. |
| a8 "rule 22" pointers | accepted, minor 5 | Read. |
| a9, b6, c clean references | accepted | Re-run with the auditor's own script, which was falsified. |
| b1 C208 not applied | rejected | "every non-key field" includes the version field; C208 leaves out only key fields. |
| b2 Diagnostics pointers | accepted, minor 1 | Counted each name across the plans. |
| b3 flags missing; InvalidWrite silent; S3 claim | accepted, B6, B4, minor 7 | Read the design at :5424; read `75a73b84^`:Operations.plan:101-104; counted names in the design. |
| b3 AdmissionOverloaded "shrink the batch" stale | rejected | The batch bound is kept (OC3, Operations.plan:383). |
| b4 Inspection flags undefined in the plan | changed, folded into B6 | Fixed with the Diagnostics entries. |
| b7 CLI scope and `trace diff` basis | accepted, B2 | Read OD43, 2.10.14, FOR-ARPIT row 17 and the memory record. |
| b8 Inspection versus CommandLine on domain recording | rejected | Domain recording is not a machine callback; no contradiction shown. |
| c1 dehydrate settling | changed, minor 9 | Real, but design-level. |
| c2 hydration throw versus diagnose | changed, minor 9 | Pre-merge text (old React.plan:78). |
| c3 PropertyTestFailed | accepted, minor 2 | Read. |
| c4 resource with no output | rejected | Pre-merge warning, renamed; no contradiction with `Schema.Void`. |
| c5 SRC1 | rejected | The phrase is not in the old O3; the runner is right. |
| c7, c9, c10 | partly accepted, minor 5 and 9, B3 | PC ids in LazyFeatures go to B3. |
| c8 Runtime-level grace | rejected | Pre-merge, not merge-caused. |
| c12, c16 | accepted, minor 4 | Read. |
| c13, c14 | accepted, minor 1 and 9 | Read. |
| d1 Q1 per record | accepted, B1 | Read Persistence.plan:33, OD54 (8), entry 1. |
| d2 conflicts not on the read list; no independent judge | accepted, B8 | Read amendment 11 and the log. |
| d3 OC3 added by the runner | changed | It is pre-merge plan text, not a ruling. |
| d4 CLC1 and CLC2 | accepted, B2 and minor 6 | Verified. |
| d5 "the user accepts exact outputs" | changed, minor 4 | A process statement, but ambiguous. |
| d6 proposed names | accepted for B7's list | `KeyOmitsInput`/`VerbMismatch` rejected (OD24). |
| d7 read-list completeness | partly accepted | Gaps 2-6 accepted; n2 and m3 rejected (see above). |
| d8 entries lacking reason, evidence or reversal | accepted, gap 7 | Read entries 1-17. |

## Re-check (2026-11-09)

Checked at `c23a1818`, after the fix pass (`a8a2551d`, `e2e5c858`, `227081b8`, `7f7afad2`, `b5dd48cc`) and the
superseded-text extraction (`6c7c5f43`, amendment 12). Same auditor, with four fresh Haiku sidecars (effort high,
read-only): (a) B1-B4 and OD55, (b) B5-B7 and the name marks, (c) the extraction, (d) the read list.

### Verdict: PASS-WITH-FINDINGS

B1-B8 are closed. None of the findings left blocks Specs. Each is a one-line edit, and the Spec writer can make them
or carry them.

Gates run by the auditor:
- `workflow check`: "Repository is valid."
- `refcheck.py`: 419 plan references, 0 dangling.
- The same check over `superseded.md`: 293 `@plan` pointers, 0 dangling, 270 items.

### Blocking findings

| Finding | Closed? | Evidence (read by the auditor) |
| --- | --- | --- |
| B1 | yes | Persistence.plan:187-188 says "(the user's Q1 A: per definition, ...), decided per record (the runner's ruling)". Log P-2 is corrected. |
| B2 | yes | CommandLine.plan:9-11 says "exposes only ... (the user's CLI scope, OD55); there is no diff, trace diff or search command". OD55 is in the design. |
| B3 | yes | PC1 and PC2 are marked at Persistence.plan:214-218 and EC2 at EntityDomains.plan:31-32. No plan cites `PC`/`EC` ids any more. |
| B4 | yes | Operations.plan:124-126 restores both sentences word for word (as at `75a73b84^` lines 102-104). It also restores "Neither restore nor hydration invokes a commit". Diagnostics' `InvalidWrite` pointer resolves to O3. |
| B5 | yes | Every lane tuple says identity with its version (Operations.plan:164, :226; Persistence.plan:57; Runtime.plan:133). No stale form is left. |
| B6 | yes | Diagnostics.plan:120-122 lists the eight flags as diagnostic records, and `ReleaseOverdue` is among them, as in Inspection. |
| B7 | yes, two names left | Every name is marked at least once in each plan that uses it. Residual: Diagnostics.plan:132 `RecordHeld` and Inspection.plan:48 `stalled: "record"` carry no mark on their own line. |
| B8 | yes | progress.md has a new "phase 2 plan merge" section, and entries 18-20 cover the audit's gaps 2-5. |

### Minor findings

Fixed:
- 1: owner pointers. Each code is now named in its owner (for example `EndedWithWork` at Runtime.plan:116).
- 2: Diagnostics D1 now has the `PropertyTestFailed` exception.
- 4: wording. Partly fixed: FlowState names fragments but not traits or subroutines.
- 5: pointers.
- 7: the summary's held-for-the-user line is corrected.

Still open:
- plan-merge-log.md:594-596 still says "`trace diff` kept with the export by the later OD43". This contradicts the
  corrected line just above it and OD55.

### New findings in the re-check (all minor)

1. **superseded.md:358 points to a rule that no longer exists.** It says the revision-diff sentence is "Now held in:
   @plan.CommandLine.O6", but O6 has no diff text, because the rule is cut. It should say "cut, no replacement
   (OD55)".
2. **OD55 (machine-design.md:9948-9953) matches the user's words in full.** The five points are kept, with nothing
   left out. But under "The user, 2026-11-02" it adds one precedence sentence that is the runner's inference:
   "Where 2.10.14 ... this entry wins (OD43 ... did not re-add `diff`)". Mark that sentence as the runner's.
3. **The user's 2026-11-02 words exist only in private session memory.** OD55 says "from the session record", and no
   repo file holds the quote. Quote the user's sentence in OD55 so the record stands alone.
4. **The trace comparison stays at library level.** Inspection O6's four-result trace comparison and D1's "diff"
   reader are pre-merge library contract. CommandLine.plan:122-124 states that the CLI has no command for it. The
   user's cut was CLI-level, so this is not a violation. Noted for the user's read only.
5. **Read list.**
   - Entry 19 (progress.md:339-340) says "(b) and (d)" but describes only (d). (b), stamps compared raw across a
     format bump, has no content. OD54 (e), a crash between the moved-lane batch and the delete
     (machine-design.md:9943-9944), is absent.
   - The phase 2 table has no evidence column. B4's reversal reads "none needed".
   - The "Others" row files PC3 with the wording-only calls. It is a priced runner ruling, already covered by
     entries 2 and 13.
   - OD54's stated limits are in revisit.md but not on the list: a changed default is not in the version, a rename is
     a drop plus an add, unstamped records never reset, and pre-format-3 lanes bind to any identity of their name.
   - `contract.get` is not in entry 10's list of names.
   - Entries 4, 10, 12 and 13 still lack a reason or evidence.
6. **The extraction is complete and nothing current moved out.**
   - All 68 old Superseded paragraphs, 282 quoted segments in all, are in superseded.md, each once, with the same
     pointers. Sentences quoted by two plans appear once per plan.
   - No `Superseded:` paragraph remains in a plan. The remaining hits are the evidence name.
   - The commit removed only Superseded paragraphs, blank separators, Testing V5's "Was:" clause (recorded at
     superseded.md:420), and the history clause in Operations.plan:359 ("renamed with descriptors"). The contract
     there is unchanged.

### Sidecar log (re-check)

| Finding (sidecar) | Result | Why |
| --- | --- | --- |
| a: B1-B4 closed | accepted | Read Persistence.plan:186-190, :213-219; CommandLine.plan:8-13; Operations.plan:123-127. |
| a: superseded.md:358 points to CommandLine O6 | accepted, new 1 | Read. |
| a: Inspection O6 and D1 keep a library diff | changed, new 4 | Pre-merge library contract; the CLI states no command for it. |
| a: log:594-596 stale | accepted | Read. |
| a: OD55 adds a precedence sentence under the user's name | accepted, new 2 | Read machine-design.md:9948-9953. |
| a: Persistence PC1 mark "reading the user's quarantine decision" attributes to the user | rejected | The sentence names the runner as the reader of a real user decision (U4); that is accurate. |
| b: B5 and B6 closed | accepted | Read the cited lines. |
| b: `RecordHeld` and `stalled: "record"` unmarked | accepted, B7 residual | Read Diagnostics.plan:132 and Inspection.plan:44-49. |
| b: marks on the next line or as list-level marks | rejected | A mark on the wrapped line, or "all, proposed names" over a list, marks the name. |
| b: minors 1, 2, 4, 5 fixed | accepted | Spot-read Runtime.plan:116, Diagnostics.plan:221-222, Machines.plan:47, CommandLine.plan:15-16. |
| c: extraction complete, 0 missing | accepted | My own count: 270 items, 293 pointers, 0 dangling. I did not re-diff every segment; I rely on the sidecar's script after reading its method. |
| c: Operations.plan:359 clause removed outside a Superseded paragraph | changed | A history clause only; the contract is unchanged. |
| c: C38 a weak pointer for `activities` | rejected | The pointer pairs C38 with C55, which carries the mapping. |
| c: Machines and Operations cite different C sets for one sentence | rejected | Each plan cites the rows that target it. |
| d: gaps 1-5 present, labels fixed, header fixed | accepted | Read progress.md:333-372. |
| d: entry 19's (b) and (e) | accepted, new 5 | Read. |
| d: phase 2 table has no evidence column; PC3 in "Others" | accepted, new 5 | Read. |
| d: OD54 stated limits not on the list | accepted, new 5 | They are in revisit.md, not unknown to the user's records; low priority. |
| d: entries 4, 10, 12, 13 lack a reason or evidence | accepted, new 5 | Read. |
