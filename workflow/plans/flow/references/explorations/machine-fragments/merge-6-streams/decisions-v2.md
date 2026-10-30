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
