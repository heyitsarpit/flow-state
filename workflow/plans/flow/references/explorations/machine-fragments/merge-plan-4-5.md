# Merge plan: merges 4 and 5 into machine-design.md

Status: **proposed, not approved.** Nothing in this file is applied. Every edit, resolution and move below waits for
the owner's yes, edit by edit or as a whole. Written 2026-10-30 against `machine-design.md` as it stands after merges 1
and 2 and the multiplicity audit (commit `9772678a`).

Short names: **MD** `machine-design.md`; **M4** `merge-4-entities/proposal.md` (accepted, E1–E18); **M5**
`merge-5-entity-analysis/proposal.md` (accepted, M5-D1–D10); **M3** `merge-3-stories/proposal.md` (not accepted);
**OD** `operations-in-definition/decisions.md` (context only, not merged). Quotes marked "before" are copied from MD;
"…" in a before quote only shortens the quote, the edit replaces the whole sentence or row it names.

## 1. Order and scope

1. **Change set 1: merge 4**, alone. The README's "merges together with merge 3" is out of date: the work order puts
   Stories last, so merge 4 goes in without merge 3. The Stories-dependent parts are marked, not merged (section 4).
2. **Change set 2: merge 5**, after change set 1 is applied and checked. M5 says "`machine-design.md`: no change"
   (M5 6.4), but it amends M4's text (M5 6.4, "merge 4"), and after change set 1 that text lives in MD. So change set 2
   is small: M5's amendments to M4 text, one rule-35 sentence, decisions, keywords, a pointer for its plan
   amendments.
3. Each change set ends with `README.md` rows, the move to `merged/`, and a verification review (NEXT.md item 4).
4. Out of scope: operations-in-definition (not merged; section 5 lists what it will replace), merge 3, merge 6,
   every `.plan` file (the design's C rows record plan amendments; plans change only when the design is accepted).

## 2. Edits

### 2.1 Change set 1: merge 4 (49 edits)

**Header and decision table**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| A1 | Status paragraph | "Merge 3 ([merge-3-stories/proposal.md](merge-3-stories/proposal.md)) is next (see [the folder README](README.md))." | "Merge 4 ([merged/entities.md](merged/entities.md), entity domains) was merged on <date>. Stories (merge 3) is last; parts of 2.8 that need Story reads are marked *Story reads: merge 3* (section 7 item 17). The work order is in [the folder README](README.md)." | M4 status line; README work order |
| A2 | "Three decisions" table | row "**2. Server calls** \| section 2.7, rules 13–25 and N1–N3, C1–C20, P15, P19, P20 \| …" | insert after row 2: "\| **4. Entity domains** \| section 2.8, rules 26–38, C21–C30, decisions E1–E18 \| Operations O1–O3/O5/O6, EntityDomains O1/O2/O5, Persistence O6, Inspection, CommandLine O5 \|"; change the sentence "**Three decisions.**" to "**Four decisions.** … decision 4 builds on decision 2." | M4 4, 6.4 |

**2.1 Fragments and 2.6 conventions**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| A3 | 2.1 snapshot paths list | "the machine's call lanes: `s.calls.<operation path>` (rule 21)." | append: "; records of an entity domain the definition lists in `operations`: `Entity.get(s, key, shape)`, `{ data, predicted, uncertain, unconfirmed }` (2.8.1). The record is the store's, read through the snapshot's cut, never memory (rule 26)." | M4 2 (view), 3.11 |
| A4 | 2.6 key order, row "commit options" | "\| commit options \| `outcomes`, `optimistic` \|" | "\| commit options \| `outcomes`, `optimistic`, `writes` \|" | M4 3.8, rule 36 (proposed, K12) |

**2.4 rules**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| A5 | Rule 14, last sentence | "Nothing is decided at settlement." | "Routing is never decided at settlement. Settlement decides only the Attempt's ending (rule 18) and, for a domain write, its store effects (rule 27)." | M4 3.3, E4; K1 |
| A6 | Rule 16, decline list | "…ends `NotSent { why: "Rejected" }`. **Revision (multiplicity audit," | insert after "`NotSent { why: "Rejected" }`.": "A start past its actor queue or a record queue's bound is declined the same way, `NotSent { why: "Overloaded" }` (rule 35)." | M4 rule 35, 6.4 "Rule 16" |
| A7 | Rule 18 | "Each send is classified as in 2.7.1. The ending delivered is the Attempt's:" | "Each send is classified as in 2.7.1. The Attempt's ending is decided at settlement, from the Attempt's send history; admission only maps it (2.5 step 1, rule 27). The ending delivered is the Attempt's:" | M4 6.4 "Rule 18"; 3.3 |
| A8 | Rule 20, `NotSent` clause | "its concurrency is `reject`, `latest` or `serialize`, the machine cancels or retries that commit value, or the actor is persisted." | "its concurrency is `reject`, `latest` or `serialize`, the machine cancels or retries that commit value, the actor is persisted, or the operation is a domain write (a record queue can overflow under any concurrency, rule 35). A resource call value's tag record must map `Defect` and `Interrupted` (rule 37)." | M4 rules 35, 37; K2 |
| A9 | Rule 21, keys | "Per actor, transaction and key (Operations O3), across every commit value of that transaction, Flow keeps a lane:" | append after the sentence: "A domain write that predicts one record and declares no `key` has that record's key (rule 34). A lane holds no store state: predictions, record queues and `uncertain` are the store's (rule 26)." | M4 6.4 "Rule 21"; rule 34 |
| A10 | Rule 21, existence | "A lane whose addressable Attempt failed or ended unknown is kept, because `retry` needs it;" | "A lane whose addressable Attempt failed or ended unknown is kept, because `retry` needs it, and a lane held by an unknown is listed in the actor's evidence, so a lane nobody reconciles is visible (merge 4, "Lane lifetime");" | M4 9.6.4, section 10 "Lane lifetime" |
| A11 | Rule 21, persistence | "Lanes persist with the actor; Persistence O6 acknowledges each Attempt before invocation." | "Lanes persist with the actor; Persistence O6 acknowledges each Attempt before invocation, in one capture with the records that Attempt predicts (rule 38)." | M4 rule 38 |
| A12 | Rule 22, the after list | "activity `params` and `when`, optimistic and write callbacks) sees **after**" | "activity `params` and `when`) sees **after**" and append a bullet: "- **Callbacks** (rule 36). `optimistic` reads the starting turn's after memory, captured when the start is recorded; `writes` reads no memory." | M4 rule 36, E12; closes item 10 |
| A13 | Rule 24, end | "and each ends once." | "and each ends once. On a domain write, rule 30 gives each ending's store effects (rule 29)." | M4 rule 29 |
| A14 | Rule N3 | "Whatever the store keeps for an Attempt holds its record (merge 4)." | "Whatever the store keeps for an Attempt (a prediction, an uncertain mark) holds its record (rules 30, 32)." | M4 E18 |
| A15 | 2.4, after the N1–N3 block (before "### 2.5") | — | insert: "**Entity domains** (2.8). Rules 26–38 are merge 4's ([merged/entities.md](merged/entities.md)); each names its decision." Then rules 26–38 verbatim from M4 section 4, with these wording fixes: internal references re-pointed ("(3.4)" → "(2.8.5)", "(9.5.1)" → "(2.8.9)", "(9.5.2)" → "(2.8.10)", "9.4.3" → "2.8.8"); "Revision (multiplicity audit, 2026-10-31)" markers kept; rule 31's "(`reject`, `latest`, `cancel`; design rule N2)" → "(`reject`, `latest`; `concurrency: "cancel"` is an error on a predicting write, rule 29; rule N2)" (K7); rule 37's "a tag record must map them" → "a tag record must map them (rule 20)". | M4 4 |

**2.5 the turn**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| A16 | "What reads what" table, After row | "…`.each` membership; the `resetOn` re-check; optimistic and write callbacks \|" | "…`.each` membership; the `resetOn` re-check; `optimistic` (captured at start, rule 36) \|" | rule 36 |
| A17 | Step 1, "A call's ending is mapped here." | "Rule 18 decides the Attempt's ending, the lane is updated (rule 21)," | "The Attempt's ending was decided at settlement (rules 18, 27), and for a domain write its store effects are already published; here the lane is updated (rule 21)," | M4 6.4 "2.5 step 1" |
| A18 | Step 5, the after memory | "schedule functions, `keys`, `restartOn`, activity `params` and `when`, optimistic and write callbacks (rule 22)." | "schedule functions, `keys`, `restartOn`, activity `params` and `when`, and `optimistic`, captured for each start (rules 22, 36)." | rule 36 |
| A19 | Step 6, last bullet | "Publish once, then start actions. Each commit value listed starts a write, recording its owner (rule 14), or declines it as an ending (rule 16)." | "Decide each listed commit value's start: declined (`Rejected`, `Overloaded`, rule 16) or admitted, with its owner (rule 14). A domain write that is admitted joins every record queue it predicts and applies its prediction (rule 28). Publish once: memory, lanes and the store revision are one cut. Then invoke. `check()` runs none of this step's starts, so it never predicts." See K3 for whether plain writes follow the same order. | M4 rule 28, 5 "Start"; K3 |
| A20 | Paragraph after step 6 ("**Before for decisions, after for effects**") | — | insert after it: "**Settlement publishes without a turn.** For a domain write, settlement applies the Attempt's ending to the store and releases record queues in one publication (rule 27); every actor's snapshot reflects that store revision, while lanes change only when the ending's turn is admitted. Between the two, a record can read confirmed while the lane row still reads `pending`." | M4 2 "Store versus lane", 3.3; K13 |

**2.7 server calls**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| A21 | 2.7.1 Flow's reasons table, `NotSent` row | "`NothingToResend` (a retry with no addressable Attempt, rule 21) \|" | "`NothingToResend` (a retry with no addressable Attempt, rule 21), `Overloaded` (a start past its actor queue or a record queue's bound, rule 35) \|" | M4 6.1 |
| A22 | 2.7.1 cache table | header "\| Channel \| Optimistic look / domain predictions \| Refetch \|" | "\| Channel \| Optimistic look (plain operations) \| Refetch \|"; add below the table: "Domain predictions follow the Attempt's ending, after rule 18, not the send's channel (rule 30; table in 2.8.6)." | M4 6.4 "2.7.1 cache table", E8 |
| A23 | 2.7.1, bullet "Entity domains follow…" | "Entity domains follow the same rule: … (How domains meet the rest of this section is open, section 7 item 14.)" | "Entity domains: 2.8. A definite failure removes predictions without repair; unknown, `StillUnknown` included, keeps live predictions, forces the repair, holds the record queue until it settles and marks the record uncertain (rule 30)." | M4 6.4; closes item 14 |
| A24 | 2.7.1, reads bullet | "A defect in a read is an issue and a `Failure` lane." | "A read's defect or interruption also ends its call value on `failure` as Flow's `Defect` or `Interrupted`, which a tag record must map (rule 37); a defect is still an issue." | M4 rule 37; K4 |
| A25 | Rule 13 (2.4), resource sentence | "A resource's call value maps `success:` and `failure:` only." | "A resource's call value maps `success:` and `failure:` only; its `failure:` carries the read's tags plus Flow's `Defect` and `Interrupted` (rule 37)." | rule 37; K4 |
| A26 | 2.7.2 table | after row "\| `superseded` \| …" | insert rows from M4 section 2: "\| A prediction \| the domain's `.predicts`, with the real input \| the store, joined in the starting turn's publication (rule 28); views read `predicted` \|", "\| The record queue \| the store, per record, across actors \| Flow joins it at start or retry and releases it at settlement or after a forced repair (rules 29, 30) \|", "\| `uncertain` \| the store, per record and Attempt \| set at settlement of an unknown, cleared by rule 32; views read it on the record \|", "\| `unconfirmed` \| the store, from a success that omitted a predicted field \| views \|" | M4 6.4 "2.7.2 table" |
| A27 | 2.7.2 `key` row | "the transaction's optional `key(input)` (Operations O1; omitted means one lane, `{}`)" | "the transaction's optional `key(input)` (Operations O1; omitted means one lane, `{}`, except a domain write that predicts one record, whose lane key is that record's key, rule 34)" | rule 34; K5 |
| A28 | 2.7.3, "Keys are optional." | "A transaction without `key` has one lane per actor (Operations O1: omitted means `{}`)," | "A transaction without `key` has one lane per actor (Operations O1: omitted means `{}`; a one-record domain write takes its record's key instead, rule 34)," | rule 34 |
| A29 | 2.7.3 member table, `pay.retry` row | "Only under `reject`, `latest` and `cancel` (rule N2) \|" | "Only under `reject`, `latest` and `cancel` (rule N2). On a domain write it is the identical request, joins the record queue and applies no prediction (rule 31) \|" | M4 rule 31, E7 |
| A30 | 2.7.5 example | "`LikeUnsure: { target: "self", updateMemory: ({ memory, event }) => ({ unsure: { ...memory.unsure, [event.id]: true } }) }   // a row shown as uncertain`" | "`LikeUnsure: { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: [...memory.likeUnsure, event.id] }) }   // workflow: the keys to reconcile (2.8.2); the record itself reads uncertain`" | rule 26; K6 |
| A31 | 2.7.8 concurrency table, `latest` row | "the waiting one goes when the in-flight one settles;" | "the waiting one goes when the in-flight one settles (a domain write: when it heads every record queue it joined, rule 29);" | M4 6.4 "2.7.8", rule 29 |
| A32 | 2.7.8 like example (code block "// Likes: rapid toggles…" and `LikeRefused` line) | the memory-held like (`desired(memory, event.id)`, `LikeSynced`, `LikeRefused` with `revertToConfirmed`) | the domain like, excerpted from 2.8.2: `setLike: write(setLike).one(Issue).predicts(…)`, the `like` commit value, `Toggle`, `LikeUnsure`, `ReconcileLike`; comment: "the store predicts and rolls back; a failure only toasts, so it can never undo newer intent (rule 30)". Keep one sentence: "A plain operation (no domain) keeps memory-held predictions, as before." | M4 6.4 "2.7.8"; 3.1 |
| A33 | 2.7.9, end of paragraph | "so neither state waits with nothing coming (rule N1)." | append: "A resource call value's `success:` sees confirmed data only, never a prediction (rule 37)." | M4 6.4 "2.7.9" |
| A34 | 2.7.11, last sentence | "(Merge 3 designs the Story API for all of this.)" | "`NotSent { why: "Overloaded" }` and record-queue order are reached with a fixture that holds the head's answer plus enough sends (*Story reads: merge 3*). (Merge 3 designs the Story API for all of this.)" | M3 G14; section 4 |
| A35 | 2.7.12, "The starting turn, step 6, after publish" row | "\| The starting turn, step 6, after publish \| on a busy `reject` lane: …" | rename the moment "The starting turn, step 6" and add: "a declined start (`Rejected`, `Overloaded`) applies nothing; a domain write joins its record queues and predicts before publication (rule 28)" (see K3) | rule 28 |
| A36 | 2.7.12 Settlement row | "the send is classified (2.7.1) and its ending queued in the FIFO mailbox; the lane is not touched; `pending` stays true; under `latest` the waiting start is invoked now" | "the send is classified (2.7.1); rule 18 applied; for a domain write, store effects applied and record queues released, in one publication (rule 27); then the ending is queued in the FIFO mailbox; the lane is not touched; `pending` stays true; under `latest` the waiting start is invoked now (plain) or when it heads its record queues (domain)" | M4 6.4 "2.7.12" |
| A37 | 2.7.12 admission row | "rule 18 applied; the lane updated" | "the Attempt's ending mapped (rule 18 was applied at settlement); the lane updated" | rule 18 move |
| A38 | 2.7.12 Restore row | "saved endings are delivered after readiness (Persistence O4) and routed by rule 14 then" | append: "; a restored acknowledged Attempt's predicted records are marked uncertain and repaired before readiness; an unacknowledged one predicted nothing (rule 38)" | M4 3.10, 5 "Restore" |

**New section 2.8** (inserted after 2.7.12, before "## 3. Example")

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| A39 | new 2.8 "Server calls and entity domains" | — | intro: M4's "the domain owns shared data, the commit value owns workflow" paragraph plus "Rules 26–38 are normative; this section shows them." Subsections: **2.8.1** Where the data comes from (M4 2, table and "Store versus lane"); **2.8.2** The list against an `Issues` domain (M4 3.1, domain, definition, machine, view, case table; the "Count" paragraph dropped, it compares with a rewrite that stays in `merged/`); **2.8.3** Ownership (3.2); **2.8.4** Settlement and admission (3.3); **2.8.5** Concurrency and the record queue (3.4, with the `NotSent` table); **2.8.6** Unknown, retry and uncertain (3.5, with the rule table); **2.8.7** Creates (3.6); **2.8.8** Keys (3.7); **2.8.9** Callback reads (3.8); **2.8.10** Reads around writes (3.9); **2.8.11** Persistence (3.10); **2.8.12** Names (3.11); **2.8.13** How it is implemented (M4 5). | M4 2, 3, 5 |
| A40 | 2.8 text, decided wording | M4's proposal voice: 3.4 "The proposed E5 extends … section 9 (question 2.1) explains … recommends"; 3.7 "E10 proposes … Checking it against ED found a gap"; 3.8 "The proposed E12 also says … Section 9 (question 5.1) recommends keeping it"; 3.9 "E15 makes them 'optional to map'. Section 9 … recommends"; 3.11 "it recommends renaming that one too" | the decided form from M4 section 10: "`concurrency: "cancel"` on a predicting write is a `flow check` error; the `.cancel(key)` action is allowed under rule 24 (E5)"; "the lane key is the recorded key of `.predicts` (E10, as corrected)"; "domain `writes` may only invalidate (E12)"; "`flow check` requires `Defect` and `Interrupted` in a tag record (E15)"; "both are renamed `predicted` (E16)". MD:/OPS:/EDP: line citations kept only for plans; MD citations become section numbers. | M4 9, 10 |
| A41 | 2.8.2 code | M4 3.1 verbatim | keep verbatim, including `key: (i) => …`, `result:`, `superseded`, `laneKey`, `s.calls` (they are MD's current API); mark nothing as superseded in the code itself (section 5 lists what OD replaces). One erratum: the domain file's import of `eq`, `asc`, `desc` is not shown; add `import { asc, desc, eq } from "flow-state"` only after merge 5 names the module (B9). | M4 3.1 |

**3.4 example, 3.6 keywords, 4 problems**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| A42 | 3.4, comment above `pin` | "// Issues.setPinned: keyed by id, concurrency "reject"." | "// Issues.setPinned: a plain operation (this list registers no domain; with 2.8's domain, the pin would be `.predicts`, and `optimistic` a type error, rule 26), keyed by id, concurrency "reject"." | rule 26; K8 |
| A43 | 3.6 "New, plans" row | "…`concurrency: "latest"`; the codes `InFlight` and `LateMayNotLeave`;" | insert after `concurrency: "latest"`: "`NotSent { why: "Overloaded" }`; the record read `{ data, predicted, uncertain, unconfirmed }` (`predicted` replaces the record's and the resource lane's `pending`);" | M4 "New keywords" |
| A44 | 3.6 "New concepts" row | "…the **Attempt's ending** (rule 18) \|" | append: "; the **record queue** (per record, across actors, rule 29), the **uncertain mark** (per record and Attempt, rule 32), **settlement** versus **admission** (rule 27), a **create draft** (`creating`, a convention, rule 33) \|" | M4 "New keywords" |
| A45 | 4, row **D1** | "Prevented. Fragment memory, resumable slices, schedule deadlines and lanes are readable, so nothing is copied;" | append: "an entity record is never copied into memory (rule 26)." Not in M4's own list; proposed. | rule 26 |

**5 plan amendments**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| A46 | Existing C rows | C2: "(`Cancelled`, `Restored`, `Superseded`, `Rejected`, `NothingToResend`)"; C4: "Success confirms the optimistic look and domain predictions; failure removes them without a refetch;"; C10: "`concurrency: "latest"` keeps one send in flight and one waiting"; C15: "Optimistic and write callbacks read the after memory (rule 22; open, section 7 item 10)"; C17: "Persistence O6 acknowledges the Attempt before invocation."; C18: "Type errors: `retry` on a commit value whose transaction is `allow` or `serialize`…" | C2 adds `Overloaded`. C4 appends "Domain predictions follow the Attempt's ending after rule 18, not the channel: a definite failure after an unknown send is unknown in the store (rule 30)". C10 appends "; a domain write's waiting start joins the record queue and is sent when it heads it; queue overflow ends `NotSent { why: "Overloaded" }` for that write only, the transition and its other actions run (rules 29, 35)". C15 becomes "`optimistic` reads the starting turn's after memory, captured at start; `writes` receives `{ value, input }` and reads no memory; domain operations have no `optimistic`, and their `writes` may only invalidate (rule 36)". C17 appends "in one capture with the records the Attempt predicts; prediction values are never persisted (rule 38)". C18 adds errors "`concurrency: "cancel"` on a predicting write (rule 29); `Defect`/`Interrupted` unmapped in a read's tag record (rule 37)", the warning "a domain write's declared `key` is not its predicted record's key (rule 34)", and the display "the commit node lists its domain entry's recorded `.predicts` entity and fields and `.alsoChanges` targets (A-L2)". | M4 6.1, 6.4 |
| A47 | 5, new subsection "### For entity domains" after "For every machine: server calls" | — | rows C21–C30, one per rule, from M4 6.4's Operations, EntityDomains, Persistence and Inspection tables: **C21** Operations O3: store effects at settlement, before the ending is queued (rule 27; replaces OPS:101). **C22** Operations O3, EntityDomains O1/O5: overflow is `NotSent { why: "Overloaded" }` for that write, no partial join (rule 35; replaces OPS:96-97, EDP:179-182). **C23** Operations O3, EntityDomains O1, Persistence O6: one retry shape, `pay.retry(key)`, the identical request; `O.x.retry(select)`, the known-settled sentence and `InvalidAttempt` go; PER:133's "Explicit retry(attempt)" becomes "`pay.retry(key)`" (rule 31). **C24** EntityDomains O1: actor concurrency includes `latest`; a superseded or cancelled queued write ends `NotSent` without repair; replaces ED:650-651's "settles interrupted" (rule 29). **C25** EntityDomains O1: what clears `uncertain` (rule 32; replaces EDP:105-106). **C26** EntityDomains O1: no temporary ids; the draft pattern (rule 33; EDP:118-119). **C27** EntityDomains O1, Operations O5/O6: `{ data, predicted, uncertain, unconfirmed }`; the resource lane's `pending` is `predicted` (E16; EDP:130, OPS:153, OPS:166). **C28** EntityDomains O1: the default lane key (rule 34). **C29** Operations O2: a resource call value's `success:` sees confirmed data; `Defect`/`Interrupted` on `failure` (rule 37). **C30** EntityDomains O2, Inspection: `Entity.queue` states include removals with their `NotSent` reason; `queue` events gain `superseded`, `cancelled`, `overloaded`; `uncertain` "ended (a later write succeeded, or a retry of the Attempt succeeded)"; held unknown lanes in actor evidence (*Story reads: merge 3*, K11). Also C1-style note: Operations O1's `latest` is already C10. | M4 6.4 |

**6–7, change log, decisions**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| A48 | Section 7 | item 10 "**`writes` and `optimistic`** (Operations O3/O5): not redesigned; …"; item 14 "**Server calls and entity domains:** who owns a write about an entity, …" | item 10 → "~~**`writes` and `optimistic`**~~ **Closed (merge 4, rule 36).**"; item 14 → "~~**Server calls and entity domains**~~ **Closed (merge 4, 2.8, rules 26–38).**"; item 16 unchanged (M4 9.3.1); new item 17: "**Story reads for entity domains** (merge 3): `Entity.get` with `predicted`, `Entity.queue` removals, the frames between settlement and admission, reaching `Overloaded` with fixtures (section 4 of the merge plan; M3 G10–G14)." | M4 6.4 "Section 7"; section 4 |
| A49 | "Changes after review", after the multiplicity bullet; and "## Decisions" | intro: "Merge 2's decisions keep their numbers D1–D17, which its rewrites and spike cite;" | change log bullet: "Merge 4 merged on <date> (section 2.8, rules 26–38, C21–C30, amended rules 13, 14, 16, 18, 20–22, 24, N3, 2.5 steps 1 and 6, 2.7.1, 2.7.2, 2.7.8, 2.7.12, C2, C4, C10, C15, C17, C18; decisions E1–E18). Stories-dependent parts are marked *Story reads: merge 3*." Decisions intro: "…D1–D17, and merge 4's E1–E18, which their rewrites, spikes and later proposals cite;". New subsection "### Entity domains (merge 4, [merged/entities.md](merged/entities.md))" with M4 section 10's bullets verbatim (E1–E18 and "Lane lifetime"), then "**Also rejected**" with M4 section 8's bullets condensed, as merge 2's decisions do. | M4 8, 10; K10 |

### 2.2 Change set 2: merge 5 (11 edits)

| # | Target | Before (MD after change set 1) | After | Source |
| --- | --- | --- | --- | --- |
| B1 | Status paragraph | "Merge 4 ([merged/entities.md](merged/entities.md), entity domains) was merged on <date>." | append: "Merge 5 ([merged/entity-analysis/proposal.md](merged/entity-analysis/proposal.md), statically analysable domains) was merged on <date>; its rules A1–A12 belong to `references/design/entity-domain.md` section 9, and only its effects on 2.8 are here." | M5 status, 4 |
| B2 | 2.8.2 domain code, `setLike` | "`likes: (i) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1),`" | "`likes: (i, input) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1),`" | M5 3.9, 6.4 "merge 4" |
| B3 | 2.8.1 table, prediction row (from M4:75) | "the domain's `.predicts`, with the real input" | "the domain's predicted fields' functions `(beneath, input) => value`, with the real input; `.predicts` itself runs once, at construction, for structure" | M5 6.4 "merge 4", A7 |
| B4 | 2.7.2 prediction row (A26) | "the domain's `.predicts`, with the real input" | the same wording as B3 | M5 6.4 |
| B5 | 2.8.13 "Start" (from M4:632-633) | "a domain write runs `.predicts` with the real input" | "a domain write calls its predicted fields' functions with the real input, over records the store holds (A8)" | M5 6.4 |
| B6 | Rule 34 | "Other writes keep their declared key or `{}`." | append: "A write whose key the Model records as `many` (an array, from the input Schema) never takes the default; its lane key is declared or `{}`; with `allow` or `serialize`, `retry` is a type error (rule N2), so a bulk write that must be retried declares a per-call key and `reject`." | M5 6.4 "rule 34", M5-D9 |
| B7 | Rule 35 | "A start that would exceed its actor queue or any record queue ends `NotSent { why: "Overloaded" }`," | "A start that would exceed its actor queue or any record queue, or a `many` key array past 4,096 items, ends `NotSent { why: "Overloaded" }`," (and the same clause in A21's reasons row and C22) | M5 9.11, M5-D10; K15 |
| B8 | 2.8.6 rule table, success row | "confirmed fields replace them; omitted ones `unconfirmed` (EDP:92-100)" | "confirmed fields (whole values, per record) replace them; omitted ones `unconfirmed`, unless no carrier's shape holds the whole field, when the prediction ends (`PredictionNotRetained`); an uncomputed field counts as predicted (merge 5, A9)" | M5 3.4, A9; K16 |
| B9 | C18 display (A46) and 2.8.2 import | "the commit node lists its domain entry's recorded `.predicts` entity and fields and `.alsoChanges` targets (A-L2)" | "the commit node shows its domain entry's predicted entity, key and field names, `.alsoChanges` targets and the reads they reach; `flow explain` prints the lane key and cardinality (merge 5, 3.7)"; 2.8.2 gains `import { asc, desc, eq } from "flow-state"` (the `Condition` operators); Package O1 row appends "and `Condition` (the condition operators, merge 5)" (K17) | M5 6.4 "merge 4" (M4:658), 3.1, 3.7 |
| B10 | Section 5, after "For entity domains" | — | one paragraph, not rows: "Merge 5 amends EntityDomains O1/V1, CommandLine O1/O5/O6/Q1 and Inspection O1/O4/D1/D2; its amendments are listed by target in [merged/entity-analysis/proposal.md](merged/entity-analysis/proposal.md) section 6.4 (with `entity-domain.md` and `sync-engine-adapter.md`, which are designs, not plans)." See K14. | M5 6.4; D14 |
| B11 | 3.6 keywords, change log, decisions | — | 3.6 "New, plans" appends the M5 keyword list's words authors write: `or`, `not`, `gt`, `gte`, `lt`, `lte`, `isNull`, `(beneath, input) => value`, `checkReplays`, `PredictionNotRetained`; "New concepts" appends yes/no/maybe, carried path, record beneath, uncomputed, prediction fault, `many`. Change log bullet "Merge 5 merged on <date> (2.8 amended; rules 34, 35; decisions M5-D1–M5-D10)". Decisions: new "### Entity analysis (merge 5, …)" with M5 section 10's bullets M5-D1–M5-D10 verbatim. | M5 10, "New keywords" |

## 3. Conflicts

Kind: **small** (wording, a superseded decision to clean up, a numbering clash; the main session can resolve it) or
**owner** (changes behaviour or public API in a way neither proposal decided). Every resolution is **proposed**.

### 3.1 Merge 4 against the current design

| # | Conflict | Kind | Proposed resolution |
| --- | --- | --- | --- |
| K1 | Rule 14 says "Nothing is decided at settlement"; rule 27 decides rule 18 and store effects at settlement. | small | A5: settlement decides the ending and store effects, never the route. E4 already decided it. |
| K2 | Rule 20 requires `failure.NotSent` only for `reject`/`latest`/`serialize`, cancel, retry or persistence. Rule 35 makes `Overloaded` possible for any domain write (record queue overflow under `allow` too); M4 does not amend rule 20. | small | A8: add "or the operation is a domain write". It follows from rule 20's own test ("only when it can occur"). |
| K3 | Step 6 and 2.7.12 publish first and mint after ("after publish"); rule 28 needs a domain write's decline, queue join and prediction decided before the starting publication. M4 decides this for domain writes only. Applying it to domain writes alone gives two orders: a plain write's lane row may appear one publication after its transition, a domain write's in the same one. | **owner** | Recommend one order for every write: decide declines and mint before publication, publish once (memory, lanes, store), invoke after (A19, A35). It matches rule 21's "`pending` is true from the starting turn" and OD's B74 (invocation after the turn). Alternative: domain writes only, as M4 wrote it. |
| K4 | Reads: rule 13 says a resource call value maps `success:` and `failure:`; 2.7.1 and C5 say a read's defect is "an issue and a `Failure` lane"; 2.7.9 says "never `unknown` or `NotSent`". Rule 37 puts Flow's `Defect` and `Interrupted`, unknown-channel reasons for writes, on a read's `failure`. | small | E15 decided it. A24, A25: a read's `failure` carries the two Flow reasons; a defect is still also an issue; rule 13's reserved-tag rule is unchanged (an author tag may not be named `Defect`). |
| K5 | D7 and 2.7.2/2.7.3: "omitted means one lane, `{}`"; rule 34 defaults a one-record domain write to its record's key. | small | A27, A28; annotate D7 "*Superseded in part by E10 (rule 34) for one-record domain writes.*" |
| K6 | 2.7.5's example stores `unsure` per id in memory "a row shown as uncertain"; with `Issues.setLike` a domain write (2.8), that mirrors the store's `uncertain` and breaks rule 26. | small | A30: the example keeps the workflow fact (keys to reconcile), as M4's list does. |
| K7 | Rule 31 (E17) lists `cancel` among the modes where a domain write's retry exists; rule 29 makes `concurrency: "cancel"` on a predicting write a `flow check` error. | small | A15: rule 31 says `reject`, `latest`; a non-predicting domain write under `cancel` follows rule N2 as written. |
| K8 | 3.4's pin uses `optimistic: [O.Issues.list.setData(…)]` on `Issues`, the name 2.8 gives a domain; under rule 26 that is a type error. | small | A42: say 3.4's `Issues` is a plain operations group; keep it as rule 36's plain-operation example. |
| K9 | Machines O1 row (section 5) replaces "a flat record of operation or entity-domain handles" with "…or one-level groups of operation handles", dropping domains; 2.8.2 lists a domain in `operations` and reads `O.Issues.setLike`, `s.calls.Issues.setLike` (a domain entry's name is the path). | small | Amend the row: "…or entity-domain handles, or one-level groups of operation handles; a domain's entries are paths under it (`O.Issues.setLike`, `s.calls.Issues.setLike`)." Counted inside A47's section-5 pass. |
| K10 | Decision numbering: MD has D1–D21; M4 has E1–E18 cited by its rules, M3, M5 and OD. | small | Keep E1–E18 (merge 2's precedent: "keep their numbers … which its rewrites and spike cite"). A49. |
| K11 | C30 / EDP O2: M4 says `Entity.queue` states include removals with their `NotSent` reason; M3 (revision 3) reads queue removals from `ending` entries instead. | **owner, at merge 3** | Merge C30's Inspection half now; mark the `Entity.queue` half *Story reads: merge 3* and decide it when merge 3 is accepted. |
| K12 | 2.6's commit-options key order lists `outcomes`, `optimistic`; rule 36 names `writes` too, and T4's lint orders category keys. | small | A4: add `writes` last. |
| K13 | 2.5 publishes once per turn; rule 27 publishes the store at settlement, outside any turn, and M4's view example reads that store revision through the actor snapshot (`Issue.get(s, …)`). | small | E4 decided it; A20 states it. Machines O8's "an old snapshot never consults live lanes" still holds: lanes change only at admission. |

### 3.2 Merge 5 against merge 4 as merged

| # | Conflict | Kind | Proposed resolution |
| --- | --- | --- | --- |
| K14 | M5 says "`machine-design.md`: no change", while D14 keeps plan amendments as section 5 C rows. | small | B10: a pointer paragraph, not rows. M5's targets are mostly `entity-domain.md` and plans MD does not otherwise carry; copying about 30 rows would duplicate the merged record. |
| K15 | M5-D10 (9.11) ends a `many` array past 4,096 items `Overloaded`; rule 35 names only queue bounds. | small | B7; M5-D10 decided it. |
| K16 | Rule table success row: "omitted ones `unconfirmed`"; M5 A9 ends a prediction no carrier can confirm (`PredictionNotRetained`) and treats uncomputed fields as predicted. | small | B8; M5 decided it. |
| K17 | M5 3.1 exports a `Condition` module from `flow-state`; no amendment list (M4's, M5's, MD's Package O1 row) names it, and M4's domain code uses `eq`, `asc`, `desc` with no import. | small | B9; the module is decided in M5 3.1. |

### 3.3 Either merge against other parts of MD

| # | Conflict | Kind | Proposed resolution |
| --- | --- | --- | --- |
| K18 | 2.7.8's like example and the `latest` row describe memory-held predictions; M4 6.4 replaces them. | small | A31, A32. |
| K19 | Section 7 item 10 and C15 contradict each other today; rule 36 decides. | small | A12, A46, A48. |
| K20 | `refetch`: 2.8.2 lists `O.Issues.list.refetch(select)` as an action; MD only shows `read.fetch(key)` on a lookup call value. `refetch` is Operations O2's existing action (OPS:50), with no ending. | small | One sentence in 2.8.10: "`O.x.refetch(select)` (Operations O2) is a cache action with no ending; a state that must wait for a read uses a call value (2.7.9)." |
| K21 | Section 2.8 location: M4 gives no section numbers. Putting the list in section 3 would renumber 3.6 Keywords, which M3 cites. | small | A39: new 2.8, list as 2.8.2; section 3 unchanged. |

**Consistency checks.** One graph and one runtime: the store and actors share the Runtime (M4 5), the store's
evaluator is the only verdict (M5 5), and `check()` runs no start (A19), so it never predicts. Static analysis: M4's
store effects are recorded `.predicts` structure, and M5's lint and `flow explain` read only the Model; M5 amends
CommandLine O5's "without running application callbacks" (M5 6.4) because construction calls recorded positions once.
CLI inspection: C18 and C30 add findings and evidence. Stories: no edit removes a Story read; the new reads wait for
merge 3 (section 4).

## 4. Stories-dependent parts of merge 4

None of these blocks a rule; each is a way for a Story to see something the rules already decide. MD marks each with
the words *Story reads: merge 3* and lists them in section 7 item 17 (A48).

| Part | M4 source | What waits for merge 3 | Meanwhile in MD |
| --- | --- | --- | --- |
| `Entity.get` returning `predicted` in Stories | E16; M3 G10 (Testing T:88 keeps `pending`; M4 has no Testing row) | the Testing amendment | keyword and C27 merged; Testing row waits |
| `Entity.queue` with removals | EDP O2 amendment (M4 6.4); M3 3.12 | which read shows removals (K11) | C30's `Entity.queue` half marked |
| The moment between settlement and admission | rules 27, 28; M3 G11 (`frames: "publication"`) | how a Story reads that frame and asserts "never" | A20's paragraph merged; Story read marked |
| `Overloaded` and record-queue order from fixtures | rule 35; M3 G14 | the fixture controls that fill a queue | A34 |
| Held unknown lanes in evidence | M4 9.6.4 | `checkpoint.evidence` shape | A10 merged as Inspection evidence; Story read marked |
| Server truth versus the store | M3 G12 | `checkpoint.truth` against `Entity.get` | nothing; 2.7.11 already points to merge 3 |

Merge 5 has three of the same kind, kept in its merged record and in section 7 item 17: `checkReplays` on by default
in Stories and `propertyTest` (M5-D10, 9.9), a Story failing on `predictionFault` (A9), and `repair.matched` for
asserting why a list refetched (6.4 ED 7.4).

## 5. Superseded soon by operations-in-definition

Merged text with a short life. Nothing here changes the merge; it tells the owner which merged lines the next
proposal will rewrite (OD decisions; the proposal's 3.8.1 amendment list).

| Merged text | Replaced by | What changes |
| --- | --- | --- |
| Rule 34, E10, the rule-34 `flow check` warning, K5's D7 annotation; M5's rule-34 `many` sentence (B6) and M5-D9's "never takes the default" | OD15 (and OD4) | no default: every write states `key`, a field list (`key: ["id"]`, `[]` for one lane); the `many` sentence loses its object |
| 2.8.2 contracts: `key: (i) => …`, `result:`, `.list(Issue, ({ result }) => …)` | OD4, OD12, OD14, OD23 (Q39) | `key` is a field list; `input`/`output` on every kind; the projector says `({ output })` |
| 2.8.2 machine shape: commit values built in the machine body, `operations: { Issues }`, `activities: { issues: O.….subscribe(…) }`, `s.calls.Issues.setLike.find(…)` in guards and views | OD3, OD17 (Q15, Q16), OD23 (Q33), proposal B7 | operations declared by name in the definition, mapped with `.outcomes`; rows read with `O.x.get(s, key)` under `s.operations` |
| Mapper `superseded` and `laneKey`; `toastUnlessSuperseded`, `LikeUnsure`'s superseded alternative; rule 27's "routes current, late or superseded" | OD5 | replaced never-sent work is not delivered; a sent Attempt's ending always is |
| Rule 29 / E5: a superseded waiting start "ends `NotSent { why: "Superseded" }`" as a delivered ending; the `NotSent` comment "Superseded or Overloaded" | OD5, OD10, OD16 | `Superseded` is evidence |
| E2: a retry on a succeeded lane "ends `NotSent { why: "NothingToResend" }`" | OD10, OD16 (MD rule 16, line 818 amendments) | evidence, not an ending |
| Rule 29's "`.cancel(key)` follows rule 24" | OD7 | `cancel` acts on one Attempt (the oldest unresolved sent one) |
| Rule 31 / E17: retry only under `reject`, `latest`, `cancel`; M5's "with `allow` or `serialize`, `retry` is a type error" (B6) | OD19 (Q35) | also on a `serialize` head |
| `retryCount < MAX_LIKE_RESENDS` and `< 3` budget guards in 2.8.2 | OD1 | `retryable({ times })` |
| Rule 32: "a later write's success clears every mark" | OD19 | only marks whose Attempt is resolved or released, per Attempt, in the record queue |
| 2.8.6 / E7 `basedOn` | OD19 (Q32) | a re-send keeps its `basedOn`; never-sent queued writes rebase along the record queue |
| Rule 38, A11 ("lanes persist with the actor … one capture") | OD19, OD20, OD21, OD22 | write lanes are Runtime records of the actor identity, captured per lane; parked endings stored raw |
| 2.8.1's `pending` "from the starting turn until the ending's turn is admitted"; 2.8.12's "`pending` means one thing" | OD10 (B58) | `pending` is `InFlight` only; rows gain `uncertain` and `waiting` (OD5, OD6) |
| E16's rename of the resource lane's `pending` to `predicted` (C27) | proposal 3.4 (OD9, Q21) | the proposal keeps Operations O6's `pending` on a one-off read row; the two disagree, so C27's resource half is likely reverted |
| A36: "under `latest` the waiting start is invoked … when it heads its record queues" | proposal B74, MD 2.7.12 amendment | the ending promotes at admission; invocation follows the turn |
| Rule 37 / 2.8.10 call value `O.Issues.issueById.lookup(key, { outcomes })` | OD2, OD9 (Q6, Q23) | a one-off read delivers only its latest lookup; mapping moves to the definition |
| Rule 36's "domain `writes` may only invalidate" | OD17 (Q17) | cache verbs `invalidate`, `clear`, `setData` live on the contract, in actions; likely restated, not reversed |
| Rule 20 as amended by A8 | OD22 | also every mapped event over the new-incarnation arrival set |

Unchanged by OD and safe: rules 26, 27 (store at settlement), 28, 30, 33, 35, the `NotSent` store table (OD adds
`StorageRefused` and `Disposed` rows), and all of merge 5 except B6.

## 6. Mechanics

Following merges 1 and 2 (commit `c3fb9be0`: moves with `git mv`, a status header on each moved file, links fixed in
the moved files and their neighbours, README rows):

1. **After change set 1:** `git mv merge-4-entities/proposal.md merged/entities.md` (one file, as `outcomes.md`).
   Status header: "**merged into machine-design.md on <date>; kept as the record behind it.** It was merge 4 (section
   2.8, rules 26–38, section 5's C21–C30, decisions E1–E18). Where this record and the design differ, the design
   wins." Fix its links: `../audit-multiplicity.md` → `../audit-multiplicity.md` (unchanged depth: `merged/` is one
   level, like the old folder), MD-relative citations stay as line numbers of the old MD.
2. **After change set 2:** `git mv merge-5-entity-analysis merged/entity-analysis` (folder, as `server-calls/`), with
   `brief.md`, `prior-art.md`, `reviews/`, `spike/`. Status header in `proposal.md` as above (2.8 amendments, rules 34
   and 35, M5-D1–D10). The folder is one level deeper than before, so its `../` links become `../../` (and
   `../merge-4-entities/proposal.md` becomes `../entities.md`); its `M4` short name points to `merged/entities.md`. The spike runs from its folder (`tsc -p .`,
   `bun main.ts`); check that the root `node_modules/.bin/tsc` path it names still resolves one level deeper.
3. **Links to fix elsewhere** (path only): `README.md`, `NEXT.md`, `audit-multiplicity.md`,
   `merge-3-stories/proposal.md`, `merge-3-stories/reviews/review-2.md`, `merge-6-streams/proposal.md`,
   `merge-6-streams/gaps.md`, `merged/fragment-operations/exploration.md`, and the M5 spike's
   `domains/issues.ts`, `legacy.ts`, `ops.ts` comments. `operations-in-definition/proposal.md` names
   `merge-N-*/proposal.md` generically; leave it.
4. **README rows.** "The design and what merges into it": remove the merge 4 and merge 5 rows; the merge 4 row's
   "merges together with merge 3" goes with it. Merge 3's "Depends on" keeps "merge 4" pointing to
   `merged/entities.md`. "Merged proposals" table gains: "\| [merged/entities.md](merged/entities.md) \| merge 4, <date> \|
   entity domains in the machine (design 2.8, rules 26–38, C21–C30, decisions E1–E18) \|" and "\|
   [merged/entity-analysis/proposal.md](merged/entity-analysis/proposal.md) \| merge 5, <date> \| statically analysable
   domains (design 2.8 amendments, rules 34–35, M5-D1–D10; rules A1–A12 for entity-domain.md) \|". "Work order" row 2
   becomes "merges 4 and 5: merged <date>". "Spikes" gains "\| [merged/entity-analysis/spike/](merged/entity-analysis/spike/)
   \| merge 5: `tsc -p .`, then `bun main.ts` \|". `audit-multiplicity.md`'s sentence "merge 5's are listed in its
   section 4" stays true.
5. **NEXT.md** items 4 and 5 are updated by the main session when it next writes NEXT.md.
6. Run `workflow check` only if a Workflow record is touched (none is planned). No commit until the owner says.
