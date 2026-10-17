# Multi-phase plan

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation. Use the
`coordination-policy` skill for actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

Resolve intent, investigate dependencies, then produce bounded phases with proof gates.
A planning-only request ends at the requested planning artifacts: Plan, Tasks, or Specs.
Do not start execution unless authorized.

1. `agent:planning-interviewer`: Resolve unsettled consumer outcomes and constraints through
   planning (Use the `planning` skill). `agent:plan-writer` records decisions through
   to-plan (Use the `to-plan` skill). Reuse settled intent. A mechanical bounded task
   needs no new
   program plan. Require Plan approval before dependent preparation; reuse existing approval
   of unchanged content.
   Record Plan Verification targets covering the agreed outcomes.
2. `agent:experiment-author`: For unresolved empirical choices, offer a prototype (Use the
   `prototype` skill) with its question, estimate, and recommendation. Build it
   only if chosen or already authorized. Preserve unresolved gates.
3. `agent:workflow-designer`: Use [bounded run design](../references/run-design.md) to select phases
   and rigor. Identify blocking first steps, independent writes, shared state, integration, and real
   dependencies.
4. `agent:task-designer`: Decompose with to-task (Use the `to-task` skill). For each
   slice name
   inputs, responsible owner, write scope, executable steps, expected results, evidence, and
   remaining prerequisite. Do not turn every layer or helper into another Task or manager. After
   drafting Tasks, resolve consequential contract needs with to-spec (Use the `to-spec` skill);
   `agent:spec-author` receives author guidance (Use the `to-spec` skill).
   Refine
   affected Tasks against the settled contracts before readiness.
   Check required verification has work and invariants/tests support the required guarantees.
5. `agent:workflow-coordinator`: Name the execution playbook and ceiling: Autonomous run for one
   target, Orchestrate for a standing program, Autopilot-full for independent landing, or
   Autopilot-stack for an ordered chain. Derive active roles and limits from the settled phases;
   use setup's model preferences. The catalogue is not a launch list.
6. `agent:verification-designer`: Design proof on the actual surface. Include regression and
   failure/recovery where the contract needs them, performance budgets where relevant, and explicit
   independent/human review gates. Unknown tooling is a prerequisite, not a passing checkbox or
   universal ten-lane roster.
   Require assembled evidence for every required target of the authorized scope before completion.
   Deferred, failed, blocked, or unexercised required targets prevent a completion verdict.
7. `agent:acceptance-checker`: Validate artifact syntax, references, readiness, and consistency.
   Return defects to the owning author. The coordinator sends repairs to the checker within budget;
   keep unresolved decisions and prerequisites open rather than declaring the plan executable.
   Return the plan, ready slices, and open gates to the coordinator. It starts the named workflow
   only when execution is granted; planning-only work ends here.

**Reply:** Plan/Spec/Task paths, phase graph, ready slices, gates, chosen execution, and evidence
needs.
