# Capacity correctness policy

[Back to the roadmap](./TASK.md)

Capacity is a correctness and resource-exhaustion concern, not a performance
target. Every retained collection must be topology-bounded, runtime-lifetime
owned, or governed by an explicit configurable limit with deterministic
overflow/eviction, active-entry protection, cleanup, and diagnostics.

This roadmap does not invent numeric limits. Defaults and maxima belong beside
the production configuration that enforces them and are proved at their exact
boundary. Timing, throughput, package size, and historical measurements never
select or revise capacity.

| Structure                                | Owner                         | Required correctness behavior                                                                                         | Proof owner       |
| ---------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Resource records and lookups             | ResourceStore                 | bounded/configured; fetching, subscribed, previewed, and actor-referenced entries protected; exact generation cleanup | P1A.4a/P1B.1      |
| Resource subscriptions and notifications | ResourceStore/NotificationHub | scoped release, bounded queued publication, no silent committed-batch drop                                            | P1B.2/P4B.1a      |
| Actor registry and mailbox               | OrchestratorSystem            | admission before work, bounded/configured mailbox, leased/stopping generations protected, exact eviction              | P1C.1/P1C.3/P1C.4 |
| Transaction serialize queues             | Actor transaction owner       | bounded/configured per canonical key, typed rejection before work, exact dequeue generation                           | P2.1c             |
| Stream buffers                           | Actor stream owner            | each exported pressure policy states capacity/order/overflow and releases retained values on finalization             | P3B.2             |
| Timer and child registries               | Actor/parent Scope            | runtime-lifetime owned or configured, stale generations retired, active generation protected                          | P3C.1/P3D.2       |
| Evidence history                         | EvidenceLog                   | bounded retention, explicit gap/truncation facts, active commit batch protected, eviction cannot change semantics     | P1D.3b/P4D        |
| Durable input                            | Boundary decoder              | depth/count/byte limits enforced before mutation with one immutable decoded result                                    | P4C.1             |
| React leases                             | Runtime lease owner           | scoped/configured, shared owners protected, final lease triggers documented cleanup                                   | P4B.1             |
| CLI/evidence export                      | CLI adapter                   | bounded output or explicit fail/truncation result after semantic state commits                                        | P4D.2             |

Silent overflow, unbounded retention by accident, and eviction of active/newer
generations are correctness failures. Changing a concrete limit requires its
production boundary test, not a planning-document update ceremony.
