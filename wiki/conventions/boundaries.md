# Boundaries

Untrusted input becomes trusted in exactly one place per source, by one complete Schema decode; after that, internals
take only the decoded, branded value and never check it again. A public function either decodes its arguments (an
entry) or stores them unread (a builder). Anything else that throws becomes a FlowError Defect.

| Source                      | Where it is checked                                             | Owner                  |
| --------------------------- | --------------------------------------------------------------- | ---------------------- |
| Construction config         | `definition`, `machine`: one Schema each, via the walker        | @task.V3.T81           |
| Builder arguments           | captured unread; checked by the `definition`/`machine` decode   | @task.V3.T81           |
| Flow-made values (tokens)   | `WeakSet` membership, per definition for its tokens             | @task.V3.T81           |
| App and Runtime setup       | `app`, `runtimeSetup`: Schema decode in `entry`                 | @task.V3.T94           |
| Event payloads              | `send`, `E.X`, Story steps: the event's compiled check          | built (@task.V3.T81)   |
| Refs and actor calls        | `ensureActor`, `createActor`, `disposeActor`: ref decode        | @task.V3.T94           |
| Runtime options             | `ready`, `dispose`: `entryEffect`                               | @task.V3.T94           |
| Any stray throw in an entry | `entry` / `entryEffect`: FlowError Defect with the cause        | @task.V3.T94           |
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

Enforced by lint (no `~` marks, `throw` only at listed sites) and the surface test, which requires every reachable
public function to be an entry or a builder. A new source changes this page first, then the code.

Status: proposed design, accepted by the user (2026-11-18); not built. Source:
[replan-2026-11-18.md](../plans/flow/references/proposals/replan-2026-11-18.md) section 4.
