# Phase receipts

Each completed phase writes `PHASE_<N>.md` here. A receipt is evidence, not a narrative
status update. It must contain:

- phase and contract IDs closed;
- starting commit and pre-existing worktree changes in scope;
- source, test, fixture, example, and export files changed;
- files and public symbols deleted;
- exact commands, exit codes, and skipped-test counts;
- hostile proof cases added and their observable results;
- broad gates run and any unrelated failures;
- remaining risks or contract conflicts;
- scratchpad entries opened, resolved, promoted, rejected, or carried forward;
- explicit statement that no replaced semantic owner remains;
- next phase promoted to `Ready`, or the precise blocker preventing promotion.
