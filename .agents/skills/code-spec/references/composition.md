# Composition (Composition phase reference)

Read during Composition, after Correctness has cut the slice and placed any owner it needs. Decides how the slice's operations and transformers are built from parts. Recursive; hands control back to Correctness the moment it finds a new owner (see the loop-back diagram in `SKILL.md`, and the closing section here).

A **concern** is one unit of decomposition: one coherent piece of knowledge or authority. A **level** is its altitude in the flow; avoid overloading an implementation target's term for dependency provision.

`concern` / `protocol` / `boundary` are SOFT. Refactor them freely; reopen the Spec only if a refactor changes what a HARD block claims.

## 1. Trace the flow

```text
Request → ValidatedRequest → Plan → (OperationA, OperationB) → Result
```

Start from the slice's highest-level input, follow it to each effect or result. A meaningful change in what a value *means* is a candidate boundary.

## 2. Name the concerns

```text
transformer   input A; returns B; may name an expected failure
              owns knowledge about how data is transformed

capability    input A; returns B; fails with named errors; needs capabilities
              owns authority — state, I/O, an external resource
```

If a concern's contract can't be stated as one clear input-to-output relationship, it probably owns more than one concern.

## 3. Define protocols

```text
good protocol:
  has meaning independent of its producer
  carries facts already established upstream
  is immutable
  can't normally be constructed invalid
```

Don't reduce a strong protocol value back to a primitive and make a downstream concern rediscover the same facts.

## 4. Compose the whole contract, not just the output

```text
input A
returns B          success value: the protocol
fails Failures     translate into the next level's vocabulary
needs Capabilities union requirements across composed concerns
```

```text
Provider429 | SocketFailure   →   SendFailed   →   NotificationFailed
```

Don't let a lower concern's failure leak upward untranslated when the caller doesn't need the detail.

## 5. Preserve closure

```text
composite { input A; returns C; fails Failures; needs Capabilities }
     same four channels as a primitive concern?
        │ yes                    │ no
        ▼                        ▼
  usable as one concern     something is still leaking —
  by a higher composition    fix the boundary
```

## 6. Keep policy at the composition site

```text
params  = encode(...)
message = buildMessage(params)
gas     = estimateGas(message)
step    = buildStep(call, gas)
```

Each concern hides *how* its own step works. The caller keeps ordering, branching, and retry/fallback policy visible. Don't add a helper only to remove repeated syntax.

Record that ordering and branching as `policy` on the composite concern.

## 7. Put each fact in exactly one place

```text
wire encoding rule    → protocol encoder
storage schema        → repository
UI dialog state       → UI
```

Nothing above the concern that owns a fact should need that fact.

## 8. Respect protocol altitude

```text
UI → DomainCommand → Plan → ChainAction → CallData     correct
UI ─────────────────────────────────────→ CallData     wrong — skips two levels
```

A value appearing far above the level where it means something usually marks a missing boundary.

## 9. Promote deliberately

```text
promote only if:  reused | owns a guarantee | independently
                   testable | must seal off implementation
                   knowledge

not a reason:      "these lines repeat"
```

## 10. Plan vs. execute

```text
Command → Planner → Plan → Runner → Execution
```

Only when representing work as data gives real value: inspection, testing without side effects, simulation, retry, reordering, an alternate runtime. Otherwise perform the effect directly.

## 11. Description vs. runtime state

```text
PlannedStep { id, action, presentation }     immutable — what should happen
StepState   { id, status, result }           mutable — what has happened
```

Split a protocol when different concerns read different halves of it.

## 12. Test each boundary

```text
replacement  can the implementation change without changing callers?
knowledge    does the caller know anything only the implementation needs?
control      did the boundary take away ordering/branching the caller needed?
protocol     can the consumer understand the value without knowing how it was made?
closure      can the composite be a primitive one level up?
facts        what does the protocol carry — can a caller construct an invalid one?
altitude     is this value above or below the level where it means something?
```

## When to hand back to Correctness

```text
naming a capability concern
        │
        ▼
does it own state 2+ operations could leave inconsistent?
        │ yes
        ▼
STOP. Start a separate, code-adjacent Spec in Correctness for this owner,
then resume against that owner's public operations.
```

This is the only point where Composition is not self-contained. A concern discovered here is tagged `design` in its dependent Spec and gets its own `owner`, `invariant`, and `guarantee` rows before composition resumes.
