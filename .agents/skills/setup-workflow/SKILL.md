---
name: setup-workflow
description: >-
  Configure this repository's installed workflow suite. Establish project intent, confirm model
  preferences, and record available CLI, lint, and formatter commands. Use for initial setup or
  configuration changes.
disable-model-invocation: true
metadata:
  kind: procedure
---

# Setup workflow

Configure the installed suite for this project. Reuse defaults and keep setup a short conversation.

## 1. Start with intent

Reuse the request and conversation. If the project's purpose is unclear, ask:
"What are you building here, and do you have a preferred stack?"
Wait for the answer before searching for tools or writing files.
The user describes the outcome; infer technical scope.

## 2. Read existing setup

Identify the project root, harness, and installed suite. Read project instructions, package scripts,
and existing model/lint settings. Stay within the repository unless the user supplies an external
path. Record the absolute root; confirm the working directory before any writes.
Do not audit every installed skill or search neighboring projects for missing tools.

## 3. Confirm model preferences

Keep existing choices, then use [the defaults below](#agent-routing-defaults).
Offer different models or reasoning effort when the user wants a change; show only changed choices.
Validate unique model/effort choices against the session's advertised options. Ask about unavailable
choices instead of searching the filesystem. Apply confirmed changes to the installed routing table.
Keep the current root's model. Preserve names, invocation policies, and unrelated settings.

## 4. Record project tools

Recommend lint and formatter commands from project scripts or the chosen stack; let the user
confirm.
Infer file scope. Write available commands and their write/check behavior into
[lint.md](references/lint.md); preserve its procedure. Leave missing tools unconfigured.
Install only requested tooling; setup does not start application implementation.

Find the workflow CLI through PATH or project instructions. If found, run `--help` and record its
invocation.
Query records only when project-owned workflow records exist.
Run global validation on those records.
Rebuild a stale index with the established CLI, then recheck; return other unresolved diagnostics.
Report missing tools; do not expand setup into an unrelated repository investigation.

## 5. Return and stop

Return changed settings, lint reference, available commands, and missing prerequisites.
Name one next action, then stop. Setup does not select a task, launch workers, or generate a graph.
Use [graph design](references/agent-graph.md) only for an explicit graph request or a complex
program.

## Agent routing defaults

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
