# Round 3 review: principles, prior art, simplicity, coverage

This review checks each proposal's round-2 must-fixes ([round2-principles.md](round2-principles.md))
and no-loss drops ([round2-simplicity.md](round2-simplicity.md)) against the revised text.
Line numbers (Lnn) refer to the revised proposal. Keywords and rules are recounted with the round-2
method: new spellings, and normative statements an author must know. The seventh proposal
(opus-trait-routine-actor) is not reviewed here.

Status words: **done**, **partly**, **rejected** (my verdict on the reason follows), **not applied**.

## Summary of counts

| Proposal | Keywords, round 2 → 3 | Rules, round 2 → 3 | Notes |
| --- | --- | --- | --- |
| sonnet-single | ~33 → ~32 | ~25 → ~33 | Checks fell from 26 to 17. The proposal's "14 rules" counts bundles. |
| opus-single | ~30 → ~30 | ~30 → ~33 | `notSent`, `uncertain`, `broken`, `.lookup`, `"pending"` and `.raise` consumed the drops. |
| codex-single | ~34 → ~41 (29 authoring) | ~65 → ~53 statements (~100 clauses) | 28 numbered rows; observer tags and roles added. |
| sonnet-split | ~33 → ~37 | ~25 → ~27 | Typed `abandoned` outcomes added 7 values. |
| opus-split | ~25 → ~27 | ~36 → ~43 | The claimed ~22 / ~29 are counting artefacts. |
| codex-split | ~36 → ~37 | ~60 → ~55 claimed (~85-100 clauses) | One numbered list now (R1-R16), with about 12 rules still outside it. |

Every proposal applied most no-loss drops, and every proposal's count still stayed flat or rose.
The round-2 correctness fixes (`pending` facts, `notSent`/`uncertain` splits, terminal totality,
projection defects, reconcile flows) cost more than the drops saved. The drops worked; the
correctness surface grew.

---

## 1. sonnet-single-fragment.md

### Round 2 must-fix

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Total `abandoned`, parts in steps | **done** | Rule 13 (L951-962) handles all six kinds and covers parts in steps. `pending` is typed with an `outcome` it does not yet have (L954). |
| 2 | One outstanding call vs Poll; commit key | **done** | Poll has WAITING/REFRESHING (L574-588); keys are in the request (L417, L716). |
| 3 | Terminal totality; projection defects | **partly** | Raise is allowed only from public-event handlers, and terminal handlers must be total (rule 11, L916, L930). That is simpler than codex-split's rule. Outcome-mapper defects deliver `Defected` (L949). A pre-commit defect (a throwing select or exit mapper) in a terminal turn still loses the delivery; the T1 row (L1042) overclaims. |
| 4 | One snapshot rule; `"self"` | **done** | Rule 4 (L890-896) and the rule 10 table (L927). `start` reading fresh `initial` memory is an unmentioned third read, and L894's "the one amendment to O3" is contradicted by L1124-1128. |
| 5 | Fragment-declared senders | **done** | `expose`, `accepts` and `unrefusable` are gone; the three lists are in rule 7. |

**No-loss drops.**
- Applied: `ignore`, the fragment-side `.send`/`R`, `start` as a shape trigger, rules 3 and 9, one
  `story.fragment`, the totality rule, raise only into `hostEvents`.
- Not applied:
  - One optional form: `fallback` and `{}` both remain.
  - Implied empty declarations: the reason given (L1218) is wrong, because Poll declares `states`.
  - Two constructor names: rejected; the brief requires single.

### Remaining issues

- **Major.**
  1. §4.4 maps `NotFound: R.Done` (L495), a failure tag onto a success result, which its own rule 12
     (L936) calls a type error. Verified.
  2. Check 8 ("results handled only in states other than where sent") fails both flagship examples
     as worded (CommitWithRetry, Poll). It must mean the sending transition's target leaf.
  3. A pre-commit defect in a terminal turn loses the delivery (above).
  4. Plan conflicts not listed:
     - read fencing against Operations O2;
     - a failed acknowledgment answered `NotSent`, against O3's `interrupt`;
     - never-invoked restore under Persistence O6;
     - `check` reporting "host first" and the Unhandled verdict, against Machines O4.
- **Minor.**
  - AutoSave drops the Attempt after `Unknown`, citing idempotent overwrite (L650). Unsound: an older
    uncertain write can land after a newer one.
  - The Story trace with `LockedTwiceThenOk` reaches `Done`, not `GaveUp`.
  - `abandoned.pending` overloads Operations' lane `pending`.
  - Two spellings per outcome (`Interrupted` vs `"interrupt"`).
  - The contract table's part input source is wrong for parts nested in steps.

---

## 2. opus-single-fragment.md

### Round 2 must-fix

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Restore against Persistence O6 | **done** | Rule 19 (L1111-1113): acknowledged → `uncertain`, else `notSent`, reads `broken`. One residue: a StorageFailure `interrupt` (adapter certainly did not run) goes to `uncertain`. |
| 2 | Request kind; amendments listed | **done, except O4** | `.commit` / `.lookup` (rule 17). §7 lists the O2 required members, the abandoned turn source, mappers and `PreviousCallUnsettled`. Machines O4 is missing. |
| 3 | Projection defects; total deliveries | **partly** | Mappers → `uncertain`/`broken` (L1112); rule 15 adds totality. Select defects still reject terminal turns (L1116), and rule 22 contradicts rule 15 (below). |
| 4 | Nested step defaults; Story `hostEvents` | **done** | Rule 4 (L1043), check 7, `.raise` (L932). |
| 5 | One `.reply` form | **done** | L933-935. |

### Rejections

- **`"self"` as a state change** (L1372: "this proposal has none"). Unsound. Always-there callbacks
  may target (rule 9), and handlers fuse (rule 12), so the rule for combining targets is still
  missing.
- **Fixtures** (L1371: "a binding plus a Layer per Story"). Weak. It keeps a Testing O3/O5
  amendment for a small saving. It also lets Stories inject runtime-only kinds (`notSent`,
  `uncertain`), so the runtime's classification of outcomes is never exercised.

**No-loss drops.**
- Applied: one `.reply` form, raise only into `hostEvents`, collapsed type-mirror checks,
  `payload` → `event`, one Story, one abandoned handler, one callback rule, one optional form, one
  totality rule.
- Not applied:
  - Implied empty declarations: sound, because the kind is derived from them.
  - Two names: the brief requires single.

### Remaining issues

- **Major.**
  1. **Rule 15 contradicts rule 22.** A reply or exit that enters a placement with an unsettled call
     declines with `PreviousCallUnsettled` (L1126). The reply is consumed and nothing publishes
     (TicketEditor L536, Checkout L823). Verified.
  2. Select defects in terminal turns are lost.
  3. Fused targets are undefined (above).
  4. Check 4 (H5) does not catch TicketEditor's Uncertain → Dismiss → Delete → new commit path. Either
     the example fails the check, or "prevents" overclaims.
  5. Machines O4: `check` must see the pending-call state that rule 22 declines on.
  6. The Testing O3/O5 conflict is kept.
- **Minor.**
  - The untagged `failure` form vs "every failure tag".
  - Checkout's `unsettled` is dead code.
  - `props` still has three roles.
  - The `E` of a fragment value is undefined (L999).

---

## 3. codex-single-fragment.md

### Round 2 must-fix

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Terminal totality | **partly** | R14 and §3.2 make every reply, exit and timer chain total (L1428, L1484). The examples comply. But a request-admission defect, or a Pending-observer defect, still rejects a terminal turn (L1478, L1568). |
| 2 | Callbacks out of `actions` | **done** | `notify` (L55, R11); amendment listed (L1809). |
| 3 | One snapshot rule | **done** | Transition `input` is the only staged read (R8/R9). |
| 4 | Cut vocabulary | **partly** | One exit spelling and one meaning for `input`. The count rose to ~41. `.from` keeps two signatures (L471 vs L660, against L86); `payload` has three shapes. |
| 5 | Live props and `lookup` shown | **done** | Poll (L796-880). |

### Rejections

- **Two constructor names** (L1917: the brief assigns a single shape). Sound under the brief.
- **Optional guard; omitting impossible replies** (correctness veto). Sound.

**No-loss drops.**
- Applied: `notify`, one exit spelling, one Story namespace, one callback rule, raise only into
  `hostEvents`, one optional form, one totality rule, implied empty declarations.
- The "one observer per operation" drop saved no lines: about 37 observer lines are copied word for
  word into both hosts (L590-626, L1213-1249), with three ledgers.

### Remaining issues

- **Major.**
  1. The totality hole via admission and observer defects (above).
  2. Vocabulary at ~41, against the must-fix.
  3. Abandoned bookkeeping is still heavy and duplicated per host.
  4. Story fixtures are never shown producing `unknown`, `notSent` or a projection defect.
     Precedence between `services` and `fixtures` is undefined (L1667).
- **Minor.**
  - "Self is not a state change" sits outside the rule list (L1474).
  - The `reject` scope differs between L82 and R16.
  - O2's optional members and O5's new `props` selector parameter are not listed as amendments.
  - An observer may start a request.
  - "start runs before the publication" wording (L428).

---

## 4. sonnet-split.md

### Round 2 must-fix

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Testing amendment or fixtures | **partly** | Scripted replies are now a "scripted adapter fixture" (L973-977), and a Testing O3 change is still listed (L1149). A service function cannot produce the `"unknown"` and `"defect"` script items, so this is injection under a new name. |
| 2 | Descriptor concurrency | **done** | `reject`/`allow` are construction errors; a second call rejects the turn; both listed (L1147). |
| 3 | Success, class grouping, projection defects, totality | **partly** | Success is required, and brands and grouping are in place. The `failure` member itself can still be omitted, which strands the fragment under O2. A select throw → `NotSent` (L89, L115) contradicts Machines O3 (the turn is rejected pre-commit, so no call exists). A write throw → `Defect` contradicts Operations O3. Neither is listed. |
| 4 | Typed `abandoned`; all departures | **done for one level** | Rule 13, L117-124. Nested request-bearing subroutines are undefined: there is no relay, yet "enclosing exit" coverage is claimed. |
| 5 | `request.read` shown or cut | **done** | Poll (L297-344). |

**No-loss drops.**
- Applied:
  - one `story.fragment`;
  - `optional` removed entirely (sound);
  - "bare only when payload-free";
  - advice rules dropped;
  - `NotSent` + `Cancelled` merged into `Unapplied`;
  - implied empty declarations;
  - one abandoned shape.
- Rule 7 still restates check 7.
- Rejected: `contract` kept (defensible).

### Remaining issues

- **Major.**
  1. The select-defect handling conflicts with Machines O3 and is unlisted.
  2. Nested request subroutines are undefined.
  3. The `failure` member can be omitted.
  4. Rule 10 is enforced only for `also`, not for guards on terminal handlers.
  5. The Testing claim contradicts itself (L973 vs L1149).
- **Minor.**
  - The examples' `abandoned` patterns are wrong, though no path reaches them today. Checkout drops
    a late success and dead-ends; TicketEditor discards an uncertain Attempt.
  - "An older write cannot land last" (L1072) is false under `cancel`.
  - H5 "prevents" holds only in the example.
  - D7's "declared draft" has no syntax.

---

## 5. opus-split.md

### Round 2 must-fix

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `"self"`; a trait callback that targets | **done** | Rule 10 (L167) and check 5; `onHeld` → WIPING (L1344). The rule 6 wording ("`self` is not a target") and the E3 row (L1495) contradict rule 6's allowance. |
| 2 | `live` rule and example; one select rule | **done** | Rules 7 and 9; Poll (L418, L794); every select reads only `payload` (L129). The round-1 log (L1706) is stale. |
| 3 | Admission input; relay `abandoned`; double order | **done** | Rule 2 (L101); the binder owns a relay's `abandoned` (L154, L1244); the exit-to-exit form is defined (L115). The original Cancel double-order path is closed (traced). Rule 2 conflates admission with a default path entered by a transition. |
| 4 | Projection defects; totality | **totality done, defects partly** | Rule 10 and check 4 cover replies, exits and timers. "Delivers `defect` without calling another mapper" (L136) is ill-defined, because every fragment `defect` mapping is itself a `.from` mapper. |
| 5 | Amendments; fixtures | **partly / done** | Fixtures adopted (L1410-1419). Restoring a never-invoked commit as `notSent` is missing from the Persistence O6 row. Mapper-throw → `defect` is filed under Operations O2 instead of Machines O3. |

### Rejections

- **Per-edge entry input** (L1837: "one canonical place … D6 prevented by construction"). Sound, but
  debatable: the cost is the staged-read exception to Machines O3.
- **Forbidding `reject`.** Sound.

**No-loss drops.** All proposal-specific drops are applied, plus shared drops 1-7. Implied empty
declarations are practised but never stated (DangerZone keeps `events: {}`).

### Remaining issues

- **Major.**
  1. **A new double-order path through `defect`.** CommitWithRetry maps `defect` to `Rejected`
     (L376). Checkout maps `Rejected` back to REVIEW (L1067), from which a new PLACING can send again.
     A post-invocation adapter defect, or a success-mapper throw now converted to `defect`, can follow
     an order that was actually placed. The file itself groups `defect` with `unknown`/`interrupt`
     elsewhere (L983, L1057). Fix: for commits, `defect` carries the Attempt and routes like
     `unknown`. Verified.
  2. Projection-defect delivery is undefined when the `defect` mapper itself throws.
  3. Unlisted:
     - never-invoked restore → `notSent` (Persistence O6);
     - the mapper-throw amendment against O3;
     - read `reject` or pre-invocation cancel. Reads have no `notSent`, so Poll's REFRESHING could wait
       forever.
- **Minor.**
  - The E3 row and the rule 6 wording.
  - The AddressStep trait input reads `({ input })`, while the port table gives `{ memory, context,
    event }`.
  - Poll's single `failure` token vs "each tag".
  - TicketList's single-slot `late` can be overwritten.
  - Stale round-1 log lines; cut 1 cites a nonexistent AutoSave.

---

## 6. codex-split.md

### Round 2 must-fix

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `story.fragment` binds guards, props, trait input | **done** | L1326-1345; RequiredField refused alone (L1374-1382). The helper auto-fills required callbacks (L1339), so Story is more lenient than production. |
| 2 | One request-binding shape | **done, with one residue** | One shape (L68-76, L1388). `abandoned?` is optional in Story and required in production (L1333). |
| 3 | List abandoned amendments | **done** | L1571, L1574. |
| 4 | One numbered list; less vocabulary | **partly** | R1-R16 (L987-1048). About 12 normative clauses remain outside it, and vocabulary rose (~37), with new capitalised tags `Success`, `Failure`, `Unknown`, `Interrupt`, `Defect` beside the lowercase outcome names. |
| 5 | Implied `start` and empty records | **done** | L94-96, R1; no `events: {}` or `exits: {}` remains. |

**Shared gaps.**
- Done:
  - totality, including timers (R9, L1127);
  - `"self"` (L1017);
  - keys in requests (L1180);
  - fixtures with no injection.
- Partly:
  - `check` throws a `FlowError` on mapper defects (L1151, verified), against Machines O4 (only
    `GuardDefect`). The O4 row omits the throw.
  - The new-scope `start` read and the mapper→`defect` closure are missing from the O3 row.

**No-loss drops.** All applied. Residues: a second totality statement (R12, L1197) and per-kind
callback prose (L530, L1087).

### Remaining issues

- **Major.**
  1. The `FlowError`-from-`check` amendment is unlisted.
  2. The example reopens the projection-defect gap. RenameHost's RECONCILING uses an ordinary
     operation (L679-690) with no Leave and no timeout, so a throwing mapper or a hung adapter strands
     it. D4 "prevents" should be scoped to request ports.
  3. The vocabulary rose against the must-fix. The six capitalised tags duplicate the outcome names;
     "Pending or an outcome value" would avoid them.
- **Minor.**
  - Story leniency (`abandoned?`, auto-bound callbacks).
  - `input` has four roles.
  - The §4 prose is still outside plan vocabulary.
  - The status line says "round 2".
  - The ~55 rule count is not reproducible.
  - Debounce's LOCKED → LOCKED callback: self or re-entry?

---

## 7. Shared issues still open

1. **Pre-commit defects in terminal turns.** A throwing select, admission check or observer inside a
   reply, exit or timer turn rejects the turn (Machines O3) and loses the delivery.
   - Every proposal has this in some form. codex-single and codex-split close the mapper case only.
   - A fixed-continuation rule would add more machinery. The simpler, honest answer: a defect in pure
     code is a bug, publishes an issue, leaves the step in place, and the host can always leave it
     (L4). Each proposal should state that, and stop claiming "no terminal delivery is lost".
2. **`defect` on a commit is uncertainty.** After invocation, a `defect` (or a success-mapper throw
   converted to `defect`) can follow a real write. It must carry the Attempt and route like
   `unknown`. opus-split's Checkout shows the double order this prevents; check the others.
3. **Unlisted amendments.** Each proposal still misses one or two:
   - Persistence O6 for `notSent`;
   - Machines O4 for `check` reading pending state or evaluating mappers;
   - Operations O2 optional members;
   - read fencing.

   A single shared amendment list, written once, would end this.
4. **Read requests under `reject` and pre-invocation cancel** have no answer in opus-split and
   sonnet-single.
5. **Vocabulary keeps growing.** Every fix adds a tag, a reserved name or a ledger field.

---

## 8. Final ranking

| Rank | Proposal | Why |
| --- | --- | --- |
| 1 | **opus-split** | Two constructors and three sender lists. Fewest keywords (~27) and 11 numbered rules. Totality, `"self"`, live values and payload-only selects are all settled. Fixtures and no injection. Majors are local: `defect` routing, defect-mapper recursion, three unlisted amendments. |
| 2 | **codex-split** | Most complete correctness: abandoned `pending`, projection defects, outcome-class brands, fixtures, no subroutine defaults. Its cost is size (~37 words, ~85-100 rule clauses) and an unlisted O4 amendment. |
| 3 | opus-single | Close to opus-split in semantics, but rule 15 contradicts rule 22, test injection is kept, and fused targets are undefined. |
| 4 | codex-single | Correct in most places, but the largest vocabulary (~41), heavy duplicated observers, and a totality hole via admission. |
| 5 | sonnet-split | Select-defect handling against O3, nested requests undefined, and test injection under another name. |
| 6 | sonnet-single | Its flagship example breaks its own rule (`NotFound: R.Done`), check 8 fails its own examples, and four amendments are unlisted. |

Since round 2, opus-split has overtaken codex-split. It closed the correctness gaps I named, while
codex-split could not shrink. Correctness ranks first, and their correctness is now close; the
remaining opus-split majors are one routing rule and two amendment rows.

## 9. Recommended basis

**Use opus-split as the basis.** It should borrow:

1. **From codex-split:**
   - `defect` as a fixed, payload-free reply that needs no mapper. This removes the defect-mapper
     recursion (§5 major 2).
   - The rule that a commit's `defect` carries the Attempt and is grouped with uncertainty.
   - No subroutine on any default path, instead of opus-split's admission/default conflation.
2. **From codex-single:** `notify` (callbacks out of `actions`). Trait callbacks may now target, so a
   callback in `actions` is a same-turn transition hidden in the finite-work list (Machines O3).
3. **From opus-single:** the one-sentence rule "a callback never leaves its node; an exit must". It
   replaces the rule 6 and E3 wordings that contradict each other.
4. **Shared:**
   - one written plan-amendment list;
   - the honest pre-commit-defect statement (§7 item 1);
   - read requests answered `interrupt` under `reject` and pre-invocation cancel.

Two choices are left to the user, not to another round:

- **Entry input per placement** (opus-split, with a staged-read exception) **or per edge**
  (`S.X.call.from`). The principles lean per edge (no O3 exception, exact payload types), but
  opus-split's single canonical place is a sound counter-argument.
- **`start` as actions** (opus-split) **or as a transition** (codex-split, for composites that call an
  input-bearing first child). Choose actions unless composite steps are kept (see cut 7).

## 10. Is single vs split settled?

**Yes, in substance.** All six enforce two kinds by type:

- The three single proposals derive the kind (sonnet-single, opus-single) or declare it (codex-single
  `kind`).
- Each concedes it is "the split under one name" (opus-single L32, sonnet-single L35, codex-single
  L36).
- None keeps the "may be either" placement.

What remains is spelling. One word with a derived kind costs principle 2 (a reader cannot tell the
lifetime from the constructor) and a derivation rule. Two names cost one extra word. The principles
favour **two names, `trait` and `subroutine`**. Record it as decided, unless the user prefers one
word for its own sake.

## 11. Consolidated feature cuts for the user

These are deduplicated across all six "Possible cuts" sections and ranked by simplicity gained
against what is lost. None is applied. "Reopens" uses principles.md §4 plus the IDs the proposals
added:

- E4: refusal by forwarding
- A7: forgotten first send
- H4: misrouted results
- H5: retrying after an uncertain write
- L5: abandoned commit
- L6: request left waiting
- L7: departure before the pending fact is recorded
- L8: two owners issue one request
- D5: restore in flight
- D6: seeding
- T1: `check` disagreeing with handling

| # | Cut | Simplicity gained | What breaks | Reopens |
| --- | --- | --- | --- | --- |
| 1 | **Always-there callbacks that move the host** | One clause and the per-kind distinction. Removes the fused-target question for traits. | Idle → LOCKED, hold → DELETING from a trait. The workaround is a step. | Coverage only; no §4 problem. Slight correctness gain. |
| 2 | **Live value props** (frozen `input` only) | One word, one rule, the D2 convention gap | Live intervals, pagination limits, changing permission flags | D1 (pushed copies); keys go stale under payload-only selects |
| 3 | **"Every port required, `{}` means ignore"** (allow omission with inspection listing) | One rule and per-placement noise | Nothing functional | A6 |
| 4 | **`check` evaluating raise payload mappers** (codex-split only; forbid transformed payloads into guarded child commands) | One Machines O4 amendment and render-time defect sites | Child guards over transformed raised payloads | T1, if transformed payloads are kept |
| 5 | **Read requests** (requests for commits only; reads via host activities or host-mapped refetch) | About a third of request rules: read restore, read kinds, read `reject`/cancel answers | Poll and verify steps owning their reply | D4, L2, D5, H3, H4 for reads |
| 6 | **Forbid leaving a step mid-commit**, instead of the full `abandoned` protocol | Smaller than it looks: a post-invocation cancel still yields `unknown`, so a route stays. Saves the `pending` fact and its host guards. | Leaving without waiting or cancelling | L4 fully for hung adapters; L7 disappears; L5 becomes a static rule |
| 7 | **Steps inside fragments** (traits may nest inside steps; no step inside a step) | Request relay, nested start/call, nested generations and nested `abandoned` routing: the deepest rules everywhere | Composite steps (wizard → address step → confirm) | Prior-art D1 and A1 inside composites. Removes L5 at depth, a net correctness gain. |
| 8 | **`start`** (the host's entering transition sends first) | One word, the default-path rule, part of the O3 exception | Self-contained first sends | A7, D2, L8 |
| 9 | **Same-turn composition (`raise`/`also` + `hostEvents`)** | The composition table, whole-turn decline, totality, acyclicity, `check` expansion | Host-fed fragments: Debounce, Replace after save, Reset, Field `Set` | H1, D3, E4, A1; T1 if only the decline is cut |
| 10 | **Request ports entirely** (the host maps outcomes onto fragment `hostEvents`) | The largest cut: about 8-15 words and 10-15 rules each, and most plan amendments | Fragment-owned retries, fenced replies, kind-checked outcomes, reconcile | D2, D4, D5, H3, H4, H5, A5, A7, L2, L5, L6, L7, L8 |

Reading the table:

- **Cuts 1-3 are cheap** and lose little.
- **Cuts 5 and 7 are the real simplicity decisions.** Each removes a whole layer with a nameable,
  contained loss, and cut 7 also removes a correctness surface.
- **Cut 6 saves less than every proposal first claimed.**
- **Cuts 9 and 10 remove the reason fragments exist.**

## 12. Is another revision round worth running?

**Not a six-way round.** Round 3 shows diminishing returns:

- The must-fixes were mostly met.
- What remains is second-order: defect corners, amendment rows, example/rule mismatches.
- Each fix grew the vocabulary, and all six now converge on the same semantics.

Another parallel round would polish six documents toward one design.

**Recommended instead:**

1. Review the seventh proposal (a different model) before deciding, since it may change the basis.
2. The user decides:
   - the cuts in §11 (at least 1-3, 5 and 7);
   - the two open choices in §9;
   - two names for the kinds.
3. Run **one consolidation pass** on opus-split, with the borrow list in §9, plus the S1 type spike:
   inference for nested `E` paths, branded result tokens and Schema-generic fragments. That spike is
   the remaining unknown none of the documents can settle.
