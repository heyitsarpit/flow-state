# Streams (from-scratch design): owner decisions

Decisions on [proposal-v2.md](proposal-v2.md), the design the owner chose to continue (2026-10-30). Revision 3
(proposal.md) stays as prior art; five of its parts are carried over (comparison.md).

| # | Decision | Date |
| --- | --- | --- |
| S1 | Continue with proposal-v2.md; revision 3 is prior art. | 2026-10-30 |
| S2 | Q1 A: the adapter reports the connection in-band, as items in its Stream (`Feed.live`, `Feed.down`), ordered with the values. | 2026-10-30 |
| S3 | Q4 A: repair lives in the adapter (`Feed.reconnect`'s `catchUp`, a server replay); the machine sees `missed` only when nothing could repair. | 2026-10-30 |
| S4 | Q5 A: the resume position across sessions is an `input` field the machine fills from its memory; Flow stores and compares no position. | 2026-10-30 |
| S5 | Section 8, the remaining questions, all option A: Q2 (`missed`), Q3 (an SDK's own reconnect policy, wrapped in `Feed.reconnect` by recipe), Q6 (row: `connection`, `drop`, `value` on state feeds, `last { value, at }`), Q7 (`Closed` in `failure`), Q8 (cursors out of scope, to open-items), Q9 (no shared session per Runtime, to open-items), Q10 (drop `persist` on streams), Q11 (`progress(p)`), Q12 (`resetAfter` default 1 minute; `Closed` and `Overflow` retryable), Q13 (`bufferSize` default 1,024), Q14 (finding names as listed). | 2026-10-30 |
| S6 | Round 4, all option A: Q15 (`catchUp` is a page-step function, no `Feed.complete`), Q16 (the row reads `Live` during a catch-up), Q17 (a proof on a state feed re-confirms only a `last` this session confirmed), Q18 (pages retry with a fresh copy of the reconnect `schedule`, no `catchUpSchedule`). | 2026-10-30 |
| S7 | Revision 3 questions, all option A: Q19 (`Feed.CannotRepair`, NEW word: a `catchUp` step fails with it; the start settles lost, `missed Lost`, no budget spent), Q20 (`emit` returns a `Promise<void>` for back-pressure), Q21 (a first start with no position is `fresh` under `Feed.reconnect` only), Q22 (an unhandled fact feed is a type error), Q23 (one `catchUp` step function; first call receives the position, later calls the page token). | 2026-10-31 |
| S8 | Delegated, from review 3: H1, a start is `fresh` only when `Feed.reconnect` declares `from` and it is empty (amends S7 Q21); H2, session identity includes the fragment subject path (rules 48–60), with freeze, thaw and `resetOn` rows; H3, `catchUp`'s contract requires pages oldest first (P1), and newest-first histories (Ably) page forwards or reverse in the adapter. | 2026-10-31 |
