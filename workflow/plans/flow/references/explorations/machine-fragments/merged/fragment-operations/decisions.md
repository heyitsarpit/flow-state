# Operations in fragments: owner decisions

**Merged into machine-design.md on 2026-10-31** (decisions section, F1–F10); kept as the record.

Decisions on [proposal.md](proposal.md) (2026-10-30). Everything else in it stays proposed.

| # | Decision | Date |
| --- | --- | --- |
| F1 | Q1 A: fragments may own operations, opt-in, traits first. | 2026-10-30 |
| F2 | Q2 A: a fragment's write lane keeps the merged identity (actor identity, contract id, key); `SharedContract` widens to one write operation per contract per actor. | 2026-10-30 |
| F3 | Q3 A: an ending after the fragment incarnation ends is parked on the lane record and delivered to the next incarnation at the placement (OD21 one level down). | 2026-10-30 |
| F4 | Q4 B: in v1, mapped writes only in placements about one thing (root trait, `.each` copy, `.resumable()` without `resetOn`); reads and streams anywhere. | 2026-10-30 |
| F5 | Q5 A: a host may read a fragment's lanes (`Fragment.O.x.get`, `idle`, `retryable`; `s.operations.<instance>.<name>`); acting is a type error. | 2026-10-30 |
| F6 | Q6 A: a held write whose `.each` copy is removed is a stated limit; the host keeps busy keys in membership when it matters. | 2026-10-30 |
| F7 | Q7–Q10 A: subroutines that own writes are phase 2; fragment Stories with `fixtures`, `.enter`, `.leave`; no subroutine entry hook; `cancel` in `whenAbandoned` deferred. | 2026-10-30 |
| F8 | Revision 2 questions, all option A: Q11 (`resetOn` allowed on a writing root or resumable trait; the reset value is the subject; amends F4), Q12 (`cancel` in `whenAbandoned` releases the incarnation's write when it ends; amends F6, reverses F7's deferral), Q13 (`Flow.entry` does not fire on thaw). | 2026-10-31 |
| F9 | Review 2 H1, option A: release on leave is a property of the subject's lanes, remembered by the Runtime; spelled key-less, `whenAbandoned: [O.put.cancel]` (NEW MEANING: releases every lane of this incarnation's subject, survives reload, also releases endings parked for the subject). Use it only for work that is worthless once its subject is gone (review 2 H3); like and follow keep the keep-busy line. | 2026-10-31 |
| F10 | The proposal (revision 3 with review 3 fixes, 1c3a1c68) is accepted for merging into machine-design.md, under the same process as the operations merge (OD24: the main session approves the change list and resolves small conflicts, logged in delegated-decisions.md; owner conflicts go to the owner). | 2026-10-31 |
