# Glossary

These are the design concepts behind the Combined format. Backticked names are fields emitted into a Spec; other terms are reasoning tools. Terms marked *(extraction)* originate in the separate requirements-extraction step.

## Spec

- **Spec** — one code-adjacent design contract for an independently evolvable slice.
- **slice** — the behavior covered by one Spec, with at most one primary state or lifetime owner.
- **requirement** *(extraction)* — one sourced, independently testable behavior; `source` records provenance and `must` states the behavior.
- **basis** — whether the Spec comes from source requirements, existing behavior, or both.
- **open** — unresolved information kept visible: `Q<n>` for a question, `FB<n>` for conflicting brownfield behavior, and `RK<n>` for a known risk. `assume` records only a reversible default. Conflicting source requirements stop design.
- **unknown / ambiguous / assumption** *(extraction)* — missing or unclear source information and the reversible default chosen for it; compile these under `open`.
- **conflict** *(extraction)* — incompatible source requirements; design stops until their authority is resolved.
- **HARD** — requirements, model facts, owner invariants, and observable operation contracts. Changing one changes the design.
- **SOFT** — algorithms, composition, rules, and realization choices. They may change while the HARD claims remain true.
- **EVIDENCE** — provenance, uncertainty, coverage, attacks, and tests supporting or qualifying the design.

## Model and correctness

- **model** — the values, entities, closed states, transitions, and expected failures needed to reason about the slice.
- **value** *(extraction)* — a constrained primitive such as `Priority: Int { 0..100 }`.
- **entity** *(extraction)* — a domain thing with identity, such as `Job` or `Delivery`.
- **state** *(extraction)* — one of an entity's mutually exclusive modes.
- **transition** *(extraction)* — one legal move between states.
- **error** *(extraction)* — an expected, named failure.
- **invariant** — a HARD truth that an owner or value must keep true.
- **temporal** *(extraction)* — an `always`, `never`, or `eventually` claim over a sequence of events.
- **operation** — an observable action. Its contract may state `requires`, `ensures`, `fails`, `publishes`, and `completes`.
- **cut** — grouping model facts, invariants, and operations into one independently evolving slice.
- **owner** — the sole authority for state or lifetime shared by several operations.
- **algorithm** — ordered semantic steps plus an `argument` explaining why they preserve named invariants.
- **rules** — cross-operation publication, locking, bounds, monotonicity, interruption, or lifetime discipline.
- **publication** — the facts observers must see together; it does not prescribe the implementation primitive.

## Composition

- **concern** — one coherent unit of knowledge or authority. The compiled Spec records it as an entry under `composition.uses`.
- **transformer** — a concern that transforms data without owning external authority: `A -> B`.
- **capability** — a concern that owns authority over state, I/O, time, or an external resource.
- **contract** — a concern's target-neutral `input`, `returns`, `fails`, and `needs` channels, not just its output.
- **protocol** — the named value crossing a boundary between concerns. It carries facts already established upstream, not merely a matching shape. A boundary records it with `protocol` and `facts`.
- **boundary** — a meaningful crossing between concerns. It names the `protocol`, its established `facts`, and knowledge `hides` below the boundary.
- **level** — a concern's semantic position in the flow, independent of implementation-specific dependency layers.
- **altitude** — whether a value appears at the level where it means something, rather than leaking above or below it.
- **closure** — a composite concern has the same contract shape as a primitive concern, so it can compose again.
- **promotion** — naming an inline concern because it is reused, independently testable, enforces a HARD claim, or seals implementation knowledge.
- **use** — one surveyed owner, protocol, transformer, or capability with one role and an explicit reuse disposition.
- **reuse disposition** — `reuse-as-is`, `extend`, `supersede`, or justified `new`.
- **composition** — the compiled `flow`, `uses`, and `boundaries` tree.

## Verification

- **coverage** — the path from a requirement to its `enforced-by` mechanisms and `proven-by` tests.
- **attack** — one misuse, race, exhaustion, interruption, or partial-failure scenario tried against the design.
- **blocked-by** — the named mechanism that prevents an attack.
- **outcome** — the observable rejection, cancellation, convergence, or visible risk when an attack remains possible.
- **test** — deterministic executable evidence for a HARD claim.

## Realization and lifecycle

- **realization** — an optional target-specific appendix translating the target-neutral design into implementation choices.
- **proposed** — written with unresolved items visible; not yet accepted for implementation.
- **accepted** — reviewed; implementation proceeds against the HARD claims.
- **superseded / supersedes** — a later linked Spec or claim replaces a HARD claim; the old claim remains as history.
- **spec-feedback** — a gap found after extraction; record it instead of silently changing the extracted requirement.
