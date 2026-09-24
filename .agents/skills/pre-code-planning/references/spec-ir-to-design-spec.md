# Spec IR → Design Spec

The Spec IR says what must be true, independent of implementation. This skill decides how the slice will make it true, and records those decisions as pseudocode that an implementer follows while coding.

```text
requirements → [Requirements → Spec IR] → Spec IR
                                            ↓
                                  [this skill: one slice at a time]
                                            ↓
                                  Design Spec (.pc pseudocode file)
                                            ↓
                          implement (framework skill decides the concrete forms)
                                            ↓
                          review (checks code against the guarantee map)
```

The Design Spec records how this slice will satisfy the Spec IR through both concern composition and correctness mechanisms. Use [composition-design.md](composition-design.md) to discover and refine concerns and protocols, and [effect-abstraction.md](effect-abstraction.md) to place invariant and authority owners and choose concrete Effect forms. Interleave those decisions: owner placement can change boundaries, and stronger protocols can remove work from downstream concerns.

Do not write production code, and do not edit the Spec IR. If design work shows the Spec IR is incomplete, record a `spec-feedback` item instead of quietly changing the meaning.

## Right-size

One file per slice, roughly 150 lines at most. If it grows past that, the slice has more than one owner, so split it. A small slice (one type, two operations) gets a half page. Skip sections with nothing to say.

## Procedure

**0. Intake gate.** Read the Spec IR and list every `unknown`, `ambiguous`, `conflict`, and `assumption` that affects this slice.
- A `conflict` stops the process. Return it to the user; design cannot resolve it.
- An `unknown` or `ambiguous` that blocks the model: ask one question. Otherwise carry it into `open` with the smallest reversible default marked `assume`.
- Scan for gaps the Spec IR does not flag: terms used but never declared (`running_count`, `queued`), operations whose relationship is unstated (does `next()` also start the job?), states referenced but not defined. Record each as `spec-feedback` and pick a marked assumption so work can continue.

**1. Cut the slice.** Group Spec IR properties that share mutable state or the same invariants. Each group is one slice with one owner. Record the requirements it implements, what it depends on from other slices, and what it provides to them. Two owners means two files.

**2. Trace initial composition.** Read [composition-design.md](composition-design.md) and trace the slice's semantic data flow. For each meaningful transformation or authority boundary, record its concern, concern kind (`transformer` or `capability`), crossing protocol, implementation knowledge hidden, and workflow policy that remains visible. Keep this initial map provisional until correctness owners are placed.

**3. Translate the constructs and place correctness owners.** Apply the table below to every Spec IR construct in the slice.

| Spec IR | Design Spec |
|---|---|
| `value` + `invariant` | `type X = base where rule`, opaque, constructed only by parsing at the edge |
| `state` (closed) + `transition` | `union` of variants; terminal states have no exit; each transition becomes an op or an internal step |
| operation `requires` | Split it. If an input type can carry it, put it in the type. If it depends on runtime state, it is a `pre` checked inside the commit and returns a typed error. If it is a caller obligation, it becomes a parse rule. |
| operation `ensures` | `post`, and a test |
| `error` | typed error on each op that can raise it |
| `invariant` | owner invariant with an enforcement point (which ops maintain it) |
| `forbids` | the op does not exist, or the transition is rejected at commit |
| `temporal` always/never | reduce to an invariant or transition rule when possible; otherwise a model test |
| `temporal` eventually | needs a progress and fairness story (bounded work, no starvation); verified by test, never by types |
| `unknown` / `ambiguous` | `open` entry plus a marked `assume` |
| `requirement` | a row in the guarantee map |

Derived terms in the Spec IR (counts, "the queued jobs") become `derived` entries on the owner, each with its source and when it is updated.

**4. Refine composition around the correctness owners.** Revisit the flow and boundaries after translating invariants and placing owners:
- strengthen protocols with facts already established by parsing, validation, or state transitions; preserve those domain types instead of widening them to primitives;
- merge concerns when one authority must own shared invariant state or an atomic update;
- hide implementation details and map lower-level failures into the next level's vocabulary when consumers do not need those details;
- ask whether each protocol appears at the semantic level where it belongs; for example, a UI should not receive raw calldata when domain-command and planning concerns belong between them; keep ordering, branching, retries, and other workflow policy at the intended composition site;
- promote an inline composition only when it is reused, owns a guarantee/invariant, has an independent meaningful contract, or seals implementation knowledge. Repeated syntax alone is not a reason.

**5. Choose algorithms and APIs.** Choose the representation, algorithm, owner boundary, and operational rules using the relevant guidance in [effect-abstraction.md](effect-abstraction.md) and [composition-design.md](composition-design.md). Record only decisions someone could reasonably have made differently, each with a one-line reason and the requirement or invariant it serves. Tag anything not forced by the Spec IR as `design` or `assume`. The composite must remain an ordinary concern contract (`A -> B` or `A -> Effect<B, E, R>`); its internal graph need not share the same input/output types and must not leak through the public API.

**6. Write the operations in pseudocode.** For each op: `pre`, `commit`, `post`, `errors`. Rules for shared state: ops take ids and return typed results; the owner checks state inside the commit and never trusts a value the caller obtained earlier, because it may be stale. State-typed inputs are fine only for values no other caller or task can hold.

**7. Build the guarantee map and attack audit.** Map every requirement to a mechanism and classify it: IMPOSSIBLE, REJECTED, GUARANTEED, VERIFIED, or POSSIBLE. Try the structural and operational misuse cases (double use, races, floods, overflow, stale handles, escape hatches). Fix any important POSSIBLE, or list it under `accepted risks`.

**8. Derive tests and implementation order** from the properties, not from the code structure.

**9. Validate before handing off.**
- Every slice requirement appears in the guarantee map or in `open`.
- Every Spec IR operation has a signature; every transition is realized or explicitly forbidden.
- Every invariant has an enforcement point; every derived term has a source and an update point.
- Every non-trivial concern has one coherent knowledge/authority responsibility; every boundary has an explicit protocol.
- Protocols carry established facts where possible; callers do not depend on implementation-only details from lower levels.
- Workflow policy remains visible; every promoted concern meets the promotion rule.
- Composites expose ordinary contracts without leaking internal wiring; protocols appear at appropriate semantic levels.
- Correctness owners and concern boundaries agree.
- No unresolved conflict; every default is tagged `assume`.
- The Spec IR is untouched; gaps appear as `spec-feedback`.

**10. Keep it alive.** The implementer treats the file as the contract. If coding reveals a flaw in the model, update the Design Spec first, then the code. Reviewers check the code against the guarantee map.

## File format

Write to the repo's design-doc location, defaulting to `design/<slice>.design.md`. Use language-neutral, indentation-based pseudocode: no imports, no framework calls, and capabilities named abstractly (`clock`, `store`). Tag each enforcing line with the requirement or invariant it serves (`[R3]`, `[I2]`). Reference the Spec IR by ID rather than restating it. Sections, in order:

```text
slice / implements / depends / provides / target
open          unknowns, assumptions, spec-feedback
types         constrained values and closed unions
composition   flow, concerns, protocols, boundaries, promoted, not_promoted
owner         state, derived terms, invariants
ops           pre / commit / post / errors
algo          representation, key steps, complexity, invariants relied on
rules         commit point, locks, bounds, task ownership, monotonic values (only for shared state)
guarantees    requirement -> mechanism, with class
attacks       misuse case -> class
tests
order
```

See [example.md](example.md) for a complete file.

The `composition` section follows `types` and precedes `owner`. Keep it proportional to the slice; omit empty entries and omit the section for a slice with only one real concern.

A protocol is not merely a DTO with a convenient field shape. It is the semantic value crossing a concern boundary; its producer establishes the facts consumers rely on. Preserve those facts downstream. For Effect-shaped concerns, `A -> Effect<B, E, R>` exposes success protocol `B`, failure protocol `E`, and required capabilities `R`; translate lower-level errors or hide requirements behind a service when higher-level callers do not need their details.

## Realization

The pseudocode constructs are chosen to map one-to-one onto the framework skill's forms, so implementation is transliteration, not redesign. For Effect, use [effect-abstraction.md](effect-abstraction.md) for the concrete forms:

| Design Spec | Effect |
|---|---|
| `type ... where` | branded Schema, decoded once at the edge |
| `union` | tagged enum, matched exhaustively |
| `owner` | Service, with private state behind it |
| `commit` | one atomic state update (`Ref.modify` or a store transaction) |
| typed errors | tagged errors in the `E` channel |
| `depends` | Layer graph |

## Rules

- Preserve meaning. Never strengthen, weaken, or drop a Spec IR property.
- Every non-obvious line traces to a requirement or is tagged `design` or `assume`.
- Never guess silently. Uncertainty goes into `open`.
- Decisions live in the file, not in the implementer's memory.
