# Retain BehaviorGateway as the CLI boundary

Status: archived accepted decision record; transferred into the active contracts.

The greenfield implementation retains `behavior({ app, stories })` and the named `BehaviorGateway` because the
CLI needs one explicit, package-branded registration boundary for an already-compiled application
and its external Story identities. The legacy gateway descriptor, Scenario runner, duplicate Story
registry, and v1 artifact machinery are replaced; the gateway remains inert and owns no runtime,
actor, evidence, or cleanup lifetime. This preserves the existing CLI contract while allowing the
new App, machine, and Story semantics to be implemented underneath it.

The gateway requires one explicit App and a non-empty keyed Story record. The record keys are external
Story IDs, all entries must belong to that App identity, and the branded gateway performs only synchronous
registration and validation. App and Machine Stories are accepted; ActorRecipe values are not. The gateway
does not compile a second app, construct a Runtime, or execute a Story.

## Considered Options

- Make `app(...)` own all Stories: rejected because it couples application composition to every Story
  consumer and creates import cycles.
- Replace the gateway with a new `.entry.ts` API: rejected for this pass because it changes the
  accepted public/CLI boundary without solving a contract requirement.
- Keep the legacy gateway and Scenario internals: rejected because they conflict with the new
  AppPlan, production Story executor, v2 artifact, and evidence ownership rules.
