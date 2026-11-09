# Model preferences

Model and reasoning effort for delegated work, by role. The current session keeps its own model.
Tiers (lead and sidecar), roles, and the models chosen by agent harness are defined in
skill:policy-delegation. A preference here does not authorize starting an agent.

| Role | Model | Reasoning effort |
|---|---|---|
| Lead | the harness pair | the harness pair |
| Sidecar | the harness pair | the harness pair |
| Author | inherit | inherit |
| Checker | inherit | inherit |
| Investigator | inherit | inherit |
| Delegator | inherit | inherit |

`the harness pair` means the pair in skill:policy-delegation's Models table for the agent harness
in use: Opus and Haiku in Claude Code, Sol and Luna (Codex's strongest and cheapest models) in
Codex. `inherit` means the agent uses the delegating session's model.

Which wins, in order: the user's explicit choice in the request or in an Epic's `instructions`;
then a row here only if the user set it explicitly (setup records only confirmed changes, so a
default `the harness pair` or `inherit` overrides nothing); then the harness pair for leads and
sidecars, and the delegating session's model for the other roles.
