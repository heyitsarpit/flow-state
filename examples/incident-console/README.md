# Incident Console

Incident Console is Flow State's client/server flagship: a Next.js operations UI
talks to a separate mutable Node API over fetch and SSE, then uses one Flow app
for cached resources, optimistic writes, workflows, testing, and inspection.

## Run it

From this package directory:

```sh
pnpm dev
```

The command starts the API at `http://127.0.0.1:5190` and the frontend at
`http://127.0.0.1:5187`. Override `INCIDENT_API_PORT` and `INCIDENT_WEB_PORT` when
those ports are occupied. `NEXT_PUBLIC_INCIDENT_API_URL` configures the browser's
API boundary, while `INCIDENT_WEB_ORIGIN` configures API CORS.

The verification commands are:

```sh
pnpm test
pnpm test:cli
pnpm test:browser
pnpm test:acceptance
pnpm build
```

`test:browser` uses the fixed development ports and skips the process-restart
case. `test:acceptance` allocates isolated ports, runs every browser case, restarts
the actual API process, and terminates the API and frontend. Install Chromium once
with `pnpm browser:install`.

## Architecture

The API under `server/` owns the 15-incident seed, cursor pagination, versions,
timeline subscribers, runbook jobs, and development-only scenario controls. The
frontend shares only schemas from `src/domain/incidents.ts`; it reaches every
read, write, timeline, and runbook through `src/services/incident-api.ts` over a
real socket.

The client follows `CLIENT_STRUCTURE_CONTRACT.md`:

- `src/features/incidents/` owns the resources, transactions, stream, parent and
  child machines, view, and module.
- `src/app/` owns app assembly, Layers, runtime creation, and the CLI behavior
  gateway.
- `src/ui/` owns rendering and sends public machine events; it never fetches or
  coordinates runtime work.
- `src/testing/` drives those production definitions with Effect Layers,
  Deferred gates, TestClock, the public testing facade, and React.

Development faults stay outside the frontend bundle. `scripts/scenario.mjs`
arranges external server conditions but never dispatches Flow events or decides
whether the UI passed.

## Reused reference patterns

No other example package is imported at runtime. These maintained files were
read and adapted into new incident-owned definitions:

| Reference file                                                                                                                                | Pattern reused                                                                    | Incident Console owner                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `examples/basic-cached-posts/src/app/app.ts`, `app/layers.ts`, `app/runtime.ts`                                                               | Explicit app, Layer, and caller-owned runtime assembly                            | `src/app/app.ts`, `layers.ts`, `runtime.ts`                    |
| `examples/basic-cached-posts/src/features/posts/resources.ts`, `machine.ts`, `view.ts`                                                        | Keyed list/detail demand, cached refresh, and a canonical derived view            | `src/features/incidents/resources.ts`, `machine.ts`, `view.ts` |
| `examples/optimistic-transactions/src/features/todos/transaction.ts`                                                                          | Optimistic preview, rollback, invalidation, typed outcomes, and overlap policy    | `src/features/incidents/transactions.ts`                       |
| `examples/offline-recovery/src/features/offline/streams.ts`, `worker.ts`                                                                      | State-owned stream finalization and typed child input/output                      | `timeline.ts`, `runbook-lease.ts`, `runbook.ts`                |
| `examples/basic-cached-posts/src/testing/posts-runtime.test.ts` and `examples/optimistic-transactions/src/testing/optimistic-runtime.test.ts` | Production-runtime tests plus `test.app`, model, Deferred, and TestClock evidence | `src/testing/incident-runtime.test.ts`                         |
| `examples/basic-cached-posts/src/testing/posts-react.test.tsx`                                                                                | Focused caller-owned `FlowProvider` and hook proof                                | `src/testing/incident-react.test.tsx`                          |

The semantic differences are deliberate: this app uses a standalone mutable API,
actual optimistic version conflicts, browser-native EventSource reconnect, and a
remote runbook lifecycle. The smaller recipes use deterministic in-process Layers
because they teach one isolated concept rather than the network boundary.

## Ordinary manual journey

1. **U1:** Start `pnpm dev`, open the printed frontend URL, and wait for the first
   five incidents and the `connected` badge.
2. **U2:** Set all four filters, confirm the empty state, then press **Clear** and
   confirm the first page returns.
3. **U3:** Press **Next page**, open a row, return with **Queue**, then return to
   the first page; the final page says **End of results**.
4. **U4:** Open `INC-002`, return to the queue, and reopen it; cached detail is
   usable immediately and only stale data triggers a background refresh.
5. **U5:** Press the header refresh in the queue and **Refresh detail** in detail;
   existing data remains readable and the result is announced.
6. **U6:** Assign the incident to Avery; the queue and detail preview immediately,
   then settle on the server version.
7. **U7:** Acknowledge, resolve, and reopen the incident; invalid actions remain
   disabled with their reason.
8. **U8:** Leave detail open while changing it from another tab; one ordered
   timeline event appears and the visible server fields reconcile.
9. **U9:** Start one runbook and watch its steps succeed, then start another and
   cancel it; terminal feedback is explicit.
10. **U10:** Open **Diagnostics** during the workflow and export the trace; the
    drawer reflects current owners and the downloaded artifact is bounded.

## Advanced manual scenarios

Reset before each scenario:

```sh
pnpm scenario reset normal
```

- **X1:** Open `INC-002` in two browser contexts, arm `delayed-patch`, assign in
  tab B, then assign in tab A. Tab B shows the real 409 and **Accept server
  version** reconciles it.
- **X2:** Arm `delayed-response`, change the service filter from API to billing,
  and confirm only billing rows publish. Repeat while selecting two details.
- **X3:** Open a detail, arm `refresh-503`, refresh, and retry; cached data remains
  visible through the typed failure. Arm `malformed-detail` to repeat the same
  check for a schema-invalid 200.
- **X4:** Open a detail, arm `sse-disconnect`, then change the incident through a
  second context. The badge moves through reconnecting to live and the replayed
  event appears once.
- **X5:** Arm `delayed-patch`, submit an assignment, and update status externally
  before it commits. The preview rolls back to the authoritative conflict.
- **X6:** Arm both `delayed-response` and `remove-before-detail`, then open a row.
  The detail becomes not found and another row remains usable.
- **X7:** Arm `runbook-failure` for one run, then start another, arm
  `runbook-cancel-race`, replace it, and cancel the replacement. Only the current
  terminal result remains.
- **X8:** Start a runbook, arm `delayed-runbook`, then run
  `pnpm scenario restart-api`. The UI becomes degraded/reconnecting and recovers
  without an active ghost job.
- **X9:** Open a detail, arm `malformed-detail`, and refresh. The last valid
  incident remains while the decode failure is announced.
- **X10:** Arm `delayed-patch`, submit an assignment, and exit the console while
  it is pending. Reopen, start a runbook, and exit again; the server status returns
  zero subscribers and active jobs after each generation.

`pnpm scenario list` prints every seed and fault. `timeline-burst` proves a real
bounded SSE burst and visible gap; `shift-before-list` removes a row between cursor
pages; the remaining names correspond directly to the scenarios above.
