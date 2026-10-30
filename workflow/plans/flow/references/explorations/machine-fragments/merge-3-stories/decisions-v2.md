# Stories (from-scratch design): decisions

Decisions on [proposal-v2.md](proposal-v2.md). All made by the main session under the owner's overnight delegation
(delegated-decisions.md), for the owner's review.

| # | Decision | Kind | Date |
| --- | --- | --- | --- |
| T1 | Continue with proposal-v2.md (from the brief); the earlier proposal.md and its reviews stay as prior art. | delegated | 2026-10-31 |
| T2 | C3: no ending injection. Every ending comes from a fake's answer through the real classification, or from a lifecycle step; Testing O3 stays as written. `NotSent { Disposed }` is reached only by the policy suite's internal `disposeRuntime` step. | delegated | 2026-10-31 |
| T3 | C10: one constructor, `Story.make(subject)`; the subject's kind decides which steps type-check; a fragment alone runs in an invisible stand-in host. | delegated, big (B6: `story.app` and `story.machine` renamed) | 2026-10-31 |
| T4 | C4/C12: stream and wire controls are data values on fake handles, applied with `.world(…)`; `together(…)` is the only race word; Testing O1's no-callbacks rule stays. | delegated | 2026-10-31 |
| T5 | Accept the proposal's big changes for review and convergence: B1 (`process()` removed, each step settles), B2 (a `Fake` module), B3 (`expect` makes `run()` reject), B4 (a frame per publication, amending accepted TST O4), B5 (`propertyTest` takes any Story). Each is listed for the owner with before/after in the morning handback. | delegated, big | 2026-10-31 |
