# Use Workflow

Start `/workflow` where the harness supports that invocation, then describe the problem.
Use the harness's supported skill invocation or read the entrypoint by path otherwise.
The mode follows the conversation; the user need not select a playbook or complete a task brief.

## Develop the work together

1. Explain the desired outcome, current difficulty, or idea. Supply relevant project artifacts.
2. Discuss the agent's understanding and recommended workflow. Correct material interpretations.
3. Settle product choices and proof of success. The agent investigates discoverable facts.
4. Review the recorded Plan. The agent records material decisions as you settle them.
5. Say "build this" or give a direct action request when ready. Existing grants remain effective.

Exploration remains exploration. A plan-only request ends at the plan.
Authorized execution continues through its agreed endpoint without routine confirmation.
Status questions update the conversation; "stop" or "pause" propagates a hold to owned workers.

## Configure only what the run needs

Use [setup-workflow](../../setup-workflow/SKILL.md) when capabilities or assignments need setup.
It confirms project intent, model preferences, and tool commands, then stops.
The coordinator infers the playbook and staffing from the conversation when work begins.
Ordinary setup needs no project graph.
Supporting skills remain explicit-only; the mode loads their methods where the workflow needs them.

For a usage question, explain the route and link its owner. Do not begin the described work.
Read the selected [playbook](../SKILL.md#playbooks) before describing its obligations.

## Keep the owners distinct

- Plans own decisions; Specs own contracts; Tasks own bounded work and execution evidence.
- Playbooks own complete workflows. Skills own reusable methods, principles, and policies.
- Runtime verification proves observed behavior. Review judges the current artifact independently.
- Orchestrate dispatches workers and assigns integration. Arena compares independent candidate
  artifacts.
- The graph assigns responsibilities; the current request decides which phases are needed.

## Recover or adapt

Use [recall](../../recall/SKILL.md) for missing prior context and
[Session pickup](../playbooks/session-pickup.md) to reconcile it with actual state.
Use [automate-me](../../automate-me/SKILL.md) for a personal working-style mode.
Use [reflect](../../reflect/SKILL.md), then [derive-guidance](../../derive-guidance/SKILL.md) when
learning lacks a usable mental model. Write an agreed package through
[Authoring a skill](../playbooks/authoring-a-skill.md).

Keep project support in workflow/reference/ or established locations.
Packaged references/ folders hold the skill's conditional guidance.

## Troubleshoot the actual gap

| Symptom | Check |
|---|---|
| Skill did not load | Harness discovery and explicit invocation support |
| Assignments had no effect | Saved graph and when the harness applies model settings |
| Workers overwrote changes | Write scopes, integration owner, and actual revision |
| Verification recipe failed | Preconditions, invocation, expected result, observed failure |
| Build was called success | Exercised consumer path, side effects, and current evidence |

**Reply:** answer, one useful prompt when needed, owning file, and actual capability limits.
