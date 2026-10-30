# Response to review 1 (revision 2 of the proposal)

Written 2026-10-31. Every finding of [review-1.md](review-1.md) is listed with its **root cause** (proposal 0.1,
C1–C6), what revision 2 does about it, and where. Findings are advice; where the proposal disagrees it says why.
Everything in the proposal stays marked as proposed.

Root causes, in short:

- **C1** Lanes were published apart from the data they describe.
- **C2** The identity of one server thing was stated twice (transaction `key` and lane).
- **C3** Identity across versions rested on an author-chosen name alone.
- **C4** Policy Flow already tracks was pushed into mappings and payloads.
- **C5** Lifetime was specified case by case.
- **C6** Vocabulary grew per kind instead of per role.
- **R** A reporting error, not a design cause.

## Gains, checked

| Finding | Cause | Done | Where |
| --- | --- | --- | --- |
| The listed gains hold (keyless plain reads, copies not sharing, no collisions, a home for commit values, one identity model) | none | kept | 0, 0.1 last paragraph |
| "13 of 14 wrong cells" is about 6 | R | **agreed**; recounted per cell: 5 newly defined by construction, 8 already fixed by N2 and re-expressed, 1 unaffected; R1's "about 6" differs only in how row 7's split cell is counted | 6.1 |
| "10 of 20 undefined" is about 6 | R | **agreed**: 5 newly defined, 6 already fixed and re-expressed (incl. row 27), 9 unaffected | 6.1 |
| Keyed lookup and never-started reads fixed for plain operations only | C1 | **fixed for every case**: `.each` rows carry `item`; domain writes publish `pending` on `Entity.get(s, key)` | 3.4, 3.6, every view in 5 and 7 |

## Losses

| Finding | Cause | Done | Where |
| --- | --- | --- | --- |
| D9's cross-operation exclusion is only a warning | C2 | `SharedContract` is a declaration **error** unless one operation `.joins` the other, which shares one lane (D9 restored explicitly and checkably) | 3.8, S7, B1 |
| On-demand keyed lanes (D11) lost; id list mirrored; paged lists past `max` | C1 | entity lanes are created by work at the record's key: no list, no `max` over pages. Remaining: a **plain** transaction over **server** rows needs a domain or a workflow list (B15); recommended path is the domain | 3.6, B15 |
| `reject` per key lost: sign-in blocked by an old late verify; pin refuses row 2 | C2 | re-derived: sign-in `verify` is `.each({ of: "seen" })` (one lane per challenge entered, as before); pin is a domain write `.each({ of: Issue })`. What is genuinely lost: one plain `latest` operation used for several documents now shares a lane; it must declare `.each` or be one actor per document (stated contract) | 3.8 table, 5.2, B16 |
| The stream mapper loses `params`; `key` changes meaning | C6 | `params` restored in read and stream mapper context; `key` has one meaning everywhere (the `.each` member), which is also what it meant for keyed activities and copy fillings; the other meaning (lane key) is removed | 3.5, 5.4 (`gap` mapper reads `params.after`), B17 |
| Per-start outcomes need a discriminator in the input | C2 | two operations, the second `.joins` the first: one lane, two mappings, nothing extra on the wire | 3.8, B18 |
| `DuplicatePlacement` rejects two placements even under disjoint `when` | C5 | **partly agreed**: `when` may hold state tokens, and token-disjoint placements are allowed. **Disagreed** for closures: `flow check` never runs closures (R10), so "disjoint" cannot be proven; the recipe is tokens, or one placement whose `params` read the state | 3.11, S9, B19 |

## High findings

| # | Finding | Cause | Done | Where |
| --- | --- | --- | --- | --- |
| 1 | Operation names as persisted identity: rename → orphaned unknown, idle new name, a second charge | C3 | persisted by (contract, operation name, member); restore binds by name, then `.was("pay")`, then the unique operation of that contract (always unique for unjoined writes, by C2's decision), then `orphaned`. The rename sequence now binds to `charge`, delivers `unknown(Restored)` through `charge`'s mapping, and reconciles | 3.13, S10, B6 |
| 2 | The "different key is Rejected" rule strands writes; domain writes get an implicit key | C2 | **adopted the fix**: transactions lose `key`, the K-rule is deleted. Misuse is a declaration error where Flow can see it (`EachRequired`: a one-record domain write without `.each({ of: Entity })`). **One addition**: R1's "or marked single" is not needed, because `.each({ of: Entity })` on a single-record actor costs nothing and keeps the rule uniform | 3.6, 3.8, S5, S7, B5, B24, B25 |
| 3 | `SharedContract` only a warning | C2 | error unless `.joins` | 3.8, S7 |
| 4 | Wiring leaks: id lists, `listed` guard, `{ key: { id } }`, `for` repeated, a member named four times | C1 | `.each` follows its source. For entities the member is derived from `.predicts`, so starts carry only the contract's input; the example contracts take `{ id }` (the `{ key: { id } }` shape was M4's choice, not Flow's). For workflow lists the member is named once per machine with `at`, and `for` is gone. **Disagreed in part** with R1's specific form `of: O.issues`: lanes per answer would split one record's writes across a list and a detail answer, and paging would end lanes of running writes; `of: Issue` gives the same benefits without either | 3.6, alternative K, 5.3, 7.4, B22 |
| 5 | Retry budgets leak through events (`resends`) | C4 | `retryable(n)`: a guard that passes, or denies `RetryLimit { retryCount }` / `NothingToResend`; `check()` disables the button at the budget. All `resends` fields removed | 3.10, 5.1, 5.3, 5.4, 7.1, 7.2, 7.4 |

## Medium findings

| Finding | Cause | Done | Where |
| --- | --- | --- | --- |
| A removed member holding an unknown never drains; it leaks and persists | C5 | workflow lanes release retained unknowns when the member leaves (evidence `RetainedReleased`); entity lanes release them when the record's mark clears or past 64 per operation (the record keeps its mark and forced repair). Persistence stores only what is retained | 3.7, S6, B20, B27 |
| Same-turn removal and drain are not ordered | C5 | reconciled once at commit, after the final list: members keep lanes, non-members with outstanding work drain, others are removed; remove and re-add in one turn changes nothing; re-adding a draining member finds the same lane | 3.7, S6, B21 |
| Membership lag; stale `Listed` drops ids | C1 | gone: entity lanes have no membership; workflow lists are written by the transition that starts their work | 3.6, B22 |
| One call split across definition, machine and contract; mappers carrying retry policy | C4 | **partly disagreed**: the three places answer three questions (how, what results mean here, when and with what), each changing for a different reason, and today's design has the same three places. Agreed on policy in mappers: budgets moved to `retryable`, supersession to one key, so mappings only translate | 5.5, B23 |
| Definitions roughly double; totals about even | C4 | measured per case (5.5): definitions +13 to +28, machines -12 to -23, net -1 to +4. Revision 2 removes `superseded` and counter lines. Mappings beside the contract, imported: possible only with events in their own module (circular types otherwise); not proposed, asked as Q15 | 5.5, Q15, B10 |
| Names: `.subscribe` vs `stream({ subscribe })`; `outcomes` misnames a stream; `operations` three meanings; `fetch` shadows the global; three verbs to begin | C6 | naming set: **contract** (module level) and **operation** (entry); `.emits` for every kind; `.live()` for live reads; `start` for all finite work; `with` for placements; `at` for members. `operations` keeps exactly the two readings `memory` has (declared key, read key); the module-record reading is gone | 3.1, Q2, B29 |
| `superseded` boilerplate in every `latest` mapper | C4 | a required `superseded:` mapping key under `latest`: every channel for domain writes (the record queue orders older before newer), success and failure for plain ones (an older plain unknown may land after the newer write, so it still reaches `unknown:`) | 3.9, S8, B26 |

## Keyed lookup

| Finding | Cause | Done | Where |
| --- | --- | --- | --- |
| Not inherent to named operations; inherent to publishing lanes apart from the data views render | C1 | **agreed; it is root cause C1**. All three fixes adopted: `.each` rows carry `item`; domain writes publish `pending` on the record; chat maps its outbox rows (which carry the outbox item, so status and text come from one row). No view in sections 5 or 7 looks up a lane | 3.4, 3.6, 5.3, 5.4, 7 |

## Top improvements proposed

| # | Proposal | Cause | Done |
| --- | --- | --- | --- |
| 1 | `.each` follows a live read or entity query | C1 | adopted with the entity query (`of: Issue`); the live-read form is alternative K, with reasons |
| 2 | Remove transaction `key` and the "different key" rule | C2 | adopted |
| 3 | Rename `.subscribe` to `.live`; let a bare contract be placed directly in `activities` | C6 | `.live()` adopted; bare contracts allowed **in `operations`** (`here: Chat.presence`), **not** in `activities`, which would become a second place that declares and make row types depend on the machine body (alternative N) |

## The coordinator's other asks

| Ask | Done | Where |
| --- | --- | --- |
| Group findings by root cause; redesign at the causes; a "Root causes" section | six causes, each with its findings and the decision that removes it | proposal 0.1, this file |
| R1's five authoring apps rewritten | upload with progress and cancel, autosave editor, dashboard with three live reads, todo list with a domain; payment with 3-D Secure is 5.1; a friction table | 7.1–7.6 |
| B15–B23 added | review-1.md does not number them; they are numbered from its Losses and Medium lists (B15 on-demand lanes, B16 `reject` per key, B17 stream `params` and `key`, B18 per-start mappings, B19 placements and `when`, B20 retained unknowns, B21 same-turn order, B22 membership lag, B23 split and size). Revision 2's own new costs are B24–B29 | 6.2 |
| Re-run porting counts | 164 document items (45 rewrites, 96 small, 12 deleted, 11 added), about 19 plan rows, 5 DD files; about 135 without the activities merge | 5.6 |
| Sections 0, 3, 5, 6 and 9; Revision 2 note; regrouped rounds | done; open questions in five rounds, Q1–Q20 | status line, 0, 3, 5, 6, 10 |
