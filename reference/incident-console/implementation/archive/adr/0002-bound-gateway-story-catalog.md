# Bound the BehaviorGateway Story catalog

Status: superseded by ADR-0003

The original app-only recommendation was too restrictive for the intended CLI use of focused machine
Stories. The replacement decision is recorded in ADR-0003.

## Considered Options

- Register focused machine Stories: rejected because they use a private one-machine AppPlan and do
  not have the gateway's app identity without adding a new association rule.
- Register `ActorRecipe` values: rejected because a recipe is run-local construction input, not an
  independently executable Story runtime.
- Assign IDs from filenames, exports, or metadata: rejected because those are unstable and are not
  Story identity.
- Allow multiple app identities in one gateway: rejected because behavior artifacts and trace
  compatibility are app-scoped; multi-app selection would require a new CLI/artifact contract.
