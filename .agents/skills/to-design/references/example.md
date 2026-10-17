# Module design example

Optional implementation exploration, not required Spec content or implementation evidence.
Representation choices below are proposals, not additional caller obligations.
Pseudocode helpers are not library APIs.
Tests call the production factory with real components; no internal collaborators are substituted.
On failure, retain configuration, operation sequence, results, and observed IDs/bytes for replay.

```text
spec BoundedQueue
status proposed
basis Illustrative agreed in-memory queue contract.
location src/queue
realized_by src/queue/createQueue.ts
provides createQueue, enqueue, dequeue
derives_from [@plan.Queue.O1, @plan.Queue.D1, @plan.Queue.V1, @task.Queue.T1]
requirements
    R1 FIFO
        source Illustrative caller requirement.
        must dequeue returns accepted items in insertion order.
    R2 Item bound
        source Illustrative caller requirement.
        must The queue retains at most capacity items.
    R3 Byte bound
        source Illustrative caller requirement.
        must Retained item charges total at most byteCapacity bytes.
    R4 Rejection
        source Illustrative caller requirement.
        must Rejected enqueue leaves queue state unchanged.
    R5 Empty result
        source Illustrative caller requirement.
        must dequeue on an empty queue returns None without mutation.
    R6 Payload isolation
        source Illustrative caller requirement.
        must Caller mutation after enqueue cannot change queued payload bytes.
    R7 Configuration
        source Illustrative caller requirement.
        must Invalid capacities return InvalidConfig without exposing a queue.
open
    Q1 Implementation and executable checks are not identified.
        outcome All product evidence remains unresolved.
model
    Config = { capacity: number, byteCapacity: number }
    ConfigError = InvalidConfig
    AdmissionError = Full | ByteLimit
    Item = { id: string, payload: Uint8Array }
    Dequeued = { tag: Some, value: Item } | { tag: None }
    ResultMapping = Result<A, E> denotes neverthrow Result<A, E>; pseudocode uses Ok and Err.
    QueueAPI = { enqueue: Item -> Result<void, AdmissionError>, dequeue: () -> Dequeued }
    Entry = { id: string, payload: Uint8Array, charge: integer >= 0 }
    QueueState = { items: Entry[], capacity: integer >= 0 }
    BudgetState = { used: integer >= 0, limit: integer >= 0 }; owned by Queue, not independently.
    charge = copied payload.byteLength; metadata is excluded from this agreed byte budget.
    OperationBoundary = synchronous return; intermediate state is not observable.
invariants
    I1 At operation boundaries, items.length <= capacity. [@R2]
    I2 At operation boundaries, the sum of admitted payload charges for retained items
       never exceeds the configured byte budget. [@R3]
owner Queue
    lifetime one queue instance
    state items, capacity, used, limit
    invariants
        I3 At dequeue, returned bytes equal the admitted bytes despite caller mutation. [@R6]
operations
    createQueue(config: Config) -> Result<QueueAPI, ConfigError>
        ensures Valid safe-integer nonnegative capacities yield items=[], used=0, configured limits.
                Invalid capacities yield Err(InvalidConfig). [@R7]
    enqueue(item: Item) -> Result<void, AdmissionError>
        ensures Err implies after.items == before.items and after.used == before.used. [@R4]
                Ok implies after.items == before.items ++ [copiedEntry(item)].
    dequeue() -> Dequeued
        ensures None implies before.items is empty and state is unchanged. [@R5]
                Some returns before.items[0]; after.items == before.items.slice(1). [@R1]
algorithm
    createQueue(config)
        if any capacity is not a nonnegative safe integer: return Err(InvalidConfig)
        initialize items=[], used=0, capacity=config.capacity, limit=config.byteCapacity
        return Ok(factory closure exposing enqueue and dequeue)
    enqueue(item)
        charge = item.payload.byteLength
        if items.length == capacity: return Err(Full)
        if charge > limit - used: return Err(ByteLimit)
        entry = copyEntry(item, charge)  // allocation failure occurs before mutation
        items.append(entry)
        used += charge
        return Ok(undefined)
    dequeue()
        if items.isEmpty(): return None
        entry = items.removeFirst()
        used -= entry.charge
        return Some(entry)
    argument
        Optional design property: used == sum(e.charge for e in items) at operation boundaries.
        Paired append/remove accounting preserves it; admission checks preserve I1 and I2.
        Copy-before-commit enforces I3. Operations neither await nor run caller callbacks.
composition
    flow
        caller -> Queue admission and budget check -> paired state update -> result
    boundaries
        One Queue owner encapsulates items and accounting because they change together.
        Byte accounting is a concern, not an independent state authority.
rules
    failure Allocation failures propagate as host exceptions before commit; do not classify as rejection.
    publication No await, callback, or external view can observe paired items/used writes.
realization typescript
    Use the TypeScript realization guide throughout this design.
    Construct one private factory closure; return only enqueue and dequeue operations.
    Validate configuration at factory admission; use neverthrow for recoverable results.
    Copy Uint8Array at admission. Do not expose mutable items or accounting state.
coverage
    @R1
        enforced_by dequeue head removal
        open_by [@Q1]
    @R2
        enforced_by [@I1], enqueue admission
        open_by [@Q1]
    @R3
        enforced_by [@I2], proposed Queue accounting
        open_by [@Q1]
    @R4
        enforced_by enqueue rejection before writes
        open_by [@Q1]
    @R5
        enforced_by dequeue empty branch
        open_by [@Q1]
    @R6
        enforced_by [@I3], copyEntry
        open_by [@Q1]
    @R7
        enforced_by createQueue configuration validation
        open_by [@Q1]
tests
    T1 Enqueue A then B through the factory API; dequeue returns A, B, None. [@R1, @R5]
    T2 With capacity 1, accept A and reject B; dequeue still returns A then None. [@R2, @R4]
    T3 With byte limit 3, accept 2 bytes and reject 2; dequeue, then accept 3 bytes. [@R3, @R4]
    T4 Mutate the caller's payload after enqueue; dequeued bytes retain their admitted values. [@R6, @I3]
    T5 Reject negative, fractional, NaN, infinite, and unsafe capacities with InvalidConfig. [@R7]
    T6 With capacity 0 reject even empty payloads; with byte limit 0 accept only empty payloads.
    T7 Repeat rejection, drain, then refill; compare dequeued IDs/bytes with an independent FIFO.
```
