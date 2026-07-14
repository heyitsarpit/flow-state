# Phase 5 example feature coverage

This is the coverage contract for the five reference applications planned in
[`tasks/PHASE_5.md`](../tasks/PHASE_5.md). It decides the suite's scope now; it
is not a future inventory task. A `C` means the example must visibly exercise
the feature and prove it through a deterministic test. A dash means the example
does not cover the feature. Existing package tests, Launch Workspace, incidental
imports, and construction without observable behavior do not count.

| Flow State feature                                      | Basic cached posts | Optimistic transactions | Bounded infinite feed | Server prefetch | Offline recovery | Suite   |
| ------------------------------------------------------- | :----------------: | :---------------------: | :-------------------: | :-------------: | :--------------: | ------- |
| `createKey` and keyed identity                          |         C          |            C            |           C           |        C        |        C         | Covered |
| `createTag` and tag identity                            |         —          |            C            |           —           |        —        |        —         | Covered |
| `flow.module` inventory                                 |         C          |            C            |           C           |        C        |        C         | Covered |
| `flow.app` and application layer                        |         C          |            C            |           C           |        C        |        C         | Covered |
| `flow.runtime` ownership and disposal                   |         C          |            C            |           C           |        C        |        C         | Covered |
| `flow.store.memory` and `flow.store.test`               |         C          |            C            |           C           |        C        |        C         | Covered |
| `flow.orchestrators.live` and `flow.orchestrators.test` |         C          |            C            |           C           |        C        |        C         | Covered |
| `flow.resource` reads and snapshots                     |         C          |            C            |           C           |        C        |        C         | Covered |
| Independent keyed resource entries                      |         C          |            —            |           C           |        C        |        C         | Covered |
| Initial loading, success, and typed failure             |         C          |            —            |           C           |        C        |        C         | Covered |
| Cached data during background refresh                   |         C          |            —            |           C           |        —        |        C         | Covered |
| Resource retry after typed failure                      |         C          |            —            |           C           |        —        |        C         | Covered |
| Request deduplication and stale-generation rejection    |         —          |            C            |           C           |        —        |        C         | Covered |
| `flow.refresh`                                          |         C          |            —            |           C           |        —        |        —         | Covered |
| `flow.invalidate` and tag invalidation                  |         —          |            C            |           —           |        —        |        —         | Covered |
| `flow.ensure` machine invocation                        |         C          |            —            |           C           |        —        |        C         | Covered |
| `flow.observe` subscription invocation                  |         —          |            —            |           —           |        —        |        C         | Covered |
| `flow.view`                                             |         C          |            C            |           C           |        —        |        C         | Covered |
| `selectView` outside React                              |         —          |            —            |           C           |        —        |        —         | Covered |
| `flow.machine` state and event ownership                |         C          |            C            |           C           |        —        |        C         | Covered |
| Guards and `flow.can`                                   |         —          |            —            |           C           |        —        |        —         | Covered |
| Immediate actions and `flow.patch`                      |         —          |            C            |           —           |        —        |        —         | Covered |
| `flow.transaction` commit lifecycle                     |         —          |            C            |           —           |        —        |        C         | Covered |
| Transaction preview and exact rollback                  |         —          |            C            |           —           |        —        |        —         | Covered |
| Transaction overlap and stale completion                |         —          |            C            |           —           |        —        |        —         | Covered |
| Queued transaction work                                 |         —          |            —            |           —           |        —        |        C         | Covered |
| Transaction cancellation                                |         —          |            C            |           —           |        —        |        C         | Covered |
| `flow.outcomes` typed routes                            |         —          |            C            |           —           |        —        |        C         | Covered |
| `flow.run` transaction invocation                       |         —          |            C            |           —           |        —        |        C         | Covered |
| `flow.stream` and pressure policy                       |         —          |            —            |           —           |        —        |        C         | Covered |
| `flow.after` timers and restored deadlines              |         —          |            C            |           —           |        —        |        —         | Covered |
| `flow.child` lifecycle and retry                        |         —          |            —            |           —           |        —        |        C         | Covered |
| Runtime `dehydrateBoot` and `hydrateBoot`               |         —          |            —            |           —           |        C        |        C         | Covered |
| Atomic rejection of invalid boot data                   |         —          |            —            |           —           |        C        |        —         | Covered |
| Persisted offline domain data                           |         —          |            —            |           —           |        —        |        C         | Covered |
| `withRequestRuntime` request isolation                  |         —          |            —            |           —           |        C        |        —         | Covered |
| `FlowProvider` and stable React ownership               |         C          |            C            |           C           |        C        |        C         | Covered |
| React `useResource`                                     |         C          |            —            |           C           |        C        |        C         | Covered |
| React `useView`                                         |         C          |            C            |           C           |        —        |        C         | Covered |
| React `useActor`                                        |         C          |            C            |           C           |        —        |        C         | Covered |
| React 18 and React 19 packed consumers                  |         —          |            —            |           —           |        C        |        —         | Covered |
| `flow-state/testing` `test` application harness         |         C          |            —            |           —           |        C        |        —         | Covered |
| `flow-state/testing` `flowTest` actor harness           |         —          |            C            |           C           |        —        |        C         | Covered |
| Test rehydration support                                |         —          |            —            |           —           |        C        |        C         | Covered |
| Model traversal and replay                              |         —          |            —            |           C           |        —        |        —         | Covered |
| `runFlowScenario` and diagnostic scenario reports       |         —          |            C            |           —           |        —        |        C         | Covered |
| `createControlledStream`                                |         —          |            —            |           —           |        —        |        C         | Covered |
| Testing debug formatters and scenario evidence          |         —          |            C            |           —           |        —        |        C         | Covered |
| CLI declared-facts job                                  |         C          |            —            |           C           |        C        |        —         | Covered |
| CLI path-discovery job                                  |         —          |            —            |           C           |        —        |        —         | Covered |
| CLI reproducible-execution job                          |         —          |            C            |           —           |        —        |        C         | Covered |
| CLI runtime-evidence job                                |         —          |            C            |           —           |        —        |        C         | Covered |
| CLI human/JSON parity and typed non-success output      |         C          |            C            |           C           |        C        |        C         | Covered |

## Coverage expansion decisions

The basic example stays deliberately small. The optimistic example absorbs
direct patch actions, timers, scenario diagnostics, and transaction-focused
evidence because each supports its edit-submit-feedback lifecycle. The
bounded feed owns model traversal and graph/path explanation because cursor
navigation is a finite workflow. Server prefetch owns direct selection and
request/hydration boundaries. Offline recovery owns observation, connectivity
streams, controlled-stream testing, child supervision, persisted work, and
artifact evidence because those capabilities all participate in reconnecting
and draining an outbox.

Together the five examples cover every public capability family in the current
runtime, React, testing, server, and CLI-backed application-truth surfaces. This
does not require every example to use every API, and it does not justify an
incidental call: each `C` remains a required visible behavior with deterministic
or packed evidence. The applications follow the normal ownership and dependency
layout defined by
[`CLIENT_STRUCTURE_CONTRACT.md`](../CLIENT_STRUCTURE_CONTRACT.md).
