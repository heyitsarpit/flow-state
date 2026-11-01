# Agent routing defaults


These defaults apply to delegated phase owners. The current root retains its session model/effort;
record exposed values or mark them inherited. Names identify phase ownership, not custom prompts.
Select only needed owners. A model default does not authorize launching the whole table.

| Agent name                            | Role                       | Model name   | Reasoning effort |
|---------------------------------------|----------------------------|--------------|------------------|
| `agent:workflow-coordinator`          | Dispatch and gates         | `gpt-6-luna` | `xhigh`          |
| `agent:setup-owner`                   | Capabilities and config    | `gpt-6-luna` | `xhigh`          |
| `agent:planning-interviewer`          | Intent and question rounds | `gpt-6-luna` | `xhigh`          |
| `agent:plan-writer`                   | Plan decisions             | `gpt-6-luna` | `xhigh`          |
| `agent:task-designer`                 | Tasks and dependencies     | `gpt-6-luna` | `xhigh`          |
| `agent:workflow-designer`             | Phases and handoffs        | `gpt-6-luna` | `xhigh`          |
| `agent:record-writer`                 | Evidence and status        | `gpt-6-luna` | `xhigh`          |
| `agent:spec-author`                   | Spec intake and edits      | `gpt-6-luna` | `xhigh`          |
| `agent:impact-investigator`           | Boundaries and risks       | `gpt-6-luna` | `xhigh`          |
| `agent:correctness-designer`          | Models and invariants      | `gpt-6-luna` | `xhigh`          |
| `agent:composition-designer`          | Protocols and dependencies | `gpt-6-luna` | `xhigh`          |
| `agent:verification-designer`         | Checks and diagnostics     | `gpt-6-luna` | `xhigh`          |
| `agent:spec-checker`                  | Contract verdict           | `gpt-6-luna` | `xhigh`          |
| `agent:performance-designer`          | Workload and cost model    | `gpt-6-luna` | `xhigh`          |
| `agent:performance-analyst`           | Costs and reductions       | `gpt-6-luna` | `xhigh`          |
| `agent:source-investigator`           | Source/history evidence    | `gpt-6-luna` | `xhigh`          |
| `agent:diagnostician`                 | Reproduction and causes    | `gpt-6-luna` | `xhigh`          |
| `agent:evidence-synthesizer`          | Reconciled conclusions     | `gpt-6-luna` | `xhigh`          |
| `agent:explainer`                     | Mechanism and rationale    | `gpt-6-luna` | `xhigh`          |
| `agent:implementer`                   | Code and self-checks       | `gpt-6-luna` | `xhigh`          |
| `agent:integrator`                    | Assembly and conflicts     | `gpt-6-luna` | `xhigh`          |
| `agent:runtime-operator`              | Runtime evidence           | `gpt-6-luna` | `xhigh`          |
| `agent:measurement-checker`           | Measurement verdict        | `gpt-6-luna` | `xhigh`          |
| `agent:acceptance-checker`            | Acceptance verdict         | `gpt-6-luna` | `xhigh`          |
| `agent:code-reviewer`                 | Code/standards findings    | `gpt-6-luna` | `xhigh`          |
| `agent:review-lead`                   | Review verdict             | `gpt-6-luna` | `xhigh`          |
| `agent:delivery-operator`             | PR lifecycle and landing   | `gpt-6-luna` | `xhigh`          |
| `agent:resource-operator`             | Resources and cleanup      | `gpt-6-luna` | `xhigh`          |
| `agent:experiment-author`             | Experiments and harnesses  | `gpt-6-luna` | `xhigh`          |
| `agent:candidate`                     | Independent alternative    | `gpt-6-luna` | `xhigh`          |
| `agent:arena-judge`                   | Candidate scores           | `gpt-6-luna` | `xhigh`          |
| `agent:evaluation-designer`           | Trials and private rubric  | `gpt-6-luna` | `xhigh`          |
| `agent:evaluation-judge`              | Blinded trial scores       | `gpt-6-luna` | `xhigh`          |
| `agent:reflection-judgment-reviewer`  | Reasoning findings         | `gpt-6-luna` | `xhigh`          |
| `agent:reflection-tooling-reviewer`   | Tool-use findings          | `gpt-6-luna` | `xhigh`          |
| `agent:reflection-divergent-reviewer` | Missed alternatives        | `gpt-6-luna` | `xhigh`          |
| `agent:learning-analyst`              | Models and guidance        | `gpt-6-luna` | `xhigh`          |
| `agent:skill-author`                  | Skill package              | `gpt-6-luna` | `xhigh`          |
