---
name: code-composition
description: >-
  Compose code through coherent concerns, meaningful protocols, and complete dependency contracts.
  Apply when designing or changing module boundaries, interfaces, composition, or abstractions.
disable-model-invocation: true
metadata:
  kind: procedure
---

# Code Composition

Decide how functions, classes, and modules are built from coherent parts.
Start from existing boundaries and established contracts. Prefer reuse or extension before new code.
Composition is recursive: each part may itself be composed under the same rules.

- **Concern:** a conceptual responsibility used to decompose the system before choosing code.
- **Boundary:** a function, class, or module implementing a concern through a public contract.
- **Protocol:** a data shape with agreed meaning and declared facts, shared across boundaries.
  A protocol value is one instance; its established facts depend on construction or validation.
- **Composition level:** a depth of decomposition into smaller concerns.

```text
Concerns: Notification = Validation + Submission

Boundaries implementing those concerns:
Notification module {
  validateRecipient() --ValidatedRecipient--> Sender.submit()
  [validation]          [protocol]        [submission]
}
```

Decompose by concerns, translate them into code boundaries, and compose those boundaries.
Each boundary may itself compose smaller boundaries under the same rules.
ValidatedRecipient carries the fact that recipient format was checked.
Levels do not prescribe folders or code constructs.

Identify the protocol and established facts at each boundary.
Refactor mechanisms while preserving contract guarantees. Required facts and workflow policy
belong in the contract.
Use [to-design](../to-design/SKILL.md) for an optional implementation proposal or review.
Only behavioral requirements, invariants, and test obligations belong in a Spec through to-spec.

## 1. Trace the flow

```text
Request → ValidatedRequest → ExecutionDescription → (OperationA, OperationB) → Result
```

Start from the slice's highest-level input, follow it to each effect or result.
A meaningful change in what a value *means* is a candidate boundary.

## 2. Name the concerns

Implement a concern as a function, class, or module boundary.
Several operations belong together when they serve one coherent concern.
State or resource authority requires an owner; encapsulating stateless knowledge alone does not.
State each operation's input, result, failures, and dependencies; do not force a module into
one input-to-output relationship.

| Concern     | Responsibility                           |
|-------------|------------------------------------------|
| Transformer | Knowledge about how data is transformed  |
| Capability  | Authority over state, I/O, or a resource  |

## 3. Define protocols

```text
good protocol:
  has meaning independent of its producer
  declares which facts its values establish
  distinguishes raw input, validated values, and runtime state
```

Don't reduce a validated protocol value to a primitive and make a downstream boundary
rediscover the same facts. Preserve declared facts through transformation; keep runtime state
behind its owner's boundary. Apply code-correctness to enforcement.

## 4. Compose the whole contract, not just the output

```text
input    A
returns  B             success value conforming to the result protocol
fails    Failures      translate into the next level's vocabulary
needs    Dependencies  requirements not supplied inside the composite
```

```text
Provider429 | SocketFailure   →   SendFailed   →   NotificationFailed
```

Don't let a lower boundary's failure leak upward untranslated when the caller doesn't need
the detail. Preserve the underlying cause for diagnosis.
A dependency is anything the operation requires; a capability dependency grants authority over
state, I/O, or a resource. Dependencies supplied internally remain the composite's responsibility.

## 5. Preserve closure

```text
composite
  input    A
  returns  C
  fails    Failures
  needs    Dependencies
same contract channels as its parts?
        │ yes                    │ no
        ▼                        ▼
usable as one boundary     obligations still leak —
in the level above         fix the boundary
```

Expose the same contract channels at each level. A function has an operation contract;
a class or module may expose several, including relevant state and lifetime obligations.
Its consumer should not need to inspect the contracts of its internal parts.

See [composition examples](references/examples.md) for recursive boundaries and shared protocols.

## 6. Keep policy at the composition site

```text
params  = encode(...)
message = buildMessage(params)
gas     = estimateGas(message)
step    = buildStep(call, gas)
```

Each boundary hides *how* it implements its concern.
The caller keeps ordering, branching, and retry/fallback policy visible.
Don't add a helper only to remove repeated syntax.
Before threading a signal through several boundaries, check whether existing ownership or another
representation removes the need.
Keep framework wiring mechanical; put domain transformations in framework-independent functions.

## 7. Put each fact in exactly one place

```text
wire encoding rule    → protocol encoder
storage schema        → repository
UI dialog state       → UI
```

A caller should not need the hidden knowledge encapsulated by a boundary.
Expose established facts through the protocol when callers need them.

## 8. Preserve protocol meaning

A protocol can be shared across modules and composition levels. Define it authoritatively once;
do not invent equivalent local shapes merely because boundaries sit at different levels.

```text
shared Receipt        -> used unchanged by submission, workflow, and audit boundaries
provider wire format  -> confined to the provider integration
```

Introduce another shape when meaning, established facts, or representation changes.
Sharing a protocol is useful; exposing hidden encoding or storage details is a boundary leak.

## 9. Promote deliberately

Introduce a separate reusable boundary when it:

- Is reused.
- Enforces an invariant or contract guarantee.
- Exposes a meaningful public interface that can be verified independently.
- Seals off implementation knowledge.

Repeated lines alone are not a reason.

## 10. Describe vs. execute

```text
Command → DescribeWork → ExecutionDescription → Runner → Execution
```

Only when representing work as data gives real value: inspection, testing without side effects,
simulation, retry, reordering, an alternate runtime. Otherwise perform the effect directly.
ExecutionDescription is runtime data, not a workflow .plan artifact.

## 11. Description vs. runtime state

```text
PlannedStep { id, action, presentation }     immutable — what should happen
StepState   { id, status, result }           mutable — what has happened
```

Split a protocol when its parts have independent responsibilities or lifetimes.

## 12. Review each boundary

```text
depth        does the surface hide a coherent capability, or expose stages callers must coordinate?
replacement  can the implementation change without changing callers?
knowledge    does the caller know anything only the implementation needs?
control      did the boundary take away ordering/branching the caller needed?
protocol     can the consumer understand the value without knowing how it was made?
closure      can this composite be used as one boundary at the composition level above?
facts        which facts does this protocol value establish, and what enforces them?
sharing      can boundaries share this shape without leaking implementation knowledge?
```

Assess reader effort along two axes: layers to trace and mutable state to remember.
Remove pass-through layers that add no policy, adaptation, or hidden knowledge.
Keep mutable state in the smallest scope that owns its lifetime; derive values instead of syncing
copies.

Keep comments explaining rationale or external constraints. Remove narration and stale claims.
Use [encode-lessons-in-structure](../encode-lessons-in-structure/SKILL.md) for enforceable
constraints.
Remove constraint warnings only after enforcement covers them; retain necessary rationale and
exceptions.

## When composition discovers another owner

```text
implementing a state or resource concern
        │
        ▼
new state authority or independent resource lifetime?
        │ yes
        ▼
Revisit ownership and correctness;
then resume against the owner's public operations.
```

Apply [code-correctness](../code-correctness/SKILL.md) to establish the new owner's invariants,
operations, and lifetime before composition resumes.

Report boundaries, protocols, contracts, dependencies, and unresolved ownership.
