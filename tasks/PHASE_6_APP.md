# Phase 6 — Incident console product and interaction contract

[Back to Phase 6](./PHASE_6.md)

`incident-console` must be a usable operations application before it is a library
demonstration. A user starts the app, triages a queue, changes incident ownership
and status, watches live activity, and runs a resolution workflow without knowing
Flow State terminology. Inspection and stress evidence must come from that same
application rather than a second testing UI.

## Visible product

Use a two-pane desktop layout that becomes queue-then-detail navigation at narrow
widths. Keep the visual design deliberate and restrained: readable hierarchy,
consistent spacing, severity/status color with text labels, clear focus, and no
bespoke design-system project.

Component names below describe responsibilities, not a requirement for one file
per row. Combine a component only when the resulting owner remains small and
cohesive.

| Component           | Responsibility and user interaction                                                                                                                    | Required visible states                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `FlowRoot`          | Create the application runtime through the accepted ownership path, provide it to React, and dispose it once                                           | Starting, ready, fatal boot failure                                         |
| `IncidentConsole`   | Own the page layout and compose queue, detail, feedback, and optional diagnostics without business logic                                               | Queue only, queue plus detail, narrow detail view                           |
| `ConsoleHeader`     | Show product name, API reachability, timeline connection state, and a queue refresh action                                                             | Connected, reconnecting, degraded                                           |
| `IncidentFilters`   | Filter by service, severity, status, and assignee; apply and clear filters without a router dependency                                                 | Defaults, active filters, disabled while first load is unavailable          |
| `IncidentQueue`     | Render current cursor page, preserve usable stale data during refresh, select an incident, and request the next page                                   | Initial loading, rows, refreshing, empty, typed failure, end of results     |
| `IncidentRow`       | Show severity, title, service, status, assignee, and last update; expose selected and keyboard-focus state                                             | Normal, selected, optimistically changed, externally updated                |
| `IncidentDetail`    | Show description, metadata, server version, freshness, and the action, timeline, and runbook panels                                                    | Loading, cached-refreshing, ready, not found, typed failure                 |
| `IncidentActions`   | Assign/unassign, acknowledge, resolve, and reopen using canonical machine availability and optimistic transactions                                     | Allowed, disabled with reason, pending preview, committed, conflict, failed |
| `ConflictNotice`    | Explain a 409, show the server-authoritative values, and let the user accept them or retry from the new version                                        | Hidden, conflict, reconciling                                               |
| `TimelinePanel`     | Render ordered SSE events and connection feedback without deriving incident product state from trace history                                           | Connecting, live, reconnecting, gap reported, failed, empty                 |
| `RunbookPanel`      | Start one resolution runbook, show its steps and terminal result, and cancel, retry, or replace it                                                     | Idle, queued, running, cancelling, succeeded, failed, cancelled             |
| `FeedbackRegion`    | Announce mutation, connection, and retry results accessibly without becoming a second state owner                                                      | Informational, success, warning, error                                      |
| `DiagnosticsDrawer` | Optionally show current machine state, resource freshness, pending transaction/stream/child work, issues, and trace export from public inspection APIs | Closed, live facts, bounded-history gap, export failure                     |

## Ordinary user journeys

These journeys must work against the normal server seed with no scenario command.
They need Playwright acceptance through root `pnpm test:browser` and a short
manual sequence in the flagship README.

| ID  | User action                                                             | Visible result                                                                                                        |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| U1  | Start `pnpm dev` and open the printed frontend URL                      | The queue loads from the API, connection indicators settle, and the first page is usable                              |
| U2  | Choose service, severity, status, and assignee filters, then clear them | The queue changes, active filters remain obvious, and clearing returns to the unfiltered first page                   |
| U3  | Request the next page and select rows from both pages                   | Rows append or replace according to the chosen cursor UI, selection stays coherent, and end-of-results is explicit    |
| U4  | Open an incident, return to the queue, then reopen it                   | Cached detail appears immediately, background refresh is visible, and no duplicate detail request is created          |
| U5  | Refresh the queue or selected detail                                    | Existing data remains readable, freshness changes are visible, and success or typed failure is announced              |
| U6  | Assign an incident to an operator                                       | The row and detail preview the assignee immediately, then commit to the server version and refresh affected views     |
| U7  | Acknowledge, resolve, and reopen an incident when allowed               | Only valid controls are enabled, status changes optimistically, and rejected actions explain why they are unavailable |
| U8  | Leave a detail open while server activity arrives                       | Timeline events appear in order and externally changed incident fields reconcile without losing selection             |
| U9  | Start a runbook, watch steps progress, and cancel another run           | Child status and steps remain visible, cancellation is idempotent, and terminal feedback is unambiguous               |
| U10 | Open diagnostics during the above actions and export a trace            | Facts correspond to the visible workflow, histories stay bounded, and diagnostics never drive product state           |

## Advanced interactive journeys

Complex journeys must be automated in Playwright and reproducible by a human. Use
two browser contexts for real concurrent operators or an external scenario driver
for server conditions; do not add a fault toolbar to the production application.

| ID  | User sequence                                                                               | Expected application behavior                                                                                    |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| X1  | Open one incident in two tabs, update it in tab A, then submit the stale version from tab B | Both tabs receive the live change; tab B shows a 409 conflict and reconciles without erasing tab A's update      |
| X2  | Change filters and selections rapidly while list and detail responses are delayed           | The UI remains responsive and only the current resource generations publish                                      |
| X3  | Arm one detail-refresh 503, revisit cached detail, refresh, then retry                      | Cached content remains usable, failure is explicit, and retry recovers without duplicate demand                  |
| X4  | Arm an SSE disconnect while a detail is open                                                | The header and timeline show reconnecting, resume from the last event ID, and avoid duplicate events             |
| X5  | Delay an optimistic PATCH and deliver an SSE update for the same incident                   | Preview, external update, conflict policy, rollback/reconcile, and final server authority remain understandable  |
| X6  | Remove an incident between queue selection and detail completion                            | Detail becomes not found, stale data does not reappear, and returning to the queue remains usable                |
| X7  | Start a runbook, replace it, and race cancellation with old and new completion              | Only the current child reaches product state; late outcomes are inspectable but cannot overwrite it              |
| X8  | Restart the API with a request, timeline, and runbook active                                | The app shows degraded state, stops stale work, and recovers through explicit retry/reconnect without ghost jobs |
| X9  | Arm a schema-invalid 200 response                                                           | The relevant panel reports a typed decode failure and retains the last valid snapshot without partial data       |
| X10 | Navigate away or unmount while request, mutation, stream, timer, and child work is active   | Every owner finalizes, no later update reaches React, and reopening starts one clean runtime generation          |

## External scenario driver

Add a package script backed by `examples/incident-console/scripts/scenario.mjs`.
It calls development-only server controls and prints the exact next UI actions and
expected result. Support at least:

- `scenario list` — list named seeds and fault scenarios.
- `scenario reset normal` — restore the ordinary interactive dataset.
- `scenario arm delayed-response`, `refresh-503`, `malformed-detail`,
  `remove-before-detail`, `sse-disconnect`, `delayed-patch`, `runbook-failure`,
  and `runbook-cancel-race` — arm one deterministic condition, consumed once.
- `scenario restart-api` — restart only the development API while preserving the
  frontend session, then print the recovery actions for X8.

The driver may reset or arrange the server but may not dispatch Flow events,
inspect private runtime state, click the UI, or decide whether a scenario passed.
Normal journeys must never require it.

## Interaction and code-quality rules

- Use the package-owned Tailwind CSS and shadcn/ui setup for the application.
  Add only primitives used by real interactions, keep registry components in
  `components/ui/`, and compose product behavior in `ui/`; do not build a second
  design system or make generated primitives own business state.
- UI components render typed views and send public events; they do not fetch,
  decode responses, mutate caches, coordinate transactions, interpret streams, or
  derive business state from receipts.
- `services/` owns HTTP/SSE clients and schema decoding, `features/` owns Flow
  definitions, `app/` owns assembly and runtime setup, `ui/` owns interaction, and
  `testing/` owns acceptance orchestration and assertions. `scripts/` owns the
  operator-only server scenario driver. The standalone `server/` never imports
  frontend owners.
- Every asynchronous control shows pending and failure feedback, prevents an
  accidental duplicate action where the machine rejects it, and remains keyboard
  reachable with labelled controls and an accessible feedback region.
- Keep server reset/fault endpoints and scenario-only code outside production
  bundles. Do not hide missing behavior behind disabled controls, raw JSON panels,
  TODO text, hard-coded success, or test-only props.
- Review the completed tree using the Phase 5 application strategy. Split a file
  when it owns unrelated domain, transport, Flow, rendering, and testing decisions;
  do not split small cohesive components merely to satisfy a directory diagram.

## Completion gate

The app contract is complete when Playwright proves U1-U10 from a clean normal
start and X1-X10 are both automated and manually reproducible. Every component
must expose its required visible states, the scenario driver must remain outside
the production UI, and the coverage ledger must link these interactions to
runtime, testing, inspection, CLI, packed, and cleanup evidence.
