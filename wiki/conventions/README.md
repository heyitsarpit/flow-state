# Conventions

The idiomatic way to do things in Flow, one page each. A page states the rule, when it applies, a before and after,
why, its prior art, and which parts rest on API not built yet. The public docs' guides are rebuilt from these pages
once that API is built.

| Page                                            | The rule in short                                              |
| ----------------------------------------------- | -------------------------------------------------------------- |
| [Where a value lives](where-a-value-lives.md)   | input, props, memory, context; derive the rest (R1 to R6)      |
| [Interaction state](interaction-state.md)       | frame-rate data in refs; milestones in a local actor           |
| [View commands](view-commands.md)               | a one-shot command is an emit, never a stored request          |
| [Controlled values](controlled-values.md)       | a parent-owned value is a prop paired with an emit             |
| [App actions](app-actions.md)                   | Effect services in the one Runtime Layer                       |
| [What an ending knows](what-an-ending-knows.md) | ids in the call's input; configuration from props or memory    |
| [Reusable primitives](reusable-primitives.md)   | a factory over the app's contract                              |
| [Cross-tab bridge](cross-tab-bridge.md)         | host code, emit out, typed send in (deferred)                  |
| [Fixtures](fixtures.md)                         | every feature proven by a fixture app before it is built       |
| [Fixture catalog](fixture-catalog.md)           | each fixture's scenarios: load and structural stress, owners   |
| [Boundaries](boundaries.md)                     | each source of untrusted input, where it is checked, its owner |

Upkeep:

- A convention the user accepts in a decision round gets a page in the same change.
- A page whose API changes is updated with that change; its Status says what is not built yet.
- Fixtures and Tasks cite pages (`code:wiki/conventions/<page>.md`) instead of repeating rules.

Source: @proposal.conventions and the deleted `ui-primitives-decisions`. Full text of the six `ui-primitives*`
proposals: `git show 3a84b878:wiki/plans/flow/references/proposals/<file>`.
