# Glossary

Every term this skill uses, once. Terms marked *(extraction)* belong to the separate Requirements → Spec skill and are only glossed here, not redefined.

## Index

| Term                    | Belongs to    |
|-------------------------|---------------|
| accepted-risk           | Verify        |
| algorithm               | Correctness   |
| altitude                | Composition   |
| ambiguous               | Extract       |
| assumption              | Extract       |
| attack                  | Verify        |
| boundary                | Composition   |
| capability              | Composition   |
| class                   | Verify        |
| commit                  | Correctness   |
| concern                 | Composition   |
| conflict                | Extract       |
| contract                | Composition   |
| cut                     | Correctness   |
| entity                  | Extract       |
| error                   | Extract       |
| existing                | Survey        |
| frozen                  | Lifecycle     |
| guarantee               | Verify        |
| HARD / SOFT             | Cross-cutting |
| invariant               | Extract       |
| level                   | Composition   |
| operation               | Extract       |
| order                   | Verify        |
| owner                   | Correctness   |
| proposed / accepted     | Lifecycle     |
| protocol                | Composition   |
| requirement             | Extract       |
| reuse disposition       | Survey        |
| rule                    | Correctness   |
| slice                   | Correctness   |
| spec-feedback           | Cross-cutting |
| state                   | Extract       |
| superseded / supersedes | Lifecycle     |
| temporal                | Extract       |
| transformer             | Composition   |
| transition              | Extract       |
| unknown                 | Extract       |
| value                   | Extract       |
| verify                  | Verify        |

---

## Extract *(inherited, glossed only)*

- **requirement** — one traceable, independently testable thing the source asked for.
- **entity** — a domain thing with identity (`Job`, `Delivery`).
- **value** — a constrained primitive (`Priority: Int { 0..100 }`).
- **state** — the mutually exclusive modes an entity can be in.
- **transition** — a legal move between two states.
- **operation** — an action, with `ensures` and `errors`, before Correctness adds `owner`/`commit`.
- **invariant** — a property that must always hold.
- **temporal** — an `always`/`never`/`eventually` property over a sequence of events.
- **error** — an expected, named failure.
- **unknown / ambiguous / assumption** — open questions and the reversible defaults chosen for them.
- **conflict** — incompatible source claims; design stops until authority resolves them.

## Survey

- **existing** — a block recording that an owner, protocol, or concern this slice needs already exists elsewhere in the codebase.
- **reuse disposition** — `reuse-as-is` (use it untouched), `extend` (it's missing something), or `supersede` (it contradicts the new requirement — feeds the Spec lifecycle).

## Correctness

- **cut** — the sub-step that groups Spec constructs sharing mutable state into one owner per slice. Not a separate phase; the first thing Correctness does.
- **slice** — one Spec, one owner, with a `status` field.
- **owner** — the sole authority for state that spans more than one operation.

  ```text
  submit ──┐
  cancel ──┼──► owner (one invariant, one commit)
  complete─┘
  ```

- **algorithm** — the chosen representation for an owner's state, plus the argument for *why* it keeps an invariant true.
- **rule** — operational discipline (`commit`, `locks`, `bounds`, `monotonic`, `tasks`) for shared or concurrent state.
- **commit** — the one operation field, added by Correctness, saying how a change becomes visible, in one sentence of prose.

## Composition

- **concern** — one unit of decomposition: one coherent piece of knowledge or authority.
- **transformer** — a concern that only transforms data: `A -> B`.
- **capability** — a concern that owns authority: state, I/O, or an external resource.
- **contract** — a concern's full signature, including its error and requirement channels, not just its output.
  
  ```text
  A -> Effect<B, E, R>
  ```

- **protocol** — the value crossing a boundary between two concerns; carries established facts, not just a matching shape.
- **boundary** — the named crossing between two concerns, with what it hides.
- **level** — a concern's semantic altitude in the flow. Not "layer" — in Effect, `Layer` means dependency provision.
- **altitude** — whether a value appears at the level where it actually means something, or has leaked above or below it.
- **closure** — the property that a composite concern has the same contract shape as a primitive one, so it can be composed again.
- **promoted / not-promoted** — whether an inline composition was given its own name, and why.

## Verify

- **guarantee** — a row mapping one requirement or invariant to the mechanism that enforces it, and how strongly.
- **attack** — a misuse case tried against the public operations, with the same classification as `guarantee`.
- **class** — the five-way strength scale used by both `guarantee` and `attack`:

  ```text
  IMPOSSIBLE   cannot be expressed
  REJECTED     an explicit error at a boundary
  GUARANTEED   an algorithm or atomic commit prevents it
  VERIFIED     covered by a test
  POSSIBLE     currently unprotected — must be fixed or explicitly accepted
  ```

- **verify** — the test that backs a `VERIFIED` classification.
- **order** — the dependency-ordered sequence for implementing the slice.
- **accepted-risk** — an explicit, reasoned decision to leave a `POSSIBLE` attack unprotected.

## Cross-cutting

- **HARD / SOFT** — semantic source and design claims are authoritative; structural `concern`, `protocol`, `boundary`, `algorithm`, and `rule` blocks are working proposals that may change only while cited HARD claims still hold.
- **spec-feedback** — a gap in the extracted Spec found later, never fixed by silently editing what extraction produced.

## Spec lifecycle

- **proposed** — written, not yet reviewed.
- **accepted** — reviewed; coding proceeds against the HARD layer.
- **frozen** — immutable design record after merge; code is the current realization, while requirements remain normative.
- **superseded** — a later slice invalidated a HARD claim; the old entry is linked forward, never deleted.
- **supersedes / superseded-by** — the fields that make that link explicit on a HARD claim.
