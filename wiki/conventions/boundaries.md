# Boundaries

Untrusted input becomes trusted in exactly one place per source, by one complete Schema decode; after that, internals
take only the decoded, branded value and never check it again. A public function either decodes its arguments (an
entry) or stores them unread (a builder). Anything else that throws becomes a FlowError Defect.

| Source                      | Where it is checked                                             | Owner                  |
| --------------------------- | --------------------------------------------------------------- | ---------------------- |
| Construction config         | `definition`, `machine`: one Schema each, via the walker        | @task.V3.T81           |
| Builder arguments           | captured unread; checked by the `definition`/`machine` decode   | @task.V3.T81           |
| Flow-made values (tokens)   | `WeakSet` membership, per definition for its tokens; event admissions by `WeakMap` (built) | @task.V3.T81 |
| App and Runtime setup       | `app` (its findings), `runtimeSetup` (a Schema decode, then `app`'s), in `entry` | built (@task.V3.T94) |
| Event payloads              | `send`, `E.X`, Story steps: the event's compiled check          | built (@task.V3.T81)   |
| Refs and actor calls        | `ensureActor`, `createActor`, `disposeActor` in `entry`; a handle's Runtime by `WeakMap` | built (@task.V3.T94) |
| Runtime options             | `ready`, `dispose`: `entryEffect`                               | built (@task.V3.T94)   |
| Any stray throw in an entry | `entry` / `entryEffect`: FlowError Defect with the cause        | built (@task.V3.T94)   |
| User callback results       | one callback wrapper; patch keys and values by field Schema     | @task.V3.T95           |
| Server answers              | only through the user's mapper, then the event's check          | @task.V3.T95           |
| A machine's sends           | the target ref decoded, the event by the target's check         | @task.V3.T96           |
| Saved records at boot       | one Schema per record kind, from Compiled; branded ids          | @task.V3.T92           |
| Records across releases     | version and fingerprint stamps                                  | @task.V3.T56           |
| Real storage (IndexedDB)    | the host adapter's read, then the record Schemas                | @task.V3.T58, T28      |
| CLI-loaded config           | the same entries as construction                                | @task.V3.T22           |

Brands: `ActorName`, `RecordKey`, `LaneKey`, `AttemptId`, `StateName`, each a `Schema.brand` built from Compiled.

Not checkable, by contract: a callback that never returns; a forged Effect Schema (its parser's throw is caught); a
service's answer before its mapper.

Enforced by lint (no `~` marks, `throw` only at listed sites) and the surface test
(`packages/flow-state-v3/tests/surface/`), which requires every function reachable from the root route and every
fixture app's setup, app, Runtime and actor to be an entry or a builder (`src/entry.ts`). The walk stops at Flow's
inert data (a builder's result, Compiled, a bound contract, a walker) and Effect's own values. A Runtime's driver and
a handle's link live in `WeakMap`s beside them, so no caller reaches them. A new source changes this page first,
then the code.

Status: accepted by the user (2026-11-18); partly built. Built (@task.V3.T94): `entry` and `entryEffect` on every
root-route function, the surface test, the lint rules, and the driver and handle links in `WeakMap`s. Parked in
@task.V3.T98: construction's identity checks and complete decode, builders that read their arguments, functions
handed out inside inert data, and the testing route, each red as an inverted Diagnostics R1 test. Source:
[replan-2026-11-18.md](../plans/flow/references/proposals/replan-2026-11-18.md) section 4.
