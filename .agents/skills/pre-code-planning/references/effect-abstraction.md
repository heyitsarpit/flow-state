# Effect abstraction design

Use before implementing non-trivial behavior.

**Goal:** derive an Effect program from requirements so that domain types preserve established facts, services own invariants, and predictable misuse becomes impossible or explicit.

For how concerns and protocols connect, read [composition-design.md](composition-design.md). Composition design determines how data and authority move between concerns; this reference determines how each concern enforces guarantees and is realized in Effect.

A concern that owns transformation knowledge is generally a pure function. A concern that owns authority to access or mutate state is generally a capability exposed through a Service. Effect `Layer` is for dependency provision, not a generic architectural level.

```text
requirements
→ properties
→ Schema / domain model
→ operations
→ algorithm
→ Service boundary
→ Layer
→ verification
```

Do not start with files, classes, handlers, or framework architecture.

---

## 1. Specify

Turn requirements into:

```text
preconditions
postconditions
invariants
legal transitions
temporal properties
```

Keep traceability:

```text
R1 -> P1
R2 -> P2, P3
```

Example:

```text
R1:
  cancelled jobs never execute

P1:
  Cancelled -> never Running
```

Resolve ambiguities that materially affect the model.

---

## 2. Model Valid Data with Schema

Use `Schema` where values cross trust boundaries or carry domain constraints.

```ts
import { Schema } from "effect"

const Priority = Schema.Int.pipe(
  Schema.between(0, 100)
)

type Priority = typeof Priority.Type
```

Think:

```text
unknown / encoded
       ↓
    Schema
       ↓
trusted domain value
```

Decode once at the boundary. Internal code should consume the decoded domain type rather than repeatedly validating primitives.

Prefer meaningful domain values:

```text
UserId
Priority
EmailAddress
PositiveAmount
```

over primitives whose meaning exists only by convention.

---

## 3. Model State Explicitly

Represent mutually exclusive states as tagged unions.

```ts
import { Data } from "effect"

type Job = Data.TaggedEnum<{
  Queued: {
    readonly id: JobId
    readonly priority: Priority
  }

  Running: {
    readonly id: JobId
  }

  Cancelled: {
    readonly id: JobId
  }

  Completed: {
    readonly id: JobId
  }
}>

const Job = Data.taggedEnum<Job>()
```

Prefer this over:

```ts
type Job = {
  running: boolean
  cancelled: boolean
  completed: boolean
}
```

Ask:

> What invalid states can the current model represent?

Remove them when practical.

Use exhaustive matching when behavior depends on every variant.

---

## 4. Derive Operations from State Transitions

Operations should consume evidence of the required state and produce evidence of the resulting state.

Conceptually:

```ts
start:
  QueuedJob -> Effect<RunningJob, StartError>

cancel:
  QueuedJob -> Effect<CancelledJob, CancelError>

complete:
  RunningJob -> Effect<CompletedJob, CompleteError>
```

Not:

```ts
complete:
  JobId -> Effect<void, Error>
```

when the stronger input can encode the operation's precondition.

Aim for:

```text
valid state
    ↓
allowed operation
    ↓
new valid state
```

rather than:

```text
anything
    ↓
operation
    ↓
runtime checks everywhere
```

---

## 5. Derive the Algorithm

For each operation identify:

```text
input
output
error
precondition
postcondition
maintained invariants
complexity requirements
```

Then choose the algorithm and representation that naturally maintain those properties.

Example:

```text
requirement:
  highest priority job runs first

representation:
  priority queue

invariant:
  heap ordering

operation:
  next() removes maximal element

complexity:
  insert O(log n)
  next O(log n)
```

Data structures are implementation details unless callers genuinely need their semantics.

---

## 6. Preserve Knowledge

Never casually widen a domain value after establishing a stronger fact.

Avoid:

```text
Unknown
→ Schema
→ ValidatedEmail
→ string
→ validate again
```

Prefer:

```text
Unknown
→ Schema
→ EmailAddress
→ EmailAddress
→ EmailAddress
```

Likewise preserve distinctions such as:

```text
QueuedJob
RunningJob
AuthenticatedUser
NonEmptyCollection
PositiveAmount
```

The rule is:

> Every successful computation should preserve or increase what the type system knows.

Do not throw established information away merely for convenience.

---

## 7. Put Effects in Effect

Keep pure domain transformations pure.

```ts
const calculatePriority =
  (job: Job): Priority => ...
```

Use `Effect` when computation involves:

```text
failure
dependencies
async work
concurrency
resources
time
retry
cancellation
external state
```

Represent expected failures in the error channel:

```ts
Effect<A, E, R>
```

Read it as:

```text
success:      A
expected error: E
requirements: R
```

Avoid collapsing meaningful failures into:

```ts
Effect<A, Error>
```

when callers need to distinguish them.

---

## 8. Define the Service Boundary

When operations cooperate to preserve shared invariants, place them behind one service.

```ts
class Scheduler extends Context.Service<
  Scheduler,
  {
    readonly submit:
      (job: NewJob) =>
        Effect.Effect<JobId, SubmitError>

    readonly cancel:
      (job: QueuedJob) =>
        Effect.Effect<CancelledJob, CancelError>

    readonly startNext:
      Effect.Effect<Option.Option<RunningJob>, StartError>

    readonly complete:
      (job: RunningJob) =>
        Effect.Effect<CompletedJob, CompleteError>
  }
>()("app/Scheduler") {}
```

The service owns the capability.

Do not expose:

```text
mutable queue
internal maps
locks
counters
state setters
```

Expose:

```text
submit
cancel
startNext
complete
```

Group state together when it participates in the same invariant.

---

## 9. Separate Interface from Implementation with Layer

The `Service` describes **what consumers may do**.

A `Layer` supplies **how it works**.

```text
Scheduler
    │
    │ capability contract
    ▼
Effect program

Scheduler.layer
    │
    │ implementation
    ▼
heap + persistence + synchronization
```

Dependencies required by the implementation belong in the Layer graph.

Conceptually:

```ts
const SchedulerLive =
  Layer.effect(
    Scheduler,
    Effect.gen(function* () {
      const store = yield* JobStore
      const clock = yield* Clock

      // construct implementation

      return {
        submit,
        cancel,
        startNext,
        complete
      }
    })
  )
```

Consumers depend on `Scheduler`, not `SchedulerLive`.

This preserves the abstraction boundary while allowing alternate implementations for tests or environments.

---

## 10. Keep Boundaries at the Edges

Decode external data before it reaches domain logic.

```text
HTTP JSON
   ↓
Schema.decode
   ↓
Command
   ↓
Service
   ↓
Domain
```

Likewise:

```text
database row
message
configuration
filesystem
RPC input
```

should cross an explicit boundary.

Do not allow `unknown`, arbitrary JSON, or weak external representations to leak deeply into domain code.

---

## 11. Place Each Guarantee at the Strongest Practical Layer

Prefer roughly:

```text
Schema / domain representation
        ↓
tagged state model
        ↓
operation signature
        ↓
Service boundary
        ↓
algorithm
        ↓
Effect error
        ↓
runtime coordination
        ↓
property/model test
        ↓
formal verification
```

Examples:

```text
priority ∈ 0..100
→ Schema

Queued | Running | Completed
→ tagged union

only Running can complete
→ operation input type

queue cannot be mutated externally
→ Service boundary

highest priority first
→ algorithm

duplicate ID discovered in storage
→ typed Effect error

no starvation
→ property/model test
```

Do not encode something dynamically unknowable into elaborate types merely to avoid an explicit Effect error.

---

## 12. Attack the API

Try to write incorrect programs using only public capabilities.

```ts
complete(cancelledJob)

start(completedJob)

Priority.make(900)

scheduler.internalQueue.push(...)

complete(jobTwice)
```

Classify each:

```text
IMPOSSIBLE
  cannot typecheck / cannot construct

REJECTED
  Schema or Effect error

GUARANTEED
  Service/algorithm/runtime preserves it

VERIFIED
  property/model test

POSSIBLE
  unprotected
```

Investigate important `POSSIBLE` cases before implementation.

---

## 13. Verify Properties

Derive verification directly from the specification.

```text
Schema tests
    ← value constraints

transition tests
    ← domain state model

service tests
    ← operations + errors

property tests
    ← invariants

model tests
    ← sequences of operations

Layer integration tests
    ← real dependencies

concurrency tests
    ← interleavings
```

Prefer testing domain properties over implementation structure.

---

# Required Planning Output

Before implementation produce:

### Requirements

```text
R1 ...
R2 ...
```

### Properties

```text
P1 ...
P2 ...
```

with:

```text
R1 -> P1
R2 -> P2
```

### Domain

```ts
const Id = Schema...
const Amount = Schema...

type State = Data.TaggedEnum<...>
```

### Operations

```text
Input
→ Effect<Output, DomainError, Requirements>
```

### Algorithm

```text
representation
algorithm
maintained invariants
complexity
```

### Service

```ts
class DomainService extends Context.Service<...>()(...) {}
```

Expose capabilities, not representation.

### Layers

```text
DomainService
├── Live
├── Test
└── required services
```

### Guarantee Map

```text
P1 -> Schema
P2 -> tagged state
P3 -> operation signature
P4 -> Service
P5 -> algorithm
P6 -> property test
```

### Bug Audit

```text
invalid value          impossible
invalid transition     impossible
duplicate resource     typed failure
ordering violation     algorithm invariant
starvation             property tested
```

### Implementation Order

Implement in dependency order:

```text
Schema/domain values
→ state model
→ pure algorithms
→ domain errors
→ Service contract
→ Layer implementation
→ boundary adapters
→ property/integration tests
```

---

# Design Laws

**Schema establishes facts at boundaries.**

**Domain types preserve those facts internally.**

**Tagged unions encode meaningful state distinctions.**

**Operation signatures encode legal transitions.**

**Effect models computation, expected failure, and requirements.**

**Services define capabilities and abstraction boundaries.**

**Layers provide implementations and dependency graphs.**

**Keep pure logic pure.**

**Expose domain operations, not internal state.**

**Do not discard information already established by the program.**

**Every requirement must terminate in an enforcement or verification mechanism.**

Final test:

> Using only the public Schemas, domain values, and Services, what programs can a caller still write that violate the requirements?

Reduce that set as far as is practical before implementation.
