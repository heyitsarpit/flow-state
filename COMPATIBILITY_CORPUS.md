# Compatibility corpus

[Back to the plan tracker](./TASK.md)

Authority: compatibility is tracked per surface. A packet may change one surface
only by naming the old fixture, the new fixture, and the migration rule.

| Surface                  | Current version/support                                                                                             | Permanent fixture locations                                                                                                | Compatible change                                               | Requires approval                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Source API               | Current root plus `./react`, `./testing`, `./server`, `./inspect`; ESM-only                                         | `API_CONTRACT.md`, `TYPE_INFERENCE_CONTRACT.md`, `packages/flow-state/src/public-api-types.test.ts`, packed proof packages | Additive calls preserving existing valid calls                  | Removing/renaming calls, mandatory `bind(App)`, new constructor family   |
| Runtime behavior         | Current runtime plus compatibility-focused starts                                                                   | `OWNER_MAP.md`, family tests, Launch Workspace tests                                                                       | Correctness fixes that preserve documented compatibility floors | Changing child floor, actor reuse semantics, or external rollback claims |
| Receipts/evidence        | Compatible public supertype, migrating toward discriminated serializable facts                                      | `tasks/SEMANTIC_DECISIONS.md`, `LAWS_AND_ORACLES.md`, inspection/CLI tests                                                 | Add derived fields, narrow internal discriminants               | Removing readable fields before migration packet                         |
| In-memory snapshots      | Current public snapshots, future exact discriminated lanes                                                          | family restore tests, P4C fixtures                                                                                         | Reject impossible/contradictory states at attach boundaries     | Changing valid serialized v1 shape without v2                            |
| Wire/boot                | `flow-state/runtime-boot.v1` remains default                                                                        | Launch Workspace boot proof, P4C v1 corpus                                                                                 | Stricter invalid-payload rejection before mutation              | New durable facts requiring v2                                           |
| Packed exports           | `flow-state`, `flow-state/react`, `flow-state/testing`, `flow-state/server`, `flow-state/inspect`, `./package.json` | `examples/typescript-proof-multi-entry`, packed React 18/19 packages                                                       | Additive types/values by subpath                                | Deep/private entry, package split, CJS default                           |
| Peer/environment         | core is React/Node neutral; React subpath supports React 18/19 peer types; Node host only for CLI/server scripts    | `examples/typescript-proof-packed-react-18`, `examples/typescript-proof-packed-react-19`, package hygiene tests            | New optional peers by subpath                                   | Core React dependency or duplicate package interop                       |
| Duplicate package/Effect | Ownership tokens from different package/runtime instances are rejected                                              | future P1/P5 duplicate-install fixtures                                                                                    | Explicit interop contract only                                  | Silent structural acceptance                                             |

v2 triggers are deliberately narrow: portable remaining-duration timers, durable
owner/generation facts absent from v1, redaction classes that cannot be
dual-read, or a non-dual-readable wire shape. Crash/durability is a nonclaim:
Flow State guarantees in-process decode-before-mutation and coherent
publication, while hosts own durable storage, process death, and external I/O
idempotency.
