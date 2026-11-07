# Check: operations-in-definition merge into machine-design.md

Reviewed 2026-10-30. Scope: f66ec80c (change set 1, OE1-OE83 normative parts), 1b0c91bd (change set 2 and the move to
`merged/operations/`), acbe86c3 (owner Q1 edits, OD26), against [merged/operations/merge-plan.md](../../../../flow/references/explorations/machine-fragments/merged/operations/merge-plan.md),
[proposal.md](../../../../flow/references/explorations/machine-fragments/merged/operations/proposal.md) (revision 13), [decisions.md](../../../../flow/references/explorations/machine-fragments/merged/operations/decisions.md) and
[delegated-decisions.md](../../../../flow/references/explorations/machine-fragments/delegated-decisions.md) rows 4-11. Method as in [merge-4-5-check.md](merge-4-5-check.md).
Line numbers are of `machine-design.md` at HEAD (acbe86c3). Only this file was written.

## Verdict

**Merged correctly, with 6 small defects to fix (none changes a rule's meaning) and a set of nits.** All 93 edits are
present with the intended text except where a defect below says otherwise. Every conflict resolution named in the brief
is present: the small ones, X7, X9, X19, X22 (one place missed, defect 1), X27, X31, OE59, OD23 written as decided,
X21 marked *Story reads: merge 3*, OD26. No rule, decision, C row or example was dropped or weakened.

Mechanical results:

- **Numbering.** Rules 1-47 are consecutive and unique (lines 378-796). N1-N3, D1-D21, E1-E18, M5-D1-D10, OD1-OD26
  (with OD2a) and C1-C53 have no duplicate and no gap. C8, C19, C20 are kept as numbered stubs ("Replaced", "Superseded",
  "Deleted"). The row count of C/P rows rose 39 to 62 (23 new: C31-C53), as expected.
- **Write-lane table.** The 16 rows by 3 states of 2.7.13, the `cancel`/`allow` sub-table, the parked sub-table and the
  per-policy table were diffed line by line against proposal 3.8.1. Every difference is an intended substitution
  ("MD rule n" to "rule n", `outstanding` per X16, `serialize` row's "MD N2" to "N2"). The new first row of the parked
  table (OE59) is present. The "16 by 3, 48 cells, 15 cannot occur, 33 reachable" sentence is kept.
- **Prose of 2.7.13-2.7.15** was checked sentence by sentence against ODP 3.8.1 and 3.10: every missing sentence is one the
  plan removes or rewrites (orphan to unbound lane, Q34/Q36/Q40 now decided, X33, the dropped amendments table).
- **Rules spot-checked against revision 13 and the decisions (30):** 2, 8, 9, 13, 14, 16, 17, 19, 20, 21, 22, 23, 24,
  26, 27, 28, 29, 30, 31, 32, 34, 35, 36, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47 plus N1, N2, N3; OD19-OD26; the rule 14 and
  rule 20 amendments (both match OE14 and OE18/X7 exactly). Rules 39-47 map to S0-S16 as the plan's 2.2 table says, with
  S7c's "do not depend on memory an earlier incarnation set" in rule 44 and its fuller text in 2.7.13.
- **Examples** 3.1 and 2.8.2 were compared line by line with ODP 5.2 and 5.3 After: the only differences are dropped
  `// NEW`/`// RENAMED` comments, the X11/X12 changes, and ODP's prose walks (kept in the record). 3.2 matches OE78.
- **Leftover scan** (item 5): no `s.activities`, `.lookup(key, {`, `read.fetch`, `superseded:` as a mapping key,
  `result:` on a contract, `start(`, `params(`, bare-number `retryable(`, `outcomes:` in commit options or "Pending owner
  Q1" remains outside quoted history. `s.calls`, `laneKey`, `key: (i) =>` appear only in the change log, the Removed row,
  the "limit" bullet, and annotated historical decisions (see nit 4).
- **Links.** No path `operations-in-definition/` remains outside `merge-plan-4-5.md`, `reviews/merge-4-5-check.md`, the
  plan's own mechanics (M1, M4, "Merge plan:" title) and `lane-model/main.ts` line 1 (a comment). All relative links in
  `machine-design.md`, `README.md`, `delegated-decisions.md`, `merge-6-streams/`, `merged/fragment-operations/` and
  `rpc-contracts/` resolve. Rule, section and C-row cross-references checked (rules 14, 20, 21, 22, 24, 27-32, 34-38,
  41-47; sections 2.5, 2.7.13-2.7.16, 2.8.5, 2.8.6, 2.8.8; C2, C15, C17, C18, C30, C33, C37-C53; E1-E18) resolve to
  the right text.

## Defects

### Defect 1: X22 not applied in 2.7.14, rule 2

Line 2160: "2. Otherwise let U be the event X maps `unknown` to." OE60 and X22 say rule 2 reads "let U be each event X's
`unknown` maps (one, or one per tag)". Rule 45 (line 784) already says it correctly, so rule 45 and 2.7.14 disagree.
**Fix:** replace the sentence with "2. Otherwise let U be each event X's `unknown` maps (one, or one per tag)." Then make
"where U can arrive" read "where any of them can arrive" if the author prefers; the minimal fix is the first sentence.

### Defect 2: `revisit.md` was not created (X26, M7)

The design cites it five times (lines 2062, 2139, 2142, 3857, 4487) and the plan's M7 says to create
`machine-fragments/revisit.md`. It does not exist anywhere under `workflow/plans/flow`. AGENTS.md also names
`revisit.md` as the place for deferred items.
**Fix:** create `machine-fragments/revisit.md` with the M7 list: B14 bulk starts (AU F13); B56 throttled independent
writes; B72 per-key fan-out of write members (the four cases in 2.7.13's limits); Q35 per-item stops and "drop the queue"
on `serialize`; offline as a reason to wait before invocation (ODP 10.3); resuming never-sent work across a reload (ODP
10.3, would amend C2 and OPS O3); branded keys (ODP 3.4); an age bound on adopted holds; a `fromRpc` adapter (OD13); a
catch-all for per-tag `unknown` if X22 is escalated.

### Defect 3: counters still say OD1-OD25 after OD26 was added

Lines 33 (decision 5 row: "decisions OD1–OD25"), 4038 (change log: "decisions OD1–OD25") and 4052 (decisions intro:
"the operations merge's OD1–OD25") count 25; `README.md` line 40 also says "OD1–OD25". The section-5 intro at line 4336 was
updated ("OD1–OD18, OD23 and OD26"), so the document now disagrees with itself.
**Fix:** write "OD1–OD26" at those four places (the change log's sentence about OD26 on line 4046 can stay).

### Defect 4: 2.5 still says lanes change only at admission (X9)

Line 922-923: "every actor's snapshot reflects that store revision, while lanes change only when the ending's turn is
admitted." X9's resolution is that a Runtime step also changes and publishes a lane (rule 27, 2.7.12, 2.8.4 all say so),
and OE44 appended that clause to this same paragraph (line 930), so the paragraph contradicts itself.
**Fix:** "...while a bound lane changes when the ending's turn is admitted (an unbound lane, when the Runtime applies the
ending's cell, rule 44)." The diagram line in 2.8.4 ("admission ── ... update the lane") and decision E4/E13 ("the lane
changes at admission") are consistent with this wording and need no change.

### Defect 5: stale or contradicted statuses in 2.7.3

- Line 1272-1273: "Proposed for streams (OD15 leaves them open): required as well, `key: []` for one session". Rule 39 and
  OD23 Q38 make it decided. **Fix:** "Decided for streams as well (OD23 Q38): required, `key: []` for one session".
- Lines 1381-1382: "2.7.10's keyed-activity `key` and (proposed, L1) a keyed schedule's `key` are the same record."
  Keyed activities no longer exist (rule 41, C40) and keyed schedules' key records are decided (OD23 Q29, rule 23).
  **Fix:** "The key of a `subscribe.each` session (2.7.10, rule 41) and a keyed schedule's `key` (rule 23) are the same
  record." Also drop "(RENAMED, OD12: was `{ params }`)" on line 1379, which is a change-mark in current text.

### Defect 6: 3.4 keeps the old commit-value shape that Q1's After removes

Lines 3593-3596 and 3606: `const pin = O.pin.commit(...)` is declared outside the transition and `Pin` lists
`actions: [pin]`. OE79 / Q1 (B) After, which the owner accepted as OD26, writes the commit inline in the `Pin`
transition: `actions: [O.pin.commit(({ event }) => ({ id: event.id, pinned: event.pinned }), { optimistic: [...] })]`,
so the select is typed by its transition (rule 1, Typing). The same pattern remains in 3.2 (line 3433 `const create =
O.create.commit(reviewedFields)`, used in two `actions`), where OE78 says `O.create.commit(reviewedFields)` in the
action list.
**Fix 3.4:** delete the `const pin` statement and its comment lines (move the comment "`optimistic` is the commit's only
option (OD26)..." above `Pin`), and write `Pin: { target: "self", guard: [O.pin.idle(({ event }) => event)], actions:
[O.pin.commit(({ event }) => ({ id: event.id, pinned: event.pinned }), { optimistic: [Issues.list.setData(({ memory,
event }) => ({ key: listQuery({ memory }), data: pinRow(event) }))] })] }`. **Fix 3.2:** replace `const create = ...`
and the two `actions: [create]` (REVIEW's Submit comment, WAITING's `RetryNow`) with `O.create.commit(reviewedFields)`.

## Judgement of the merger's reported extras

| Extra | Verdict |
| --- | --- |
| `ChargeUnsure` routing to `SETTLING` with `O.charge.retry(chargeKey)` (line 1594) | **Accept.** X19 requires the booking excerpt to gain the release it needs; a late/adopted `ChargeUnsure` that re-sends owns the hold (rule 44/45), and the comment says so. `SETTLING` is not defined in the excerpt, which is acceptable for an excerpt but worth one clause: "(SETTLING retries or reads; elided)". |
| 3.1 keeping comment marks | **Partly accept.** The `user-defined`/`existing` comments in 3.1 are the design's own style. Remove the two stray change marks that remain in the design: line 1322 `// NEW MEANING (OD4)` and line 1511 `// NEW (OD5)`, and the trailing spaces on line 3115 (`operations: ({ E }) => ({` with a blank comment). Nit 1. |
| `retrieveIntent` (line 1142) | **Accept.** It is in proposal line 1142 verbatim; not an invention. |
| One intro note instead of per-citation prefixes (lines 970-974) | **Accept.** It says whose citations R*n*, K*n*, F*n*, Q*n*, 5.*x* are, and that the *decided*/*proposed* marks are kept as written; this is the plan's OE58 intent ("prefixed ODP R*n*") in one place. Side effect: the "proposed" marks that remain in 2.7.3 (defect 5) are not all true any more, hence defect 5. |
| E12's annotation | **Accept.** OE92 lists "E12 *Amended per Q1.*"; the merged text names OD26 and says what changed. |
| The change-log sentence on Q1 (line 4046) | **Accept.** Replaces the "marked and wait" sentence; says where OD26 landed (2.6, rules 26, 36, 2.8.3, 2.8.9, 3.4, C15), which matches the diff of acbe86c3. |
| The OD26 bullet (line 4451) | **Accept**, with one nit: it sits between OD25 and OD24, so OD24 ("process, last") is no longer the final item in numeric or intended order; it reads fine. Count updates are defect 3. |

Other hunks without an OE number, all justified: 2.7.12's note that the spike is "in the form before the operations
merge"; rule 21's "A failed Attempt is resolved, not kept for `retry`" (rule 19, OE17); rule 21's *Story reads: merge 3*
mark on the `checkpoint.evidence` shape (the 4/5 check's Defect 1, carried over); rule 24's "with evidence" on `Idle`;
rule 36's "OD26" and 2.6's "operation options" row (OD26); the `Machines O1` K9 row "Superseded by C37".

## Nits

1. Stray change marks and trailing spaces in 3.1 (see above): lines 1322, 1511, 3115.
2. Rule 19 (line 569) and decision D8 (line 4115) still say `pay.retry` without `O.`; line 569 should read `O.pay.retry`.
3. T4 (line 3832) lists "commit options" only; add "and operation options" to match 2.6's two rows.
4. Decision E17 (line 4233-4238) still reads "lanes as `s.calls` rows (D18)" and "`laneKey`" with only the "Amended by
   OD19" note; D18, D21 and the "Revision" lines are annotated, E17 is not. Add "*Rows are `s.operations`; `laneKey` is
   `key` (X30).*". Decision E1 ("the commit value owns workflow") and E4/E13 ("the lane changes at admission") are
   likewise unannotated; OE92 did not list them, so this is the plan's gap, not the merger's.
5. Decision order: OD26 sits before OD24 (line 4451 vs 4456); the plan puts OD24 last as the process item. Either move
   OD26 above OD25 or leave it.
6. 2.8.10 (lines 2889-2890) shows two operations (`issue`, `issue2`) on the same read contract to illustrate the single
   `failure:` event and the tag record; fine for reads (exempt from `SharedContract`), but `issue2` reads oddly. Consider
   "// or, as a tag record:" on one operation instead.
7. `merged/operations/merge-plan.md` quotes MD-relative links (`merged/operations/proposal.md`, lines 291, 338, 419-423,
   540-543) that do not resolve from its own folder. Harmless: they sit inside quoted edit text.
8. NEXT.md was not updated (M8, "by the main session"); the README, `delegated-decisions.md` (rows 4-11),
   `merge-6-streams/proposal.md`, `merged/fragment-operations/exploration.md` and `rpc-contracts/exploration.md` path fixes
   are all in place.
9. 2.7.3 keeps proposal-era words "Proposed" / "(proposed, follows from OD5)" on points the intro says were accepted
   under OD24. That is allowed by the intro note; only the items decided later (OD23) needed updating (defect 5).
