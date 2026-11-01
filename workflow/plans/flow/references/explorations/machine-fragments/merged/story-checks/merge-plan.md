# Merge plan: amended Stories and Fake into machine-design.md

Status: **applied 2026-11-01** (the owner approved the proposal; the `.plan` changes in 2.7 are still owed). Written against
`machine-design.md` at HEAD `8865ab1c` (last changed in `0ca7d93b`, the Stories merge check) and
[stories-amended.md](stories-amended.md) and [fakes-v2.md](fakes-v2.md) as committed there. Method as in
[merged/stories/merge-plan.md](../stories/merge-plan.md) and
[merged/fragment-operations/merge-plan.md](../fragment-operations/merge-plan.md).

Short names: **MD** [machine-design.md](../../machine-design.md); **SA** [stories-amended.md](stories-amended.md);
**F2** [fakes-v2.md](fakes-v2.md); **C1–C5, W1–W43** [decisions.md](decisions.md); **FI**
[reviews/final-integration.md](reviews/final-integration.md); **MDL** [model/RESULTS.md](model/RESULTS.md); **v3**
[merge-6-streams/proposal-v3.md](../../merge-6-streams/proposal-v3.md) (not merged). "Before" quotes are copied from MD by the
script that applies them; "…" only shortens a quote, and the edit replaces the whole sentence, row or block it names.

Marks: **small** (wording, numbering, a superseded clause), **small†** (a behaviour consequence the decisions leave to the
proposal, carried marked [P] or [fakes-v2]), **owner** (behaviour no decision covers). This plan has **no owner row**.
Stream material stays marked ***Stream details: merge 6***.

---

# Part 1: compatibility

## 1.1 What was checked

| Source | Rows | Where it lands |
| --- | --- | --- |
| SA section 2 (rules 11, 61–66) | 7 | AE3, AE6 |
| SA section 3 (2.10 and all subsections, 2.10.17's tables, 2.10.18's examples) | 1 section | AE10 |
| SA section 4 (C rows) | 11 | AE-C69 … AE-C84; "C-new" into C79 (MX2) |
| SA section 7 (3.6) | 2 | AE13, AE14 |
| SA section 8 (other MD lines) | 11 MD rows, 6 outside MD | 1.2 |
| F2 | whole | not merged on its own: it says SA wins, and 2.10.4 has its text (FI section 4) |
| decisions.md C1–C5, W1–W43, "Proposed", "To settle" | 48 + 2 lists | AE26; 1.3 |
| FI findings on SA | L2, L3, section 2 | applied in SA already: `bookmark` with `filled`, "a ping does not register", `bufferSize` cut |
| MD swept with grep for `Story.make`, `Story.records`, `Story.inspection`, `Story.entity`, `Story.attempt`, `Story.now`, `Story.property`, `.expect`, `expect(`, `process()`, `StoryExpectationFailed`, `AmbiguousAttempt`, `Fake/Lost`, `latency`, `Domain.propertySteps`, `run.calls`, `checkpoint.exit`, `story.machine`, `cut.read` | — | every hit outside 2.10 is in 1.2 or 1.5 |

## 1.2 SA section 8, row by row

Anchors were checked against today's MD; all are clean.

| SA row | Target now | State | Edit |
| --- | --- | --- | --- |
| line 650 | rule 21 | clean | AE4 |
| line 999 | rule 58 | clean | AE5 |
| lines 2057–2068 | 2.7.11's example and paragraph | clean | AE7, AE8 |
| line 2628 | 2.8's intro | clean | AE9 |
| lines 5274–5284 | 3.1 `lockout.story.ts` | clean | AE11 |
| lines 5404–5408 | 3.2 `confirm.story.ts` | clean | AE12 |
| line 5759 | C63 | clean | AE16 |
| lines 5908–5910 | section 7 item 17 | clean | AE18 |
| line 5684 | C16 | clean; its predicate clause also cites C2 now | AE15 |
| line 5769 | "For Stories" note | clean; the `process()` sentence moves to 2.7's owed list | AE17 |
| lines 6533, 6535–6536 | T3, T5, T6 | clean; rows stay as history, annotated | AE23–AE25 |
| `open-items.md` 28 | the route table | answered by W16 | M5 |
| `delegated-decisions.md` rows 21, 24; `NEXT.md` 13, 21 | respell | history; not rewritten (MX8) | 2.7 owed; M4 notes `NEXT.md` |
| `references/COVERAGE.md` section 6, Q4 | `@flow-state/vitest`, `storyTest` | outside this merge (MX8) | 2.7 owed |
| `Testing.plan`, `Package.plan`, `Diagnostics.plan`, `FlowState.plan` | C rows | limit: no `.plan` edit | 2.7 owed |

## 1.3 Preconditions (SA 12, FI section 4) and "To settle" (decisions.md)

| Item | State |
| --- | --- |
| Re-run the Stories executor model | **Done**: MDL, final: 77 invariants pass, 92 of 95 mutants killed, all 23 and all 83 modelled cells reached; capped at 200,000 states. On disk uncommitted (MX7). SA's section 6 and 10.6, written before that run, stay as record; AE10 corrects the one sentence in 2.10.17 that says it is not done (MX4) |
| Convert the desk's fakes | **Partial**: `merge-6-streams/trials/desk/` on paper, for the feed, Presence and Assistant only. Not a blocker under the owner's approval; stated in section 7 item 22 (MX6) |
| Owner accepts Stories and Fake spellings | Accepted as a whole, 2026-11-01. W35 stays true of the row: spellings keep their [fakes-v2] marks |
| T5 B3 and `StoryExpectationFailed` go; `run()` still rejects on a real error | SA H15, 2.10.1; AE10, AE-C75 |
| Reads over a whole run | SA H7: a loop over `run.frames` (W25) |
| `toMatchObject` on an `undefined` key; `attempt`'s plain read | SA H2, H4; 2.10.6 |
| Where `expect` was used elsewhere | MD: this plan. Streams: v3 (2.8). Desk and Checkout: 2.7 owed |
| Type check the reads | Against mock signatures only (SA 6); section 7 item 22 |
| Before streams merges | Yes: this merges first |
| decisions.md "Proposed": no `@flow-state/vitest`; `inspection`, `entity` on the checkpoint; `at` stays | Second confirmed by W24; first and third carried from SA as decided by C2–C4's consequence and SA 1.2, recorded as "Also rejected" and [P] |

## 1.4 Conflicts

| # | Conflict | Mark | Resolution (each **proposed**) |
| --- | --- | --- | --- |
| MX1 | **Label clashes.** decisions.md's C1–C5 against MD's C rows; SA's RV1–RV3, MDL and H*n* against MD's section 4 rows H*n* and the record's other reviews | small | In MD: **SC*n*** for decisions.md's C*n*; **SA RV*n***, **SA MDL**, **SA H*n***. W*n* is unique in MD once 2.10 is replaced. SA's bare T*n* in rule 63 and 2.10.2 reads "Stories T*n*", and 2.10's intro says T1–T3 in stream text are v3's. Precedent: the Stories plan's SX2 |
| MX2 | **SA section 4's "C-new"** has no number; v3 and FI put merge 6's new C rows "after C85" | small† | Folded into C79, the row it says it adds to, so C85 stays last and merge 6's numbering holds |
| MX3 | **SA's "section *n*" inside section 3** would read as MD's own sections | small | "section 7" → "3.6"; "Section 10 lists the change to Testing O8" → "C75 lists"; "section 10 flags" → "as W42 amends it"; item 13's and section 11's pointers name the record. `(../merge-6-streams/…)` becomes MD-relative |
| MX4 | **2.10.17's intro says the model "has not been done"**, against MDL's final run | small | Reworded from MDL, with its caps and what it does not model |
| MX5 | **SA's keyword marks in code** (`// existing:`, `// NEW:`, `// RENAMED`, `// CHANGED`) | small | Dropped as earlier merges did; `// user-defined` and citations stay. Prose marks [P], [fakes-v2], W*n* and SC*n* **stay**, because they say what is decided |
| MX6 | **SA 6 and 10's points for an owner's eye** (no Flow code ran; engines; guards; memory) have no place in MD | small† | New section 7 item 22 (AE19). Nothing is reopened |
| MX7 | **Uncommitted work by someone else** in `story-checks/model/`, `merge-6-streams/proposal-v3.md` and `merge-6-streams/trials/` | mechanics | Not staged. `git mv` keeps the model's edits as unstaged changes at the new path. Link fixes reach those files in the index against HEAD and in the working copy, so only the link goes in the commit |
| MX8 | **SA 8's rows outside MD and the plans**: `delegated-decisions.md` is a log, `COVERAGE.md` a separate document, and the brief's limits name neither | small | Listed as owed; history not rewritten |
| MX9 | **What SA 2.10.18.1's "before" keeps** | small | `.expect` and `Story.make` remain only there, in 3.6's Removed row, 2.10's Removed list and in history (change log, OD23, F7, T3, T5, T6, "Also rejected", the fragments' Testing O1 row, which says "replaced by C69") |
| MX10 | **Links the brief did not name**: `merge-6-streams/requirements-v3.md` (a path) and `trials/desk/RESULTS.md` (two links) point into `story-checks/`; `explorations/absorb-wiring.md`, which the brief names, has no such link | small | Fixed the first two; nothing to change in the third (M3) |

## 1.5 Owner conflicts

**None.** W1 reverses T3, C1 reverses T5 B3, W24 respells T6; MD records each on the T row (AE23–AE25). W42, W43 are the owner's own amendments.

---

# Part 2: the change list

## 2.1 Order

Change set 1 is the normative text and change set 2 the examples, applied in one commit, since 2.10's examples are in the one replaced section: AE1–AE6, AE8–AE10, AE13–AE26 and AE-C rows; then AE7, AE11, AE12.

## 2.2 Rule numbering

Rules 1–60 and 61–66 keep their numbers. Rule 63's title becomes "A Story is data; checks are the test's". Merge 6 starts at 67.

## 2.3 The edits

| # | Target | Mark | Before | After | Source |
| --- | --- | --- | --- | --- | --- |
| AE1 | Status paragraph | small | "with no ending injected (2.10, rules 61–66). Streams (merge 6) is not merged yet;" | with no ending injected (2.10, rules 61–66). The amended Stories and Fake design (`[merged/story-checks/stories-amended.md](merged/story-checks/stories-amended.md)`, [merge … expect` (rules 11, 61–66; decisions SC1–SC5, W1–W43). Streams (merge 6) is not merged yet; | SA 12 |
| AE2 | Decision 7's row | small | "C69–C85, decisions Stories T1–T7 \| Testing O1–O4, O6–O9, V1–V9," | C69–C85, decisions Stories T1–T7, amended by SC1–SC5 and W1–W43 \| Testing O1–O9, V1–V9, | SA 4 |
| AE3 | Rule 11 | small | "11. **Tested alone** (Stories T3). `Story.make(fragment, { id, fixtures?, world? })` runs the fragment in an invisible **stand-in host** whose placement its declaration a … ded, are `callback` records and exits are `exit` records, the same as in a host (rule 58)." | 11. **Tested alone** (Stories T3; W1, W5, W30–W34). `Story.fragment(fragment, { id, fixtures?, world? })` runs the fragment in an invisible **stand-in host** whose placem … ded, are `callback` records and exits are `exit` records, the same as in a host (rule 58). | SA 2; W1, W5, W30–W34 |
| AE4 | Rule 21 | small | "visible in Inspection and in `Story.inspection`'s lane listing, the same listing (2.10.7)." | visible in Inspection and in a checkpoint's `inspection` lane listing, the same listing (2.10.7). | SA 8, line 650; W24 |
| AE5 | Rule 58 | small | "58. **Stories** (decided, F7; amended by Stories T2, T3). `Story.make(fragment, { id, fixtures })` (rule 11);" | 58. **Stories** (decided, F7; amended by Stories T2, T3; W1). `Story.fragment(fragment, { id, fixtures })` (rule 11); | SA 8, line 999; W1 |
| AE6 | Rules 61–66, with their heading | small† | "**Stories** (2.10). Rules 61–66 are Stories' (`[merged/stories/proposal-v2.md](merged/stories/proposal-v2.md)`); each names its decisions (Stories T1–T7). Streams (merge 6) … rld by the run it hydrates into. Never by later steps or by the fake author's Effect code." | SA section 2's rules 61–66, verbatim under MX1's labels. Changes: rule 61 gains the drain, the finish phase and its stated limits; rule 62 adds `StoryFakeError`; rule 63 becomes "A Story is data; checks are the test's"; rule 64 says reads are answered from what was captured; rule 65 drops `Story.attempt` for the `attempt` read, adds the `lane` read, and `timer` names Flow's own session sleeps; rule 66 adds "whether a value is right by the test". | SA 2; SC1, W2, W4, W11, W12, W22–W24, T-rows |
| AE7 | 2.7.11, code | small | "const busyThenCharged = Story.make(CheckoutMachine, { id: "checkout/busy-then-charged", input: { intentId: "pi_1" }, fixtures: [StripeFake] }) .world(Stripe.busy({ times: … [{ intentId: "pi_1", key: Story.attempt(O.pay, { n: 1 }) }] })   // the fake's truth, read" | SA section 8's `busyThenCharged` and its test | SA 8, lines 2057–2068 |
| AE8 | 2.7.11, paragraph | small | "A fake server holds the truth, and a Story reads it with `expect(fake, partial)` (2.10.4, 2.10.6)." | A fake server holds the truth, and a test reads it with `cp.read(fake)` (2.10.4, 2.10.6). | SA 8; W23 |
| AE9 | 2.8 intro | small | "Stories read the store with `Story.entity`, and its queues and marks in `Story.inspection` (2.10.8)." | A test reads the store with `cp.entity`, and its queues and marks in `cp.inspection` (2.10.8). | SA 8, line 2628; W24 |
| AE10 | 2.10, whole section | small† | "### 2.10 Stories Stories (merge 3, `[merged/stories/proposal-v2.md](merged/stories/proposal-v2.md)`, revision 3; decisions Stories T1–T7). Rules 61–66 (2.4) are normative;  …  "c7" }, fixtures: [] }) // type error: IssuesApi is missing (LikeButton's R, rule 57) ```" | SA section 3 with the mechanical rules of 2.4 below. Stream material stays marked *Stream details: merge 6* (2.10.3, 2.10.9, 2.10.15, 2.10.18.7) | SA 3, fakes-v2 (through SA 2.10.4) |
| AE11 | 3.1, `lockout.story.ts` | small | "// lockout.story.ts: a fragment alone (rule 11); every step settles (rule 61) const L = Lockout({ limit: 2, length: "1 minute" }); export const locks = Story.make(L, { id … ; // at "locked", s.schedules.timer.done.dueAt is Story.now + 60_000 (cut.read(Story.now))" | SA section 8's `locksThenClears` and its test | SA 8, lines 5274–5284 |
| AE12 | 3.2, `confirm.story.ts` | small | "// confirm.story.ts: a subroutine alone (rule 11) export const confirmYes = Story.make(Confirm, { id: "confirm/yes" }) .enter() .send(Confirm.E.Yes()) .expect(Story.recor …  payload: {} }]); // .leave() instead abandons it: no exit record, and read() is undefined" | SA 2.10.18.5's `confirmYes` and its test; the `.leave()` comment stays | SA 8, lines 5404–5408; SA 2.10.18.5 |
| AE13 | 3.6, New, Stories | small | "\| **New, Stories** \| (rules 61–66, 2.10; common) `Story.make` with the `world` option, `send`, `advance` (settles at every deadline; `{ next: address }`), `checkpoint`, ` … nter`, `leave`, `setContext`, `dehydrate`, `hydrate`. The address is a shape, not a word \|" | SA section 7's row | SA 7 |
| AE14 | 3.6, Removed | small | "\| **Removed** (Stories merge) \| `story.app`, `story.machine` (renamed `Story.make`), `process()`, `advanceTo`, `advanceToNextTimer`, the `frames` option and frame collaps … ry.ending` (never adopted), `model` and Testing O5 (T1), Testing O4's `pending` for work \|" | SA section 7's row | SA 7 |
| AE15 | C16 | small | "truth is read with `expect(fake, partial)`, with no checkpoint predicate (Stories T4);" | truth is read with `cp.read(fake)`, with no checkpoint predicate (SC2); | SA 8, line 5684 |
| AE16 | C63 | small | "\| C63 \| Testing O1 \| `Story.make(fragment, { id, fixtures })`;" | \| C63 \| Testing O1 \| `Story.fragment(fragment, { id, fixtures })`; | SA 8, line 5759 |
| AE17 | "For Stories" note | small | "The Stories merge (`[merged/stories/proposal-v2.md](merged/stories/proposal-v2.md)`, section 6.2). playback.md follows Testing O4 and O9; its one stale sentence (`minDwell`'s "frames from one `process()`") is the plan's (M10)." | The Stories merge (`[merged/stories/proposal-v2.md](merged/stories/proposal-v2.md)`, section 6.2), amended (`[merged/story-checks/stories-amended.md](merged/story-checks/stories-amended.md)` section 4): **all proposed**, following the decisions cited. playback.md follows Testing O4 and O9. | SA 8, line 5769; SA 4 |
| AE-C69 | C69 | small | "\| C69 \| Testing (title), O1 \| Title "…checkpoints, models and property tests" → "…checkpoints and property tests". `Story.make(subject, options)` over an app setup, a mac … nique across the configuration"; replaces the fragments' Testing O1 row and C63's syntax \|" | SA section 4's row | SA 4 |
| AE-C70 | C70 | small† | "\| C70 \| Testing O2 \| Every step settles on a microtask-only run scheduler (`executionMode: "sync"`): no host task runs during a settle, which ends once Flow's queue and t … s currently eligible work…" and "These commands make work eligible without draining it…" \|" | SA section 4's row | SA 4 |
| AE-C71 | C71 | small | "\| C71 \| Testing O3 \| Fixtures are client halves; `Fake.server` (run-scoped truth, endpoints, controls, the wire words `hold`, `release`, `drop`, `duplicate`); provenance  … tcomes directly" **kept** (rules 62, 66; Stories T2, T5 B2) \| Adds to O3; supersedes C16 \|" | SA section 4's row | SA 4 |
| AE-C72 | C72 | small | "\| C72 \| Testing O4 \| A frame after every committed publication; a step per command, each with its step cut; frames never collapse; `checkpoint.actor(ref)` → `frame.read(r … pse into one" (amends the accepted playback contract, Stories T5 B4); answers C27's note \|" | SA section 4's row | SA 4 |
| AE-C73 | C73 | small | "\| C73 \| Testing O6 \| `propertyTest(story, { steps, properties, seed, runs?, length?, quietWithin? })`; invalid generated steps are skipped and left out of emitted Stories … ps; the domain form is a preset (Stories T5 B5; 2.10.16) \| Replaces O6's generator shape \|" | SA section 4's row | SA 4 |
| AE-C75 | C75 | small† | "\| C75 \| Testing O8 \| Errors `StoryExpectationFailed`, `StoryInvalidCommand` (`ActorAbsent`, `AlreadyEntered`, `NotEntered`, `TabOpen`, `TabClosed`, `NothingHeld`, `NoDeadline`), `HostTimeWait`, `FramesTruncated`, `AmbiguousAttempt` (2.10.2, 2.10.6) \| Adds \|" | SA section 4's row | SA 4 |
| AE-C77 | C77 | small | "\| C77 \| Testing O5, V1–V9 \| O5 and V5 removed (T1); V3 proves rule 61 and the instant order; V4 proves publication frames and steps \| Applies T1 \|" | SA section 4's row | SA 4 |
| AE-C81 | C81 | small | "\| C81 \| CommandLine O2, O5, O6 \| `describe` prints subject, options, steps, checkpoints, expectations, properties and every fake reached; coverage by cells, handlers (cur … nge (2.10.12); top-level Stories in `defineConfig` (`appId: null`) (2.10.14) \| Amends T2 \|" | SA section 4's row | SA 4 |
| AE-C82 | C82 | small | "\| C82 \| Package O1 \| `flow-state/testing` exports `Story`, `Fake`, `propertyTest`, `StoryFrame`, `StoryPlayer`, `definePresentation`; `story` and `model` removed (T1); `flow-state/internal/testing` (not public) exports `disposeRuntime` for Flow's suite \| Amends Package O1 \|" | SA section 4's row | SA 4 |
| AE-C84 | C84 | small | "\| C84 \| EntityDomains O2, O4 \| `Entity.queue` removals are `queue` records with their reason (`Superseded`, `Cancelled`, `Released`; an `Overloaded` write never joined an … nd Inconclusive rules \| Resolves C30's deferred half and delegated-decisions row 3 (K11) \|" | SA section 4's row | SA 4 |
| AE-C74 | C74 | small | "`dehydrate` moves time as `advance` does (2.10.10, 2.10.11) \| Adds \|" | `dehydrate` moves time as `advance` does (2.10.10, 2.10.11); the default tab is `"main"` \| Adds \| | SA 4's intro |
| AE-C79 | C79 | small† | "every event gains the run-wide sequence and `tab: { name, open }` (2.10.6) \| Adds \|" | every event gains the run-wide sequence and `tab: { name, open }`; the `delivery` kind [fakes-v2]; `records` takes 21 kinds (2.10.6); the diagnostic `UnusedWireRule` (2.10.4) \| Adds \| | SA 4's C-new; MX2 |
| AE18 | Section 7, item 17 | small | "**Closed (Stories merge):** `Story.entity` reads `{ data, predicted, uncertain, unconfirmed }` (C72); removals are `queue` records (C84); settlement frames are named with … rder are reached by holds and sends; held lanes are in `Story.inspection` (2.10.6–2.10.8)." | **Closed (Stories merge):** `cp.entity` reads `{ data, predicted, uncertain, unconfirmed }` (C72); removals are `queue` records (C84); settlement frames are named with `checkpoint(…, { at })`; `Overloaded` and queue order are reached by holds and sends; held lanes are in `cp.inspection` (2.10.6–2.10.8). | SA 8, lines 5908–5910 |
| AE19 | Section 7, new item 22 | small† | "cancel's capture so the restore sees the cancel (the Stories record's Q15, option B). " | cancel's capture so the restore sees the cancel (the Stories record's Q15, option B). 22. **Amended Stories, what is unproven** (proposed, 2026-11-01). No Flow code ran:  …  timeout passes (rule 61's limits). `inspection` and frame memory is unmeasured (2.10.6).  | SA 6, SA 10; MX6 |
| AE20 | Change log | small | "resolved. Streams (merge 6) is not merged: its rules renumber from 67, and Stories' stream parts are marked *Stream details: merge 6*. " | resolved. Streams (merge 6) is not merged: its rules renumber from 67, and Stories' stream parts are marked *Stream details: merge 6*. - Stories, amended, merged on 2026- … The `.plan` files are still owed (the plan's 2.7). Streams (merge 6) is still not merged.  | SA 12 |
| AE21 | Decisions intro | small | "operations-in-fragments' F1–F10 and Stories' T1–T7 (cited "Stories T*n*"; a bare T*n* is a tooling row of section 5), which" | operations-in-fragments' F1–F10, Stories' T1–T7 (cited "Stories T*n*"; a bare T*n* is a tooling row of section 5) and amended Stories' SC1–SC5 and W1–W43, which | MX1 |
| AE22 | F7 | small | "*Amended by Stories T3 (delegated, big): `Story.make(fragment)` with `enter`, `leave`, `guards`, `reset`.*" | *Amended by Stories T3 (delegated, big): `Story.make(fragment)` with `enter`, `leave`, `guards`, `reset`; respelled `Story.fragment(fragment)` by W1, and W5, W31–W33 confirm the steps.* | W1 |
| AE23 | T3 | small | "*Delegated, big* (B6: `story.app` and `story.machine` renamed). (2026-10-31)" | *Delegated, big* (B6: `story.app` and `story.machine` renamed). (2026-10-31) *Reversed by W1: `Story.app`, `Story.machine`, `Story.fragment`.* | SA 8, line 6533 |
| AE24 | T5 | small | "B5 (`propertyTest` takes any Story). *Delegated, big.* (2026-10-31)" | B5 (`propertyTest` takes any Story). *Delegated, big.* (2026-10-31) *B3 reversed by SC1; B1 confirmed by W2, B2 by W11, B4 by W22, B5 by W38.* | SA 8, line 6535 |
| AE25 | T6 | small | "`together({ advance: d })`. *Delegated, big.* (2026-10-31)" | `together({ advance: d })`. *Delegated, big.* (2026-10-31) *`Story.attempt` became the `attempt` read on a checkpoint (W24); the rest confirmed by W6, W7, W10, W13, W26.* | SA 8, line 6536 |
| AE26 | Decisions, new subsection at the end of the file | small | "**an app-shipped awaiting adapter** (it would test Flow's adapter, not the app). " | "### Stories, amended": SC1–SC5 and W1–W43 verbatim, each marked owner-confirmed; then a "Proposed" block for [P] and [fakes-v2] and for this merge's resolutions; then "Also rejected" | decisions.md; SA 1.2 |


## 2.4 AE10's mechanical rules

From SA lines "### 2.10 Stories" to the line before "## 4.": (a) MX1's labels; (b) MX3's pointers; (c) MX4's sentence;
(d) MX5's code marks, and "(RENAMED from `Story.World`)" and the examples' "Marks in this section" sentence go; (e) "the merged
table" → "the Stories merge's table", and 2.10.18.1's "Before (the merged design…)" → "Before (the Stories merge of 2026-10-31…)";
(f) a new intro: provenance, then what SC*n*, W*n*, [P], [fakes-v2], T*n*, SA and v3 mean. Nothing else changes. Headings and
numbers stay, so every MD cross-reference into 2.10 holds; 2.10.18.7 (chat) is new and marked *Stream details: merge 6*.

## 2.5 Unchanged and safe

Every rule but 11, 21, 58 and 61–66; the write-lane tables; 2.9. C74, C76, C78, C80, C83 and C85 keep their text, but for
C74's default tab; their words were already free of `Story.*`. Rule 17's sentence and item 21 stand. T1 and T2 stand.

## 2.6 Mechanics

1. **M1.** `git mv story-checks merged/story-checks`, with its model, reviews and this plan. Untracked and modified files move with the folder and stay unstaged (MX7).
2. **M2.** Inside the record, relative links gain one level: `../revisit.md` → `../../revisit.md`, `../merge-6-streams/` → `../../merge-6-streams/`, `../machine-design.md` → `../../machine-design.md`; `../merged/x` → `../x`; `../../../../Testing.plan` → one more `../`; `../../../dispatch-desk/` likewise. Status headers: SA and F2 "merged 2026-11-01; kept as the record; where they differ from the design, the design wins"; decisions.md "included"; fakes.md and its review unchanged. This plan's status becomes "applied".
3. **M3. Inbound links.** `merge-6-streams/proposal-v3.md` lines 1216 and 1280; `merge-6-streams/requirements-v3.md` line 28; `merge-6-streams/trials/desk/RESULTS.md` lines 4–5. Nothing else in them changes. `explorations/absorb-wiring.md` has no link (MX10).
4. **M4.** `README.md`: work order row for the amended Stories; merged table row; the paragraph on `story-checks/`; the `merged/stories/model` spike row gains the new model. `NEXT.md`: note what is done. `revisit.md`: the three links, plus SA section 9's deferred items, as "when accepted" says. 
5. **M5.** `open-items.md` 28 closed by W16, in one line.
6. **M6.** No `.plan`, `packages/flow-state-rewrite` or `packages/flow-state` edit. Three commits: this plan; MD; the record. `.claude/launch.json` stays out.

## 2.7 Still owed (not done here)

| Target | What | Row |
| --- | --- | --- |
| `Testing.plan` | Title, O1, O2, O3, O4, O5 and V5 removed, O6, O7, O8 (cancellation goes), O9, V1, V3, V4, V6, V8 | C69–C77 |
| `Package.plan` O1 | Exports; `story`, `model` removed; no test-runner adapter | C82 |
| `Diagnostics.plan` | Error names | C83 |
| `Inspection.plan` O1, O4, O5 | `work`, `incarnations`, `binding`; kinds with `delivery`; digests | C78–C80 |
| `CommandLine.plan` O2, O5, O6 | `describe`, `flow story run`, coverage | C81, T2 |
| `EntityDomains.plan` O2, O4 | `queue` removals; `domainPropertyOptions` | C84 |
| `Persistence.plan` O7 | The capture's order | C85 |
| `FlowState.plan` lines 19, 45, 93 | "models", "`@plan.Testing.V2 to V5`" | C77 |
| `playback.md` | `minDwell`'s "frames from one `process()`" → "from one step" | earlier M10 |
| `references/COVERAGE.md` section 6, Q4 | `@flow-state/vitest`, `storyTest` go | SA 8 |
| `delegated-decisions.md` rows 21, 24 | A pointer to W1, W24, if wanted; history otherwise | SA 8 |
| The desk and Checkout | Convert: `Story.machine`, `.checkpoint`, `*.test.ts`, object results, 74 Story names (SA 5's traps) | SA 5 |
| Agent docs | `flow story run` no longer answers "did it pass" | SA 5 |

## 2.8 Owed by merge 6 (not edits to MD)

- SA section 11, all of it; FI M3's table with **today's anchors shifted**: v3 lists MD lines from before this merge, and 2.10 is about 1,180 lines longer, so its anchors after 2.10 move.
- Then remove the *Stream details: merge 6* marks (2.10.3, 2.10.9, 2.10.15, 2.10.18.7) and take SA section 11's table out.
- If the owner falls back to trimmed v2, 2.10.9 needs revising (SA 12 item 5).

## 2.9 Single graph, runtime, static analysis, Stories, CLI

- **One runtime:** kept, with `model()` gone (W39). **Static analysis:** kept; no warning read expectations (SA 5).
- **Stories:** the plan loses its checks and gains checkpoints; tests hold them (C1). **CLI:** `describe` loses two lines and `flow story run` reports what ran (W40).

## 3. What blocks merging

Nothing. Open and unproven items are in section 7 item 22; plan changes are owed (2.7).
