# Perf issue

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation.
Apply [coordination-policy](../../coordination-policy/SKILL.md) to actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

Measure the bottleneck, make one justified change, then check correctness and the complete-path
gain.
Continued tuning belongs to [Hillclimb](hillclimb.md).

Before measurements, give `agent:task-designer` [to-task](../../to-task/SKILL.md) to create or
reuse the owning Task. Record workload, metric, behavior, budget, and acceptance.

1. `agent:experiment-author`: Fix the workload, symptom, metric, required behavior, and target from
   the conversation or Task. Capture a representative baseline. Apply
   [benchmark-checklist](../../benchmark-checklist/SKILL.md) before relying on any comparison;
   record actual work and errors as well as time.
2. `agent:performance-analyst`: Use [optimize-software](../../optimize-software/SKILL.md) to trace
   limiting costs and select candidates. Apply [work reduction](../../work-reduction/SKILL.md)
   before cheapening remaining work: remove unused work, narrow it, reuse valid results, then
   consider deferral, concurrency, or kernels.
3. `agent:performance-designer`: Choose one justified attempt. State removed work, added costs,
   correctness, freshness, and memory. Return consequential contract changes to the coordinator for
   [to-spec](../../to-spec/SKILL.md).
   `agent:spec-author` receives [author guidance](../../to-spec/references/spec-author.md).
4. `agent:workflow-coordinator`: Delegate the bounded change through
   [execute-task](../../execute-task/SKILL.md). Give `agent:implementer`
   [its method](../../execute-task/references/implementer.md); declare compatible worker reuse.
   The coordinator may implement compatible bounded work; preserve independent measurement.
   Do not stack unmeasured changes; preserve unrelated edits.
5. `agent:measurement-checker`: Remain independent of the implementer. Compare the complete path at
baseline and final revisions under
   comparable conditions. Check all promised results, ordering, persistence, and regressions. Keep
   only justified gains. Return product or missing-test failures to the implementer, harness defects
   to their author, and contract gaps to step 3. Recheck repaired snapshots before keeping the
   change.
6. `agent:workflow-coordinator`: Stop when the bounded pass ends or its target is proved. For
   requested continued attempts, transfer the run contract and evidence to Hillclimb. Do not quietly
   change the metric.
7. `agent:record-writer`: Return Task evidence, uncertainty, and the primary comparison.
   Assign `agent:delivery-operator` the comparison and applicable [Opening a PR](opening-a-pr.md)
   steps only for granted publication.

**Reply:** workload, baseline → final with units, completed work, correctness, tradeoffs, evidence.
