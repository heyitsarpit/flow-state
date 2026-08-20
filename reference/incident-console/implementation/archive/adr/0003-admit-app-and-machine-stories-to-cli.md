# Admit app and machine Stories to the CLI catalog

Status: archived accepted decision record; transferred into the active contracts.

The CLI should register both complete app Stories and focused machine Stories under the existing
external-ID `behavior({ app, stories })` record. App Stories exercise full application orchestration;
machine Stories provide useful focused production-runtime tests and support the existing `--machine`
filter. `ActorRecipe` values remain run-local inputs and are excluded. One BehaviorGateway still has one
one explicit app identity, and machine Story plans must carry private provenance that lets the gateway validate
their machine against that app's compiled `AppPlan` without adding a public app argument to
`story.machine(...)`.

The focused Story execution plan may remain package-private, but it is derived from the admitted machine and
does not create a second public app identity.

## Considered Options

- App Stories only: rejected because it makes the CLI unable to inspect and run useful focused machine
  tests even though the public Story contract defines them and the artifact model has a machine Story
  variant.
- Add an explicit public app argument to `story.machine(...)`: rejected because it couples focused
  Story construction to application composition and changes the accepted Story API.
- Register `ActorRecipe` values: rejected because recipes are run-local construction inputs, not standalone
  runtime plans.
- Allow multiple app identities in one gateway: rejected because the current behavior and trace
  artifacts are app-scoped and the CLI has no multi-app selector contract.
