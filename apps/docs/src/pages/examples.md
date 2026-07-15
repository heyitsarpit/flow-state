# Examples

The five small applications are recipes, while Incident Console is the
client/server architecture proof. Every application is an independent workspace
package and uses public package entrypoints.

## Focused recipes

| Recipe                      | What it proves                                                             |
| --------------------------- | -------------------------------------------------------------------------- |
| `basic-cached-posts`        | Keyed resources, stale refresh, typed failure, React reads, and cleanup    |
| `optimistic-transactions`   | Optimistic preview, commit, rollback, invalidation, and write concurrency  |
| `bounded-infinite-feed`     | Dynamic resource parameters, bounded cursor data, and replacement          |
| `server-prefetch-hydration` | Request-scoped runtime boot, dehydration, hydration, and request isolation |
| `offline-recovery`          | Host signals, stream ownership, interruption, and recovery                 |

Run a recipe from the repository root:

```sh
pnpm --filter @flow-state/basic-cached-posts test
pnpm --filter @flow-state/basic-cached-posts build
```

## Incident Console

`examples/incident-console` is a two-pane operations console backed by a separate
mutable Node API. The browser crosses real fetch and EventSource boundaries for
cursor-paged incidents, optimistic version conflicts, live timelines, and remote
runbook jobs; development controls only arrange deterministic external faults.

```sh
pnpm --filter @flow-state/incident-console dev
pnpm --filter @flow-state/incident-console test:acceptance
```

The development command starts the API on `127.0.0.1:5190` and Next on
`127.0.0.1:5187`. Set `INCIDENT_API_PORT`, `INCIDENT_WEB_PORT`,
`NEXT_PUBLIC_INCIDENT_API_URL`, and `INCIDENT_WEB_ORIGIN` to override that
boundary. Install Chromium once with
`pnpm --filter @flow-state/incident-console browser:install`.

The isolated acceptance command allocates ports, runs ordinary and adversarial
browser workflows, restarts the actual API process, and terminates the server,
frontend, streams, runtime work, and child workflows. See the package README for
the manual U1-U10 journeys and reproducible X1-X10 fault scenarios.

Run the package CLI evidence for all six applications with:

```sh
pnpm check:example-cli
```
