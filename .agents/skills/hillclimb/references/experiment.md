# Run the assigned experiment

Read your role sections and the shared run/measurement contract.

## Establish the run: experiment author

If an attempt requires changing an agreed guarantee, use
[keep-intent-aligned](../../keep-intent-aligned/SKILL.md) to expose the finding and proposal before
continuing that attempt. Keep run evidence in the ledger below.
Read the owning Task and its Plan references. Confirm the target, units, stopping condition,
workload, environment, selected diagnostic tools, regression tests, invariants, and run budget.
Surface missing commitments before tuning. Do not substitute another metric or relax the target.

Inspect HEAD, existing changes, and prior performance commits with their evidence.
Identify each measured code state by commit, plus a saved patch for uncommitted changes.

## Build and validate the harness: author and measurement checker

Author: build or repair the harness and return sensitivity and baseline evidence.
Checker: independently run and assess that evidence; do not edit the harness or tests.
Freeze only the approved harness revision. The construction steps below belong to the author.

Apply [benchmark-checklist](../../benchmark-checklist/SKILL.md) before freezing the harness and when
reporting a comparison. Keep the agreed target and run budget; this checklist audits the evidence.

1. Build or adapt one repeatable command for the workload and metric. Verify correct outputs and
   completed work inside the timed region. Report errors and work counts. Match builds, settings,
   and warmup conditions between baseline and candidate.
2. Prove **harness sensitivity** using a controlled workload change or deliberate slowdown near the
   target's scale. Repeated runs must distinguish it from noise before tuning begins.
3. State the rule for deciding when repeated measurements show improvement beyond run-to-run
   variation. Alternate baseline and candidate runs against drift. Collect profiles separately when
   their overhead distorts timing. For reported failures, reproduce the target symptom and check
   relevant control workloads. Return the baseline, regression results, harness revision, and
   sampling method
   for approval.

The script calculates and prints sample count, median, min/max, errors, work counts, and deltas.
Provide a per-run option to append detailed TSV records.
The TSV can retain detailed samples and run metadata. It may be ignored or deleted later.
Task evidence must survive TSV deletion.

If measurement conditions change, repeat sensitivity checks and establish a new baseline.
Preserve earlier evidence and explain the change; do not compare incompatible runs.

## Task experiment ledger

Edit Task prose directly; run `workflow format --write`, then `workflow check`, and review the diff.
Put the run contract in `description` and target criteria in `acceptance`.
Include the baseline revision, measurement commands, harness revision, and sensitivity evidence.
Use supported `derives_from` and `satisfies` fields for Plan links.

Append a dated `comment` after every attempt, including rejects and inconclusive results.
Record numeric summaries for measured attempts, including uncommitted candidates.
Identify an uncommitted snapshot by its base commit and saved patch.

```text
        comment 2026-10-07T12:00:00+05:30
            H1: Avoid repeated decoding on the measured request path.
            Change: reuse the decoded request within its existing lifetime.
            Baseline: <commit>. Accepted: <commit>.
            Conditions: <workload, environment, harness revision and command>.
            Metric: <name and unit>.
            Before: <median, min/max, sample count>. After: <median, min/max, sample count>.
            Delta: <absolute and percentage change>.
            Errors: <before -> after>. Completed work: <before -> after>.
            Checks: <correctness and regression results>.
            Verdict: kept; <reason>.
            Evidence: <durable diagnostic artifacts, if retained>.
```

## Propose an attempt: experiment author

Read the ledger and diagnostics. Name the limiting mechanism and one bounded hypothesis.
Use [optimize-software](../../optimize-software/SKILL.md) only for missing candidate guidance.
Return the hypothesis, expected work reduction, added costs, invariant, and measurement criterion.
Revisit rejected ideas only with new evidence. Return repeated failed premises for investigation
using [attack-the-premise](../../attack-the-premise/SKILL.md).

## Implement an attempt: executor

Read the supplied Task, baseline, write scope, hypothesis, checks, and restoration boundary.
Use [execute-task](../../execute-task/SKILL.md), including assigned tests
and [lint](../../setup-workflow/references/lint.md). Make one change; do not stack unmeasured
changes.
Return the patch, snapshot, actual checks, and unresolved gaps. Wait for the measurement verdict.
For reject or inconclusive, save evidence and patch, then restore only your attempt.
Commit a kept attempt only when authorized; otherwise retain its tested state and saved patch.

## Assess an attempt: measurement checker

Remain independent of the author/executor. Run the frozen comparisons and regression tests.
Inspect the actual diff, outputs, completed work, conditions, and configured lint receipts.
Return keep, reject, or inconclusive with baseline/candidate identities and evidence.
Keep requires the agreed gain beyond noise, preserved guarantees, passing regressions, and lint.
Changed conditions require a new checked baseline; an inconclusive run is not an improvement.
Advance the baseline only on a valid keep; choose the next attempt from the checked evidence.
