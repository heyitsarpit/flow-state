# Example Design Spec

Built from the JobScheduler example in the Requirements → Spec IR skill (R1 to R5). Note how gaps in the Spec IR become `open` entries, and how nothing outside the requirements (a database, an API) is invented.

```design
slice JobScheduling
implements  R1 R2 R3 R4 R5
depends     none
provides    submit, cancel, startNext, complete
target      effect-v4

open
  Q1   equal-priority order is unspecified
       assume A1: FIFO within equal priority (also prevents starvation among equals)
  FB1  spec-feedback: Spec IR defines next() and start separately. Does next() also start?
       assume A2: startNext = pick + start as one atomic step
  FB2  spec-feedback: running_count and queued are used but never declared
       resolved as derived terms on the owner
  Q2   no bound on queue length
       assume A3: reject with QueueFull above MAX_QUEUE (configurable)
  Q3   persistence is not mentioned
       assume A4: state is in memory; durability is out of scope for this slice

types
  JobId     = String where non-empty        -- opaque, parse at edge          [R1]
  Priority  = Int where 0..100              -- opaque, parse at edge          [R1]
  NewJobInput = {id: String, priority: Int}  -- untrusted boundary shape
  NewJob    = {id: JobId, priority: Priority}                                [R1]
  Job       = Queued{id, priority, seq}     -- seq is design, for FIFO (A1)
            | Running{id}
            | Cancelled{id}                 -- terminal
            | Completed{id}                 -- terminal

composition
  flow
    NewJobInput -> NewJob -> Queued
      -> (Cancelled | Running -> Completed)

  concerns
    parseJob
      kind: transformer
      contract: NewJobInput -> NewJob
      knows: JobId and Priority parsing at the input boundary

    scheduler
      kind: capability
      contract: submit, cancel, startNext, complete
      knows: queue ordering, capacity, and lifecycle state

  protocols
    NewJob
      facts: JobId is non-empty; Priority is within 0..100

    Job.Queued
      facts: admitted job with assigned sequence and queue membership

    Job.Running
      facts: atomically removed from Queued and counted against capacity

  boundaries
    parseJob -> scheduler.submit
      protocol: NewJob
      hides: raw input and parsing details

    scheduler -> callers
      protocol: JobId and operation results
      hides: heap, counters, and state coordination

  promoted
    parseJob
      reason: validates domain values under an independent contract

    scheduler
      reason: owns shared lifecycle invariants and an independently testable contract

owner Scheduler                             -- sole authority for Job state
  state    jobs: Map<JobId, Job>
           queue: indexed max-heap of Queued, key (priority desc, seq asc)
           next_seq: Int
  derived  running_count = count(jobs, Running)   -- updated inside every commit
  invariants
    I1  queue contains exactly the Queued jobs                        [R2]
    I2  running_count == count(Running) and running_count <= 5        [R3]
    I3  job ids are unique                                            [design]
    I4  next_seq strictly increases, checked before increment         [design]

ops   (ids in, typed results out; state is checked inside the commit)

submit(NewJob) -> JobId | DuplicateJob | QueueFull | SeqExhausted
  pre     id not in jobs; queue size < MAX_QUEUE; next_seq < MAX_SEQ
  commit  jobs[id] = Queued{id, priority, next_seq}; queue.push; next_seq++
  post    exists Job with that id                                      [R1]

cancel(JobId) -> Cancelled | NotFound | InvalidTransition
  pre     jobs[id] is Queued
  commit  queue.remove(id); jobs[id] = Cancelled                       [R4, R5]

startNext() -> Running | NothingQueued | AtCapacity
  pre     queue not empty; running_count < 5
  commit  j = queue.popMax(); jobs[j.id] = Running{j.id}; running_count++   [R2, R3]
  post    j.priority == max priority of Queued jobs before the commit

complete(JobId) -> Completed | NotFound | InvalidTransition
  pre     jobs[id] is Running
  commit  jobs[id] = Completed; running_count--

algo
  representation  indexed max-heap (remove by id) + counter
  complexity      submit, startNext, cancel O(log n); complete O(1)
  argument        startNext returns the maximum because I1 holds (the heap holds
                  exactly the Queued jobs) and the heap orders by key. cancel keeps
                  I1 by removing from the heap in the same commit.

rules
  commit     every op's commit is one atomic update of all owner state;
             `pre` runs inside it, never before it
  locks      no I/O or callbacks inside a commit
  bounds     queue <= MAX_QUEUE (A3)
  monotonic  next_seq checked before increment (I4)
  tasks      none; this slice spawns no background work

guarantees
  R1  priority range          IMPOSSIBLE   Priority is only constructible by parse
  R2  highest priority first  GUARANTEED   I1 + heap order;  VERIFIED by model test
  R3  at most 5 running       GUARANTEED   pre and increment in one commit
  R4  queued jobs cancellable GUARANTEED   cancel pre/commit
  R5  cancelled never runs    GUARANTEED   Cancelled is terminal; startNext pops only Queued;  VERIFIED by model test

attacks
  complete a cancelled job                  REJECTED    InvalidTransition
  complete twice                            REJECTED    second call sees Completed
  two startNext calls at 4 running          GUARANTEED  pre checked inside the commit
  cancel races startNext on the same job    GUARANTEED  one commit wins, the other sees the new state
  submit priority 900                       REJECTED    parse error at the edge
  mutate the internal queue                 IMPOSSIBLE  not exposed
  flood submit                              REJECTED    QueueFull
  starvation among equal priorities         VERIFIED    model test asserts FIFO within a priority
  accepted risks: none

tests
  parse tests for JobId and Priority
  transition table test for Job (every non-declared transition rejected)
  model test: random op sequences; assert I1 to I4 after every step
  concurrency test: interleave cancel, startNext, complete on the same jobs

order
  types -> Job union -> heap + seq ordering (pure) -> errors -> Scheduler (atomic update)
        -> edge adapters -> tests
```
