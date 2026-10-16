# Hillclimb

Own one tuning run as `agent:workflow-coordinator`; Workflow owns the human conversation.
Apply [coordination-policy](../../coordination-policy/SKILL.md) to dispatch and handoffs.
Keep the experiment loop with you; give workers only their assigned experiment sections.

1. **Open the run.** Give `agent:task-designer` [to-task](../../to-task/SKILL.md).
   Create or reuse an owning Task before harness construction, benchmarking, or code changes.
   Record workload, metric, invariants, budget, and stopping condition; keep an unknown target
   proposed.
2. **Establish evidence.** Run [hillclimb](../../hillclimb/SKILL.md) with bounded workers.
   Assign `agent:experiment-author` harness construction and candidate proposals;
   `agent:measurement-checker` independently checks sensitivity, baseline, and comparisons.
   Report the checked baseline and proposed target through Workflow before optimization.
   Resolve reserved target choices there; reuse a current baseline only under matching conditions.
3. **Run attempts.** Assign `agent:implementer` one isolated attempt at a time.
   Assign `agent:record-writer` the [Task
   ledger](../../hillclimb/references/experiment.md#task-experiment-ledger).
   Keep accepted baselines and evidence; rejected or inconclusive attempts never advance the
   baseline.
   Changes to guarantees return to contract design before dependent tuning.
4. **Close the run.** Stop at the target, budget, hold, or demonstrated dead end.
   Return an unmet target honestly. Reconcile workers and retain the ledger before scratch cleanup.
   Use applicable [Autonomous run](autonomous-run.md) continuation controls only when needed.
   Give `agent:delivery-operator` [PR delivery](opening-a-pr.md) steps only within the grant.

**Reply to Workflow:** metric, checked baseline/final, target, delta, attempt verdict counts,
revisions, Task ledger, evidence, remaining gap, and next boundary.
