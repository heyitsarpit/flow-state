# Merge plan: operations-in-definition into machine-design.md

Status: **applied 2026-10-30** (change sets 1 and 2; approved under OD24, Q1 pending). Written as proposed: Under OD24 the main session approves this change
list and resolves the small conflicts (logging each in [delegated-decisions.md](../../delegated-decisions.md)); the two
owner conflicts (X20, X21) go to the owner as numbered questions. Written 2026-10-30 against `machine-design.md` at
HEAD `ebd7120c` (merges 1, 2, 4 and 5 merged, the 4/5 check's two defects fixed) and `proposal.md` revision 13.

Short names: **MD** [machine-design.md](../../machine-design.md); **ODP** [proposal.md](proposal.md) (revision 13,
accepted for merging, OD24); **OD** [decisions.md](decisions.md); **LM** [lane-model/RESULTS.md](lane-model/RESULTS.md);
**P45** [merge-plan-4-5.md](../../../../../../archive/flow-design-2026-11/machine-fragments/merge-plan-4-5.md) (its section 5 listed what this merge replaces); **CHK**
[reviews/merge-4-5-check.md](../../../../../../archive/flow-design-2026-11/machine-fragments/reviews/merge-4-5-check.md). ODP's "M4 rule *n*" is now **MD rule *n*** (26–38); its
"MD line 818" is MD 2.7.1's reasons table; its "MD:1361-1457" is MD 3.1's fragments. "Before" quotes are copied
from MD; "…" in a quote only shortens it, and the edit replaces the whole sentence, row or block it names.

Marks: **small** (wording, numbering, a superseded clause; the main session resolves it), **small†** (a behaviour
consequence the text leaves unstated; the main session decides it under OD19's delegation of behaviour and logs it as
a decision, not a wording fix), **owner** (public API that no decision covers). Every resolution is **proposed**.

---

# Part 1: compatibility

## 1.1 What was checked

| Source in ODP | Rows | Where it lands now |
| --- | --- | --- |
| 3.8.1 "Amendments to MD, OPS and merge 4" (the K16 list, completed per R7 M6; carries the OD19–OD22 sweeps: revision 10 item 5, revision 11 item 4, revision 12 K33) | 36 | AM1–AM36 below |
| 5.6 "Rule by rule" (MD rules, sections, decisions; plans; change counts) | 41 items | 1.3; written before OD15–OD25, partly stale (X2) |
| 3.3 "Consequences, stated" (contract shape across docs) | 7 | 1.4 |
| Section 7, B1–B90 | 90 | 1.5; 31 name an MD or plan target, all also in the K16 list or 5.6 |
| OD23 (owner API round), OD25 (lane model C5–C8) | 9 + 4 | 1.6; **OD23 is not applied in ODP's text** (X1) |
| P45 section 5 (merged text with a short life) | 18 | re-checked in 1.4; one prediction corrected (X10) |

## 1.2 The K16 list, row by row

"Clean" = the target text is as ODP quoted it. "Moved" = the target was renamed or renumbered. "Changed" = merges 4
or 5 edited the target since ODP was written; the amendment still applies with the merged text kept unless noted.

| # | ODP target | Target now | State | Conflict |
| --- | --- | --- | --- | --- |
| AM1 | MD N2, C18 | N2; C18 (now also carries merge 4/5 errors and display) | clean (N2); changed (C18) | X5 |
| AM2 | MD 2.7.8 (two tables) | 2.7.8; its `latest` row now has merge 4's record-queue clause, and its example is the domain like (A32, B2) | changed | X6 |
| AM3 | MD 2.7.12 "at settlement, the waiting start is invoked now" | 2.7.12 Settlement row, now "…invoked now (plain) or when it heads its record queues (domain)" (A36) | changed; applies to both halves | — |
| AM4 | MD rule 16 | rule 16 (now also the `Overloaded` sentence, A6, kept) | changed | X6 |
| AM5 | MD rule 17 | rule 17 | clean | X17 |
| AM6 | MD rule 19 | rule 19, last sentence | clean | — |
| AM7 | MD rule 21 | rule 21 (now with merge 4's default-key, evidence and capture sentences, A9–A11) | changed; rule rewritten (OE19); A9 goes (OD15), A10 becomes Inspection of unbound lanes, A11 becomes rule 46 | X4, X13 |
| AM8 | MD rule 23 | rule 23 | clean | — |
| AM9 | MD rule 24, C7, OPS O7 | rule 24 (now ends with merge 4's store sentence, kept); C7 | changed | — |
| AM10 | MD C11 | C11 | clean | — |
| AM11 | MD 2.5 step 5 | step 5, now with merge 4's "Starts" bullet (K3: every start decided in step 5) | changed; **convergent**: OD16's "cells apply in step 5 in action order" generalises that bullet to every member | — |
| AM12 | "MD line 818" | 2.7.1 reasons table, `NotSent` row (also C2, 3.6) | moved | X6 |
| AM13 | OPS O3, O7 (disposal) | plan; C33, C36 | — | — |
| AM14 | M4 rule 29 | MD rule 29 | moved | X6 |
| AM15 | M4 rule 31 | MD rule 31, now "(`reject`, `latest`; `concurrency: "cancel"` is an error…)" (K7) | moved, changed | X5 |
| AM16 | M4 rule 32 | MD rule 32 (now with E18's sentence, kept); also C25, 2.8.6 E3, decision E3 | moved | X24 |
| AM17 | M4 rule 34 | MD rule 34, now with merge 5's `many` sentence (B6); also C28, 2.8.8, 2.7.2, 2.7.3, rule 21, C18, D7's K5 note, E10, M5-D9 | moved, changed | X4 |
| AM18 | M4 `basedOn` | MD 2.8.6 E7 "The same `basedOn`", 2.8.1 `basedOn` row | moved | — |
| AM19 | MD rule 20 | rule 20 (now with merge 4's domain-write and rule-37 clauses, kept) | changed | X7 |
| AM20 | Testing O7 | plan; C53 | — | — |
| AM21 | React O2, O3 (pre-attach buffer) | plan; C52 | — | — |
| AM22 | MD 2.5 step 2 | step 2 | clean | — |
| AM23 | Runtime O3, V4 | plan; C42 | — | — |
| AM24 | Runtime O3 (local identity) | plan; C42 | — | X13 |
| AM25 | React O2, O3 (fresh local actors) | plan; C52 | — | — |
| AM26 | MD rule 14 | rule 14 (now ends with A5's settlement sentence, kept) | changed | — |
| AM27 | MD C17 | C17 (now with "in one capture with the records…; prediction values are never persisted", kept) | changed | X15 |
| AM28 | Runtime O6 | plan; C43 | — | — |
| AM29 | Persistence O2 | plan; C44. MD's fragment row "Persistence O2" (slices, copies, timers) is unaffected | — | — |
| AM30 | Persistence O3 | plan; C45 | — | — |
| AM31 | Persistence O4 | plan; C46; also C17 | — | — |
| AM32 | Persistence O5 | plan; C47; **also MD P19, rule 8's last sentence and section 7 item 16**, which ODP does not list | — | X14 |
| AM33 | Persistence O6 | plan; C48; **also MD P15** ("Each send is acknowledged before it runs"), not listed | — | X15 |
| AM34 | ServerRendering O3, O5 | plan; C49 | — | — |
| AM35 | LazyFeatures O3 | plan; C50 | — | — |
| AM36 | Inspection | plan; C51; also MD C30's evidence clause | — | X13 |

## 1.3 ODP 5.6 (MD rules, sections, decisions)

5.6 was written for revisions 3–4 and not re-run (its own note). Where it disagrees with the K16 list or a later OD,
the later text wins:

| 5.6 item | Stale against | Use |
| --- | --- | --- |
| rule 21 "write lanes per (actor, operation, key)" | OD20 | (actor identity, contract id, key) |
| rule 24 "(OD7, S7a)" | 3.13 has no S7a | rule 24 per OD7 and the table |
| "21 addendum": the hold "under `latest` and `reject`" | OD19 | also `serialize` |
| D7 "optional, but required under `latest` and `cancel`"; 2.7.3 "Keys are optional (S: required under…)"; plans "Operations O1 (`key` required under `latest`/`cancel`)" | OD15 | required on every contract |
| "S1–S13 (A)", "S10" for bare writes, "S11" for the verb, "S12" for rows, "S13" for one-off `cancel`, "S14" for key records | 3.13's own numbering (S0–S16, S7c) | MD rules 39–47 (2.2 of Part 2) |
| section 7 items 6 and 15 "(D)" | both are already closed and struck | keep struck; add "moot after the operations merge" |
| change counts (91 MD edits) | revisions 4–13 | this plan's count |

Everything else in 5.6 applies: rules 1, 2, 9 (×2), 13, 14, 16, 17, 20, 22, 23, N1–N3; sections 2.1, 2.2, 2.3, 2.5,
2.6, 2.7 intro and 2.7.2–2.7.12, 3.1, 3.2, 3.4, 3.6, section 4 (six rows), section 5 (Machines O1/O4/O6/O8,
Persistence O2, CommandLine O5, C5–C8, C10–C12, C17–C20), section 7 items 0, 6, 15, "Changes after review"; decisions
D1, D4–D7, D9, D11, D18–D21.

## 1.4 Against merged merge 4 and 5 text (2.8, rules 26–38, C21–C30, E1–E18, M5)

| Merged text | ODP / OD | State | Conflict |
| --- | --- | --- | --- |
| Rule 26 "the commit value owns workflow… Call-site `optimistic` and `setData` are type errors on it" | OD3, OD17 Q15–Q17 | applies: "the operation and the machine own workflow"; the `optimistic` half waits for X20 | X20 |
| Rule 27 "Store effects never depend on whether the ending routes current, late or superseded"; "At admission it… updates the lane" | OD5; OD19 (Runtime applies endings of unbound lanes) | small rewording | X9, X25 |
| Rule 28 | OD16, B74 | applies unchanged; a `latest`/`serialize` commit queued behind a hold also joins and predicts at commit | X31 |
| Rule 29 "`NotSent { why: "Superseded" }`… `.cancel(key)` follows rule 24" | OD5, OD7, OD20 F4 | applies: `Superseded` is evidence (store row kept); `cancel` by the table | X6 |
| Rule 30 `NotSent` list; 2.8.5 table | 3.8.1 "merge 4 facts unchanged" | applies; add `StorageRefused`, `Disposed`; `Released` has no row | X6, X27 |
| Rule 31 / E17 / K7's "(`reject`, `latest`; …)" | OD19 Q35, AM15 | applies with the `serialize` head | X5 |
| Rule 32 / E3 / C25; 2.8.2's "Like unknown" row ("`Toggle` drops the key, because a newer write's success clears `uncertain`") | OD19 (per Attempt) | applies; the 2.8.2 row and E3 are superseded in part | X24 |
| Rule 33 | — | unchanged | — |
| Rule 34 / E10 / C28 / 2.8.8 / M5's `many` sentence and M5-D9's "never takes the default" | OD15 | rule rewritten; the warning kept and re-worded | X4 |
| Rule 35, C22, M5-D10's 4,096 cap | — | unchanged; "actor queue" is `serialize`'s `W` (64) | — |
| Rule 36 / E12 / C15 / 2.8.9 / 2.6 "commit options" / T4 | OD17 Q16, Q17; ODP 12 ("without an `outcomes` option") | **ODP never says where a plain operation's `optimistic` and `writes` live** once `outcomes` leaves the commit | **X20** |
| Rule 37 / E15 / C29 / 2.8.10 | OD2, OD9 | applies: "a read operation's `success:`" | — |
| Rule 38 / E14 / 2.8.11 / C17's capture sentence | OD20 (lane records, per lane and Attempt) | applies: the capture is the lane record's | X15 |
| 2.8.1 lane row, view code (`s.calls…find(…)?.pending ?? false`); 2.8.12 "`pending` means one thing" | OD10, OD4, OD16 | applies: `O.like.get(s, issue).pending` (= `InFlight`); 2.8.12 gains "a lane's `uncertain` is not the record's" | — |
| 2.8.2 code (merged from M4 3.1 plus merge 5's B2 and import) vs ODP 5.3 After | OD4, OD12, OD15, OD23 Q39; merge 5 M5-D5 | ODP 5.3's domain predates merge 5 and Q39 | X11, X12 |
| C27 / E16, the resource lane's `pending` renamed `predicted` | ODP 3.4 calls OPS O6's field `pending` | **P45 section 5 predicted "C27's resource half is likely reverted". It is not:** ODP 3.4's point is "no second `pending` on a read row"; with E16 the field is `predicted`, which makes that point stronger | X10 |
| C30 "held unknown lanes appear in actor evidence" | OD19, OD20 (unbound lanes listed by identity) | applies, extended | X13 |
| M5 `flow explain` "prints the lane key and cardinality" (C18 display) | OD4, OD15 | applies; the lane key is now the contract's `key` (data), cardinality from it; the recorded `.predicts` key feeds only the rule 34 warning and queue joins | — |
| M5's recorder: "Keys are recorded reads and constants" (merged/entity-analysis 3.3) vs ODP 5.3's `Issue.patch({ id: input.id }, …)` (OD4: no nested input keys) | OD4 | applies if a record of recorded reads counts as a key; check it in the M5 spike before 2.8.2 lands (not blocking) | — |
| E5 "the `.cancel(key)` action is allowed under rule 24" | OD7 | annotate | — |
| "Lane lifetime" (D11 kept, with evidence) | OD19, OD20 | annotate: lanes are Runtime records kept while not `Idle` | — |

## 1.5 Section 7 (B1–B90)

- **Target rows** (B7, B8, B9, B31, B35, B40, B43, B57, B58, B60, B61, B67, B73, B74, B79–B82, B84–B86, B88, B89): every
  one is covered by the K16 list or 5.6. B60 says "amends MD rule 21"; the K16 list says rule 19. Both are right:
  rule 19's last sentence and rule 21's "kept, because `retry` needs it" after a failure both go (OE17, OE19).
- **Stale statuses** (small, X2): B8 "open, Q20" (decided, OD19); B53 and B62 "open, Q33/Q34", B71 "Q36–Q38 open",
  B78 "Q39", B83 "Q40", B90 "Q41" (all decided, OD23); B25 "withdrawn: M4 rule 34 supplies the key" (OD15 removed the
  default; the row's answer is now "every write states `key`"). ODP 5.3's intro sentence "The three predicting writes
  take their key from `.predicts` (M4 rule 34)" contradicts its own code (`key: ["id"]`). The record is not edited;
  its status header says the design wins (mechanics, M2).
- **Still open after merging** (go to section 7 or `revisit.md`): B13 typing risk (builder fallback), B14 bulk starts
  (AU F13), B56 throttled independent writes, B72 work over a dynamic key set, Q35's per-item `serialize` stops.

## 1.6 OD23 and OD25

**OD23 is recorded in decisions.md but not applied in ODP** (X1): ODP's status line says "OD1–OD21 applied", section
11 still lists Q29, Q33, Q34, Q36–Q41 as open, and their text is marked *proposed*. All are option A, so the merge
writes them as decided:

| Q | Decided | Lands in |
| --- | --- | --- |
| Q29 | keyed schedules use key records; `keys` may read `operations` (after lanes) | rule 23, 2.7.10, C39 |
| Q33 | the one-off read row carries `key`; `O.x.get(operations, k)` in guards and callbacks; S15 with `Story.ending` | rules 42, 47; 2.7.5; C53 (`Story.ending`: X21) |
| Q34 | `idle` accepts a partial key, passing only when every existing matching lane is `Idle`; only `idle` | rule 21 members, 2.7.13 `idle` row, rule N1 |
| Q36 | `unknown` may be mapped per tag, as `failure` is | rule 13, rule 45, 2.7.14 (X22) |
| Q37 | an omitted `output` means `Schema.Void` | rule 39 |
| Q38 | streams require `key`, `[]` for one session | rule 39; merge 6's own rebase |
| Q39 | merge 4's projector says `({ output })` | 2.8.2 (X11) |
| Q40 | `runtime.unsettledWrites()` | rule 44, C43 |
| Q41 | a clean Runtime shutdown stays a policy-suite test; no Testing API | 2.7.16, C53 |

**OD25** (C5–C8) is applied in ODP 3.8.1 and walked in 5.7; LM passes on it. It lands with 2.7.13 and 2.7.14
unchanged, plus the decided item below.

## 1.7 Conflicts

| # | Conflict | Kind | Proposed resolution |
| --- | --- | --- | --- |
| X1 | OD23 decided, not applied in ODP's text | small | write each as decided (1.6); edits OE13, OE19, OE21, OE38, OE60, OE65, OE86 |
| X2 | Stale sentences inside ODP (5.6, B-row statuses, 5.3 intro) | small | the design uses the K16 list and the ODs (1.3, 1.5); the record keeps its text under its status header |
| X3 | S-numbers in ODP's body drift from 3.13 (3.2 "S10" is 3.13's S11; 3.4 "S12" is S13; section 4 "S11" is S12; 3.12 "S14" is part of S3) | small | MD gives the rules numbers 39–47 with one mapping table (Part 2, 2.2); citations use MD numbers |
| X4 | Rule 34's default lane key (E10, C28, 2.8.8, rule 21, 2.7.2, 2.7.3, D7's note, M5's `many` sentence) vs OD15 | small | rule 34 rewritten (OE33): domain writes state `key`; `flow check` warns when a one-record write's declared key fields are not the input fields its predicted record key reads; `many` writes and multi-record writes are exempt; E10 and M5-D9's clause annotated superseded |
| X5 | `retry` on a `serialize` head (OD19 Q35) vs N2, rule 31 (K7's list), E17, M5's rule-34 sentence ("with `allow` or `serialize`, `retry` is a type error"), C18's type errors, 2.7.8's table | small | one sentence everywhere: `retry`, `retryable`, `retryCount`, `progress` exist under `reject`, `latest`, `cancel` and on the `serialize` head; under `allow` only key-less in an ending's own handler (OD20 F9); elsewhere type errors |
| X6 | `Superseded` and `NothingToResend` become evidence (OD5, OD10, AM12), and a declined retry is evidence `InFlight` (AM4); MD delivers them as `NotSent` in 2.7.1, C2, C10, C24, rule 29, 2.8.5 (table and code comment), 2.8.6 E2, D17, decision E2, 3.6 | small | delivered `NotSent.why` values: `Rejected`, `Cancelled`, `Overloaded`, `StorageRefused`, `Restored`, `Disposed`. Evidence kinds: `Superseded`, `NothingToResend`, `InFlight`, `Released`. The store table keeps `Superseded` as a row (its store effect is unchanged), marked "evidence". A `failure.NotSent` mapper's `why` type excludes the evidence kinds |
| X7 | Rule 20 requires `failure.NotSent` under `latest`; after OD5 `latest` alone never delivers `NotSent` (replacement is evidence). The persisted list lacks `StorageRefused`, `Disposed` | small† | rule 20: `NotSent` must be mapped under `reject` or `serialize`, where the machine cancels the operation, for a persisted identity, or for a domain write (OE18) |
| X8 | D19 and N3 ("an absent lane has no row") vs `O.x.get(s, key)` returning the idle row (OD4, OD9 Q2) | small | D19 superseded for write lanes; N3 reworded: a write lane read by key is total because lanes exist only while they hold work; `s.operations.x` still lists only lanes that exist; reads and placements keep `undefined` |
| X9 | MD says lanes change only at admission (rule 27, 2.5 "Settlement publishes without a turn", 2.8.1, 2.8.4, the Machines O8 row). Under OD19/OD20 the Runtime applies cells outside turns: `invoked` raises `retryCount`, `storage refused` promotes `W`, endings of unbound lanes, dispose. LM applies them at the event (`doAckRefused`, `doInvoke`) | small† | a Runtime step that changes a bound lane's row publishes it on its own, as settlement publishes the store (a lane-only publication, a new snapshot); an old snapshot never sees it, so Machines O8 holds. Added to 2.5's paragraph, rule 27 and 2.8.4 (OE27, OE44, OE67) |
| X10 | C27's resource half (E16) vs ODP 3.4's "OPS O6's `pending`" | small | keep E16 as merged; ODP's sentence reads `predicted`. No revert |
| X11 | ODP 5.3's domain code vs merged 2.8.2: `likes: (i) => …` closes over `input` (merge 5 decided `(beneath, input) => value`, M5-D5, B2); `.list(Issue, ({ result }) => …)` (OD23 Q39: `output`); its imports | small | merged 2.8.2 = ODP 5.3 After with `likes: (i, input) => …`, `({ output }) => output.issues`, and merge 5's import line |
| X12 | ODP 5.3's view drops MD's `!rows.some((r) => r.id === d.id)` draft filter; without it a created issue shows twice between its row landing and `Listed`'s turn (rule 33; 2.8.7 F-M4 "one issue never shows twice") | small | keep MD's filter in the merged view (OE65) |
| X13 | "Orphan" names two things: ODP's lane with no binding actor ("the rest stay orphans, listed by Inspection") and P19's `orphaned` handler (a version change) | small | the design calls the first an **unbound lane** (a table label, not an author word); `orphaned` stays P19's. Applied in 2.7.13, rule 44, C42, C51 |
| X14 | P19 ("On `RestoreDiscarded`, acknowledged Attempts… go to … `orphaned`"; "An orphaned retry has no actor: its ending is evidence only"), rule 8's last sentence, section 7 item 16 vs Persistence O5 as amended (lane records decode by their contract's `input` pick, independent of the actor record; a fresh incarnation adopts them; only a removed operation or an undecodable key goes to `orphaned`, ODP 3.10) | small | amend P19, rule 8 and item 16 (OE10, OE84, OE88); ODP lists only the plan row |
| X15 | P15 "Each send is acknowledged before it runs" and C17 vs OD20 F2 (once per Attempt; a persisted re-send waits for its lane record's capture) | small | amend P15 and C17 (OE83, OE84) |
| X16 | `outstanding` counts two things: queued commits `W` under `serialize` (OD16) and independent Attempts under `allow` (OD20 F9); MD's one meaning is "outstanding Attempts" | small | one definition: "unresolved commits other than the addressable Attempt" (all of them under `allow`, which has none; `W` under `serialize`). No behaviour change |
| X17 | Rule 8 "Deliveries are never lost… every event a server… produces" vs evidence-only endings (a replaced never-sent commit, a released lookup, a bare write, an Attempt a `cancel`-concurrency commit interrupted) | small | rule 8 points to rule 17's list of what is evidence by declaration (OE10) |
| X18 | Rule 2 ("`internalEvents` come only from the fragment's own schedules") vs a definition's mapped events and S15 | small | rule 2 gains: on a definition, `internalEvents` come from its schedules or its operations' endings, and an event an operation maps comes only from endings (rule 47) |
| X19 | MD examples ODP does not port fail the new checks. **3.2:** UNSURE's `CheckAgain` is guarded by `create.idle()`, which denies `Uncertain` in `Held`, so the re-send can never run (`UnresolvedHold` error and a real deadlock), no branch releases, and `create`'s handlers sit only on SUBMITTING (rule 20, amended, errors at the new-incarnation arrivals). **3.4:** `PinUnsure: { target: "self" }` keeps the hold while `Pin` is reachable (`UnresolvedHold` error). **2.7.7:** the booking excerpt's `ChargeUnsure` `{ target: "self" }` branch and the uploads excerpt (ODP 8.1 ports uploads). | small† | 3.2: `CheckAgain` drops `idle`, takes `O.create.retryable({ times })` with a fallback that cancels; `create`'s endings get root handlers (S7c). 3.4: `PinUnsure: { target: "self", actions: [O.pin.cancel] }` (key-less: `pin` alone maps it). 2.7.7: port uploads from ODP 8.1; re-walk booking against [the rewrite](../../merged/server-calls/rewrites/booking.ts) and add the release it needs (OE52, OE78, OE79) |
| X20 | Where a plain operation's `optimistic` and `writes` live. MD has them as commit options beside `outcomes` (2.6, rule 36, C15, 2.8.9, 3.4). ODP moves `outcomes` to the operation, says `commit(select)` is "without an `outcomes` option", and never places the other two | **owner** | Q1 below |
| X21 | `Story.ending` (OD23 Q33, S15) injects an ending through the operation; MD 2.7.2 says "no ending is injected (Testing O3)" and 2.7.11 "every ending can be produced through services" | **owner, at merge 3** | merge rule 47 and C53 with `Story.ending` marked *Story reads: merge 3*; merge 3 decides whether `Story.ending` is a fixture answer for a send already on the wire (Testing O3 stays true) or Testing O3 is amended (as K11 was deferred) |
| X22 | Q36 (per-tag `unknown`, "as `failure` is") leaves open whether the record is exhaustive and whether Flow's unknown reasons must appear | small† | as `failure` and rule 37: exhaustive over the contract's unknown tags; Flow's reasons (`Cancelled`, `Restored`, `Interrupted`, `Defect`, `StillUnknown`, `StorageRefused`) optional in the type and required by `flow check` where they can occur. `Restored`, `Interrupted` and `Defect` can always occur on a holding write, so a per-tag record maps them (Q36's example gains three entries). Every target is `Flow.uncertain`; `UnresolvedHold`'s U is every event the record maps. Escalate if a catch-all is preferred: that is API |
| X23 | 2.7.5's example keeps `likeUnsure` in memory (merge 4's K6) | small | OD5/R9 remove the mirror; the example shows the schedule's `keys` reading the lanes' `uncertain` |
| X24 | Rule 32 per Attempt (OD19) vs 2.8.2's "Like unknown" row and E3 ("a later successful write clears it") | small | rewrite the row ("a newer toggle waits behind the held like; once the like is retried or released, the toggle's success clears its mark"); annotate E3 |
| X25 | Rule 27's "routes current, late or superseded" | small | "current or late" |
| X26 | ODP cites `revisit.md`, which does not exist | small | create `machine-fragments/revisit.md` (M7) |
| X27 | `Released` (a `cancel` in `Held`) is a store effect (ODP 3.8.1) with no row in 2.8.6's rule table | small† | add a row from ODP's own words: prediction none (ended by the forced repair); the queue entry withdrawn if a re-send waits; no repair; the mark kept until a later write's success (rule 32) |
| X28 | The Attempt's `.each` copy key and incarnation (rule 9, C20, D21, 2.7.2, 2.7.3, N2, section 4 L2) go; the mapper's `key` now means the contract's key | small | accepted with ODP (5.6, OD12); rule 9's revision paragraph rewritten; C20 deleted; D21 superseded. A host that needs the copy in an ending puts it in the input |
| X29 | 2.5's lane-read paragraph: "`pay.idle(key)` in an ending's own turn therefore sees the lane free" | small | under the hold, an unknown's own turn sees `Held` (denies `Uncertain`); a success's turn may see the promoted commit (`InFlight`) |
| X30 | D17 and 2.7.3: a `NotSent` mapper's `input?` (absent on `NothingToResend`) and `laneKey` | small | `NothingToResend` is evidence, so `input` is always present; `attempt?` stays optional (`Rejected`, `Overloaded`); `key` replaces `laneKey` |
| X31 | A commit queued behind a held lane (`W`) joins its records' queues at commit (rules 28, 29, unchanged by ODP), so it heads record r's queue while it cannot be invoked: **every other actor's write to r waits as long as the hold lasts**, for an unbound lane until an incarnation of its identity returns or the Runtime ends. ODP states the hold's limit for its own lane only; LM has no record queue | small† | keep the order (it is the cross-actor ordering merge 4 promises, and letting B pass A's earlier commit reintroduces a late landing across actors, as TanStack's `scope` also blocks) and **state it as a limit** in 2.7.13's limits and 2.8.5; Inspection lists the blocking unbound lane. Alternatives, if the main session prefers: join at promotion (moves rule 28's join and rule 35's overflow check), or let the record queue skip unpromoted entries (breaks per-record order). Not walked by LM: add it to the model's next run |
| X32 | The decided item: the parked state's flags, while `cancel`/`allow` rows have no `uncertain` field (R6 L4) and LM keeps them false (LM N1) | small | edit OE59: as `Held`, `pending` false and `uncertain` true, read where lanes are listed by identity (Inspection, `runtime.unsettledWrites()`); no row field is added. Adding `uncertain` to `cancel`/`allow` rows would be API (owner) |
| X33 | ODP calls LM "the first draft" of Flow's policy suite; a suite that runs the model instead of the Runtime is the second execution path T1 removed | small | 2.7.16: the policy suite drives the real Runtime under the TestClock; LM stays a design check |

### Owner questions (numbered round)

**Q1 (X20). Where do a plain operation's `optimistic` and `writes` go?** Before (MD 3.4, today):

```ts
// issuelist.machine.ts
const pin = O.Issues.setPinned.commit(({ event }) => ({ id: event.id, pinned: event.pinned }), {   // existing: commit
  outcomes: { success: E.Pinned, failure: E.PinFailed, unknown: E.PinUnsure },                     // existing: outcomes
  optimistic: [O.Issues.list.setData(({ memory, event }) => ({ key: listQuery({ memory }), data: pinRow(event) }))],   // existing: optimistic
})
Pin: { target: "self", guard: [pin.idle(({ event }) => ({ id: event.id }))], actions: [pin] },
```

- **A.** Both stay commit options: `O.pin.commit(select, { optimistic, writes })`. 2.6's commit options become
  `optimistic`, `writes`.
- **B (recommended).** `optimistic` stays on the commit (it reads the starting turn's after memory and event, rule 36,
  so it belongs where the select is typed); `writes` moves to the operation beside `outcomes`, because it reads only
  `{ value, input }` and must be found from a lane record after a rebind or reload, as `outcomes` are (OD22: parked
  endings are mapped through the current definition at delivery). A commit-site closure cannot be recovered from a
  lane record; an operation can, by contract id.
- **C.** Both on the operation; `optimistic` loses memory and reads `{ input }` only (rule 36 changes).

After (B):

```ts
// issuelist.definition.ts
operations: ({ E }) => ({                                                       // existing keyword, NEW MEANING (OD3)
  pin: Issues.setPinned.outcomes(                                               // user-defined: pin; existing: outcomes
    { success: E.Pinned, failure: E.PinFailed, unknown: E.PinUnsure },
    { writes: ({ value }) => [Issues.list.invalidate({})] },                    // NEW: the operation's second argument; cache verbs on the contract (OD17 Q17)
  ),
  issues: Issues.list,                                                          // user-defined: issues; bare, subscribed in the machine
}),
// issuelist.machine.ts
Pin: {
  target: "self",
  guard: [O.pin.idle(({ event }) => event)],                                    // existing: idle; the event carries `id` (OD4)
  actions: [O.pin.commit(({ event }) => ({ id: event.id, pinned: event.pinned }), {   // existing: commit
    optimistic: [Issues.list.setData(({ memory, event }) => ({ key: listQuery({ memory }), data: pinRow(event) }))],   // existing: optimistic, the commit's only option
  })],
},
PinUnsure: { target: "self", actions: [O.pin.cancel] },                         // existing: cancel; key-less: pin alone maps PinUnsure (OD8)
```

Added: the operation's options argument (`writes`). Dropped: `outcomes` and `writes` as commit options. Domain
operations: unchanged (no `optimistic`; `writes` may only invalidate, now on the operation).

**Q2 (X21), at merge 3.** `Story.ending` versus Testing O3's "no ending is injected". Asked when merge 3 is
reviewed; nothing in this merge depends on the answer.

## 1.8 The decided item

The lane model found the flags of `Held` (parked) unstated under `cancel`/`allow` (LM N1). **Decided by the main
session:** while a parked unknown holds the lane it is `Held` (OD10's flags as functions of state; ODP 3.8.1's K10), so
`uncertain` is true and `pending` false. Edit OE59; X32 says how it is read without a new row field.

---

# Part 2: the change list

## 2.1 Order and scope

1. **Change set 1, normative text:** header, sections 1–2.6, rules, 2.5, 2.7 prose, new 2.7.13–2.7.16, 2.8 prose,
   section 4, section 5 C rows, sections 6–7, change log, decisions (OE1–OE64, OE66–OE76, OE81–OE93).
2. **Change set 2, examples:** 2.7.3–2.7.11 code, 2.8.2, 3.1, 3.2, 3.4, 3.6 (OE48–OE56 code parts, OE65, OE77–OE80),
   after change set 1 is checked. Code in change set 1 sections is replaced in change set 2, so set 1 may leave old
   code with a one-line "rewritten in change set 2" note.
3. Q1 (X20) must be answered before OE7, OE26, OE35, OE66, OE72, OE79 and C15/C38's wording; everything else proceeds.
4. Each change set ends with a verification review in CHK's form. Then the mechanics (2.9).
5. Out of scope: `.plan` files (C rows only), merge 3 and merge 6 (their rebases are listed in 2.10), DD.

## 2.2 Rule numbering

Rules 1–38 keep their numbers (M3, M6, the merged records and ODP cite them). ODP's S-rules map to:

| ODP 3.13 | MD rule |
| --- | --- |
| S0 contract shape, S4 keys | 39 (new) |
| S1 declared once, S6 one write operation per contract, S11 bare writes | 40 (new); mapping in 13 |
| S2 verbs, S10 one placement, S12 verb agrees | 41 (new) |
| S3 identity, S5 replacement, S13 rows | write halves: 21 (rewritten), 17 (rewritten); read halves: 42 (new) |
| S7 the write lane | 21 and 2.7.13 |
| S7c a hold outlives its actor | 44 (new); 14 amended |
| S8 key-less addressing | 43 (new) |
| S9 persistence | 46 (new); 38 amended |
| S14 every hold has an owner | 45 (new); 20 amended |
| S15 mapped events only from endings | 47 (new); 2 amended |
| S16 `restartOn` per key | 23 (rewritten) |

## 2.3 Edits (93)

**Header, section 1, 2.1–2.6**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| OE1 | Status paragraph | "Merge 4 (…) was merged on 2026-10-30, and merge 5 (…) on 2026-10-30;" | append: "Operations in the definition ([merged/operations/proposal.md](merged/operations/proposal.md), revision 13) was merged on <date>: server interaction is declared once under `operations` (2.7, rules 39–47), write lanes are the Runtime's (2.7.13)." | OD24 |
| OE2 | "Four decisions" | "**Four decisions.** … decision 4 builds on decision 2." | "**Five decisions.** … decision 5 builds on decisions 2 and 4."; new row "\| **5. Operations in the definition** \| 2.7 (rewritten), 2.7.13–2.7.16, rules 13–25 and N1–N3 amended, 26–38 amended, 39–47, C31–C53, decisions OD1–OD25 \| Operations O1–O7, Machines O1/O4–O6/O8, Runtime O3/O6/V4, Persistence O2–O6, ServerRendering O3/O5, LazyFeatures O3, Inspection O1, React O2/O3, Testing O3/O7, CommandLine O5 \|" | ODP 0 |
| OE3 | Section 1, three layers; last paragraph | "**Operations own how a call is made…** the transaction's key and concurrency; the cache; restore." / "**Machines own … the calls they start**"; "schedules and commit values (2.7)" | "**Contracts own how a call is made, which server thing it is about (`key`) and what its ending means**…"; add "**Definitions declare** every operation the actor uses and what its endings become (`operations`, `outcomes`)"; machines "own when work starts, is sent again, cancelled or placed"; "the Runtime keeps write lanes (2.7.13)"; last paragraph "schedules and the operations' members (2.7)" | OD3, OD19 |
| OE4 | 2.1 reading list | "a keyed activity: `s.activities.<name>[i]`, each `{ key, …lane }` (2.7.10); the machine's call lanes: `s.calls.<operation path>` (rule 21);" | "the operations' lanes: `s.operations.<name>`: a write's row, or under a keyed contract a keyed list of `{ key, …row }`, read by key with `O.<name>.get(s, k)` (rule 21); a one-off read's row or `undefined` (rule 42); a placement's lane, or under `subscribe.each` a keyed list (rule 41);" and the closing sentence "found by key with `find`" gains "or, for write lanes, `get`" | OD4, OD17 Q15 |
| OE5 | 2.2.1 `Flow.uncertain` row | "marks an event that a commit value's `unknown:` may target (rule 13)" | "marks an event that an operation's `unknown:` (or one of its tags) may target (rule 13)" | OD23 Q36 |
| OE6 | 2.3 "Running I/O" row; "Sharing a guard" example | "host **machine**: commit values in `actions`, their `outcomes` onto the host's own events (2.7)"; "A commit value's `idle(key)` is already a guard value"; `const verify = O.Auth.verifyCode.commit(select, { outcomes });` `const notChecking = verify.idle(…)` | "host **definition**: `operations`, each contract with its `outcomes` onto the host's events; host **machine**: `O.x.commit` and `O.x.lookup` in `actions`, `O.x.subscribe` in `activities` (2.7)"; "An operation's `idle(k)` is already a guard value"; drop the `verify` line; `const notChecking = O.verify.idle(({ memory }) => ({ challengeId: memory.challengeId }))`; the closing paragraph "Filling refers to `S`, `E` and `O`" stays | OD2, OD3 |
| OE7 | 2.6 key order; "What lives in `Flow`" | row "\| commit options \| `outcomes`, `optimistic`, `writes` \|"; "what a commit value does is a member of it: `.retry`, `.cancel`, `.idle`. What a lane is, is a fact about the actor, so it is snapshot data, `s.calls`" | per Q1: (B) row "\| commit options \| `optimistic` \|" and new row "\| operation options \| `writes` \|"; the definition row's `operations` is written `operations: ({ E }) => ({ … })`. "what an operation does is a member of its handle: `O.x.commit`, `.lookup`, `.subscribe`, `.retry`, `.cancel`, `.idle`, `.retryable`, `.get`. A write lane is the Runtime's record of the actor identity (rule 21), read as snapshot data, `s.operations`" | X20; OD19 |

**2.4 rules 1–25, N1–N3**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| OE8 | Rule 1, Typing | "a commit value's select is checked at each transition whose `actions` list it;" | "a commit's or lookup's select is written in, and typed by, its transition;" | ODP 5.6 |
| OE9 | Rule 2 | "`internalEvents` come only from the fragment's own schedules." | append: "On a definition, `internalEvents` come from its schedules or its operations' endings; an event an operation maps comes only from endings (rule 47)." and "The host maps call endings onto **its own** events" → "…through its operations' `outcomes`…" | X18 |
| OE10 | Rule 8 | "call endings, current and late (rules 14, 20);" / "An Attempt orphaned by a version change goes to its descriptor's `orphaned` handler, outside any actor (P19)." | "call endings, current and late (rules 14, 20), except what rule 17 makes evidence by declaration;" / "A write lane whose operation is gone, or whose key no longer decodes, goes to its descriptor's `orphaned` handler (P19); a lane whose actor record no longer decodes is adopted by the fresh incarnation (rule 46)." | X14, X17 |
| OE11 | Rule 9, revision paragraph | "A commit started in a copy's filling is an ordinary call: its **Attempt** carries the copy's key and incarnation… (`SharedCopyLane`)." | "A commit started in a copy's filling is an ordinary commit of the host's operation: its lane is named by the contract's key, picked from the input, so copies whose input carries the copy's key have their own lanes, and copies whose input does not share one, which is `reject`'s promise (rule 21). The Attempt carries no copy key; a handler that needs the copy reads it from the mapper's `key` or `input`. Call endings are never dropped; only a raise the handler makes into a gone copy follows the drop below (rule N3)." Delete the D9/`SharedCopyLane` sentence; the incarnations sentence drops "item 15" | X28; ODP 5.6 |
| OE12 | Server-calls intro (before rule 13) | "A **write** is one start of a commit value, an **Attempt** with an id Flow mints;" | "A **write** is one commit of a write operation, an **Attempt** with an id Flow mints;"; append "Rules 39–47 (after rule 38) declare operations; rules 13–25 say how their work runs." | OD3 |
| OE13 | Rule 13 | "A commit value `O.x.commit(select, { outcomes })` maps each ending of its Attempts…" (whole rule) | "**Endings map to events, on the definition.** An operation `name: contract.outcomes({ … })` (rule 40) maps each ending to one of the definition's events: for a write `success:`, `failure:` (an exhaustive record over the commit's failure tags, plus an optional `NotSent`; or one event), and `unknown:` (one event, or a record by tag as `failure` is, OD23 Q36); for a read `success:` (one-off) or `value:` (live) and `failure:` (rule 41). A mapping value is an event or `E.X.from((value, ctx) => payload)`, with `ctx` `{ input, attempt, progress, key }` for a write and `{ input, key }` for a read or stream; `key` is the contract's key record of the call that ended. Several endings may map to one event. Every `unknown:` target is a `Flow.uncertain` event. A read's `failure:` carries its tags plus Flow's `Defect` and `Interrupted` (rule 37). An author error whose tag is one of Flow's reasons (`NotSent`, `Cancelled`, `Restored`, `Interrupted`, `Defect`, `StillUnknown`, `StorageRefused`) is a type error." | S1; OD3, OD12, OD17 Q15–Q16, OD23 Q36 |
| OE14 | Rule 14 | "A start or retry is owned by…"; "…(the root at worst)." | "A commit, lookup or retry of an operation is owned by…"; insert after "(the root at worst).": "**One owner test**, whenever an ending lands, parked or not (rule 44): the owner activation alive → current; ended in this incarnation → late; never of this incarnation (an adopted lane) → current, from the active leaf. Every `unknown { Restored }` is current from the active leaf." A5's last sentences stay | OD21, OD22 (R10 M2) |
| OE15 | Rule 16 | "a start on a lane that is pending invokes nothing"; "**Revision (multiplicity audit…)** In every mode, a retry whose addressable Attempt (rule 21) is still outstanding also ends `NotSent { why: "Rejected" }`… a retry on a lane with no addressable Attempt ends `NotSent { why: "NothingToResend" }`… (decision D17)."; "`pay.idle(key)`"; "lists a `reject` commit value without its `idle` guard" | "a commit on a lane that is `InFlight` or `Held` invokes nothing"; the revision sentences become: "A retry on an `InFlight` lane is evidence `InFlight`, and on an `Idle` lane evidence `NothingToResend`: neither is an ending (rule 17). A declined commit has no Attempt, so its `NotSent` mapper sees `attempt` undefined (D17, as amended)."; "`O.pay.idle(k?)`"; "lists a `reject` commit without its `idle` guard". The `Overloaded` sentence stays | AM4; OD5, OD10 |
| OE16 | Rule 17 | "**Every start ends once.** Every start and every retry, invoked or declined, delivers exactly one ending." | "**Every commit ends once, unless its operation declares it replaceable.** Every commit and lookup, and every retry that sends, delivers exactly one ending, to a live incarnation of its identity or its saved record (rule 44). Evidence, by declaration: a never-sent commit replaced under `latest` (`Superseded`); a lookup a newer lookup or `cancel` released (`Superseded`); a declined retry (`InFlight`, `NothingToResend`); a bare write's endings (rule 40); under `concurrency: "cancel"`, the ending of an Attempt a newer commit interrupted." | S5; OD5, OD9 Q6/Q7, AM5 |
| OE17 | Rule 19, last sentence | "`pay.retry` after a definite failure stays allowed and sends the same id." | "A failed Attempt is resolved: `retry` after it is evidence `NothingToResend`; trying again is a new commit." | AM6 (B60) |
| OE18 | Rule 20 | "`failure.NotSent` must be mapped only when it can occur: its concurrency is `reject`, `latest` or `serialize`, the machine cancels or retries that commit value, the actor is persisted, or the operation is a domain write…" | "`failure.NotSent` must be mapped only where it can occur: under `reject` (`Rejected`) or `serialize` (`Overloaded`), where the machine cancels the operation (`Cancelled`), for a persisted identity (`Restored`, `StorageRefused`, `Disposed`), or for a domain write (`Overloaded`, rule 35)."; append after the late-event sentences: "**Adopted endings.** Every event a write operation maps (`success`, each `failure` tag, `unknown` or each of its tags) is handled totally from every leaf of that operation's new-incarnation arrival set (2.7.14); `{ target: "self" }` is the explicit ignore; a missing handler is a `flow check` error naming the event and the leaf. Requirements are read per operation; a bare operation has none." | AM19; X7; OD22 |
| OE19 | Rule 21 | "**The lane, read as `s.calls`.** …" (whole rule with its five bullets) | "**The write lane** (2.7.13). A write lane is (actor identity, contract id, key of the input), owned by the Runtime; the actor that commits is its **binding actor**. It is created by work and removed when `Idle`. Its states are `Idle`, `InFlight` (waiting to be invoked, or on the wire) and `Held` (a retained unknown), each with queued commits `W`; every member, ending and Runtime step acts by the table in 2.7.13, which is normative, and the cells apply in step 5 in action order (2.5). Only a never-sent commit is replaceable; a sent Attempt's ending is always delivered; under `reject`, `latest` and `serialize` an unknown holds the lane until `retry` resolves it or `cancel` releases it; `cancel` and `allow` hold it for its own ending's turn (`HeldThisTurn`), or, for a persisted identity with no live actor, until it is delivered. The **addressable Attempt** is the lane's one sent, unresolved Attempt (the head under `serialize`). **Rows** (`s.operations.<name>`; `O.<name>.get(s, k)`): `{ pending, uncertain, waiting, retryCount, progress? }`, plus `outstanding` under `serialize`; `{ pending, retryCount, progress? }` under `cancel`; `{ pending, outstanding }` under `allow`. `pending` is `InFlight`; `uncertain` is `Held`; `waiting` is `W` not empty; `outstanding` counts unresolved commits other than the addressable Attempt; `retryCount` counts the addressable Attempt's invoked re-sends. **Members:** `retry(k?)`, `cancel(k?)` in actions; `idle(k?)` (a partial key passes only when every lane it matches is `Idle`) and `retryable(k?, { times })` in guards. A lane holds no store state: predictions, record queues and marks are the store's (rule 26)." | S3, S7, S13; OD5–OD7, OD10, OD16, OD19, OD20, OD23 Q34, OD25; X16 |
| OE20 | Rule 22 | "(a commit's input select, a retry's or cancel's key select, a schedule function, `keys`, `restartOn`, activity `params` and `when`)"; bullet "**Lane reads** (`calls` and the `idle` guard) are not memory. They see the pre-turn lanes with the turn's own ending already admitted (rule 21)." | "(a commit's or lookup's select, a member's key select, a schedule function, `keys`, `restartOn`, a placement's select and `when`)"; the bullet: "**Lane reads** (`operations`, `get` and the `idle` and `retryable` guards) are not memory. Selects and guards see the pre-turn lanes with the turn's own ending admitted; `keys`, `when`, placement selects and the published rows see the **after lanes**, the lanes with this turn's members applied (rule 21)." | AM11; OD16 |
| OE21 | Rule 23 | "A keyed schedule (`keys`) keeps one timer per key of the after list…"; "An activity may declare `keys` the same way (2.7.10): one subscription per key." | "A keyed schedule's `keys` return key records (`({ docId })`, the shape of a contract's key) from the after memory and the after lanes, so `keys` may read `operations`; one timer per key, armed when the key first appears, cancelled when it leaves, firing once with `key`. `restartOn` on a keyed schedule is evaluated per key, `({ key, memory }) => value`, and restarts that key's timer when its value changes; `armOn` on a keyed schedule is a construction error." Repeats and restore stay; the activity sentence becomes "One live session per key is `O.x.subscribe.each(select)` (rule 41)." | S16; OD17 Q13, OD23 Q29 |
| OE22 | Rule 24 | "**Cancel.** Before invocation: … **Revision (multiplicity audit…).** `x.cancel(key)` applies this to **every** outstanding Attempt of the lane…" | "**Cancel** acts on the addressable Attempt, the one `retry` names (2.7.13). On the wire it interrupts; the ending (`unknown`, `Cancelled`) is queued when the fiber exits and is retained (`Held`), so nothing newer is sent while the request may land. Waiting to be invoked, it acts by history: never sent, it ends `NotSent { why: "Cancelled" }` and the next queued commit is promoted; a re-send returns to `Held` and is released. In `Held` it releases the Attempt (`Released`, evidence) and promotes. In `Idle` it does nothing. It never drops a queued commit silently. **A settled ending is never rewritten.** A one-off read's `cancel` is rule 42's." Merge 4's last sentence stays | AM9; OD7 |
| OE23 | Rule N1 | list "…keyed schedules, keyed activities, call lanes."; "`idle` and a row's `pending` mean any outstanding Attempt, `cancel` means every one, `outstanding` counts them." | "…keyed schedules, `subscribe.each` placements, a keyed operation's write lanes."; "`idle` passes only when its lane, or every lane a partial key matches, is `Idle`; a row's `pending` is `InFlight`; `retry` and `cancel` name one Attempt; `outstanding` counts unresolved commits other than the addressable one." | OD7, OD10, OD23 Q34; X16 |
| OE24 | Rule N2 | "…exist only where the transaction's `concurrency` guarantees at most one: `reject`, `latest` and `cancel`. Under `allow` and `serialize` they are type errors;… and every mapper receives `laneKey`." | "`retry`, `retryable`, and a row's `retryCount` and `progress` address the addressable Attempt: under `reject`, `latest` and `cancel` the one minted Attempt, under `serialize` the head. Under `allow` they exist only key-less in an ending's own handler, naming that ending's Attempt; elsewhere they are type errors. A call that needs its own status, retry or progress gets its own key and `reject`. Every ending reads its origin (operation, key) from its Attempt; every mapper receives `key`." | AM1; OD19, OD20 F9; X5 |
| OE25 | Rule N3 | "A read of something that may not exist returns `undefined` (a lane never started or evicted, a copy, a record)…; call endings are never dropped and route by owner (rules 8, 14, 17, 20);" | "…returns `undefined` (a one-off read row before its first lookup or after `cancel`, an inactive placement, a copy, a record)… A write lane read by key, `O.x.get(s, k)`, is total: a key with no lane reads the idle row, which is true because lanes exist only while they hold work (rule 21); `s.operations.x` lists only the lanes that exist. … call endings are never dropped: they reach a live incarnation of their identity or its saved record, routed by owner (rules 8, 14, 17, 20, 44);" | X8 |

**2.4 rules 26–38**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| OE26 | Rule 26 | "The commit value owns workflow:… Call-site `optimistic` and `setData` are type errors on it (EDP:60-61)." | "The operation and the machine own workflow:…"; "A commit's `optimistic` and a `setData` action on its own entries are type errors on a domain operation (EDP:60-61)." (wording after Q1) | OD3; X20 |
| OE27 | Rule 27 | "At admission it maps the ending, tests its owner and updates the lane (rules 14, 21). Store effects never depend on whether the ending routes current, late or superseded." | "At admission it maps the ending, tests its owner and applies the ending's cell to the lane (rules 14, 21); for a lane with no binding actor the Runtime applies the cell when the ending lands, and parks the ending (rule 44). Store effects never depend on whether the ending routes current or late, or on whether an actor is bound." | X9, X25 |
| OE28 | Rule 28 | "A start declined as `Rejected` or `Overloaded` applies nothing." | append: "A `latest` or `serialize` commit queued behind an `InFlight` or `Held` Attempt (`W`) joins and predicts at commit too, and is invoked only once its lane promotes it and it heads every queue it joined (2.7.13; the cross-actor wait this causes is a stated limit)." | X31 |
| OE29 | Rule 29 | "superseding it removes a never-invoked queued write: `NotSent { why: "Superseded" }`, prediction removed, no repair."; "`.cancel(key)` follows rule 24, with rule 30's store effects." | "a newer commit replaces a never-sent queued write, or a never-sent head not yet invoked: evidence `Superseded`, prediction removed, queue entry removed, no repair, delivered to no handler."; "`O.x.cancel(k?)` follows rule 24 and the table (2.7.13), with rule 30's store effects." | AM14; OD5, OD7, OD20 F4; X6 |
| OE30 | Rule 30 | "`NotSent` removes or never applies them, without repair (2.8.5);" | "`NotSent` (`Rejected`, `Overloaded`, `Cancelled`, `Restored`, `StorageRefused`, `Disposed`) and evidence `Superseded` remove or never apply them, without repair (2.8.5); `Released` keeps the mark (rule 32) and withdraws a waiting re-send's queue entry (2.8.6);" | ODP 3.8.1; X27 |
| OE31 | Rule 31 | "`pay.retry(key)` is the only re-send of a domain write. … (`reject`, `latest`; `concurrency: "cancel"` is an error on a predicting write, rule 29; rule N2)…" | "`O.x.retry(k?)` is the only re-send of a domain write. It exists where the lane has an addressable Attempt (rule N2: `reject`, `latest`, the `serialize` head; `concurrency: "cancel"` is an error on a predicting write, rule 29) and acts only in `Held`. It sends the Attempt's input and `basedOn` unchanged…" rest kept | AM15; OD19 Q35; X5 |
| OE32 | Rule 32 | "a success of a later write to the record clears every mark on that record." | "a success of a later write to the record clears every mark on that record whose Attempt is resolved or released; a mark whose Attempt is still unresolved stays. `Released` is a store effect: the record queue learns the Attempt is given up. Disposal is not a release." E18's sentence stays | AM16; OD19 |
| OE33 | Rule 34 | "**The lane key of a domain write** (E10, as corrected; 2.8.8). A write that predicts exactly one record and declares no `key` has that record's key… (merge 5, M5-D9)." | "**The key of a domain write** (E10, superseded by OD15; 2.8.8). A domain write states `key` like every contract (rule 39). `flow check` warns when a write that predicts exactly one record declares key fields that are not the input fields its predicted record's key reads (two lanes for one record would let `reject` pass two writes). A write whose predicted key the Model records as `many` (an array, merge 5, M5-D9) reads its keys at start and predicts each listed record once; the warning does not apply to it or to writes predicting several records or none." | AM17; X4 |
| OE34 | Rule 35 | "A start that would exceed its actor queue or any record queue" | "A commit that would exceed its lane's queued commits (`W`, 64 under `serialize`) or any record queue" | ODP 3.8.1 |
| OE35 | Rule 36 | "`optimistic` reads the starting turn's after memory, captured at start. `writes` receives `{ value, input }` and reads no memory. Domain operations have no `optimistic`; their `writes` may only invalidate (2.8.9)." | per Q1 (B): "`optimistic`, the commit's option, reads the starting turn's after memory, captured at commit. `writes`, the operation's option, receives `{ value, input }` and reads no memory, so it is found by contract id after a rebind or reload. Domain operations have no `optimistic`; their `writes` may only invalidate." | X20 |
| OE36 | Rule 37 | "A resource call value's `success:` sees confirmed data only." | "A read operation's `success:` and `value:` see confirmed data only." | OD2, OD9 |
| OE37 | Rule 38 | "A persisted actor's lane, its Attempt and that Attempt's predicted keys are written in one capture, the Persistence O6 acknowledgement before invocation." | "A domain write's lane record, its Attempt and that Attempt's predicted keys are written in one capture, the Attempt's one Persistence O6 acknowledgement before its first invocation (rule 46). Prediction values are never persisted." | OD20; AM33 |
| OE38 | After rule 38 | — | insert "**Operations in the definition** (2.7, 2.7.13–2.7.16). Rules 39–47 are the operations merge's ([merged/operations/proposal.md](merged/operations/proposal.md)); each names its decisions." and rules 39–47, each written from ODP 3.13 (map in 2.2) with these decided completions: **39** adds OD23 Q37 (omitted `output` is `Schema.Void`), Q38 (streams require `key`), OD18 (`progress` keeps its schema), OD17 Q18 (`*.contracts.ts`); **40** adds "the definition exports `O`"; **42** adds OD23 Q33 (the row's `key`; `O.x.get(operations, k)`); **43** adds "under `serialize`, only in the head's own ending's handler" (OD19 Q35); **44** names unbound lanes (X13) and adds `runtime.unsettledWrites()` (OD23 Q40); **45** reads U as every event the operation's `unknown` maps (X22); **46** adds the `orphaned` sentence (X14); **47** marks `Story.ending` *Story reads: merge 3* (X21). S4's "domain writes included" and S9's restore sentence are kept verbatim | ODP 3.13; OD1–OD23 |

**2.5 the turn**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| OE39 | "What reads what", After row; "Lane reads" paragraph | "…`restartOn`; activity `params` and `when`;…"; "**Lane reads** (`calls` and the `pay.idle` guard)… A guard `pay.idle(key)` in an ending's own turn therefore sees the lane free, unless another Attempt of the lane is still outstanding (rule N1: `idle` means none outstanding)." | "…`restartOn`; placement selects and `when`;…"; new row "\| **After lanes** \| the lanes with this turn's members applied, in action order, in step 5 \| `keys`, `when`, placement selects, the published rows \|"; paragraph: "**Lane reads** (`operations`, `get`, `idle`, `retryable`) in selects and guards see the pre-turn lanes with the turn's own ending admitted (rule 22). In an unknown's own turn the lane is `Held`, so `idle` denies `Uncertain` and `retry` re-sends; in a success's turn the next queued commit may already be promoted, so `idle` denies `InFlight`." | AM11; OD16; X29 |
| OE40 | Step 1, "A call's ending is mapped here." | "here the lane is updated (rule 21)," | "here the ending's cell is applied to the lane, which may promote the next queued commit (rule 21, 2.7.13)," | OD10, OD16 |
| OE41 | Step 2 | "Only after the root is the event `Denied` (if any handler existed) or `Unhandled`, and then nothing changes." | "…and then nothing of the turn's own changes. An ending admitted in step 1 keeps its lane effects (its cell and any promotion), which are published, and counts as delivered; a promoted commit is invoked after the turn." | AM22; OD20 F8 |
| OE42 | Step 5 "Starts" bullet; the defect paragraph | "**Starts** (rules 16, 21, 28; every write). For each commit value listed, in action order:…"; "A violation, a failing select or an invalid duration is a pre-commit defect." | "**Lane cells** (rules 16, 21, 28; every write member). For each member listed, in action order, apply its cell to the after lanes (2.7.13): a commit is declined (`Rejected`, `Overloaded`), minted (`InFlight`), queued (`W`) or replaces a never-sent one; `retry` re-sends or is evidence; `cancel` interrupts, releases or ends a never-sent commit. An admitted domain write joins every record queue it predicts and computes its prediction (rule 28). `check()` computes the verdicts only."; append: "A rejected turn keeps none of its own members' cells; step 1's admitted ending keeps its cell (step 2)." (CHK nit 7) | OD16; AM11 |
| OE43 | Step 6, last bullet | "Then the admitted Attempts are invoked (2.7.12)." | "After the turn, whatever its outcome, each Attempt minted, promoted or re-sent is invoked once its Persistence O6 acknowledgement (once per Attempt), its record queues and, for a persisted re-send, its lane record's capture allow (2.7.12)." | AM3; B74 |
| OE44 | "Settlement publishes without a turn" | "**Settlement publishes without a turn.** For a domain write…" | title "**Settlement and Runtime steps publish without a turn.**"; append: "A Runtime step that changes a bound lane's row (an invocation raising `retryCount`, a storage refusal promoting the next commit) publishes that row on its own, a new snapshot; an old snapshot never sees it (Machines O8)." | X9 |

**2.7 prose and code** (code parts are change set 2)

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| OE45 | 2.7 intro | "A machine starts a server write by listing a commit value in a transition's `actions`… Rules 13–25 (2.4) are normative" | "A definition declares each server interaction once, by name, under `operations`, and maps its endings with `outcomes`; the machine uses it through `O`, with the contract's own verb: `commit` and `lookup` in `actions`, `subscribe` in `activities` (rules 40, 41). Contracts own how the call is made and which server thing it is about (2.7.1, rule 39); the machine owns when work starts, is sent again or cancelled, and where its ending goes (2.7.3–2.7.7); the Runtime keeps write lanes (2.7.13). Rules 13–25 and 39–47 are normative" | OD2, OD3, OD19 |
| OE46 | 2.7.1 reasons table and reads bullet | `NotSent` row "`Superseded` (a newer `latest` start replaced it), `Rejected`…, `NothingToResend` (a retry with no addressable Attempt, rule 21), `Overloaded`…"; `Cancelled` row "`pay.cancel(key)`"; `Restored` row "the page reloaded mid-call"; "ends its call value on `failure`" | `NotSent` row: "`Cancelled` (before invocation, rule 24), `Restored` (reloaded before the Attempt was acknowledged), `Rejected`, `Overloaded`, `StorageRefused` (the Attempt's acknowledgement failed), `Disposed` (the Runtime was disposed before invocation)"; a line below: "`Superseded`, `NothingToResend`, `InFlight` (a declined retry) and `Released` (a `cancel` in `Held`) are evidence, never endings (rule 17)."; `Cancelled` "`O.pay.cancel(k?)`"; `Restored` "the page reloaded mid-call, or a new incarnation adopted a held lane (rule 44)"; new unknown row "\| `StorageRefused` \| unknown \| a re-send's lane-record capture failed before invocation \|"; reads bullet "ends the read operation's lookup on `failure`" | AM12; X6 |
| OE47 | 2.7.2 table | rows `Attempt id, retryCount` ("…lane row's `retryCount` in `s.calls`"), `input` ("absent on a `NothingToResend` ending"), `key` ("the transaction's optional `key(input)`… rule 34)… `laneKey`…"), "The copy's key", `superseded`, `Cancel` ("`pay.cancel(key)`"), "Server truth in Stories" | `retryCount`: "counted at invocation of each re-send; the row's `retryCount` (`s.operations`, rule 21)"; `input`: "the commit's select (rule 22); always present"; `key`: "the contract's `key`, a list of `input` fields (rule 39) \| the lane's identity for a write, the entry for a read; every mapper's `key`"; delete "The copy's key" and `superseded` rows; `Cancel`: "`O.pay.cancel(k?)`"; "Server truth" row adds "(*Story reads: merge 3*: `Story.ending`, X21)"; new row "\| Lane identity \| Runtime O3's actor identity, the contract id, the key \| adoption by a new incarnation (rule 44) \|" | OD4, OD12, OD20; X28 |
| OE48 | 2.7.3 | "#### 2.7.3 The commit and the commit value" (whole subsection) | "#### 2.7.3 Contracts, operations and the commit": ODP 3.2 (what an operation is, the per-kind table, verb agreement, bare operations), 3.3 (contract shape; key as field list; for writes), 3.5 (members), 3.6 (one write operation per contract); code from ODP 5.1 After (contract with `key: []`, the definition's `operations`, `Pay`, `CheckAgain`, `TookTooLong`). Kept from MD: "Refusing a second press is explicit", "Starting is static" (re-spelled), "The select is typed where it is used". "Keys are optional" becomes "Keys are required" (OD15). "Lanes belong to the transaction and key, not to `pay`" becomes "One write operation per contract" (OD9 Q4). File comments `*.operations.ts` → `*.contracts.ts` | ODP 3.2–3.6, 5.1 |
| OE49 | 2.7.4 | the excerpt (`Unsure: { target: "self", actions: [read.fetch(key)] }`, `paid` guard `S.LEFT`) | ODP 5.1 After's routing excerpt (root handlers for every `pay` ending, `answered`); prose: add "A holding write's endings are handled at the root, because a new incarnation can adopt the lane in any leaf (rule 44)." | ODP 5.1; OD21, OD22 |
| OE50 | 2.7.5 | "#### 2.7.5 Reading a lane: `s.calls`" (whole) | "#### 2.7.5 Reading lanes: `s.operations` and `O.x.get`": ODP 3.4 (rows per kind, the view excerpt, `get` in callbacks, the one-off row's `key` and `placeholder` note, "why a join and not rows on items", the record keeps its shared state); the `LikeUnsure` example replaced by the reconcile schedule's `keys` over `uncertain` (X23) | ODP 3.4; OD23 Q33 |
| OE51 | 2.7.6 | table rows "`pay.cancel(key)`… the ending is `unknown(Cancelled)`, or the real one"; reconcile code `lane(calls, memory.intentId)?.retryCount ?? 0) < 5`; last paragraph "under `allow` this `retry` would be a type error" | rows: `O.pay.cancel` "→ `unknown(Cancelled)`, retained: the lane is `Held` until retried or released (rule 24)"; code: ODP 5.1 After's UNSURE (`O.pay.retryable({ times: 5 })`, fallback to STUCK, which owns a release or a read); last paragraph: "under `allow` a key-less `retry` exists only in the ending's own handler (rule N2)" | ODP 5.1; OD1 |
| OE52 | 2.7.7 | booking and uploads excerpts; "the call stays pending until the commit's fiber has exited, so a retry cannot run beside it" | spelling (`O.charge.retry(chargeKey)`, `*.contracts.ts`; `orphaned: ({ attempt, retry }) => retry(attempt)` stays, P19); uploads from ODP 8.1 After (`put.cancel` then `UploadUnsure` releasing, `clean`); "the lane stays `InFlight` until the interrupt's ending is admitted, then `Held` (rule 24), so nothing newer is sent while the upload may land"; booking re-walked (X19) | ODP 8.1; X19 |
| OE53 | 2.7.8 | "#### 2.7.8 Concurrency" (both tables, the like excerpt, the plain-operation sentence) | the mode table from ODP 3.8.1's "Per concurrency policy" (holds, `W`, addressable Attempt, notes) and the row table from rule 21; the like excerpt from ODP 5.3 After (the `like` operation, `Toggle`, `LikeUnsure`, `ReconcileLike`, the reconcile schedule) with merge 5's `(i, input)` line; keep "A plain operation (no domain) keeps memory-held predictions… a `superseded` guard" as "…; a never-sent replaced commit is not delivered, so no guard is needed (rule 17)"; one pointer: "Every cell is in 2.7.13." | AM1, AM2; ODP 3.8.1, 5.3 |
| OE54 | 2.7.9 | "#### 2.7.9 Reads around writes" (whole) | "#### 2.7.9 Reads around writes": ODP 3.8.2 (one lane, latest lookup delivered, replaces "each `fetch` action is its own call with one ending") and 3.8.3; code from ODP 5.1 After's READING (`O.read.lookup(select)`) and 9.5's search (`O.results.cancel`); rule 37's sentence kept | ODP 3.8.2, 3.8.3; B31 |
| OE55 | 2.7.10 | keyed schedule code (`keys: ({ memory }) => Object.keys(memory.lockedUntil)`, string `key`); "**Keyed activities.**" paragraph and code | keyed schedule code with key records and `restartOn` per key (ODP 3.12; the per-document autosave of 3.3); "**One session per key.**" with `activities: [O.quotes.subscribe.each(({ memory }) => memory.watchlist.map((symbol) => ({ symbol })))]` and `O.quotes.get(s, { symbol })`; keep the release, repeat-repair and `DuplicateSession` sentences | ODP 3.12; OD9 Q22, OD23 Q29 |
| OE56 | 2.7.11 | "`NotSent` by a cancel during the Attempt's storage acknowledgement or by `latest`." | "`NotSent` by a cancel during the Attempt's storage acknowledgement, by `reject`, or by a refused acknowledgement (`StorageRefused`)." Keep the *Story reads: merge 3* sentence; add "`Story.ending` (rule 47) is merge 3's (X21)." | X6, X21 |
| OE57 | 2.7.12 | the timing table (whole) | rows rebuilt from ODP 3.8.1: starting turn steps 2–3 (unchanged); step 5 (lane cells in action order on after lanes; declines; queue joins and predictions); step 6 (one publication); **after the turn** (invocation when acknowledgement, record queues and capture allow); settlement (classification, rule 18, store effects and queue release, then the ending queued; the lane untouched); Runtime steps (invoked, storage refused, unbound endings, dispose; X9); admission (cell applied, promotion, mapping, owner test); a cancel (rule 24); restore and rebind (the delivery order of rule 44, then readiness); the timer row unchanged | AM3; ODP 3.8.1 |
| OE58 | New 2.7.13 "The write lane" (after 2.7.12) | — | ODP 3.8.1 from its principles 1–4 through "Limits, stated", verbatim, except: "orphan(s)" → "unbound lane(s)" (X13); `outstanding` as X16; the "Amendments to MD, OPS and merge 4" table dropped (applied by this plan); "Merge 4, with the facts on their owner" moved to 2.8.6 (OE69); the `UnresolvedHold` spec moved to 2.7.14; "Prior art" kept as one paragraph; "Stories and tests" says the policy suite drives the real Runtime (X33); the limits gain X31's cross-actor wait | ODP 3.8.1; OD5–OD8, OD10, OD16, OD19–OD22, OD25 |
| OE59 | 2.7.13, the parked sub-table (`Held` (parked)) | — | new first row: "\| **Flags** \| as `Held`: `pending` false, `uncertain` true. `cancel` and `allow` rows have no `uncertain` field, so the flag is read where lanes are listed by identity (Inspection, `runtime.unsettledWrites()`) and by `idle`, which denies `Uncertain`; the delivering turn publishes `HeldThisTurn`'s row \|" | decided item; X32; LM N1 |
| OE60 | New 2.7.14 "Every hold has an owner" | — | ODP 3.8.1's `UnresolvedHold` section (rules 1–4, the walks paragraph, "What this replaces", "The late-landing race is gone") verbatim; rule 2 reads "let U be each event X's `unknown` maps (one, or one per tag)"; its "same set is MD rule 20's arrival set" sentence points to rule 20 | ODP 3.8.1; OD6, OD10, OD16, OD22, OD25; X22 |
| OE61 | New 2.7.15 "Lane persistence, restore and hydration" | — | ODP 3.10 verbatim, with the hydration row's explanation from 3.8.1 and "goes to `orphaned` (P19)" kept | ODP 3.10; OD9 Q26, OD17 Q12, OD20–OD22 |
| OE62 | New 2.7.16 "Views, `check()`, Stories, `flow check`, `flow explain`" | — | ODP 3.11 verbatim, with: `Story.ending` marked *Story reads: merge 3*; "M3 3.14 becomes…" moved to 2.10; Q41 ("a clean Runtime shutdown is a policy-suite test; Testing O7's `closeTab` stays abrupt"); the policy-suite sentence (X33); ODP 4's typing note as a closing "Typing" list | ODP 3.11, 4; OD23 Q41 |

**2.8 prose** (2.8.2's code is change set 2)

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| OE63 | 2.8 intro | "**the domain owns shared data and the commit value owns workflow**" | "**the domain owns shared data; the operation and the machine own workflow**" | OD3 |
| OE64 | 2.8.1 table and "Store versus lane" | row "\| `pending`, `retryCount`, the addressable Attempt \| the lane (rule 21) \| Flow \| `pending` from the starting turn until the ending's turn is **admitted** \| …`s.calls.Issues.setLike`… \|"; row "The ending as an event, its route \| … the commit value's `outcomes`"; code `const saving = useView(list, (s) => s.calls.Issues.setLike.find((l) => l.key.id === id)?.pending ?? false)` | "\| the lane's state, `pending`, `uncertain`, `waiting`, `retryCount` \| the Runtime's write lane (rule 21) \| Flow, at admission, or in a Runtime step for an unbound lane \| `pending` while `InFlight` \| `O.like.get(s, issue)` \|"; "…the operation's `outcomes`…"; `const saving = useView(list, (s) => List.O.like.get(s, issue).pending)`; add "`O.like.get(s, issue).uncertain` is this actor's lane holding an unknown; `row.uncertain` is the record's mark (2.8.12)." | OD4, OD10, OD16, OD19 |
| OE65 | 2.8.2 (change set 2) | the domain, definition, machine and view code; line counts; "What changed" table | ODP 5.3 After (contracts, domain, definition, machine, view), with X11 (`likes: (i, input) => …`; `.list(Issue, ({ output }) => output.issues)`; merge 5's import), X12 (the view keeps `!rows.some((r) => r.id === d.id)`); ODP's line counts (definition 72, machine 86); "What changed" rows from ODP 5.3 "What changed", plus X24's "Like unknown" row; comments `// RENAMED`/`// NEW` dropped (the design shows current code) | ODP 5.3; X11, X12, X24 |
| OE66 | 2.8.3 | table header "\| The domain (store) \| The commit value (machine) \|"; code `Toggle: { target: "self", actions: [like] }`; "stated for the merged commit value: `optimistic` and `setData` stay type errors"; "A plain operation (not in a domain) keeps memory-held or `optimistic` predictions" | "\| The domain (store) \| The operation (definition) and the machine \|"; `Toggle: { target: "self", actions: [O.like.commit(({ event }) => ({ id: event.id, liked: event.liked }))] }`; "stated for the operation"; the last bullet per Q1 | OD3; X20 |
| OE67 | 2.8.4 | "**The lane changes at admission**, as merge 2 decided (2.7.12)" | append: "; for a lane with no binding actor, the Runtime applies the cell when the ending lands and parks the ending for the identity's saved record (rule 44). A Runtime step publishes the rows it changes (2.5)." | X9 |
| OE68 | 2.8.5 | code comment "C supersedes B: B was never invoked, so it is removed from the queue and ends NotSent Superseded"; E5 bullet "it ends `NotSent { why: "Superseded" }`"; `cancel` bullet "with rule 24's endings… queued, `NotSent { why: "Cancelled" }`"; `failure: { …, NotSent: fail(…) }   // Superseded (superseded: true, no toast) or Overloaded (toast)`; `NotSent` table rows `Superseded`, `NothingToResend` | "…and becomes evidence `Superseded`"; E5 "it becomes evidence `Superseded`, delivered to no handler, prediction removed, no repair"; `cancel` "by the table (2.7.13): never sent, `NotSent { why: "Cancelled" }`; a waiting re-send, released; invoked, unknown `Cancelled`, retained (`Held`), a forced repair and `uncertain`"; `NotSent: fail("Could not update")   // Overloaded (a replaced toggle is evidence, rule 17)`; table: `Superseded` row first cell "`Superseded` (evidence)", `NothingToResend` row "`NothingToResend` (evidence)"; new rows "\| `StorageRefused` (acknowledgement failed) \| removed \| removed \| none \| unchanged \|", "\| `Disposed` (Runtime disposal, never sent) \| removed \| removed \| none \| unchanged \|"; after the table, X31's limit | X6, X31; ODP 3.8.1 |
| OE69 | 2.8.6 | E2 "a retry ends `NotSent { why: "NothingToResend" }`… spelled `pay.retry(key)`"; E7 code `actions: [like.retry(issue)]`; E3 "a later write's success clears every mark on the record (EDP:105-106)"; the rule table's success row "this Attempt's mark and the record's cleared" | E2 "a retry is evidence `NothingToResend`… spelled `O.x.retry(k?)`"; E7 `actions: [O.like.retry(named)]`; "**The same `basedOn`**" bullet gains "A never-sent queued write's `basedOn` is rebased along the record queue: it takes the version the write ahead of it returns when that write's committed base equals its own, transitively (OD19 Q32); a re-send keeps its first send's"; E3 "…clears every mark on the record whose Attempt is resolved or released (rule 32)"; success row "this Attempt's mark, and the record's marks whose Attempts are resolved or released, cleared"; new row "\| `Released` (`cancel` in `Held`) \| none left (ended by the forced repair) \| none \| a waiting re-send's entry withdrawn \| kept until a later write's success \|"; ODP 3.8.1's "Merge 4, with the facts on their owner" as a closing paragraph | AM16, AM18; X27 |
| OE70 | 2.8.7 | code `actions: [create]` | `actions: [O.create.commit(({ memory, event }) => ({ draftId: event.draftId, projectId: memory.projectId, title: event.title }))]` (as 2.8.2) | ODP 5.3 |
| OE71 | 2.8.8 | "#### 2.8.8 Keys (E10)" (whole) | "#### 2.8.8 Keys (E10, superseded by OD15)": "A domain write states its `key`, a list of `input` fields, like every contract (rule 39): `setLike`, `renameIssue` and `removeIssue` write `key: ["id"]`, `createIssue` `key: ["draftId"]`. There is no default. `flow check` warns when a one-record write's key fields are not the input fields its predicted record's key reads (rule 34); writes predicting several records, none, or a `many` key are exempt. The `.each` spelling (strings, rule 9) is unchanged." | X4 |
| OE72 | 2.8.9 | code `O.Notes.save.commit(select, { optimistic: …, writes: …, outcomes: { … } })` | per Q1 (B): `notes: Notes.save.outcomes({ … }, { writes: ({ value, input }) => … })` in the definition; `O.notes.commit(select, { optimistic: ({ memory, input }) => … })` in the machine; text "`writes`… it runs at settlement… found by contract id after a rebind or reload" | X20 |
| OE73 | 2.8.10 | `const read = O.Issues.issueById.lookup(key, { outcomes: … })` (two lines); "`O.x.refetch(select)` (Operations O2, as `reload` in 2.8.2)"; "uses a call value (2.7.9)" | definition `issue: Issues.issueById.outcomes({ success: E.Loaded, failure: { NotFound: E.Gone, Defect: E.ReadFailed, Interrupted: E.ReadFailed } })`, machine `O.issue.lookup(({ event }) => ({ id: event.id }))`; "`O.issues.refetch` (Operations O2, as in 2.8.2)"; "uses a one-off read operation (2.7.9)" | OD2, OD9 |
| OE74 | 2.8.11 | "A lane, its Attempt and the keys that Attempt predicts persist in **one capture**" | "A domain write's lane record, its Attempt and the keys that Attempt predicts persist in **one capture**, the Attempt's one acknowledgement (rule 38); lane records are the Runtime's, never inside the actor's record (rule 46)" | OD20 |
| OE75 | 2.8.12 | "Then `pending` means one thing: this actor's call is in flight or its ending not yet handled (rule 21)." | "Then `pending` means one thing: this actor identity's write is `InFlight` (rule 21). `uncertain` names two things, kept apart by where they are read: `Issue.get(s, k).uncertain` is the store's mark; `O.like.get(s, k).uncertain` is the lane holding an unknown (OD16)." | OD10, OD16 |
| OE76 | 2.8.13 | "**Send.** A write is invoked when it heads every queue it joined."; "**Admission** is unchanged: map, test the owner, update the lane." | "**Send.** A write is invoked after its turn, once its lane has promoted it, its acknowledgement is written and it heads every queue it joined."; "**Admission**: map, test the owner, apply the cell (promotion included). For an unbound lane the Runtime applies the cell when the ending lands and parks it (rule 44)." | B74; OD19 |

**Section 3** (change set 2)

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| OE77 | 3.1 | requirement bullet "(`verify.idle`, rule 21)"; the definition and machine (`signin.definition.ts`, `signin.machine.ts`) | "(`O.verify.idle`, rule 21)"; ODP 5.2 After's definition and machine (its Before is MD 3.1 verbatim, checked: the fragments and the view are unchanged); the prose after the code re-spelled (`O.verify`, `O.resend`) | ODP 5.2 |
| OE78 | 3.2 | `const create = O.Accounts.create.commit(reviewedFields, { outcomes: … })`; REVIEW's `create.idle()`; WAITING `create.idle()`; UNSURE `CheckAgain: { target: S.SUBMITTING, guard: [create.idle()], actions: [create.retry()] }`; last paragraph "`create.retry()` from UNSURE re-sends the Attempt the lane holds" | the operation `create: Accounts.create.outcomes({ … })` in the definition; `O.create.commit(reviewedFields)`; root handlers for `Created`, `Busy`, `EmailTaken`, `TryAgain`, `Unsure` (S7c), SUBMITTING keeping its current-state ones; UNSURE `CheckAgain: [{ target: S.SUBMITTING, guard: [O.create.retryable({ times: 3 })], actions: [O.create.retry] }, { target: S.WIZARD.REVIEW, updateMemory: () => ({ error: "We couldn't confirm your account. Check your email before trying again" }), actions: [O.create.cancel] }]`; last paragraph "`O.create.retry` re-sends the held Attempt with its own input (rule 21); `idle` would deny it in `Held`" | X19 |
| OE79 | 3.4 | the `pin` commit value; `Pin` guard `pin.idle(({ event }) => ({ id: event.id }))`; `PinUnsure: { target: "self" }`; `hasNext: ({ memory, activities }) => … activities.issues?.data?.total`; `raise … ({ activities }) => … activities.issues?.data?.items` | Q1's After (B); `hasNext: ({ memory, operations }) => … operations.issues?.data?.total`; `({ operations }) => … operations.issues?.data?.items`; the comment above `pin` "a plain operation… keyed by id (`key: ["id"]`), concurrency "reject"" | X19, X20 |
| OE80 | 3.6 keywords | the four rows | rebuilt from ODP 12 with: OD23's words (`unknown` by tag, `idle` over a partial key, an omitted `output`, `runtime.unsettledWrites()`, `Story.ending` *merge 3*); "New, plans" loses `s.calls`, the mapper's `superseded`, `laneKey` and copy `key`, `read.fetch(key)`, `keys` on activities, `NothingToResend`/`Superseded` as `NotSent` reasons (now evidence); "New concepts" gains contract, operation, the hold, `Idle`/`InFlight`/`Held`/`HeldThisTurn`, binding actor, unbound lane, rebind, after lanes, actor identity, pending mapped outcome; "Removed" (new row) from ODP 12's "Removed"; merge 5's words stay | ODP 12; OD23 |

**Section 4, section 5**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| OE81 | Section 4 rows L2, L6/L8, D1, D2, D5, A1/A2 | L2 "carry the copy's key from their Attempt"; L6 "Lanes are readable as snapshot data… (`s.calls`, rules 21, N3)"; D1 "the Attempt stays in the lane"; D2 "`.retry` re-sends the lane's addressable Attempt…"; D5 "Lanes persist with the actor"; A1/A2 "One `outcomes` mapping per commit value" | L2: drop the copy-key clause; add "an adopted ending is current from the active leaf (rule 14)"; L6: "`s.operations`, `O.x.get`, rules 21, N3; replaced never-sent work is evidence (rule 17)"; D1: "the Attempt stays in the Runtime's lane"; D2: "…and only in `Held` (rule 21)"; D5: "Write lanes are Runtime records of the identity, restored by the table's restore row, and an ending with no live incarnation is parked (rules 44, 46)"; A1/A2: "One `outcomes` mapping per operation, on the definition" | ODP 5.6 |
| OE82 | Section 5 fragment rows | Machines O1 row (K9) "`operations` may hold operation or entity-domain handles, or group operation handles one level deep; … `s.calls.Issues.setLike`"; Machines O1 typing row "a commit value's select is typed at each transition that runs it"; Machines O4 "Guards also receive `schedules` and `calls`… a commit value's `idle` guard"; Machines O8 "…and `calls`, the lane rows of rule 21" | Machines O1 (K9) row: "*Superseded by C37.*"; typing row: "a commit's or lookup's select is typed at its transition"; O4: "…`schedules` and `operations` (rows of rules 21, 42; `O.x.get(operations, k)`), and may use an operation's `idle` and `retryable` guards"; O8: "…`operations`, replacing `calls` and `activities`; a Runtime step publishes the bound lane rows it changes (2.5)" | ODP 5.6; X9 |
| OE83 | C2, C5–C8, C10–C12, C17–C20 | C2's reason list; C5 "`O.x.lookup(select, { outcomes })` maps… `read.fetch(key)`… each `fetch` action has its own ending"; C6 "`O.x.commit(select, { outcomes })` returns an inert commit value… `superseded, laneKey, key?`"; C7 "The commit value is the handle… `cancel` cancels every outstanding Attempt"; C8 "One lane per actor, transaction and key…"; C10 "`latest` keeps one send in flight and one waiting… mappers receive `superseded`"; C11 "while running it interrupts… the lane stays pending until its turn"; C12 "A start or retry is owned by…"; C17 "Lanes persist with the actor; Persistence O6 acknowledges the Attempt before invocation…"; C18 (errors, warnings, type errors); C19; C20 | C2: delivered `NotSent` values per X6, unknowns add `StorageRefused`, evidence kinds listed; C5: "a one-off read operation (rule 42); see C32"; C6: "an operation maps endings on the definition (rule 13); mappers `(value, { input, attempt, progress, key })`; see C33"; C7: "the operation's handle `O.x`: `commit`, `retry(k?)`, `cancel(k?)` (one Attempt, rule 24), `idle(k?)`, `retryable(k?, { times })`, `get`"; C8: "*Replaced by C33 and C35* (lanes per identity, contract and key, rule 21)"; C10: "`reject` declines… `latest` keeps one Attempt and one queued commit; a replaced never-sent commit is evidence; an unknown holds the lane (rules 17, 21)" + merge 4's domain sentence kept; C11: "…the ending `unknown(Cancelled)` is retained (`Held`)"; C12: "A commit, lookup or retry of an operation… adopted endings current from the active leaf (rule 14)"; C17: "Write lanes are Runtime records of the identity (C44–C48); acknowledged once per Attempt, in one capture with the records it predicts; prediction values are never persisted (rule 38); restore per the table, delivery per rule 44"; C18 rebuilt from ODP 3.11's findings (errors `SharedContract`, `DuplicatePlacement`, `VerbMismatch`, `KeyRequired`, `UnresolvedHold`, a mapped event sent by a schedule, `raise` or view, a contract without `key`, a key field not in `input`, rule 20's adopted-ending handlers; warnings `KeyOmitsInput`, `UnusedOperation`, `UnresolvedHold` when only unreachable, rule 34's; info bare writes; `SharedCopyLane` deleted; type errors per X5; merge 4/5 errors and display kept, the display printing the contract's `key`); C19: "*Superseded by C40.*"; C20: deleted (X28) | ODP 5.6; X5, X6, X15, X28 |
| OE84 | P15, P19, P20 | P15 "Each send is acknowledged before it runs"; P19 "On `RestoreDiscarded`, acknowledged Attempts that are unsettled… An orphaned retry has no actor: its ending is evidence only"; P20 "reconcile its unknowns with `.retry`" | P15: "The Attempt is acknowledged once, before its first send; a persisted re-send waits for its lane record's capture (C48)"; P19: "A write lane whose operation is gone or whose key no longer decodes goes to its descriptor's `orphaned` handler… An actor record that no longer decodes does not orphan its lanes: the fresh incarnation adopts them (C47)."; P20: "`O.x.retry`" | X14, X15 |
| OE85 | C21–C30 | C22 "past the actor's `serialize` queue"; C23 "`pay.retry(key)`"; C24 "a superseded or cancelled queued write ends `NotSent` without repair"; C25 "a later successful write clears every mark on the record"; C28 (whole); C29 "A resource call value's `success:`"; C30 "held unknown lanes appear in actor evidence" | C22: "past the lane's queued commits (`W`, 64)"; C23: "`O.x.retry(k?)`, in `Held` only, also on a `serialize` head"; C24: "a replaced never-sent queued write is evidence `Superseded` and a cancelled one ends `NotSent { Cancelled }`, both without repair"; C25: "…clears every mark whose Attempt is resolved or released (rule 32)"; C28: "A domain write states its `key`; `flow check` warns when a one-record write's key fields are not those its predicted record key reads (rule 34). Replaces EDP O1's default and M5's `many` sentence"; C29: "A read operation's…"; C30: "…held lanes, bound or unbound, appear in Inspection by identity (C51)" | X4, X5, X6, X24 |
| OE86 | Section 5, new "### For operations in the definition" after "For entity domains" | — | rows C31–C53 (2.6) | ODP 3.3, 3.8.1, 5.6; OD23 |

**Sections 6–7, change log, decisions**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| OE87 | Section 6, "Not in v4's model" | — | add bullets: "**Operations in fragments** (OD17 Q19): fragments keep rule 3; their own exploration is `merged/fragment-operations/`."; "**An Rpc-based contract** (OD13): a `fromRpc` adapter, later, when a real app needs it."; "**Per-key fan-out of write members, throttled independent writes, per-item stops on a `serialize` queue** (B56, B72, Q35): bulk contracts and keyed designs; `revisit.md`." | ODP 3.8.1 limits, 3.9 |
| OE88 | Section 7 | item 0 "~~per-copy subscriptions (keyed activities)~~ (…keyed activities, 2.7.10 and C19…)"; items 6, 15; item 11 "**Persisted endings.** … needs the transaction's success Schema (`result`)"; item 16; item 17 | item 0: "…(`subscribe.each`, rule 41, C40)"; items 6 and 15 append "*Moot after the operations merge: `laneKey` and the copy key are gone (X28).*"; item 11: "~~Persisted endings~~ **Closed (operations merge):** contracts carry `output` (OD12); parked endings are stored raw and mapped at delivery (OD22)"; item 16: "…narrowed: only a lane whose operation is gone or whose key no longer decodes reaches `orphaned` (P19, X14)"; new item 18 "**Typing risks** (ODP 4, B13): the `operations` callback needs `E` first; key-less members need the handler's event origin; fallback `definition({ … }).operations(fn)`, `flow check`"; new item 19 "**Story reads for operations** (merge 3): `Story.ending` against Testing O3 (X21); M3 3.14 reads `snapshot.operations` / `O.x.get`; merge 3's Q40 (export commit values at module scope) is moot, the definition exports `O`" | ODP 5.6; X14, X21 |
| OE89 | "Changes after review", after the merge 5 bullet | — | "Operations in the definition merged on <date> ([merged/operations/proposal.md](merged/operations/proposal.md), revision 13; decisions OD1–OD25): operations declared once under `operations` with `outcomes`; verbs `commit`, `lookup`, `subscribe`; `s.operations` and `O.x.get`; contracts with `input`, `output` and a required field-list `key`; the write lane as a table owned by the Runtime (2.7.13); `UnresolvedHold` (2.7.14); lane persistence (2.7.15); rules 13–25, N1–N3 and 26–38 amended, rules 39–47 added; C rows amended and C31–C53 added; examples 2.7, 2.8.2, 3.1, 3.2, 3.4 rewritten. OD23 applied as decided (ODP had left it open). Small conflicts in [delegated-decisions.md](delegated-decisions.md)." | — |
| OE90 | Decisions intro | "Merge 2's decisions keep their numbers D1–D17, and merge 4's E1–E18, which…" | "…, merge 4's E1–E18 and the operations merge's OD1–OD25, which their rewrites, spikes, models and later proposals cite;" | 2.5 |
| OE91 | D1, D4–D7, D9, D11, D13, D17–D21 | — | annotations: D1 "*Superseded in part by OD3, OD17 Q16: the mapping is on the definition's operation.*"; D4 "*Superseded by OD3, OD17 Q15: the operation's handle `O.x` is the handle; starting stays static.*"; D5, D6 "*Spelled `O.pay.idle(k?)`; rows are `s.operations` (OD17 Q15).*"; D7 "*Superseded by OD15: `key` is required.*" (replaces K5's note); D9 "*Superseded by OD9 Q4: one write operation per contract (`SharedContract`).*"; D11 "*Superseded by OD9 Q2, OD19: a lane is removed when `Idle`; `get` reads the idle row.*"; D13 "*Extended by OD22: adopted endings, rule 20.*"; D17 "*Amended: `input` is always present; `key` replaces `laneKey` (X30).*"; D18 "*Superseded by OD17 Q15: `s.operations` and `O.x.get`.*"; D19 "*Superseded for write lanes (X8).*"; D20 "*Superseded in part by OD7, OD19: the `serialize` head is addressable; `cancel` acts on one Attempt; no starter.*"; D21 "*Moot (X28).*" | ODP 5.6 |
| OE92 | E2/E7, E3, E5, E10, E12, E14, E17, "Lane lifetime"; M5-D9 | — | annotations: E2/E7 "*Spelled `O.x.retry(k?)`; a retry outside `Held` is evidence (OD10).*"; E3 "*Amended by OD19: per Attempt (rule 32).*"; E5 "*`cancel` by the table (OD7); a superseded write is evidence (OD5).*"; E10 "*Superseded by OD15 (rule 34).*"; E12 "*Amended per Q1.*"; E14 "*Amended by OD20: the lane record's capture.*"; E17 "*Amended by OD19: also the `serialize` head.*"; "Lane lifetime" "*Superseded by OD19, OD20: lanes are Runtime records, kept while not `Idle`; Inspection lists them by identity.*"; M5-D9 "*Its 'never takes the default' clause is moot (OD15).*" | 2.4 of Part 2 |
| OE93 | Decisions, new "### Operations in the definition (operations merge, [merged/operations/decisions.md](merged/operations/decisions.md))" | — | intro: "Settled by the owner, OD1–OD18 and OD23; OD19–OD22 and OD25 are behaviour delegated by the owner to the main session; OD24 is the process under which this merge was approved. Numbers are kept." Then OD1–OD25 (with OD2a) verbatim in number order, OD24 last as process. Then "**Accepted with the proposal under OD24** (not decided one by one): `VerbMismatch` and one verb per operation (S12); invocation as its own step (R7 K18); the `UnresolvedHold` spec; `KeyOmitsInput`; `cancel` on a one-off read; ending events not raised or scheduled; the one-off row holding its entry; the delivery order; local identity (R9 M1); the stated limits of 2.7.13." Then "**Also rejected**", condensed from ODP 10.2 (A–U), the Runtime-wide lane (R8), resuming never-sent work across reload (TanStack's model, ODP 10.3), branded keys (ODP 3.4), an age bound on adopted holds (ODP limits) | OD; ODP 10.2, 10.3 |

That is **93 edits**: 7 in the header and 2.1–2.6, 31 in the rules (9 new), 6 in 2.5, 18 in 2.7 (4 new
subsections), 14 in 2.8, 4 in section 3, 6 in sections 4–5, 7 in sections 6–7, the log and the decisions.

## 2.4 What in 2.8 and rules 26–38 is superseded

| Merged text | By | What happens |
| --- | --- | --- |
| Rule 34, E10, C28, 2.8.8, the `flow check` warning's "default" wording, K5's D7 note, M5's rule-34 `many` sentence, M5-D9's clause | OD15 | rewritten (OE33, OE71, OE85); warning kept, re-worded |
| 2.8.2 contracts `key: (i) => …`, `result:`, `({ result })`, nested `input.key` | OD4, OD12, OD14, OD23 Q39 | replaced by ODP 5.3 (OE65) |
| 2.8.2 machine: commit values in the body, `operations: { Issues }`, `activities: { issues: … }`, `s.calls…find(…)`, `memory.likeUnsure`, `toastUnlessSuperseded`, `superseded` fields, `laneKey`, `retryCount < MAX_LIKE_RESENDS`, shared `Unsure` | OD1, OD2, OD3, OD5, OD8, OD17 Q15/Q16 | replaced (OE65) |
| Rule 29's delivered `NotSent { Superseded }`; 2.8.5's comment and E5 bullet; C24 | OD5, OD10 | evidence; store effect kept (OE29, OE68, OE85) |
| E2's `NotSent { NothingToResend }` for a retry on a succeeded lane | OD10 | evidence (OE69) |
| Rule 29 / E5 "`.cancel(key)` follows rule 24" | OD7 | the table's `cancel` row |
| Rule 31 / E17 / K7's mode list; M5's "with `allow` or `serialize`, `retry` is a type error" | OD19 Q35 | adds the `serialize` head (OE31) |
| Rule 32, E3, C25 "a later write's success clears every mark" | OD19 | per Attempt (OE32, OE69, OE85) |
| 2.8.6 / E7 `basedOn` | OD19 Q32 | kept for re-sends; never-sent writes rebase along the record queue (OE69) |
| Rule 38, E14, 2.8.11, A11's "lanes persist with the actor … one capture" | OD20 | the lane record's capture (OE37, OE74) |
| 2.8.1's `pending` "from the starting turn until the ending's turn is admitted"; 2.8.12 | OD10 | `pending` is `InFlight`; rows gain `uncertain`, `waiting` (OE64, OE75) |
| A36 "under `latest` the waiting start is invoked … when it heads its record queues" | B74, OD16 | promotion at admission; invocation after the turn (OE57) |
| Rule 37 / 2.8.10 call value `O.Issues.issueById.lookup(key, { outcomes })` | OD2, OD9 | an operation and `O.issue.lookup` (OE73) |
| Rule 36's "domain `writes` may only invalidate" | OD17 Q17; Q1 | restated on the operation (Q1) |
| Rule 26's "Call-site `optimistic` and `setData`" | Q1 | restated |
| Rule 27's "superseded"; "updates the lane" at admission only | OD5, OD19 | X9, X25 |
| C27's resource half (E16) | — | **kept** (X10) |
| "Lane lifetime" | OD19, OD20 | annotated |

Unchanged and safe: rules 28 (one sentence added), 30's store effects, 33, 35's bound, 2.8.3's split, 2.8.4's
settlement, 2.8.7's drafts, 2.8.13's one runtime, E1, E4/E13, E6, E8, E9, E11, E15, E16, E18, and all of merge 5
except its rule-34 sentence and M5-D9's clause.

## 2.5 Decisions: keep the OD numbers

**Proposed: keep OD1–OD25 (with OD2a) as they are**, as merge 4 kept E1–E18. They are cited outside ODP by merge 6
(OD1–OD5), rpc-contracts (OD4), operations-in-fragments, delegated-decisions.md (OD24), P45, LM's code and output
(OD20–OD25) and ten reviews; renumbering would break all of them. Merge 2's D-numbers already sit beside E- and
M5-numbers, so a third prefix follows precedent. OD24 is recorded as process, not as a design decision (OE93).

## 2.6 New C rows (C31–C53)

| # | Plan | Rule | Replaces or adds |
| --- | --- | --- | --- |
| C31 | Operations O1 | Contracts have `input` and `output` (a fields record or a Schema; omitted `output` is `Schema.Void`), the function inline, `progress` with its own schema, and a required `key`, a list of top-level `input` fields, `[]` for one; streams too; files `*.contracts.ts` (rule 39) | Replaces `key(params)`, `result`, `params` and the optional key |
| C32 | Operations O2 | A one-off read operation has one lane and delivers only its latest lookup; its row is O6's lane with `key`, held until the next lookup or `cancel`; not persisted; `VerbMismatch` (rules 41, 42) | Replaces "each finite lookup settles once" for lookups through one operation; replaces C5's call values |
| C33 | Operations O3 | The write lane table (2.7.13): the hold; promotion; invocation after the turn; `retryable({ times })`; a failed Attempt is resolved; one write operation per contract; write lanes are the Runtime's, disposal drops nothing, endings of unbound lanes are parked (rules 21, 40, 44) | Replaces C8 and OPS O3's disposal sentences |
| C34 | Operations O4 | A stream is declared under `operations` and placed with `subscribe`/`subscribe.each`; `key` required (rules 39, 41) | Adds (merge 6 rebases on it) |
| C35 | Operations O6 | Rows are `s.operations.<name>`; `O.x.get(s, k)` is total for write lanes; transactions have lanes (rules 21, 42) | Amends "Transactions have outcomes, never lanes" (with C8's old amendment) |
| C36 | Operations O7 | `cancel` acts on the addressable Attempt, by history before invocation; `cancel` on a one-off read releases its wait (rules 24, 42) | Replaces "this actor's queued and running commits for a key"; amends "resources have no cancel action" |
| C37 | Machines O1 | `operations: ({ E }) => ({ name: contract.outcomes({ … }) \| contract })`; the definition exports `O`; selects typed at their transition (rules 13, 40) | Replaces the K9 row |
| C38 | Machines O4 | Guards receive `operations`; `idle(k?)` (a partial key allowed) and `retryable(k?, { times })` (rule 21) | Replaces `calls` in O4's row |
| C39 | Machines O5 | Keyed schedules: key records; `keys` may read `operations` (after lanes); `restartOn` per key; `armOn` banned on keyed schedules (rule 23) | Amends C14 |
| C40 | Machines O6 | `activities` is a list of placements; `subscribe.each` for one session per key; `DuplicatePlacement` (rule 41) | Replaces C19 |
| C41 | Machines O8 | The snapshot exposes `operations` (replacing `calls` and `activities`); a Runtime step publishes the bound lane rows it changes (2.5) | Amends O8's row |
| C42 | Runtime O3, V4 | A write lane is (actor identity, contract id, key); a starting incarnation adopts only its own identity's unbound lanes; local identity is (machine id, input by `Equal.equals`), equal local identities adopt the oldest first | AM23, AM24 |
| C43 | Runtime O6 | Disposal invokes nothing new; queued commits end `NotSent { Disposed }`, delivered after reload for a persisted identity; `runtime.unsettledWrites()` lists non-`Idle` lanes by identity (OD23 Q40) | AM28 |
| C44–C48 | Persistence O2, O3, O4, O5, O6 | ODP 3.8.1's rows verbatim (AM29–AM33); O5 also carries P19's narrowing (X14), O6 P15's (X15) | AM29–AM33 |
| C49 | ServerRendering O3, O5 | ODP's row (AM34) | AM34 |
| C50 | LazyFeatures O3 | ODP's row (AM35) | AM35 |
| C51 | Inspection O1 | Unbound lanes by identity, with holds, queued commits and marks; lane states `Idle`/`InFlight`/`Held`; `ending` evidence names operation, contract, verb and key; evidence kinds `Superseded`, `Released`, `NothingToResend`, `InFlight` | AM36; amends C30 |
| C52 | React O2, O3 | Fresh memory and state, adopted write lanes by identity; the pre-attach buffer flushes after a new incarnation's deliveries; selectors read `operations` (React's `activities` reads) | AM21, AM25 |
| C53 | Testing O3, O7 | `Story.ending(O.x, …)` drives an ending (*Story reads: merge 3*, X21); Testing O7's `closeTab` stays abrupt; a clean shutdown is a policy-suite test (OD23 Q41) | AM20 |

## 2.7 Keywords

OE80 rebuilds 3.6. Net against MD today:

- **New:** `retryable({ times })`, `retryable(k, { times })`; `O.x.get(s, k?)`; `subscribe.each`; `.outcomes(...)` as a
  method; `operations: ({ E }) => …`; `input`/`output` on every contract; `key: [...]` (NEW MEANING); rows'
  `uncertain`, `waiting`; `idle` over a partial key; `unknown` by tag; `runtime.unsettledWrites()`; `Story.ending`
  (*merge 3*); findings `SharedContract`, `DuplicatePlacement`, `VerbMismatch`, `KeyRequired`, `UnresolvedHold`,
  `KeyOmitsInput`, `UnusedOperation`; denials `Uncertain`, `RetryLimit`; evidence `Superseded` (now evidence),
  `Released`; reasons `StorageRefused`, `Disposed`; `DehydrateCommitInFlight`; table labels `Idle`, `InFlight`, `Held`,
  `HeldThisTurn`, `W`, after lanes, binding actor, unbound lane, rebind.
- **Renamed:** `s.calls`, `s.activities` → `s.operations`; `read.fetch(key)` → `O.read.lookup(select)`;
  `*.operations.ts` → `*.contracts.ts`; `result` → `output`; mapper `{ params }` → `{ input }`; `laneKey` → `key`.
- **New meaning:** `pending` (`InFlight` only); `outstanding` (X16); `cancel` (one Attempt); `operations`; `O`;
  `activities` (a list); `key` (field list; the mapper's `key` is the contract's).
- **Dropped:** commit values and their `{ outcomes }` option; the mapper's `superseded` and copy `key`; `laneKey`;
  `keys` on activities; `SharedCopyLane`; the default lane key; `NotSent { Superseded | NothingToResend }` as
  endings.

## 2.8 Examples

| MD example | Becomes | Checked against |
| --- | --- | --- |
| 2.7.3–2.7.6 checkout excerpts | ODP 5.1 After | `UnresolvedHold` passes (ODP 5.7); rule 20 amended passes (ODP revision 12) |
| 2.7.7 booking | re-spelled; re-walked (X19) | to do at merge |
| 2.7.7 uploads | ODP 8.1 After | passes (ODP 5.7) |
| 2.7.8 like | ODP 5.3 excerpt | passes |
| 2.7.9 reads | ODP 5.1 READING, 9.5 search | — |
| 2.7.10 schedules, sessions | ODP 3.12, 3.3 autosave, `subscribe.each` watchlist | — |
| 2.8.2 list | ODP 5.3 with X11, X12 | passes (ODP 5.7) |
| 3.1 sign-in | ODP 5.2 After | passes (ODP 5.7) |
| 3.2 signup | fixed by X19 | to walk at merge |
| 3.4 pin | Q1's After with `PinUnsure` releasing | to walk at merge |

## 2.9 Mechanics

Following merges 1, 2, 4 and 5 (`git mv`, a status header, links fixed, README rows):

1. **M1.** `git mv operations-in-definition merged/operations` (folder, as `server-calls/`): `proposal.md`,
   `decisions.md`, `merge-plan.md` (this file), `lane-model/`, `reviews/`. Nothing inside links outside the folder
   (checked), so no inside link changes; this plan's `../` links become `../../`.
2. **M2.** Status header in `proposal.md`: "**merged into machine-design.md on <date>; kept as the record behind
   it.** It became 2.7 (rewritten), 2.7.13–2.7.16, rules 39–47, C31–C53 and decisions OD1–OD25. OD23 was applied at
   merge. Where this record and the design differ, the design wins (its 5.6, section 7 statuses and S-numbers are
   older than OD15–OD25)." The same one line in `decisions.md`.
3. **M3.** Lane model: runs from its folder (`tsc -p .`, `bun main.ts`; `python3 mutations.py`); check that the root
   `node_modules/.bin/tsc` it uses still resolves one level deeper. Its RESULTS.md N1 is answered by OE59 (the model
   keeps the flags false; update `model.ts`'s flag reading for `Held (parked)` on its next run, with X31's record
   queue).
4. **M4. Links to fix** (path only): `README.md`, `delegated-decisions.md` ("operations-in-definition/decisions.md
   OD24"), `merge-6-streams/proposal.md`, `merge-6-streams/reviews/review-1.md` and `review-1-response.md`,
   `merged/fragment-operations/exploration.md`, `rpc-contracts/exploration.md`, `machine-design.md` line 3165 (text).
   Leave `merge-plan-4-5.md` and `reviews/merge-4-5-check.md`: they cite the old path as history, as P45 did.
5. **M5. README.** Work order: row 1 becomes "operations-in-definition: merged <date>
   ([merged/operations/merge-plan.md](merged/operations/merge-plan.md))"; the next paragraph says "Merges 1, 2, 4, 5
   and operations are merged into it". "Merged proposals" gains "\| [merged/operations/proposal.md](merged/operations/proposal.md)
   \| operations, <date> \| server interaction declared once under `operations`; the Runtime's write lanes (design 2.7,
   2.7.13–2.7.16, rules 39–47, C31–C53, OD1–OD25) \|". "Spikes" gains "\| [merged/operations/lane-model/](merged/operations/lane-model/)
   \| operations: `tsc -p .`, `bun main.ts`, `python3 mutations.py` \|". Merge 6 and merge 3 "Depends on" add
   "operations".
6. **M6. delegated-decisions.md** gains one row per small and small† conflict resolved (X1–X19, X22–X33), with the
   commit, as rows 1–3 did.
7. **M7. `revisit.md`** (new, `machine-fragments/revisit.md`, X26): B14 bulk starts (AU F13); B56 throttled
   independent writes; B72 per-key fan-out of write members (four cases in ODP 3.8.1); Q35 per-item stops and "drop
   the queue" on `serialize`; offline as a reason to wait before invocation (ODP 10.3); resuming never-sent work
   across reload (ODP 10.3; would amend C2 and OPS O3); branded keys (ODP 3.4); an age bound on adopted holds;
   a `fromRpc` adapter (OD13); a catch-all for per-tag `unknown` if X22 is escalated.
8. **M8.** NEXT.md by the main session. `workflow check` only if a Workflow record is touched (none planned). No
   commit until approved; this plan is applied as two commits (change sets 1 and 2), each followed by a check.

## 2.10 Rebases owed by unmerged proposals (not edits to MD)

- **Merge 6 (streams), next in the work order:** `input`/`output` and a required `key` on streams (OD12, OD23 Q38;
  ODP 3.3: `messages` is `input: { roomId, after }, key: ["roomId"]`); streams declared under `operations` and
  placed with `subscribe` in an `activities` list; `subscribe.each` replaces keyed activities; mapper `{ params }` →
  `{ input }`; M6's `s.activities` reads → `s.operations` (ODP 5.6 counts 22 M6 edits).
- **Merge 3 (Stories):** `Story.ending` (X21); 3.14's lane reads become `snapshot.operations` / `O.x.get`, so its
  Q40 (export commit values) is moot; Story reads for rebind and restore (dispose the Story's actor and start another
  incarnation in the same Runtime, ODP 3.8.1); `checkpoint.snapshot.calls` → `operations`; the parked state's flags.
- **operations-in-fragments:** starts from rules 39–47.

## 2.11 Single graph, runtime, static analysis, Stories, CLI

- **One runtime, one graph:** kept. Lanes move from the actor to the Runtime, still one Runtime; `check()` applies the
  table to after lanes in memory and publishes nothing (2.5). The one risk is X33: the policy suite must drive the
  real Runtime, not LM. Runtime-step publications (X9) are snapshots like any other, so Machines O8 holds.
- **Static analysis:** improved. Keys are data (field lists); the verb is a token; `UnresolvedHold`, rule 20's
  arrival set, `KeyRequired`, `VerbMismatch` and `DuplicatePlacement` read tokens. Stated limits: closures are
  over-approximated (ODP 2.7.14 rule 3); a schedule's `keys` closure over `operations` can hide an owner (false
  negative); `KeyRequired` may fall back from types to `flow check` (section 7 item 18). Merge 5's Model keeps
  reading `.predicts` for joins and queues; the lane key now comes from the contract.
- **Stories:** nothing removes a Story read, but three wait for merge 3 (`Story.ending`, rebind/restore drives, the
  parked flags) and S15 forbids a Story from sending a mapped event. No MD Story sends one (checked: 2.7.11 sends
  `E.Pay()`, a user event; 3.1's Stories drive fragments).
- **CLI inspection:** extended: Inspection lists unbound lanes by identity (C51), `flow explain` prints each
  operation's verb, contract, policy and key (ODP 3.11), C18 gains the operations findings. No finding is lost:
  `SharedCopyLane` goes with the copy key it checked.

## 2.12 The merged design as a whole

Checked across edits, not edit by edit:

1. **Numbering:** rules 1–47, N1–N3; decisions D1–D21, E1–E18, M5-D1–D10, OD1–OD25; C1–C53 with P rows. No clash:
   ODP's own K1–K33, H/M/L, F/G/C findings stay in its record and are never cited by bare letter in MD (OE58 keeps
   ODP's parenthesised review citations, prefixed "ODP R*n*").
2. **Timing:** one statement of when a lane changes: in step 5 (members), at admission (endings), in a Runtime step
   (invocation, storage refusal, unbound endings, dispose), each a publication (X9). Rule 27, 2.5, 2.7.12, 2.7.13,
   2.8.1 and 2.8.4 all say this after OE27, OE44, OE57, OE58, OE64, OE67.
3. **One name per thing:** `key` (the contract's, everywhere); `pending` (`InFlight`); `uncertain` (lane vs record,
   told apart by where it is read, OE75); `outstanding` (X16); "unbound" vs `orphaned` (X13); `Superseded` names
   replaced work of two kinds (a never-sent commit, a released lookup), both "replaced, not delivered", one rule
   (rule 17).
4. **Ordering promises agree:** the lane hold (one lane), the record queue (one record, across actors, released at
   forced repair), and the cross-actor wait a queued commit behind a hold causes (X31, stated). Two lanes with no
   shared record stay unordered (2.7.13 limits).
5. **Every example passes the new checks** after X19 (2.8).
6. **Every delivered ending has a receiver:** live incarnation, saved record, or evidence by declaration (rules 8, 17,
   44); rule 20 checks the receiver's handlers over the arrival set.

## 3. What blocks merging

- **Q1 (X20)** blocks OE7, OE26, OE35, OE66, OE72, OE79 and C15/C38's wording. Change set 1 can go in without them
  if those edits are held; change set 2's 3.4 cannot.
- **Nothing else blocks.** X21 waits for merge 3. X31 and X22 are main-session decisions under OD19 (recommended
  resolutions above); the M5 recorder check (1.4) and the 3.2/3.4/booking walks (X19) are done during the merge.
