# Operations in fragments: owner decisions

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
