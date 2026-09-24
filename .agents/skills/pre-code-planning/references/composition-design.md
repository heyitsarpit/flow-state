# Composition Design

Use when deciding how a slice is decomposed into reusable functions, services, protocols, and composition sites.

**Goal:** assemble the slice from concerns that each own one piece of knowledge or authority, communicate through explicit protocol values, and compose recursively into larger concerns without leaking implementation details.

```text
input
  → concern
  → protocol
  → concern
  → protocol
  → ...
  → behavior
```

A **concern** is one unit of decomposition.

A **level** is its semantic altitude in the composition.

Do not call these layers. In Effect, `Layer` means dependency provision.

Composition and correctness are interleaved:

```text
trace flow
→ identify concerns
→ place state/invariant owners
→ strengthen protocols with established facts
→ refine boundaries
→ derive APIs
```

Skip this for a trivial slice with only one real concern.

---

## 1. Trace the semantic flow

Start from the slice's highest-level input and follow it to each effect or result.

Write the semantic forms the data takes.

Flows may branch and join:

```text
Request
  → ValidatedRequest
  → Plan
      ├→ OperationA
      └→ OperationB
  → Result
```

Do not begin from files, classes, or existing helper names.

A meaningful change in what a value *means* is a candidate boundary.

---

## 2. Identify concerns

For each transformation ask:

> What knowledge or authority is required to turn this input into this output?

Use two broad forms:

```text
transformer
  A -> B
  A -> Effect<B, E, R>

  owns knowledge about how data is transformed

capability
  A -> Effect<B, E, R>

  owns authority to access or change state, perform I/O,
  allocate resources, or use an external capability
```

Examples:

```text
AbiInputs -> EncodedParams
  transformer

MessageParts -> Message
  transformer

Plan -> Effect<Result, RunError, Runtime>
  capability
```

A concern should own one coherent piece of knowledge or authority.

If its contract cannot be stated clearly, it may own too much.

---

## 3. Define protocols

A protocol is the value crossing a concern boundary.

The producer owns how the value is constructed.

The consumer depends only on what the value means.

A good protocol:

* has domain meaning independent of its producer;
* carries facts already established by earlier concerns;
* is immutable;
* cannot normally be constructed in an invalid state;
* exposes only the information its consumers need.

Examples:

```text
ValidatedRequest
Message
CallData
TransactionStep
Plan
ExecutionEvent
Result
```

Do not reduce strong protocol values back to primitives and force downstream concerns to rediscover the same facts.

---

## 4. Treat A, E, and R as the contract

For Effect-shaped concerns:

```text
A -> Effect<B, E, R>
```

all of these are part of the boundary:

```text
B  success protocol
E  failure protocol
R  required capabilities
```

Do not mechanically leak lower-level errors upward.

Translate implementation-specific failures into the vocabulary of the next level when callers do not need the lower-level detail.

Example:

```text
Provider429 | SocketFailure | InvalidProviderResponse
  ↓
SendFailed
  ↓
NotificationFailed
```

Requirements may compose naturally, but lower-level capabilities should also disappear behind a service when callers do not need to know them.

---

## 5. Preserve compositional closure

A composition should collapse back into an ordinary concern contract.

```text
f: A -> B
g: B -> C

g ∘ f: A -> C
```

or:

```text
f: A -> Effect<B, E1, R1>
g: B -> Effect<C, E2, R2>

compose(f, g):
  A -> Effect<C, E, R>
```

The composite does not need the same exact input and output types as its parts.

It must preserve the same **contract form**:

```text
explicit input
explicit output
explicit failures
explicit requirements
no leaked internal wiring
```

Test:

> Can this composition now be treated as one primitive by a higher-level composition?

If not, internal details are still escaping.

---

## 6. Keep policy at the composition site

Hide mechanics, not useful control.

A composition site should normally keep visible:

```text
ordering
branching
combination
optional work
retry policy
fallback policy
workflow decisions
```

Example:

```text
params   = encode(...)
message  = buildMessage(params)
gas      = estimateGas(message)
call     = buildCall(...)
step     = buildStep(call, gas)
```

Each concern hides how its transformation works.

The caller still owns the workflow.

Do not introduce a large helper merely to remove repeated syntax.

---

## 7. Put knowledge in one place

For every implementation fact ask:

> Which single concern needs to know this?

Put it there.

Nothing above that concern should need the fact.

Example:

```text
wire encoding rule
  → protocol encoder

storage schema
  → repository

chain-specific transaction rule
  → chain planner/runtime

UI dialog state
  → UI
```

Each level should speak in its own vocabulary.

---

## 8. Respect protocol altitude

A protocol belongs to a semantic level.

Example:

```text
DomainCommand
  ↓
TransactionPlan
  ↓
ChainAction
  ↓
CallData
```

Avoid letting low-level values bypass intermediate semantic levels:

```text
UI -> raw calldata
```

when the actual hierarchy is:

```text
UI
  -> DomainCommand
  -> TransactionPlan
  -> ChainAction
  -> CallData
```

A value appearing far above the level where it has meaning usually indicates a missing abstraction boundary.

---

## 9. Promote compositions deliberately

Leave composition inline by default.

Promote it into a named concern when at least one is true:

* it is reused;
* it owns a guarantee or invariant;
* it has an independently meaningful and testable contract;
* it hides implementation knowledge that must not escape upward.

Do not promote merely because several lines repeat.

Abstract stable semantics, not repeated syntax.

---

## 10. Separate planning from execution when useful

Use:

```text
Command
  → Planner
  → Plan
  → Runner
  → Effect
```

when representing work as data gives concrete value:

```text
inspection
testing without execution
simulation
retry
reordering
persistence
alternate runtimes
UI progress
```

Otherwise perform the effect directly.

A plan with no consumer other than immediate execution may be speculative abstraction.

---

## 11. Separate description from runtime state

Do not combine unrelated meanings into one protocol merely for convenience.

Watch for:

```text
immutable operation description
+
mutable progress
+
presentation metadata
```

Split when different concerns consume them.

Example:

```text
PlannedStep
  id
  action
  presentation

StepState
  id
  status
  result
```

The description says what should happen.

Runtime state says what has happened.

---

## 12. Reconcile composition with correctness

Data flow alone does not determine every boundary.

The correctness pass may discover that several values must be owned together because they participate in one invariant or atomic update.

When that happens:

```text
initial flow
  ↓
correctness ownership
  ↓
refined concern boundaries
```

Likewise, a strong protocol may move validation or invariant enforcement out of downstream concerns.

Iterate until:

* protocol facts are explicit;
* authority is placed with the correct owner;
* consumers do not know lower-level implementation details.

---

## 13. Test boundaries

For each boundary ask:

### Replacement

Can the implementation change without changing callers?

### Knowledge

Does the caller know anything needed only by the implementation?

### Control

Did the abstraction unnecessarily take away ordering, branching, or policy from the caller?

### Protocol

Can the consumer understand the value without understanding how it was produced?

### Closure

Can the composite itself be used as a primitive by a higher-level composition?

### Facts

What facts does the protocol carry, and can callers construct an invalid value?

### Altitude

Is this protocol appearing above or below the semantic level where it belongs?

If an important test fails, reconsider the boundary.

---

# Output in the Design Spec

Add:

```text
composition
```

after `types` and before `owner`.

Use:

```text
composition
  flow
  concerns
  protocols
  boundaries
  promoted
  not_promoted
```

Example:

```text
composition
  flow
    Request -> ValidatedRequest -> Plan -> ExecutionResult

  concerns
    validate
      kind: transformer
      knows: request validation rules
      contract: Request -> ValidatedRequest

    plan
      kind: transformer
      knows: domain planning rules
      contract: ValidatedRequest -> Plan

    run
      kind: capability
      knows: runtime execution
      contract: Plan -> Effect<ExecutionResult, RunFailed, Runtime>

  protocols
    ValidatedRequest
      facts: all required fields valid

    Plan
      facts: executable operations are ordered and complete

  boundaries
    validate -> plan
      protocol: ValidatedRequest
      hides: raw validation mechanics

    plan -> run
      protocol: Plan
      hides: planning rules from the runtime

  promoted
    plan
      reason: independently testable contract and owns planning guarantees

  not_promoted
    request -> validate -> plan -> run
      reason: one call-site workflow; wrapping it would hide orchestration policy
```

---

# Design laws

**A concern owns one coherent piece of knowledge or authority.**

**Concerns communicate through explicit protocol values.**

**Protocols carry established facts, not merely matching field shapes.**

**A, E, and R all belong to the concern contract.**

**Translate lower-level failures and requirements at abstraction boundaries when callers do not need them.**

**Composition must collapse back into an ordinary concern contract.**

**Keep ordering, branching, and workflow policy at the composition site.**

**Put implementation knowledge in exactly one concern.**

**Keep protocols at the semantic level where they belong.**

**Promote semantic concerns, not repeated syntax.**

**Separate planning from execution only when the plan has real value.**

**Correctness ownership and composition boundaries must be refined together.**

Final question:

> What does this concern uniquely know or control, what protocol does it expose, and can the next level use that protocol without learning how the concern works?
