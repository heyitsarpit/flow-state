# Capacity policy

[Back to the plan tracker](./TASK.md)

Authority: P0.6 records explicit safety limits before implementation packets
choose data structures. These are correctness and resource-exhaustion contracts,
not performance targets, and they must be proved through boundary behavior,
typed diagnostics, cleanup, and no corruption. Timing and package-size
measurements do not select or revise these limits.

| Structure                    | Owner                         | Safety default / max                                       | Overflow or eviction                                                              | Active-entry protection                                                  | Correctness proof                   |
| ---------------------------- | ----------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------- |
| ResourceStore records        | ResourceStore                 | 10,000 canonical resource instances / configurable max     | reject with `capacity.resource.records` unless caller requested explicit eviction | never evict fetching, subscribed, previewed, or actor-referenced entries | P1B.1/P1A.4a record-capacity test   |
| In-flight lookups            | ResourceStore                 | 1,000 keyed lookup fibers / configurable max               | reject/admit-later with `capacity.resource.inflight`                              | exact generation finalizer must retire before slot reuse                 | P1B.1/P1A.4a lookup-pressure test   |
| Resource subscribers         | NotificationHub/ResourceStore | 5,000 scoped subscriptions / configurable max              | reject subscription with `capacity.resource.subscribers`                          | subscribed entry is protected from inactive eviction                     | P4B.1a external-store churn test    |
| Notification queue           | NotificationHub               | 1,000 pending batches / configurable max                   | fail producer with `capacity.notification.queue`                                  | committed batch cannot be dropped silently                               | P1B.2 batch-pressure test           |
| Actor registry               | OrchestratorSystem            | 1,000 live actor incarnations / configurable max           | reject start with `capacity.actor.registry`                                       | leased, child-owned, or stopping actors remain until finalizer finishes  | P1C.1/P1C.3a registry-capacity test |
| Actor mailbox                | OrchestratorSystem            | 1,000 pending events per actor / configurable max          | reject send with `capacity.actor.mailbox` before client work                      | current transition cannot be evicted                                     | P1C.4b mailbox-pressure test        |
| Transaction serialize queues | Actor transaction owner       | 256 queued attempts per concurrency key / configurable max | reject start with `capacity.transaction.queue`                                    | active/latest publication generation is protected                        | P2.1b/P2.1c queue-pressure test     |
| Stream buffers               | Actor stream owner            | 1,000 pending values per binding / configurable max        | selected policy emits `capacity.stream.buffer` or interrupts stream               | active state-owned binding is interrupted before replacement             | P3B.2 stream-pressure test          |
| Timer registry               | Actor timer owner             | 1,000 scheduled timers per actor / configurable max        | reject schedule with `capacity.timer.registry`                                    | due timer generation protected until fire/interrupt                      | P3C.1 timer-pressure test           |
| Child registry               | Parent actor owner            | 500 child generations per actor / configurable max         | reject spawn with `capacity.child.registry`                                       | current child generation protected until stop finalizer                  | P3D.2 child-pressure test           |
| Evidence log                 | EvidenceLog                   | 10,000 facts or 8MiB / configurable max                    | evict oldest with gap marker `capacity.evidence.evicted`                          | facts for active transition batch are protected                          | P1D.3b/P4D evidence-retention test  |
| Hydration payload            | Hydration decoder             | 8MiB, depth 64, 10,000 entries / configurable max          | reject before mutation with `capacity.hydration.payload`                          | no partial attach; decoded value immutable                               | P4C.1a/P4C.1b hostile-payload test  |
| React leases                 | Runtime lease owner           | 1,000 leases per actor/runtime / configurable max          | reject/acquire-fail with `capacity.react.leases`                                  | leased actor cannot be evicted by inactive cleanup                       | P4B.1b/P4B.1d lease-pressure test   |
| CLI output/evidence export   | CLI adapter                   | 4MiB text, 16MiB JSON / configurable max flag              | fail closed with `capacity.cli.output` and truncation hint                        | semantic state already committed; export can fail                        | P4D.2/P5.2 output-capacity test     |

Silent drop is never the default. A packet that wants a different default must
change this file and its proof command in the same commit.
