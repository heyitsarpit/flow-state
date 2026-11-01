---
name: coordination-policy
description: >-
  Separate pipeline coordination from artifact work and disclose context by assignment.
  Apply when composing workflows, delegating methods, or writing multi-role instructions.
metadata:
  kind: policy
---

# Coordination policy

## Assign work

- Coordinator: dispatch, monitor, route failures, advance gates.
- Author/executor: produce artifacts. Integrator: combine outputs. Record writer: update records.
- Checker: judge artifacts and evidence; return findings. Authors repair artifacts.
  Checkers do not edit reviewed artifacts or weaken expectations.
  Keep required checking independent of authors.
- Assign each needed duty; reuse compatible roles explicitly. Coordinators may also do specialist
  work when directly using a method.
- In Workflow, the coordinator may run the playbook and coordinate composite procedures with
  bounded workers, without another manager per method.
- Use harness tools to dispatch actual workers. Role labels alone do not assign work.
- Checks that clean or rebuild the same output share write scope. Serialize them or isolate outputs.

## Disclose only what the role needs

- Resolve commands, project inputs, and installed methods from the assigned absolute checkout.
  Check that checkout before declaring an input missing or choosing a fallback.
- Coordinator reads the scenario playbook and invokes relevant composite procedures. Specialists
  invoke assigned skills by registered name; each skill selects its own references. Never hand
  specialists a coordination entrypoint or another skill's internal files. If a worker cannot
  discover or load an assigned skill, report the capability gap.
- Follow named skills and their applicable dependent methods within the assigned phase.
  Conditional invocation is required when its trigger applies. Reuse already loaded instructions.
  Each method owns dependency selection; playbooks need not enumerate its dependent skills.
  Load dependencies as their triggers arise, not the whole graph in advance.
  For review, apply relevant criteria without executing authoring, implementation, or experiment
  phases outside the assignment.
- Start specialists with fresh context; in Codex, set `fork_turns: none`.
  Supply a complete bounded brief instead of inheriting the coordinator's conversation.
- Brief each role with its objective, phase, inputs, decisions, rationale, scope, checks, budget,
  and return shape. Include relevant principles, dependencies, and unresolved questions.
- Use the `workflow-configuration` skill for project tools and model preferences. The
  selected playbook supplies
  assignments and limits. Planning/design supplies commitments and checks. Leaves retain local
  guards.

## Advance on checked evidence

- Checker inspects artifacts and evidence; returns scope, revision, conditions, verdict, gaps,
  and evidence locations.
  Challenge omitted applicable methods as well as application of the chosen methods.
- Coordinator checks receipt identity and currency; advances only on required passing verdicts.
- Check combined artifacts after integration. Self-checks do not satisfy required independent gates.
- Relay product questions through the conversation owner. Return answers to the assigned writer.

## Stop and hand back

At the endpoint, budget, or hold, stop new dispatch and reconcile owned workers and wakeups.
Stop them before returning unless their continued ownership is explicitly handed off.
Report unstopped resources honestly. Return actual state, retained evidence, and a recoverable
checkpoint for unfinished work; a pause is not completion.

## Route failures

| Failure | Return to |
|---|---|
| Tool, model, delegation | Setup/coordinator |
| Product defect | Executor |
| Contract gap | Designer |
| Evidence gap | Checker/runtime operator |
| Authority or objective conflict | Conversation owner |

Leaves report broken prerequisites. Reopen only decisions invalidated by findings.

## Direct entry and small work

- Direct invocation binds a specialist role, scope, inputs, and endpoint; establish missing
  prerequisites through narrow setup. Conversational skills need no role declaration.
- Select permitted serial execution or reduced staffing upstream. Report lost independence;
  required independent gates remain blocked.
- Omit irrelevant phases; reuse valid evidence. Keep fallback policy here, not in every leaf.
