# Phase owners

Agent names identify owners of bounded phase slices. Playbooks assign their inputs, permitted
work, outputs, and gates. Specialist skills supply methods without named-agent assignments. Keep
staffing in this layer.

## Bind only needed phases

- Owner name: `agent:spec-checker`. Scoped assignment: `agent:spec-checker#payments`.
- Keep the owner name stable. Add a scope suffix only to distinguish multiple assignments.
- Setup configures role/model preferences. The coordinator binds needed phases to workers and
  limits when work is known. Record runtime IDs separately; names are not custom agent prompts.
- Reuse a worker across compatible phases explicitly. Required independent checking uses a worker
  different from the artifact's authors. An owner may use several skills within its assigned slice.
- Auto-mode owns the conversation and selects the playbook. It may perform bounded work directly
  when capable; use a playbook owner or phase workers when the work benefits from delegation. A
  composite method does not require another manager.

Select phases from the requested outcome and valid evidence. Pass each worker only its phase
contract and relevant methods.

Setup owns the [agent names, roles, and model
defaults](../../setup-workflow/SKILL.md#agent-routing-defaults).
Read the installed routing table for model choices. Keep phase composition here and in playbooks;
pass workers only their assigned phase and relevant methods.

## Conditional method phases

Use these assignments only when the selected playbook calls the method and its phase applies. The
method owns its coverage rules; setup counts selected workers and explicit reuse.

- **How:** `agent:source-investigator` for exploration; `agent:explainer` for requested
  explanations.
- **Why:** `agent:source-investigator` for evidence; `agent:evidence-synthesizer` for synthesis.
- **To Spec:** `agent:spec-author` owns intake and shared edits; `agent:impact-investigator`
  investigates; `agent:verification-designer` develops test obligations when needed;
  `agent:spec-checker` checks behavior contracts. Correctness and composition designers contribute
  optional implementation-design findings when assigned.
- **Execute Task:** `agent:task-designer` establishes readiness; `agent:implementer` builds;
  `agent:integrator` assembles when needed; `agent:runtime-operator` supplies missing runtime proof;
  `agent:acceptance-checker` judges claims; `agent:record-writer` records results.
- **Review:** `agent:workflow-coordinator` fixes scope; `agent:code-reviewer` challenges;
  `agent:review-lead` resolves findings and returns the verdict.
- **Arena:** `agent:task-designer` frames; `agent:candidate` produces alternatives;
  `agent:arena-judge` scores; `agent:integrator` combines; `agent:acceptance-checker` checks;
  `agent:record-writer` records.
- **Reflect:** `agent:reflection-judgment-reviewer`, `agent:reflection-tooling-reviewer`, and
  `agent:reflection-divergent-reviewer` inspect; `agent:evidence-synthesizer` reconciles;
  `agent:learning-analyst` develops missing models; `agent:acceptance-checker` checks guidance;
  `agent:skill-author` applies authorized edits.
- **Eval:** `agent:evaluation-designer` frames; `agent:setup-owner` establishes isolation; ordinary
  task owners run trials; `agent:evaluation-judge` scores; `agent:acceptance-checker` checks
  outcomes; `agent:evidence-synthesizer` recommends; `agent:record-writer` records;
  `agent:resource-operator` cleans up.
