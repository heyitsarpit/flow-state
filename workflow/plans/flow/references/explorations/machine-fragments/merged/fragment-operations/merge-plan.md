# Merge plan: operations-in-fragments into machine-design.md

Status: **applied 2026-10-31** (change sets 1 and 2; approved under the delegation, delegated-decisions.md rows 12–16). Written as proposed: Under F10 (the operations process, OD24) and the owner's wider delegation of
2026-10-31 ([delegated-decisions.md](../../delegated-decisions.md)), the main session approves this change list and resolves
the small conflicts, logging each in delegated-decisions.md marked "delegated". This plan found **no owner conflict**
(1.4). Written 2026-10-31 against `machine-design.md` at HEAD `a92181ef` (last changed in `0cfadee4`: merges 1, 2, 4,
5 and operations-in-definition, the operations check's fixes) and `proposal.md` revision 3 with review 3's fixes
(`1c3a1c68`). Method as in [merged/operations/merge-plan.md](../operations/merge-plan.md),
[reviews/operations-merge-check.md](../../../../../../archive/flow-design-2026-11/machine-fragments/reviews/operations-merge-check.md) and [merge-plan-4-5.md](../../../../../../archive/flow-design-2026-11/machine-fragments/merge-plan-4-5.md).

Short names: **MD** [machine-design.md](../../machine-design.md); **FP** [proposal.md](proposal.md) (revision 3, accepted
for merging, F10); **F** [decisions.md](decisions.md) (F1–F10); **EX** [exploration.md](exploration.md) (prior art);
**RV3** [reviews/review-3.md](reviews/review-3.md); **M6** [merge-6-streams/proposal-v2.md](../../merged/streams/proposal-v2.md)
(accepted, not merged); **OPP** the operations merge plan. FP's "MD rule *n*" stays MD rule *n* (rules 1–47 keep their
numbers). FP's FO0–FO12 become **MD rules 48–60** (2.2). "Before" quotes are copied from MD; "…" only shortens a
quote, and the edit replaces the whole sentence, row or block it names.

Marks: **small** (wording, numbering, a superseded clause), **small†** (a behaviour consequence the text leaves
unstated; the main session decides it under the delegation and logs it as a decision, not a wording fix), **owner**
(behaviour or public API that no decision covers). Every resolution is **proposed**. Places where fragments touch
streams keep MD's current stream text and are marked ***Stream details: merge 6***.

---

# Part 1: compatibility

## 1.1 What was checked

| Source in FP | Rows | Where it lands now |
| --- | --- | --- |
| Section 7, "What breaks or changes in the merged design" (items 1–41, with RV3 M3's six additions as 36–41) | 41 | AM1–AM41 (1.2) |
| 2.2 rules FO0–FO12 | 13 | MD rules 48–60 (2.2) |
| 2.3 lifecycle table, 2.4 lane delta and releasing rows, 2.5 persistence, 2.6 tooling, 2.9 concepts | 5 blocks | new MD 2.9 (FE72) |
| Section 4 examples, 2.10 walk | 5 | 2.8 below: 4.1 and 4.4 and 2.10 ported; 4.2 and 4.3 stay in the record |
| Section 9 "For `revisit.md`" (6), RV3 "For `revisit.md`" (1) | 7 | `open-items.md` 20–26 (M6) |
| F1–F10 | 10 | MD decisions, new subsection (FE81) |
| MD as it stands, swept for every sentence that says fragments do no I/O, "binding actor", "before any external event", rule 3, `internalEvents`, one-off read persistence, OD20's bare `F`*n* | — | FX3, FX9, FX2 |

## 1.2 The amendment list, row by row

"Clean" = the target text is as FP quoted it. "Changed" = the operations merge or its check edited the target after FP
was drafted; the amendment still applies. "Missing" = MD places FP's list does not name, found by the sweep (FX3).

| # | FP target | Target now | State | Conflict |
| --- | --- | --- | --- | --- |
| AM1 | Section 1, fourth bullet | same; **also** the paragraph "Because fragments do no I/O…" and the closing "v4 reuses pieces…, not I/O **policy**" | clean; missing ×2 | FX3, FX4 |
| AM2 | 2.1 Reading | the multiplicity bullet ("a keyed schedule…; the operations' lanes…"); **also** its entity-domain clause and the namespace sentence | clean; missing ×2 | FX3, FX12 |
| AM3 | 2.2.1 `Flow.entry` | row "also start when the schedule's owner begins (its state is entered, its trait created or reset)" | clean; **convergent**: 2.5 step 6 already arms entry schedules only for "entered, reset or created" incarnations, so F8 states what MD implies | — |
| AM4 | 2.2.2 last sentence | "Fragments may not declare `operations`, `activities`, `context`, `onContext`, `send` or persistence." | clean | FX13 |
| AM5 | 2.3 "Running I/O and mapping endings" | same; **also** "What survives an abnormal ending" | clean; missing | FX3 |
| AM6 | 2.6 key order | the "machine or fragment body" row lacks `activities` entirely (a gap since the operations merge, which placed `activities` in state nodes) | clean; the edit closes the older gap too | — |
| AM7 | Rule 1, `.resumable()` and `resetOn` | same; `resetOn`'s "Pending resets are not persisted: on restore, `resetOn` baselines are re-taken silently (section 6)" | clean | FX6 |
| AM8 | Rule 2 | now "On a definition, `internalEvents` come from its schedules or its operations' endings…" (operations merge) | changed; **convergent**: the edit becomes "On a definition or a fragment" | — |
| AM9 | Rule 3 | "**No I/O.** Fragments run no operations, read no context and send to no actor." | clean | — |
| AM10 | Rule 4 | same | clean | — |
| AM11 | Rule 6, `whenAbandoned` | same; it is "fused into the leaving turn (2.5, step 3)", while FP's marks apply in step 5 | clean | FX27 |
| AM12 | Rule 8 | first bullet now ends "except what rule 17 makes evidence by declaration" | changed; applies | — |
| AM13 | Rule 9 | the revision paragraph (operations merge) "A commit started in a copy's filling is an ordinary commit of the host's operation…" | changed; applies | FX11 |
| AM14 | Rule 10 | same | clean | FX22 |
| AM15 | Rule 11 | same; `fixtures` already exists on `story.machine` (2.7.11), `.enter`/`.leave` exist for subroutines | clean | — |
| AM16 | Rule 12 | same | clean | — |
| AM17 | Rule 14 | now with the "One owner test" sentence (OD21, OD22) | changed; applies inside the binding incarnation | FX10 |
| AM18 | Rule 17 | "…to a live incarnation of its identity or to its saved record (rule 44)" | clean | FX5 |
| AM19 | Rule 20 | `NotSent` list and "Adopted endings" (OD22) | clean | FX7 |
| AM20 | Rule 21 | "the actor that commits is its **binding actor**" | clean | FX9, FX11 |
| AM21 | Rule 24 | ends "It never drops a queued commit silently." | clean | FX5 |
| AM22 | Rule 40 | "One write operation per write contract (`SharedContract` otherwise)"; **also** "A definition declares every server interaction once"; C33, C37 | clean; missing ×3 | FX3 |
| AM23 | Rules 37, 42; Persistence O2 | same; **also** 2.7.15's one-off read bullet and 2.7.13's lifetime table | clean; missing ×2 | FX3 |
| AM24 | Rule 44 | title "handle it at the root"; "before any external event" | clean | FX9, FX10 |
| AM25 | Rule 45 | same | clean | — |
| AM26 | Rule 46 | same; **also** P19 and C47 | clean; missing | FX19 |
| AM27 | 2.5 steps 1, 3, 5, 6 | same; **also** `check()` (runs steps 2–6) and the lane-reads paragraph | clean; missing | FX16, FX6, FX8 |
| AM28 | 2.7.13 "Owner" paragraph | same; **also** six more "binding actor" places in 2.7.13, the "Delivered" definition, the delivery-order sentence, principles 3 and 4 | clean; missing | FX5, FX9 |
| AM29 | 2.7.14 items 2, 5 | same; **also** item 4 | clean | — |
| AM30 | 2.7.16 | same; **also** its Typing list | clean | FX21 |
| AM31 | 3.6 | same | clean | — |
| AM32 | Section 5 rows | no numbers given; FP names "Persistence O2/O6" | moved: C54–C68 (2.6) | FX19, FX20 |
| AM33 | Section 6 | "Fragment I/O", "Nested request relays", "Operations in fragments (OD17 Q19): fragments keep rule 3…" | clean | FX24 |
| AM34 | Merge 3 | not MD | rebase (2.10) | FX18 |
| AM35 | Merge 6 | not MD | rebase (2.10) | FX1, FX17 |
| AM36 | Rule 16 | same | clean | — |
| AM37 | Rule 41 | "`O.x.subscribe(…)` … in `activities`, a list of placements" | clean | FX13 |
| AM38 | Rule 43 | same | clean | — |
| AM39 | Rule 23, N1 | same | clean | — |
| AM40 | 2.1 lifecycle table, "On ending, except by an exit or a freeze" | same | clean | — |
| AM41 | `flow check`, `key: []` on a non-empty path | 2.7.16 lists `SharedContract` as an error | clean | FX21 |

Missing from FP's list and not tied to one row (FX3): rule 13 ("the definition's events"); rule 27 and 2.8.4
("binding actor", three places); 2.7.3's "a host's filling of a fragment callback"; 2.7.12's "Restore and rebind" row;
2.8.3 and 2.1's "records of an entity domain the definition lists"; section 4's rows L2, E2, H3, D3, D5, A1/A2, A5, A7;
section 7 items 1 and 2; decision OD17 Q19; Machines O4 and C38 (`updateMemory`); P7; DehydrateCommitInFlight (FX26).

## 1.3 Conflicts

| # | Conflict | Kind | Proposed resolution |
| --- | --- | --- | --- |
| FX1 | **Rule numbers collide with merge 6.** M6 6.1 adds "New rules 48–53 (after rule 47)" and cites "rule 51" about ten times and "rules 48–52" in its plan rows. This merge takes 48–60 | small (numbering; ordering is the main session's under the wider delegation) | If this merge lands first (as the brief says), it takes 48–60 and merge 6 rebases to 61–66, rewriting its 6.1 and 6.2 citations; if merge 6 lands first, this plan's 2.2 table shifts by +6 (54–66) and nothing else changes. Decide the order before applying (section 3). README's work order (streams 3, fragments 4, both *proposed*) is updated either way (M4) |
| FX2 | **Bare `F`*n* already means OD20's sub-items in MD:** 2.7.14 item 4 "(F3, OD21)" and "(F3, F5)"; eight places write "(OD20, F*n*" with a comma (2.7.13 ×6, 2.7.15, C48). F1–F10 keep their numbers | small | Requalify the two bare ones as "OD20 F3", "OD20 F5"; normalise the comma forms to "OD20 F*n*" (FE79). After the merge a bare F*n* in MD means a fragments decision; FO numbers are never cited in MD (rules 48–60 are) |
| FX3 | **The amendment list misses MD places** (1.2's "missing" rows and the list after it) | small | edits added: FE3–FE5, FE7–FE9, FE11, FE13, FE16, FE28, FE29, FE40–FE42, FE44, FE59–FE63, FE65, FE66, FE70, FE73, FE75, FE78, FE81 |
| FX4 | **MD states the opposite of F1** in three places: section 1 ("v4 reuses **pieces**…, not I/O **policy**. Policy is written once per machine"), section 4 A5 ("Prevented (rule 3)") and D3/A7 ("Not applicable: fragments do no I/O"; "the host starts every operation"). principles.md's starting point "version 2: Fragments do no I/O" is the source | small (superseded by F1) | rewrite each (FE5, FE76). principles.md says its starting points "can be revisited if a proposal shows a better answer"; it is not MD, so M5 offers a one-line pointer there and does not rewrite it |
| FX5 | **Release on leave drops queued commits as evidence** (rule 60's mark row: "every `W` entry ends `NotSent { Cancelled }`, evidence"), against rule 24 "It never drops a queued commit silently", 2.7.13 principle 4 (OD7) and principle 3 "no quiet release" (OD6) | small (superseded in part by F9, a later decision) | rule 24 and principle 4 gain "except a release on leave the fragment declares (rule 60)"; principle 3 gains "a declared release on leave is not quiet (F9)"; rule 17's evidence list carries "an ending of a releasing lane". OD6/OD7 annotated "narrowed by F9" |
| FX6 | **A restore that re-takes a different reset value now resets the trait** (rule 51, RV3 M2), against rule 1's "on restore, `resetOn` baselines are re-taken silently". When the reset runs, relative to rule 44's deliveries, is unstated; and 2.2.2 says creation happens "never on restore" | small† | the reset is a **pending reset**: the first follow-up turn after restore, before rule 44's deliveries (rule 1's "a pending reset … runs first"; rule 54's "after any pending reset"). So the old path's lanes become unplaced (parked, or released if the fragment declares release), and the new incarnation adopts only its own path's lanes. Being a turn, it is visible to Stories and is not "creation on restore". Rule 1's sentence reads "…re-taken silently, except on a placement that owns a mapped write (rule 51)" |
| FX7 | **Rule 20's `NotSent` requirement depends on the placement** (a non-empty subject path, rule 51), but rule 20 is "read per operation", and a fragment cannot know where it is placed | small† | checked **at the host's placement** from the fragment's summary (rule 57 records the mapped tags); the error names the placement and the fragment operation. Documented default: a reusable writing fragment maps `NotSent`. 2.7.16's "Rule 20's `NotSent` requirement is read per operation" gains "and per placement for a fragment's operation" |
| FX8 | **A host's `updateMemory` reads lanes** (rule 50: "`get`, `idle`, `retryable` in a host's guards and `updateMemory`"; FP 4.4's `Listed`), but MD gives `operations` to guards, selects and mappers only (rule 22's lane-reads bullet, Machines O4, C38) | small† (accepted with FP under F10; the main session confirms the general form) | `updateMemory` receives `operations`, the pre-turn lanes with the turn's ending admitted, as guards see them; there it may call `get` only; `idle` and `retryable` stay guard values. One rule for every `updateMemory` (a host's own operations too), not a fragments-only case. Edits FE36, FE53, C55 |
| FX9 | **"Incarnation" and "binding actor" now name two levels.** MD uses "incarnation" for actor lives (rules 14, 44, 2.7.13) and fragment lives (rule 1); FP replaces "binding actor" with "binding incarnation" and adds "unplaced lane" beside MD's "unbound lane" | small | "binding incarnation" is defined once (rule 53): the live fragment incarnation with the lane's subject path, or **the actor** for a definition's operation. MD's actor-level uses read "actor incarnation" where ambiguous. Two lane words, kept apart: **unbound** = no live actor incarnation of the identity (rule 44); **unplaced** = the actor is live, no fragment incarnation has the path (rule 53). `orphaned` stays P19's; **releasing** is rule 60's. 17 "binding actor" places rewritten (FE35, FE42, FE48, FE63, FE65, FE66, FE73, FE74) |
| FX10 | **"Current, from the active leaf" inside a trait**, which has no states (rule 14, rule 44, 2.7.13); rule 44's title "handle it at the root" | small | "from the binding incarnation's active leaf (a trait: its own `on`)"; rule 44's title "handle it at the root of its declarer" |
| FX11 | **A definition's operation committed in a copy's filling** (rule 9): which subject path does its lane record? | small | none: a definition's operation's lane has path `[]` and the actor as its binding incarnation; a path is recorded only for a fragment's operation. Stated in rules 9 and 51 |
| FX12 | **`s.operations.<instance>.<name>` and `s.operations.<name>` share one record**: an operation named `chat` and a trait instance `chat` collide | small | operation names join 2.1's one namespace ("These names, state names and memory keys share one namespace, and a collision rejects") |
| FX13 | **FP allows `activities` only "in a trait body"** (AM4, AM37), while rule 48 allows reads and streams in any fragment and a subroutine's states are states (rule 41) | small† | rule 41 reads "in a state (a subroutine's included) or a trait body"; 2.2.2's sentence says the same |
| FX14 | **A frozen `.each` copy removed from membership** (rule 9: frozen copies "are still reconciled every turn"). Rule 52 says only that a frozen trait "reset on return" has ended | small† | a frozen copy whose key leaves the list has ended: its parked read endings are evidence, rule 60's marks apply, and its writes are unplaced (rule 53) |
| FX15 | **Rule 15 (`LateMayNotLeave`) counts calls a host state owns.** A late turn that leaves a node also ends the fragment placements on it | small† | rule 15 reads only the host's own operations; a fragment's work belongs to its incarnation and follows rules 52 and 53 (reads end, writes outlive), so ending a placement is never "leaving live work". One sentence in rule 15 |
| FX16 | **`check()` and the new cells.** It runs steps 2–6 and "mints nothing, joins no queue" | small | `check()` applies no releasing mark and parks nothing (marks are Runtime records, like minting); a decline from another path is a verdict it reports, like `Rejected` |
| FX17 | **FP 4.2 is written in M6's first syntax** (`gap`, `complete`, `s.operations.chat.feed?._tag === "Live"`, linking `merge-6-streams/proposal.md`); M6 revision 3 has `missed` and a feed row (S3, S5, S7) | small | 4.2 is not ported (2.8). Rule 52's stream sentences ("its live placements are the incarnation's", "Thawing places its `activities` again … so a stream resumes from the fragment's own position") are written with MD's current stream words and marked *Stream details: merge 6* |
| FX18 | **`Story.ending(Autosave.O.save, …)`** (rule 58) addresses an operation through `Fragment.O`, which rule 50 limits to write reads; a fragment's reads and streams have no `Fragment.O` handle | small, at merge 3 | rule 58 and C63 mark it *Story reads: merge 3*; merge 3 decides whether `Story.ending` accepts a `Fragment.O` handle and how a fragment's read is addressed (by instance path) |
| FX19 | **FP's plan rows name "Persistence O2/O6"**: the mark's capture order is O3, the upgrade rule O5 and P19, the restore reset O4 | small | C60–C62 are written against O2, O3, O4 and O5; P19 gains the path-shape case |
| FX20 | **The reset value "persisted with its slice"** (rule 51) has no plan row; MD persists memory and re-takes baselines | small | in C60 |
| FX21 | **`SharedContract` as a warning** (`key: []` on a non-empty path, AM41) under a name 2.7.16 lists as an error | small | precedent: `UnresolvedHold` has two severities. 2.7.16 and C18 say "`SharedContract` (error; a warning for `key: []` on a placement whose path is not empty)" |
| FX22 | **Rule 57's exception to rule 10.** A fragment's summary carries its children's write operations, so swapping a nested writing child changes every ancestor's contract ("A changed summary is a changed contract") | small, stated | rule 10 states the exception and its consequence; section 4 E2 notes it |
| FX23 | **FP says `revisit.md`**; the repo has none. `open-items.md` is titled "To revisit" and holds the operations merge's deferrals (items 5–14) | small | add FP 9's six items and RV3's one as open-items 20–26 (M6). AGENTS.md's `revisit.md` is that file in practice; renaming it is out of scope |
| FX24 | **OD17 Q19** ("operations in fragments deferred to their own exploration") and section 6's pointer to EX | small | OD17 annotated "*Q19 answered by F1–F10*"; section 6's bullet rewritten to say what stays out (FE77) |
| FX25 | **The lane-record removal rule** (rule 51: "removed once `Idle` with no parked ending") vs 2.7.13 ("a lane record holding only a parked ending counts as non-`Idle`") | — | convergent, no edit beyond rule 51's sentence |
| FX26 | **`DehydrateCommitInFlight`** names "the actor and its state"; a fragment's commit needs its placement | small | "…the actor, its state and, for a fragment's operation, its instance path" (2.7.13's hydration cell, C49 annotated) |
| FX27 | **Release marks apply in step 5, `whenAbandoned` is fused in step 3** (rule 6, 2.5) | small | the key-less `cancel` is listed in step 3 with the leaving notifications; its cells apply in step 5 after every member of the turn (rule 60, FP 2.4 "Order and capture") |


## 1.4 Owner conflicts

**None.** Every behaviour and API change in FP is covered by F1–F10 (F10 accepts the proposal as a whole), and every
gap above is wording, numbering, a superseded clause, or a consequence the main session decides under the delegation.
The two closest to API are FX8 (`updateMemory` receives `operations`, required by FP's own 4.4) and FX6 (a restore can
now run a reset turn); both are recommended as small† and should be logged as "delegated" so the owner sees them.

---

# Part 2: the change list

## 2.1 Order and scope

1. **Change set 1, normative text:** header, sections 1–2.6, rules, 2.5, 2.7 prose, new 2.9 prose (2.9.1–2.9.5),
   sections 3.6–7, change log, decisions (FE1–FE71, FE73–FE81).
2. **Change set 2, examples:** new 2.9.6 (Autosave, the like, the subject walk; FE72), after change set 1 is checked.
3. FX1's merge order is settled before change set 1 (it fixes the rule numbers).
4. Each change set ends with a check in [operations-merge-check.md](../../../../../../archive/flow-design-2026-11/machine-fragments/reviews/operations-merge-check.md)'s form. Then
   the mechanics (2.9).
5. Out of scope: `.plan` files (C rows only), merge 3 and merge 6 (their rebases are in 2.10), principles.md (M5 offers
   a pointer).

## 2.2 Rule numbering

Rules 1–47 keep their numbers. FO0–FO12 become, in order:

| FP | MD rule | Title in MD |
| --- | --- | --- |
| FO0 | 48 | Scope in v1 (F4, F8) |
| FO1 | 49 | A fragment may declare operations (F1) |
| FO2 | 50 | Only the fragment acts; the host reads and asks (F5) |
| FO3 | 51 | Lane identity is unchanged; each lane records its subject path (F2, F8) |
| FO4 | 52 | Reads live and die with the incarnation; a freeze ends what it cuts |
| FO5 | 53 | Writes outlive the incarnation; their endings go to the subject (F3) |
| FO6 | 54 | A starting incarnation adopts its subject's lanes (F3) |
| FO7 | 55 | Adopted endings are handled inside the fragment |
| FO8 | 56 | A host that ends a holding placement must be able to start it again |
| FO9 | 57 | Summaries carry operations and requirements |
| FO10 | 58 | Stories (F7) |
| FO11 | 59 | A fragment's rows |
| FO12 | 60 | Release on leave (F9) |

Each rule's text is FP 2.2's, with: "MD rule *n*" → "rule *n*"; FO*n* → its MD number; "decided, F*n*" kept;
"RV1/RV2/RV3 *x*" citations kept, prefixed "FP" (as OPP kept "ODP R*n*"); X-resolutions applied (FX6 in 51, FX7 in 51,
FX9 in 53, FX10 in 53–54, FX11 in 51, FX13 in 52, FX14 in 52, FX16 in 60, FX17's mark in 52, FX18's mark in 58,
FX27 in 60). Rule 48 cites MD rule 9 for "nested `.each` is out of scope" (RV3 L11, already in FO0).

## 2.3 Edits (81)

**Header, section 1, 2.1–2.6**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| FE1 | Status paragraph | "…and write lanes are the Runtime's (2.7.13)." | append: "Operations in fragments ([merged/fragment-operations/proposal.md](merged/fragment-operations/proposal.md), revision 3) was merged on <date>: a fragment may declare and act on its own operations (2.9, rules 48–60); write lanes keep their identity and record the subject path of the incarnation that created them." | F10 |
| FE2 | "Five decisions" | "**Five decisions.** … decision 5 builds on decisions 2 and 4." | "**Six decisions.** … decision 6 builds on decisions 1 and 5."; new row "\| **6. Operations in fragments** \| 2.9, rules 48–60, rules 1–4, 6, 8–17, 20–24, 26, 27, 37, 40–47, N1 and N3 amended, C54–C68, decisions F1–F10 \| Machines O1/O4–O6/O8, Runtime O3/V4, Persistence O2–O5, Testing O1, Inspection O1, CommandLine O5, React O4, EntityDomains O1, Operations O3 \|" | F10 |
| FE3 | Section 1, fourth bullet | "**Fragments are locked islands of logic with no I/O.**" | "**Fragments are locked islands of logic, with no I/O of their own unless they declare `operations`** (rule 49), which only they may act on (rule 50)." | AM1 |
| FE4 | Section 1, after "There are two kinds" | "Because fragments do no I/O, the machine reads like today's machines: the host runs every operation and feeds the answers into its fragments by raising their events." | "A fragment without `operations` does no I/O: the host runs every operation and feeds the answers in by raising its events. A fragment that declares `operations` owns them wholly; its host reads their lanes and asks through its events (rules 48–50)." | FX3, FX4 |
| FE5 | Section 1, last paragraph | "v4 reuses **pieces** (fields, timers, dialogs, selections), not I/O **policy**. Policy is written once per machine, as states, schedules and the operations' members (2.7)." | "v4 reuses **pieces** (fields, timers, dialogs, selections) and, opt-in, a piece's **I/O policy** (an autosave, a like with its reconcile; 2.9). Policy is written once per declarer, as states, schedules and the operations' members (2.7)." | FX4; F1 |
| FE6 | 2.1 table, "On ending, except by an exit or a freeze" | "`whenAbandoned` notifications run, fused into the leaving turn" | append "; a key-less `O.x.cancel` listed there releases the subject's lanes of that operation (rule 60)" | AM40 |
| FE7 | 2.1 Reading, operations bullet | "…a placement's lane, or under `subscribe.each` a keyed list (rule 41); records of an entity domain the definition lists in `operations`:" | insert after "(rule 41);": "a fragment's operations under its instance, `s.operations.<instance>.<name>` (`undefined` while inactive, a keyed list of copies under `.each`; rule 59), and its write lanes by key with `Fragment.O.<name>.get(s, k)` (rule 50);"; "the definition lists" → "the definition or a fragment in its tree lists" | AM2; FX3 |
| FE8 | 2.1, namespace sentence | "These names, state names and memory keys share one namespace, and a collision rejects." | "These names, operation names, state names and memory keys share one namespace, and a collision rejects." | FX12 |
| FE9 | 2.2 code and port table | `internalEvents: { Due: {} },               // produced only by this fragment's own schedules`; row "\| `internalEvents` \| sent by its own `schedules` \| nothing \|" | comment "// produced only by this fragment's own schedules or operations (rule 49)"; row "\| `internalEvents` \| sent by its own `schedules`, or mapped from its own operations' endings (rule 49) \| nothing \|" | FX3 |
| FE10 | 2.2.1 `Flow.entry` row | "(its state is entered, its trait created or reset)" | "(its state is entered, its trait created or reset; not on a thaw, F8)" | AM3 |
| FE11 | 2.2.2 summary bullets | "- It also records the callbacks `whenAbandoned` notifies." | add bullet: "- For a fragment with `operations`, it records each operation, its children's write operations included, and the contracts' Effect requirements (rule 57)." | FX3; FO9 |
| FE12 | 2.2.2 last sentence | "Fragments may not declare `operations`, `activities`, `context`, `onContext`, `send` or persistence." | "Fragments may not declare `context`, `onContext`, `send` or persistence. They may declare `operations` (rule 49); a trait body, and a subroutine's states, may hold `activities` (rules 41, 52)." | AM4; FX13 |
| FE13 | 2.3 rows | "Running I/O and mapping endings \| host **definition**: `operations`…"; "What survives an abnormal ending \| the fragment's body: `whenAbandoned`" | append to the first: "; or a fragment's declaration (`operations`) and body, the only place its operations are acted on (rules 49, 50)"; the second: "the fragment's body: `whenAbandoned`, which may also release its operations' lanes (rule 60)" | AM5; FX3 |
| FE14 | 2.6 key order | "\| machine or fragment body \| `default`, `schedules`, `traits`, `on`, `states`, `whenAbandoned` \|" | "\| machine or fragment body, a state \| `default`, `activities`, `schedules`, `traits`, `on`, `states`, `whenAbandoned` \|" | AM6 |
| FE15 | 2.6 "What lives in `Flow`" | "A write lane is the Runtime's record of the actor identity (rule 21), read as snapshot data, `s.operations`." | append: "A fragment's handles are its `O` inside its body; outside, `Fragment.O` offers only its write operations' reads (rule 50)." | FO2 |

**2.4 rules 1–12**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| FE16 | 2.4 intro | "Rules 1–12 are fragments and the turn; rules 13–25 are server calls (2.7)…" | append: "; rules 48–60, after rule 47, let fragments declare operations (2.9)" | FX3 |
| FE17 | Rule 1, `.resumable()` | "- Freezing is not ending, so `whenAbandoned` does not run. It runs if the trait is reset on return." | add bullet: "- Freezing releases the trait's placements and ends its lookups `failure { Interrupted }`, parked with the frozen slice; thawing delivers its parked endings, the interrupted lookups first, and places its `activities` again. `Flow.entry` does not fire on a thaw (rule 52; F8)." | AM7 |
| FE18 | Rule 1, `resetOn` | "Pending resets are not persisted: on restore, `resetOn` baselines are re-taken silently (section 6)." | "Pending resets are not persisted: on restore, `resetOn` baselines are re-taken silently (section 6), except on a placement that owns a mapped write: there the reset value is a string and a subject part, recorded with the slice, and a re-taken value that differs resets the trait as a pending reset, the first turn after restore (rules 48, 51)." | AM7; FX6 |
| FE19 | Rule 2 | "On a definition, `internalEvents` come from its schedules or its operations' endings"; "The host maps call endings onto **its own** events, through its operations' `outcomes`, and raises into fragments." | "On a definition or a fragment, …"; "Each declarer maps its operations' endings onto **its own** events, through their `outcomes`; a host raises into fragments." | AM8 |
| FE20 | Rule 3 | "3. **No I/O.** Fragments run no operations, read no context and send to no actor." | "3. **I/O is opt-in.** A fragment reads no context and sends to no actor. It runs operations only if it declares them (rule 49), within rule 48's scope; a fragment without `operations` is unchanged." | AM9; F1 |
| FE21 | Rule 4 | "Its policy enters only through the declared guards." | append: "It reads a fragment's write lanes through `Fragment.O` and its other rows at the instance path, and never acts on them: a host that wants a stop or a retry sends the fragment's public `events` or `hostEvents` (rule 50)." | AM10 |
| FE22 | Rule 6, `whenAbandoned` | "Its fillings cannot target, cannot refuse (rule 8), and write only keys the leaving transition does not write." | append: "It may list a write operation's key-less `O.x.cancel`: listed in step 3 with the notifications, it releases that operation's lanes of this incarnation's subject path in step 5, after every member (rule 60); it reads no memory, so rule 22 and `KeyRequired` do not apply." | AM11; FX27 |
| FE23 | Rule 8 | "- call endings, current and late (rules 14, 20), except what rule 17 makes evidence by declaration;" | "- call endings, current and late (rules 14, 20), to the binding incarnation, or parked for the lane's subject path (rule 53), except what rule 17 makes evidence by declaration, a releasing lane's included (rule 60);" | AM12 |
| FE24 | Rule 9, revision paragraph | "A commit started in a copy's filling is an ordinary commit of the host's operation:" | before it insert: "A copy may own operations (rule 48); a lane its commit creates records the copy's key as a part of its subject path (rule 51)."; after "…(rule N3)." add: "A host operation's lane has path `[]` and the actor as its binding incarnation." | AM13; FX11 |
| FE25 | Rule 10 | "A changed summary is a changed contract." | append: "**One exception** (rule 57): a fragment's summary carries its children's write operations (contract, holding, releasing) and its contracts' requirements, so `SharedContract` and rule 56 work above a nested writing child; changing such a child changes every ancestor's summary." | AM14; FX22 |
| FE26 | Rule 11 | "`story.machine(fragment, { id })` fills every port…"; "`.enter(input)` enters a subroutine, with its `Input` record; `.leave()` abandons it, as a host transition would." | "`story.machine(fragment, { id, fixtures })`…"; "`.enter(input)` enters a subroutine or starts a trait incarnation, with its `Input` record; `.leave()` abandons or ends it, as a host transition would (rule 58)." | AM15 |
| FE27 | Rule 12, construction errors | "- two state changers or overlapping keys that the state-token pruning cannot separate." | add bullets: "- an acting member of a fragment's operation used outside that fragment (rule 50); - a mapped write outside rule 48's scope; - a non-string `resetOn` on a placement that owns a mapped write (rule 48)." | AM16 |

**Server-call rules 13–25, N1–N3**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| FE28 | Intro before rule 13 | "Rules 39–47 (after rule 38) declare operations; rules 13–25 say how their work runs." | append: "Rules 48–60 let a fragment declare them; read \"the definition\" in rules 13–47 as \"the declarer\" (a definition or a fragment), and \"binding actor\" as \"binding incarnation\" (rule 53)." | FX3, FX9 |
| FE29 | Rule 13 | "maps each ending to one of the definition's events" | "maps each ending to one of its declarer's events (a definition's, or a fragment's `internalEvents`, rule 49)" | FX3 |
| FE30 | Rule 14 | "If that activation is alive, the event is **current** and routes from the active leaf." | append after the "One owner test" sentence: "The test runs inside the binding incarnation (rule 53): a fragment's operation is current or late within that incarnation, and an adopted ending is current from its active leaf (a trait: its own `on`). With no binding incarnation the ending is parked for the lane's path (rule 53)." | AM17; FX10 |
| FE31 | Rule 15 | "A call started in a late turn is an ordinary call with its own owner: lateness is not transitive." | append: "Only the host's own operations count: a fragment's work belongs to its incarnation (rules 52, 53), so ending a placement never leaves live work." | FX15 |
| FE32 | Rule 16 | "A commit past its lane's queued commits or a record queue's bound is declined the same way, `NotSent { why: \"Overloaded\" }` (rule 35)." | append: "Under every concurrency, a commit from an incarnation whose subject path differs from the lane's ends `NotSent { why: \"Rejected\" }`, and the transition runs (rule 51)." | AM36 |
| FE33 | Rule 17 | "…delivers exactly one ending, to a live incarnation of its identity or to its saved record (rule 44). Evidence, by declaration:" | "…delivers exactly one ending, to a live incarnation of its identity with the lane's subject path, or parked for it (rules 44, 53). Evidence, by declaration:"; the list gains "a fragment's lookup whose incarnation ended (rule 52); an ending of a releasing lane, and its queued commits (rule 60)." and the closing "A freeze is not a release: it ends the lookup (rule 52)." | AM18; FX5 |
| FE34 | Rule 20 | "…for a persisted identity (`Restored`, `StorageRefused`, `Disposed`), or for a domain write (`Overloaded`, rule 35)."; "…new-incarnation arrival set (2.7.14)" | add "or on a placement whose subject path is not empty (`Rejected`, rule 51; checked at the placement from the fragment's summary, rule 57)"; "…over the new-incarnation arrival set of its declarer (a fragment: its own body, rule 55) (2.7.14)" | AM19; FX7 |
| FE35 | Rule 21 | "the actor that commits is its **binding actor**."; "A lane holds no store state" | "the live incarnation that receives its endings is its **binding incarnation** (the actor for a definition's operation; rule 53)."; before "A lane holds…" insert: "A lane created by a fragment's commit records the committing incarnation's subject path; a member from another path is declined (rule 51); a lane may be marked releasing (rule 60)." | AM20; FX9 |
| FE36 | Rule 22, lane-reads bullet | "Selects and guards see the pre-turn lanes with the turn's own ending admitted;" | "Selects, guards and `updateMemory` (with `get` only) see the pre-turn lanes with the turn's own ending admitted;" and append: "Inside a fragment, `operations` is that fragment's own rows (rule 59)." | FX8; AM39 |
| FE37 | Rule 23 | "so `keys` may read `operations` (OD23 Q29);" | append to the sentence: "inside a fragment, its own rows, and under `.each` only the lanes of that copy's path (rule 59);" | AM39 |
| FE38 | Rule 24 | "It never drops a queued commit silently." | "It never drops a queued commit silently, except a release on leave the fragment declares, whose cells act on every lane of the subject path and end its queued commits as evidence (rule 60)." | AM21; FX5 |
| FE39 | N1 | "…`subscribe.each` placements, a keyed operation's write lanes." | append: "a fragment's rows under an `.each` placement, one entry per copy, each listing only the lanes of that copy's path (rule 59)." | AM39 |
| FE40 | N3 | "call endings are never dropped: they reach a live incarnation of their identity or its saved record, routed by owner (rules 8, 14, 17, 20, 44);" | "…they reach the binding incarnation, or are parked for the lane's subject path or the identity's saved record, routed by owner (rules 8, 14, 17, 20, 44, 53), unless their lane is releasing (rule 60);" | FX3 |

**Rules 26–47**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| FE41 | Rule 26 | "For an operation registered in a domain," | "For an operation registered in a domain (by a definition, or by a fragment for its actor, rule 49)," | FX3 |
| FE42 | Rule 27 | "for a lane with no binding actor the Runtime applies the cell when the ending lands, and parks the ending (rule 44)."; "or on whether an actor is bound." | "for a lane with no binding incarnation the Runtime applies the cell when the ending lands, and parks the ending (rules 44, 53)."; "or on whether an incarnation is bound." | FX9 |
| FE43 | Rule 37 | "A read's defect or interruption ends on `failure` as `Defect` or `Interrupted`;" | append: "a lookup cut by a freeze ends `Interrupted` too (rule 52);" | AM23 |
| FE44 | Rule 40 | "A definition declares every server interaction once"; "One write operation per write contract (`SharedContract` otherwise)" | "A definition or a fragment declares…"; "One write operation per write contract **per actor**, counting the definition and every fragment placement in its tree (`SharedContract` otherwise; F2); two placements of one writing fragment are therefore an error"; "The definition exports `O`" → "Each declarer exports `O` (a fragment's, outside it, is read-only; rule 50)." | AM22 |
| FE45 | Rule 41 | "in `activities`, a list of placements." | "in `activities`, a list of placements in a state (a subroutine's included) or a trait body, placed for that activation or incarnation (rule 52; *Stream details: merge 6*)." | AM37; FX13 |
| FE46 | Rule 42 | "A one-off read operation has one lane;"; "One-off read lanes are not persisted." | "A one-off read operation has one lane (in a fragment, one per incarnation: actor, operation, incarnation; rule 52);"; "One-off read lanes are not persisted; the one exception is the `Interrupted` ending a freeze parks, which persists with the frozen slice (rule 52)." | AM23 |
| FE47 | Rule 43 | "anywhere else a key-less member is `KeyRequired`." | append: "A key-less `O.x.cancel` in `whenAbandoned` is not `KeyRequired`: it names every lane of the incarnation's subject path (rule 60)." | AM38 |
| FE48 | Rule 44 | title "**A hold outlives its actor; handle it at the root**"; "Disposing a binding actor drops and cancels nothing"; "receives, before any external event:" | "**A hold outlives its actor and its fragment incarnation; handle it at the root of its declarer**"; "Disposing an actor, or ending the incarnation that binds a fragment's lane, drops and cancels nothing"; after the delivery list add: "Within the actor, each lane's deliveries go to the incarnation with its subject path, as follow-up turns after that incarnation's starting turn (rule 54); a lane whose path no incarnation has is **unplaced** and parks its endings (rule 53)." | AM24; FX9, FX10 |
| FE49 | Rule 45 | "The same arrival set is rule 20's for the operation's other mapped events." | append: "For a fragment's operation the check runs on the fragment's body (rule 55); at its host, rule 56 adds the placement's arrivals, unless the operation releases on leave (rule 60)." | AM25 |
| FE50 | Rule 46 | "A local identity's lanes are never persisted;" | insert before it: "A lane record names no instance path; it carries the subject path (strings) and the releasing mark (a flag), both decoding without the machine. A recorded path the placement cannot produce is adopted by key equality only when the placement's last subject part is the contract's single key field, else goes to `orphaned` (rule 51; FP 2.5)." | AM26 |
| FE51 | Rule 47 | "Stories drive endings through the operation, `Story.ending(O.x, …)` (*Story reads: merge 3*)." | append: "; a fragment's, through `Fragment.O.x` (rule 58; *Story reads: merge 3*)." | FX18 |
| FE52 | After rule 47 | — | new block: "**Operations in fragments** (2.9). Rules 48–60 are operations-in-fragments' ([merged/fragment-operations/proposal.md](merged/fragment-operations/proposal.md)); each names its decisions (F1–F10)." then rules 48–60 per 2.2 | FP 2.2 |

**2.5 the turn**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| FE53 | "What reads what" table and lane-reads paragraph | row "\| **Before** … \| every guard; every payload mapper …; the source's `updateMemory`; parts' `updateMemory` \|"; "**Lane reads** (`operations`, `get`, `idle`, `retryable`) in selects and guards are not memory:" | row unchanged; paragraph: "…in selects, guards and `updateMemory` (`get` only) are not memory:" | FX8 |
| FE54 | `check()` sentence | "`check(snapshot, event)` runs steps 2–6 on the given event and publishes nothing." | append: "It applies no releasing mark and parks nothing; a decline from another subject path is a verdict, like `Rejected` (rules 51, 60)." | FX16 |
| FE55 | Step 1, "A call's ending is mapped here." | "…and its owner is tested against the pre-turn snapshot (rule 14)" | append: "inside its binding incarnation; an ending with no binding incarnation is parked for the lane's path or, on a releasing lane, applied and released (rules 53, 60)" | AM27 |
| FE56 | Step 3, "Leaving." | "…`whenAbandoned` for every incarnation the turn ends." | append: "A key-less `O.x.cancel` listed there records a release for step 5 (rule 60)." | AM27; FX27 |
| FE57 | Step 5, "Lane cells" | "`cancel` interrupts, releases or ends a never-sent commit." | append: "A member from an incarnation whose subject path differs from the lane's is declined (rule 51). After every member, the turn's releases mark their lanes and apply the releasing cells (rule 60)." | AM27 |
| FE58 | Step 6 | "- Cancel the schedules of ended incarnations, and freeze resumable ones."; "queue any pending resets as one follow-up turn at the head of the mailbox." | "…and freeze resumable ones, ending each of their lookups `failure { Interrupted }`, parked with the slice (rule 52)."; append to the second: "; after them, queue the adoption deliveries of every incarnation the turn started (rule 54)." | AM27 |
| FE59 | "Settlement and Runtime steps publish without a turn." | "a bound lane changes when the ending's turn is admitted (an unbound lane, when the Runtime applies the ending's cell, rule 44)." | "…(an unbound or unplaced lane, when the Runtime applies the ending's cell, rules 44, 53)." | FX9 |

**2.7 server calls**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| FE60 | 2.7.3, commit placement | "A commit is a value, so it may sit in a shared transition object, in an action list beside other actions, in a host's filling of a fragment callback, or behind a schedule's event;" | "…in a host's filling of a fragment callback (for the host's own operation), in a fragment's own body (for its operation, rule 50), or behind a schedule's event;" | FX3 |
| FE61 | 2.7.12, "Restore and rebind" row | "a new incarnation adopts its identity's lanes and receives, before any external event, …" | append: "; within the actor, each lane's deliveries go to the incarnation with its subject path, after any pending reset (rule 54)" | FX3 |
| FE62 | 2.7.13 lifetime table | "\| a one-off read lane (proposed) \| from the operation's first lookup until `cancel`, or the actor ends; …"; "\| a placement's session \| the state activation \|" | "…until `cancel`, or the actor (in a fragment, the incarnation) ends; a freeze ends its lookup `Interrupted` (rule 52) …"; "\| a placement's session \| the state activation, or the trait incarnation (rule 52; *Stream details: merge 6*) \|" | AM23; FX17 |
| FE63 | 2.7.13 status bullets | "changes **only in its binding actor's turns**"; "endings with no binding actor"; "it outlives its binding actor"; "until a binding actor resolves or releases it" | "binding incarnation" ×4 (the actor's turns are the incarnation's) | FX9 |
| FE64 | 2.7.13 principles 3, 4 | "**The hold is the default** (decided, OD6): no quiet release and no automatic retry (rule 25)."; "`cancel` never silently drops a waiting commit (decided, OD7)." | append "A declared release on leave is not quiet (F9, rule 60)."; append "; a release on leave ends them as evidence (F9, rule 60)" | FX5 |
| FE65 | 2.7.13 Owner paragraph | "The actor that commits is the lane's **binding actor**: it receives the lane's endings and its members address the lane."; "**With no binding actor**"; "while bound a lane belongs to its binding actor"; "\"Actor\" in earlier sections reads as \"binding actor\"." | "The live incarnation with the lane's subject path is its **binding incarnation** (the actor, for a definition's operation; rule 53): it receives the lane's endings and its members address the lane."; "**With no binding incarnation**"; "…its binding incarnation"; "\"Actor\" in earlier sections reads as \"binding incarnation\"; an actor alive with no incarnation of the path leaves the lane **unplaced**, and its endings are parked on the lane record whether or not the identity persists (rule 53; 2.9.3)." | AM28; FX9 |
| FE66 | 2.7.13 transitions intro and rows | "\"Delivered\" is a mapped event to the binding actor in a later turn, or evidence if there is none;"; dispose row "(the binding actor ends; R7 K17)"; hydration cell "naming the actor and its state" | "…to the binding incarnation in a later turn, parked if the actor is alive without one (rule 53), or evidence if there is none; 2.9.3 adds the fragment rows (subject path, another path, freeze, thaw, release)"; "(the binding incarnation ends: the actor is disposed, or the incarnation with the lane's path ends; cells unchanged except the parking row, 2.9.3)"; "…naming the actor, its state and, for a fragment's operation, its instance path" | AM28; FX26 |
| FE67 | 2.7.13 delivery order | "The deliveries are several turns, in this order, before any external event:" | append after the list: "For a fragment's operation the same order applies per subject path, as follow-up turns after the starting turn (its own raises first) and any pending reset, before any later event (rule 54)." | AM28 |
| FE68 | 2.7.13 parked sub-table | "\| `Held` (parked; persisted identity, no live actor) \|" | add after the table: "In a live actor, a lane with no incarnation of its path parks the same way (rule 53); 'no live actor' reads 'no binding incarnation' (FP 2.4)." | FP 2.4 |
| FE69 | 2.7.14 | item 2 "and **every leaf a new incarnation can be in while X's lane is unresolved**"; item 4 "the next incarnation **of the same identity** receives it exactly once" | item 2: append "For a fragment's operation the arrivals are inside the fragment (a trait: its own `on`; rule 55)."; item 4: append "; for a fragment's operation, the incarnation with the lane's path (rules 53, 54)"; new item 5: rule 56's host checks (node or resumable placement, the structural `.each` warning, the `resetOn` default), not for an operation that releases on leave | AM29 |
| FE70 | 2.7.15 | "- **A one-off read lane is not persisted.**"; "- **A write lane** is a Runtime record…, with its Attempts," | append to the first: "The one exception is a fragment's lookup cut by a freeze: its `Interrupted` ending persists with the frozen slice (rule 52)."; the second: "…with its Attempts, the creating incarnation's subject path and the releasing mark (rule 46)," | AM23 |
| FE71 | 2.7.16 | "- `flow check`: errors `SharedContract`, …"; "Rule 20's `NotSent` requirement is read per operation."; `flow explain` lines; Typing list | "`SharedContract` (per actor tree, F2; a warning for `key: []` on a placement whose path is not empty)"; "…read per operation, and per placement for a fragment's operation (rule 51)"; add `flow explain` line "`docs  SaveDue → commits save (docs/save, reject, one lane per docId, subject = copy key)`"; Inspection: "every lane with its operation path and subject path, and whether it is unplaced or releasing"; `UnresolvedHold` and rule 20 run inside each fragment and gain rule 56 at the host; no new finding name. Typing gains: "`Fragment.O` is typed from the declaration and has only write operations' reads; members are branded with their fragment; key-less `O.x.cancel` type-checks in `whenAbandoned`; the fragment's `R` reaches the host and its Stories; a writing placement's `resetOn` returns `string`. Not spiked (section 7 item 20)." | AM30, AM41; FX7, FX21 |
| FE72 | New 2.9 (change set 1: 2.9.1–2.9.5; change set 2: 2.9.6) | — | "### 2.9 Operations in fragments": **2.9.1** where the data comes from (FP 1.1's table) and when a fragment should own I/O (FP 1.2); **2.9.2** lifecycle (FP 2.3's table); **2.9.3** the write lane's fragment rows (FP 2.4: the delta table, the releasing rows, `cancel`/`allow`, order and capture), as a reading of 2.7.13's table, which stays normative; **2.9.4** persistence and rebind (FP 2.5); **2.9.5** static analysis, the single graph, `flow check` (FP 2.6) and the wiring decisions (FP 2.8); **2.9.6** examples (2.8 below) | FP 1–2, 4 |
| FE73 | 2.8.4 | "for a lane with no binding actor, the Runtime applies the cell"; "or one applied with no binding actor," | "binding incarnation" ×2 | FX9 |

**Sections 3–7, change log, decisions**

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| FE74 | 3.6 Keywords | rows "New, fragments", "New concepts, not words" | "New, fragments" gains "(operations in fragments) `operations` in a trait or subroutine declaration, `O` in a fragment body, `Fragment.O.<write>.get` / `.idle` / `.retryable` outside it, `activities` in a trait body, `s.operations.<instance>.<name>`, `fixtures` / `.enter` / `.leave` on a fragment Story, a string `resetOn` on a writing trait, key-less `O.x.cancel` in `whenAbandoned` (all existing words, new meanings; no new word)"; concepts gain "**binding incarnation**, **subject path**, **unplaced lane**, **releasing lane** (rules 51, 53, 60)"; concepts' "the **binding actor**" → "the **binding incarnation**" | AM31 |
| FE75 | Section 4 | L2 "an adopted ending is current from the active leaf (rule 14)."; E2 "Hosts are checked against contract summaries only (rule 10)."; H3 "`internalEvents` come only from the fragment's own schedules."; D3 "Not applicable: fragments do no I/O."; D5 "…(rules 14, 44, 46)."; A1/A2 "One `outcomes` mapping per operation, on the definition,"; A5 "Prevented (rule 3)."; A7 "Not applicable: the host starts every operation on its own transition." | L2 append "; a fragment's ending goes to the incarnation with its subject path (rule 53)"; E2 append "Rule 57's one exception (children's write operations) is stated."; H3 "…from the fragment's own schedules or its operations' endings, and a mapped event only from endings (rules 2, 47, 49)."; D3 "Not prevented, as for hosts: a fragment that owns a save coalesces like a host does (2.9.6's Autosave)."; D5 append "; a lane records its subject path, so the restored incarnation of the right thing adopts it (rules 51, 54)"; A1/A2 "…on its declarer,"; A5 "**Allowed, opt-in** (F1): a fragment that declares an operation is its only actor; its host reads and asks (rules 48–50), so I/O is never split for one operation."; A7 "A host or a fragment starts an operation on its own transition; a fragment that commits on creation uses a 0 ms `Flow.entry` schedule guarded by `idle` (rule 54's default)." | FX3, FX4 |
| FE76 | Section 5 | — | new subsection "### For operations in fragments" with C54–C68 (2.6); C33 and C37's "one write operation per contract" read "per actor (C68)"; the fragments rows Machines O1, Persistence O2, Testing O1, Inspection O1, CommandLine O5 and C18, C38, C40–C42, C44–C47, C49, C51–C53, P7, P19 end "(amended by C*n*, operations in fragments)" | AM32 |
| FE77 | Section 6 | bullets "**Fragment I/O** (`requests`, `CommitWithRetry`)…", "**Nested request relays.** These follow from the above.", "**Operations in fragments** (OD17 Q19): fragments keep rule 3; their own exploration is [operations-in-fragments/exploration.md](…)." | delete the first two; the third becomes "**Generic I/O fragments** (EX's `CommitWithRetry`): rule 13's exhaustive `failure` makes a contract-agnostic reconcile fragment unwritable; fragments own concrete operations (2.9). **Mapped writes in subroutines and node traits** are phase 2 (F4, F7; [merged/fragment-operations/](merged/fragment-operations/proposal.md) section 9)." | AM33; FX24 |
| FE78 | Section 7 | item 1 "**Summaries in types.**…"; item 2 "**`.resumable()` and `resetOn` together.**…" | item 1 append: "Rule 57 adds operations and the contracts' `R` to the summary in the fragment's type."; item 2 append: "On a writing placement the frozen value is also a subject part, and a restore whose value differs resets (rule 51)."; new **item 20 Typing risks** (FP risk 8): `Fragment.O`, branded members, key-less `cancel` in `whenAbandoned`, rows under `.each`, `R` reaching the host, string-only `resetOn`; no spike; `flow check` is the fallback | FX3 |
| FE79 | 2.7.13, 2.7.14, 2.7.15, C48: OD20 citations | "(F3, OD21)"; "(F3, F5)"; "(OD20, F4"; "(OD20, F5" ×2; "(OD20, F6)"; "(OD20, F8)"; "(OD20, F9)"; "(2.7.13; OD20, F3;"; "(OD20, F2)" | "OD20 F*n*" in each | FX2 |
| FE80 | Change log (after the operations entry) | — | "- Operations in fragments merged on <date> ([merged/fragment-operations/proposal.md](…), revision 3; decisions F1–F10; plan [merged/fragment-operations/merge-plan.md](…)): fragments declare and alone act on `operations` (rules 48–50); write lanes keep their identity and record a subject path (rule 51); reads end with their incarnation, a freeze ends lookups `Interrupted` (rule 52); endings go to the incarnation with the path, parked meanwhile (rules 53, 54); hold checks inside the fragment and at the host (rules 55, 56); summaries carry operations and requirements (rule 57); release on leave (rule 60); 2.9 added; rules 1–4, 6, 8–17, 20–24, 26, 27, 37, 40–47, N1, N3, 2.1–2.6, 2.5 steps 1, 3, 5, 6, 2.7.3, 2.7.12–2.7.16, 2.8.4, 3.6, sections 4, 6, 7 amended; C54–C68 added." | F10 |
| FE81 | Decisions | header "…the operations merge's OD1–OD26, which…"; OD17 "Q19 (operations in fragments deferred to their own exploration)" | "…, the operations merge's OD1–OD26 and operations-in-fragments' F1–F10, which…"; OD17 gains "*Q19 answered by F1–F10.*"; OD6 and OD7 gain "*Narrowed by F9: a declared release on leave (rule 60).*"; new "### Operations in fragments (fragments merge, [merged/fragment-operations/decisions.md](…))": F1–F10 verbatim (F10 marked *process, not a design decision*), then "**Accepted with the proposal under F10** (not decided one by one): rules 48–60 as written; the freeze-cut `Interrupted` (rule 52); the upgrade rule (2.9.4); the `key: []` warning. **Decided by the main session at merge (delegated):** FX6, FX7, FX8, FX13–FX15", then "**Also rejected**" from FP section 3 (lanes per placement or per subject, a committing copy on each Attempt, a keyed member in `whenAbandoned`, `Superseded` for a freeze-cut lookup, `Fragment.O` for reads, `Flow.entry` on thaw) | F1–F10 |

Count: 81 edits; FE52 carries 13 rules and FE72 one section with six subsections.

## 2.4 What becomes superseded

| MD text | By | What happens |
| --- | --- | --- |
| Rule 3 "**No I/O.** Fragments run no operations…" | F1 | replaced: I/O is opt-in (FE20) |
| 2.2.2 "Fragments may not declare `operations`, `activities`, …" | F1, rule 52 | narrowed to `context`, `onContext`, `send`, persistence (FE12) |
| Section 6 "Fragment I/O", "Nested request relays" | F1 | deleted; `CommitWithRetry` stays out with a new reason (FE77) |
| Section 6 "Operations in fragments (OD17 Q19): fragments keep rule 3" | F1–F10 | rewritten (FE77); OD17 Q19 annotated (FE81) |
| Section 1 "no I/O", "Because fragments do no I/O…", "not I/O **policy**" | F1 | rewritten (FE3–FE5) |
| Section 4 A5 "Prevented (rule 3)", D3 "Not applicable", A7 "the host starts every operation", H3 "only … schedules" | F1, rule 49 | rewritten (FE75) |
| Rule 2 "`internalEvents` come only from the fragment's own schedules" | rule 49 | the definition clause widened to fragments (FE19) |
| Rule 1 "baselines are re-taken silently" | rule 51, RV3 M2 | narrowed for writing placements (FE18) |
| Rule 10 "Nesting hides the level below" | rule 57 | one stated exception (FE25) |
| Rule 24, 2.7.13 principles 3–4, OD6, OD7: "never silently drops", "no quiet release" | F9 | narrowed (FE38, FE64, FE81) |
| Rule 40, C33, C37: "one write operation per write contract" | F2 | per actor tree (FE44, FE76) |
| Rule 42, 2.7.15: "One-off read lanes are not persisted" | rule 52, RV3 H1 | one exception (FE46, FE70) |
| "Binding actor" (17 places), 2.7.13 "before any external event" for fragment incarnations | rules 53, 54 | binding incarnation; follow-up turns (FX9) |
| Rule 11's `.enter`/`.leave` "a subroutine" only | F7 | also traits (FE26) |
| Machines O4 / C38 "Guards receive `operations`" | rule 50, FX8 | also `updateMemory` (C55) |
| principles.md "version 2: Fragments do no I/O" (not MD) | F1 | pointer offered (M5) |

Unchanged and safe: rules 5, 7, 18, 19, 25, 28–36, 38, 39, N2; 2.7.1–2.7.2, 2.7.4–2.7.11; 2.8 except 2.8.4's two words;
the write lane's 16 rows, both policy tables and the per-policy table (FP 2.4: "The lane's states … are unchanged");
every MD example (none has a fragment that owns an operation; 3.4's array `resetOn` is on a non-writing trait).

## 2.5 Decisions: F1–F10 keep their numbers

As OPP 2.5 kept OD1–OD26: F1–F10 are cited by FP, its reviews, delegated-decisions.md and this plan. FX2 removes the one
ambiguity. F10 is recorded as process, as OD24 was.

## 2.6 New C rows (C54–C68)

| # | Plan | Rule | Replaces or adds |
| --- | --- | --- | --- |
| C54 | Machines O1 | A fragment may declare `operations` after `memory` and `traits`, mapped onto its own `internalEvents`; mapped writes only within rule 48's scope (every placement from the root a root trait, an `.each` copy or a `.resumable()` trait, any with a string `resetOn`, no subroutine); acting members only in the declaring fragment; `Fragment.O` exposes its write operations' reads; key-less `O.x.cancel` in `whenAbandoned` releases on leave (rules 48–50, 60) | Amends the fragments row "A fragment declares what a definition declares (…)" |
| C55 | Machines O4 | A host's guards read a fragment's write lanes with `Fragment.O.x.get`, `idle`, `retryable`; every `updateMemory` receives `operations` (pre-turn lanes, `get` only); inside a fragment `operations` is its own rows (rules 22, 50, 59) | Amends C38 |
| C56 | Machines O5 | `Flow.entry` does not fire on a thaw; a fragment's keyed schedule reads its own rows (rules 23, 52, 59; F8) | Amends P7, C39 |
| C57 | Machines O6 | `activities` in a trait body or a subroutine's states, placed for the incarnation's life; a freeze releases them, a thaw places them again (rules 41, 52; *Stream details: merge 6*) | Amends C40 |
| C58 | Machines O8 | The snapshot exposes `s.operations.<instance>.<name>`, `undefined` while inactive, a keyed list of copies under `.each`, each write row listing the lanes of that copy's path (rule 59) | Amends C41 |
| C59 | Runtime O3, V4 | A write lane's identity is unchanged; it records the creating incarnation's subject path; its binding incarnation is the live incarnation with that path (the actor for a definition's operation); a member from another path is declined; with no binding incarnation in a live actor the ending is parked for the path; a starting incarnation (entry, copy, reset, thaw, rebind, restore) receives its path's parked endings, then held heads' `unknown { Restored }`, then in-flight endings, as follow-up turns (rules 51, 53, 54) | Amends C42 |
| C60 | Persistence O2 | The lane record carries the subject path (strings) and the releasing mark (a flag); a writing placement's reset value persists with its slice; a frozen slice persists its parked read endings (`Interrupted`) beside its frozen schedules; parked endings of an unplaced path are on the lane record (rules 46, 51, 52, 60) | Amends C44 and the fragments' Persistence O2 row |
| C61 | Persistence O3 | A releasing mark is captured no later than the actor record that drops the incarnation (rule 60) | Amends C45 |
| C62 | Persistence O4, O5 | On restore, a writing placement whose re-taken reset value differs resets as a pending reset before rule 44's deliveries (FX6); a recorded path the placement cannot produce adopts by key equality only when its last part is the contract's single key field, else `orphaned` (rule 46; P19 gains the case) | Amends C46, C47, P19 |
| C63 | Testing O1 | `story.machine(fragment, { id, fixtures })`; `.enter`/`.leave` on traits; `Story.ending(Fragment.O.x, …)` (*Story reads: merge 3*); rule 58's ten walks are Stories | Amends the fragments' Testing O1 row and C53 |
| C64 | Inspection O1 | Every lane with its operation path, subject path, and whether it is unplaced or releasing; fragment operations in contract summaries; `runtime.unsettledWrites()` lists unplaced lanes and drops a releasing lane once its ending lands | Amends C51 and the fragments' Inspection O1 row |
| C65 | CommandLine O5 | `SharedContract` per actor tree, and its warning for `key: []` on a non-empty path; `UnresolvedHold` and rule 20 inside each fragment, plus rule 56 at the host; rule 20's `NotSent` on a non-empty path, at the placement; construction errors of rule 12's new bullets; `flow explain` prints fragment operations and their subject; no new finding name | Amends C18 and the fragments' CommandLine O5 row |
| C66 | React O4 | Views read `Fragment.O.x.get(s, k)` and `s.operations.<instance>.<name>` | Amends C52 |
| C67 | EntityDomains O1 | A fragment's domain write registers its domain for its actor; `Released` on a releasing lane keeps the record's mark (rules 26, 30, 32, 60) | Adds |
| C68 | Operations O3, O7 | One write operation per contract per actor, across placements; a release on leave interrupts, releases and ends queued commits as evidence, the one exception to "never silently drops" (rules 24, 40, 60) | Amends C33, C36 |

## 2.7 Keywords

FE74 updates 3.6. Net against MD today:

- **New words:** none (FP 0).
- **New meaning** (existing words, decided): `operations` in a trait or subroutine declaration (F1); `O` in a fragment
  body; `Fragment.O.<write>.get` / `.idle` / `.retryable` outside it (F5); `activities` in a trait body (rule 52);
  `s.operations.<instance>.<name>` (F5); `fixtures`, `.enter`, `.leave` on a fragment Story (F7); `resetOn` on a
  writing trait, its string value a subject part (F8); key-less `O.x.cancel` in `whenAbandoned`, release on leave (F9).
- **Changed behaviour of an existing word:** `updateMemory` receives `operations` (FX8); a freeze-cut lookup ends
  `Interrupted` (rule 52); `SharedContract` per actor and with a warning severity (F2, FX21).
- **New concepts:** binding incarnation, subject path, unplaced lane, releasing lane.
- **Renamed:** "binding actor" → "binding incarnation" (a concept, not an author word).
- **Dropped:** rule 3's ban; nothing an author writes.

## 2.8 Examples

| FP example | Becomes | Checked against |
| --- | --- | --- |
| 4.1 Autosave (`.each`), After: fragment and host | 2.9.6, first example | rule 20 (maps `NotSent`, path `[docId]`); rule 56 (`Close` guards `Autosave.O.save.idle`, so the structural warning passes); `UnresolvedHold` inside (`ResendDue`'s `cancel` fallback) |
| 4.4 Like (`.each`, domain write), After: fragment and board | 2.9.6, second example; the issue page as a three-line note | rule 20 (`NotSent` mapped); rule 56's structural warning **stays** (the keep-busy line reads lanes in `updateMemory`, not a token; FP says so); merge 4's store rows unchanged; needs FX8 |
| 2.10 subject walk (`IssueRow` → `LikeButton`) | 2.9.6, after the like | rules 51, 53, 54, 59 |
| 4.2 live feed | **not ported**: M6-v1 stream syntax (FX17); its read-only lessons (freeze cuts a lookup, `resync` recurring) are stated in rule 52 | — |
| 4.3 checkout (subroutine, phase 2) | **not ported**: outside rule 48's v1 scope | — |
| Before forms, 4.5 totals, section 5 cases | stay in the record | — |

Comments in ported code drop FP's `// NEW MEANING` and review citations (as OPP did), keep `// user-defined` where it
helps, and cite MD rule numbers. No MD example changes: 3.1–3.5 own no fragment operations.

## 2.9 Mechanics

1. **M1.** `git mv operations-in-fragments merged/fragment-operations` (`proposal.md`, `decisions.md`, `exploration.md`,
   `merge-plan.md`, `reviews/`). Recommended over `merged/fragments/`, which reads as the fragments design itself (that
   is MD sections 2.1–2.6 and `merged/each.md`); the name parallels `merged/operations/`. Links inside change by one
   level: `proposal.md`'s `../machine-design.md` → `../../machine-design.md`, `../merged/operations/decisions.md` →
   `../operations/decisions.md`, `../merge-6-streams/proposal.md` → `../../merge-6-streams/proposal.md`; each
   `reviews/review-*.md`'s `../../machine-design.md` → `../../../machine-design.md`; this plan's `../` links become
   `../../`. `exploration.md` has no relative links (checked).
2. **M2.** Status headers: `proposal.md` "**merged into machine-design.md on <date>; kept as the record behind it.** It
   became 2.9, rules 48–60, C54–C68 and decisions F1–F10. Where this record and the design differ, the design wins (its
   4.2 uses merge 6's first stream syntax; FX17)." One line in `decisions.md`; `exploration.md` "prior art, superseded
   by proposal.md".
3. **M3. Links to fix:** `README.md` (work-order row 4); `machine-design.md`'s section 6 pointer (rewritten by FE77)
   and the new links of FE1, FE52, FE77, FE80, FE81. Text-only mentions left as they are: `delegated-decisions.md`
   line 7, `open-items.md` line 191. History left as it is: `merge-plan-4-5.md`, `merged/operations/merge-plan.md`,
   `reviews/*-check.md`.
4. **M4. README.** Work order: row 4 becomes "operations-in-fragments: merged <date>
   ([merged/fragment-operations/merge-plan.md](merged/fragment-operations/merge-plan.md))", position "done (F10)"; if
   it lands before streams, rows 3 and 4 swap with a note (FX1). "Merges 1, 2, 4, 5, operations and
   operations-in-fragments are merged into it". "Merged proposals" gains "\| [merged/fragment-operations/proposal.md](merged/fragment-operations/proposal.md)
   \| operations in fragments, <date> \| fragments declare and own operations; subject paths on write lanes; release on
   leave (design 2.9, rules 48–60, C54–C68, F1–F10) \|". Merge 6's "Depends on" adds "operations-in-fragments (rules
   48–60 taken; `activities` in a trait body)"; merge 3's adds "operations-in-fragments (fragment Stories,
   `Story.ending` through `Fragment.O`)".
5. **M5. principles.md** (offered, not planned as an edit): a pointer under the starting-points table, "version 2's
   no-I/O starting point is revisited by F1 (operations in fragments)". Only if the main session agrees: it is the
   judging basis, not the design.
6. **M6. open-items.md** gains 20–26, "deferred by operations-in-fragments, <date>": the subject path as phase 2's
   admission rule for node traits and subroutines; one fragment's placements sharing an operation when their paths
   differ (FP RV1 M8); release on user cancel; releasing without interrupting; an age bound on parked endings of a path
   that never returns (FP risk 7); per-copy fan-out of write members (pointer to item 7); delivering `Interrupted` on
   restore to every lookup a persisted incarnation was waiting on (RV3). Item 15 gains one line: the fragments half
   is answered in FP 2.8 (kept: retry budget, keep-busy line; absorbed: release on leave, `resetOn`). Numbering
   continues after streams' 16–19; if merge 6 adds items first, these shift.
7. **M7. delegated-decisions.md** gains one row per resolved conflict (FX1–FX27 by group: the small ones in one row;
   FX6, FX7, FX8, FX13, FX14, FX15 each in its own row, marked "delegated"), with the commit.
8. **M8.** NEXT.md by the main session. `workflow check` only if a Workflow record is touched (none planned). No commit
   until approved; two commits (change sets 1 and 2), each followed by a check.

## 2.10 Rebases owed by unmerged proposals (not edits to MD)

- **Merge 6 (streams):** its new rules become 61–66 if this merge lands first (FX1), with every "rule 48"–"rule 53"
  in its 6.1 and 6.2 rewritten; MD's "M6 rule 44", "M6 rule 47" and "M6 rule 51" (2.7.3, 2.7.10, 2.7.13, 2.7.15) are
  merge 6's own citations and are rewritten by its 6.1 table, not here. It inherits: a placement's owner is a state
  activation **or a trait incarnation** (its rule 51, "Ownership and release"); a freeze releases a session and a
  thaw re-opens it from the fragment's memory (consistent with S4: the position is an `input` field); FE45's, FE52's (rule 52), FE62's
  and C57's *Stream details: merge 6* marks are its to resolve; its rule 8, 13, 14, 20, 37, 47 edits land on top of
  FE23, FE29, FE30, FE34, FE43, FE51.
- **Merge 3 (Stories):** fragment Stories with `fixtures`, `.enter`/`.leave` on traits (rule 58); `Story.ending`
  through `Fragment.O` and the addressing of a fragment's reads (FX18); `checkpoint.evidence` for declines from
  another path, unplaced and releasing lanes; rule 58's ten walks.

## 2.11 Single graph, runtime, static analysis, Stories, CLI

- **One runtime, one graph, one lane space:** kept. Identity is unchanged (F2); the subject path is data on the lane
  record, not a second key. A fragment's operations are nodes under its placement. Nothing breaks. Stated cost: parked
  endings of paths that never return accumulate in a live actor (FP risk 7, open-items).
- **Static analysis:** kept, with stated limits. Summaries carry operations (rule 57), so a host is still checked from
  summaries only, with rule 10's one exception (FX22). Not static, by design: whether a write key belongs to one
  subject (a closure; the runtime decline and Stories catch it); the structural `.each` warning over-approximates (the
  keep-busy line is not a token, so the like's board keeps a warning that does not fail the check). Rule 20's
  placement-dependent requirement needs FX7 to stay checkable. Typing is unspiked (section 7 item 20).
- **Stories:** extended, not broken. One thing becomes load-bearing: "release on leave only for worthless work" is
  guidance that `flow check` cannot read (FP risk 3), so Stories are its only defence; rule 58's walks must exist
  before the guidance is relied on. FX18 waits for merge 3.
- **CLI inspection:** extended. Inspection lists operation path, subject path, unplaced and releasing lanes;
  `flow explain` prints fragment operations; no finding is lost and none is added (FP 2.6). Stated cost: the host's
  graph shows a fragment's I/O states only through its summary (FP risk 6; 4.2's LIVE/OWED/LOST became a memory
  `status`).

## 2.12 The merged design as a whole

Checked across edits, not edit by edit:

1. **Numbering:** rules 1–60, N1–N3; decisions D1–D21, E1–E18, M5-D1–D10, OD1–OD26, F1–F10 (FX2 removes the bare-`F`
   clash); C1–C68 with P and T rows; FP's FO, RV and Q-labels stay in the record.
2. **One receiver per ending:** the binding incarnation (the actor, for a definition's operation); else parked for the
   path (live actor) or the identity's saved record; else evidence by declaration (rule 17's list, two entries
   added). Rules 8, 17, 44, 53 and N3 say the same after FE23, FE33, FE40, FE48.
3. **One timing statement:** lanes change in step 5 (members, then release marks), at admission, or in a Runtime step;
   adoption deliveries are follow-up turns after pending resets (rules 1, 54; 2.5 step 6; FX6 puts the restore reset
   in the same slot).
4. **Four lane words, one meaning each:** unbound (no actor incarnation), unplaced (actor live, no incarnation with
   the path), releasing (a declared mark), `orphaned` (P19, a version change). "Incarnation" is qualified where it
   could mean either level (FX9).
5. **The hold stays the default** (OD6): only a fragment's explicit declaration releases, and only on leave (F9); the
   exceptions to "never silently drops" are stated where the promise is made (FX5).
6. **I/O is never split for one operation:** the declarer is the only actor (rule 50), which answers principles A5's
   concern; hosts read, never act (rule 4).
7. **Persisted format:** the lane record gains path and mark; the slice gains the reset value and freeze-parked read
   endings; the upgrade rule says which old records adopt and which go to `orphaned` (C60–C62).
8. **Every ported example passes the new checks** (2.8); no MD example changes.

## 3. What blocks merging

- **The merge order against streams (FX1)** must be fixed before change set 1: it decides whether these are rules
  48–60 (and merge 6 rebases to 61–66) or 54–66. Under the wider delegation this is the main session's call; the brief
  implies fragments first.
- **Nothing else blocks.** No owner conflict. The small† items (FX6, FX7, FX8, FX13, FX14, FX15) are the main
  session's decisions with recommended resolutions above; FX18 waits for merge 3 and FX17's marks for merge 6. No type
  spike exists (as for the operations merge, a stated risk, section 7 item 20).
