# Principles for Flow State design work

A checklist of what the user cares about. Each item links to where it is defined; read the link
rather than relying on this summary.

Skills live in [`.agents/skills/`](../../../../../.agents/skills/); routing is in
[`AGENTS.md`](../../../../../AGENTS.md).

## General

| Principle                      | In one line                                                            | Source                                                                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code composition               | coherent concerns, meaningful protocols, complete dependency contracts | [code-composition](../../../../../.agents/skills/code-composition/SKILL.md)                                                                                                                                       |
| One canonical form per concept | two ways to say one thing is a defect                                  | D3 in [FlowState.plan](../../FlowState.plan)                                                                                                                                              |
| Simplify, do not redesign      | smallest change that removes the problem                               | D4 in [FlowState.plan](../../FlowState.plan)                                                                                                                                             |
| Every name earns its place     | an author writes it or a tool calls it, and nothing else covers it     | D4 in [FlowState.plan](../../FlowState.plan)                                                                                                                                                                       |
| API design                     | names, types, failure behaviour, compatibility                         | [api-design](../../../../../.agents/skills/api-design/SKILL.md)                                                                                                                                                   |
| Static analysis                | structure is data, not closures; the source file is the spec           | D1 and D2 in [FlowState.plan](../../FlowState.plan)                                                                                                                                              |
| Lessons become structure       | a recurring mistake becomes a type or a check                          | [encode-lessons-in-structure](../../../../../.agents/skills/encode-lessons-in-structure/SKILL.md)                                                                                                                 |
| Verifiable claims              | claims are proven by tests or spikes; uncertainty is shown honestly    | [design-for-verification](../../../../../.agents/skills/design-for-verification/SKILL.md)                                                                                                                         |
| Effect use                     | Effect where it earns its place; installed 4.0.5 is the authority      | [effect-systems-design](../../../../../.agents/skills/effect-systems-design/SKILL.md), [effect-api-documentation](../../../../../.agents/skills/effect-api-documentation/SKILL.md)                                   |
| Style                          | Flow State TypeScript and Effect style                                 | [typescript-style-guide](../../../../../.agents/skills/typescript-style-guide/SKILL.md), [code-patterns](../../../../../.agents/skills/code-patterns/SKILL.md), `/Users/arpit/Developer/workflow/lint-bomb/STYLE.md` |
| Data first                     | Schema owns validation; clear transformation phases                    | [data-oriented-design](../../../../../.agents/skills/data-oriented-design/SKILL.md)                                                                                                                               |
| Tests                          | observable behaviour through public boundaries                         | [testing-policy](../../../../../.agents/skills/testing-policy/SKILL.md)                                                                                                                                           |
| Writing                        | plain, short, concrete                                                 | [writing](../../../../../.agents/skills/writing/SKILL.md)                                                                                                                                                         |

**Agents are the primary authors:** the model fits in a few rules, defaults are safe, and likely
mistakes are caught by types or `flow check`.

## Specific to Flow State

| Building for    | What it requires                                                                                                                                                                     | Defined in                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Stories         | determinism (Runtime clock, seeded ids); every input playable at an exact step; plain frozen snapshots; assertions on machine truth; a feature that cannot be replayed is unfinished | O9 in [FlowState.plan](../../FlowState.plan) |
| The CLI         | every relation declared so `flow graph` sees it; `flow check` rules for each new concept; diagnostics that name the cause; `explain` and `trace` answer "why"                        | O11 in [FlowState.plan](../../FlowState.plan)   |
| Full inspection | nothing off the record; passive reads; no hidden state; inspection in production                                                                                                     | O11 in [FlowState.plan](../../FlowState.plan)                                                     |
| Machines        | machines own workflow; memory holds keys and drafts, never copies; narrow `useView`                                                                                                  | D29 and O7 in [FlowState.plan](../../FlowState.plan)                                                                          |

## Working style

One decision at a time, with options and a recommendation; large documents in chunks; designs tested
against many kinds of application; subagents verified before relying on them.
