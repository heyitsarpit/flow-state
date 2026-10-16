---
name: code-spec
description: Grow one code-adjacent Spec per non-trivial slice after requirement extraction, including brownfield slices, through Survey, Correctness, Composition, and Verify. Use while proposing or superseding a slice design. Skip trivial changes, settled slices, implementation review, and raw-requirement extraction.
---

# Code Spec

## Goal

Minimize new code through better architecture. Reuse or extend existing owners before creating new ones, so each change strengthens one system instead of adding parallel paths, duplicate authority, or speculative abstractions. Fewer lines are an outcome, never a reason to skip correctness.

```text
prose requirements        existing codebase
        │                         │
        ▼                         ▼
     EXTRACT                   SURVEY
  (separate skill)          existing owner / dependency,
        │                    recorded under `composition.uses`
        └────────────┬────────────┘
                      ▼
               CORRECTNESS          model, cut, owner,
                                    operations, algorithm, rules
                      │
                      ▼
               COMPOSITION  ◄────┐  concern, protocol, boundary
           (recursive)           │  loops back into Correctness
                      │──────────┘  when a new owner is found
                      ▼
                   VERIFY           coverage, attacks, tests
                      │
                      ▼
        Spec: proposed → accepted
                      │
                   REVIEW            separate skill, anytime after acceptance
```

One artifact per slice, the **Spec**. Extraction supplies semantic claims; every phase grows the same uninterrupted, section-oriented `spec` block. Full term list: `references/glossary.md`. The canonical compiled format is `references/example.md`. See `references/examples/actor-lifecycle.md` for stateful lifetime, `references/examples/context-lineage.md` for an algorithm and data structure, and `references/examples/submission-overlap.md` for a brownfield issue and migration.

## Compiled shape

Use only sections that have something to say, in this order:

```spec
spec <Name>
status       proposed
basis        <source requirements | inferred from existing behavior>
location     <code-adjacent spec path>
realized-by  <current or intended owner files>
implements   <requirement ids>
depends      <relative Spec paths or stable Spec ids>
provides     <public operations>

requirements
    R1
        source  <provenance or quoted intent>
        must    <one testable behavior>

open
    Q1 <unresolved question>
        assume  <smallest reversible default, only when unblocked>
    FB1 <existing behavior that contradicts the proposed contract>
    RK1 <known risk intentionally left unresolved, with reason>

model
owner <Name>
operations
algorithm
composition
rules
realization <target>  -- optional
coverage
attacks
tests
```

## Placement and granularity

- Keep Specs distributed beside the code they describe. Follow the repository convention; otherwise use `<slice>.spec.md` beside the primary owner, public entry, or module directory.
- One Spec covers one independently evolvable semantic slice. It may have no state owner; it has at most one primary state or lifetime owner.
- A dependency with its own authority or acceptance boundary gets a separate, nearby Spec linked by relative path or stable ID. Never embed that Spec inline.
- A bug or extension that preserves the slice boundary updates the existing Spec. Create another only for a genuinely independent boundary.

## Where the Spec comes from

Extraction is a separate skill. If no Spec exists yet for these requirements, extract first. If anything here shows the Spec is wrong or incomplete, record it as `spec-feedback` — never silently edit what extraction produced.

## Intake

- Stop on an unresolved conflict between source requirements.
- Ask one question when an `unknown` or `ambiguous` blocks the model; otherwise record the smallest reversible `assumption`.
- Record undeclared terms or relationships as `spec-feedback`.
- Existing behavior that disagrees with a new requirement is a Survey supersession, not a source conflict.

## HARD and SOFT

```text
HARD    requirements; model values, states, transitions, and errors;
        owner invariants; observable operation contracts
        authoritative — changing one is a real design decision

SOFT    algorithm · composition · rules · realization
        a working proposal — refactor freely while coding;
        reopen the Spec only if a refactor changes what a
        HARD section claims

EVIDENCE basis · source · realized-by · open · coverage · attacks · tests
         records provenance, uncertainty, enforcement, and proof
```

This is why the Spec doesn't try to be the final source of truth for the code's *shape* — only for what the code must guarantee. A protocol fact or workflow policy needed for correctness must also appear as a HARD claim.

## Right-size

A small slice needs about half a page. Skip any section with nothing to say. Length is only a warning: split when the Spec contains another owner, lifetime, or acceptance boundary, not merely because it crosses a line count.

---

## Phase: Survey

Read `references/survey.md`. Before designing anything new, walk outward from what the new requirements actually touch and record what already exists.

```spec
composition
    uses
        <name>
            kind      owner | protocol | transformer | capability
            found-in  <module, file, or nearby Spec>
            role      <what this slice needs from it>
            reuse     reuse-as-is | extend | supersede | new because <reason>
```

Correctness and Composition consume every `uses` entry — never silently rebuild it.

## Phase: Correctness

Read `references/correctness.md`.

**Cut.** Group model facts, invariants, and operations by one independently evolving boundary. Shared mutable state or changes that must publish atomically identify a primary owner; a stateless slice may have none. Check Survey's `uses` entries first.

```spec
spec <Name>
status       proposed
basis        <source requirements | inferred from existing behavior>
location     <code-adjacent spec path>
realized-by  <current or intended owner files>
implements   <requirement ids>
depends      <relative Spec paths or stable Spec ids>
provides     <public operations>
```

**Place owners, algorithms, and rules.** For every `invariant` and `transition` already in the Spec, decide who enforces it and how.

```spec
model
    <values, closed variants, errors, and legal transitions>

owner <Name>
    lifetime  <where its authority begins and ends>
    state     <what it holds>
    derived   <name> = <expression>, updated <when>
    invariants
        I1 <hard truth> [R1]

operations
    submit(job: NewJob) -> JobId
        fails      QueueFull
        requires   job passed admission
        ensures    the returned id identifies one queued job
        publishes  Queued{id}
        completes  after insertion or typed rejection

algorithm
    submit
        1. <ordered semantic step>
    argument
        <why the steps preserve I1>

rules
    publication  <facts observers must see together>
    bounds       <what is bounded and the outcome at the bound>
```

## Phase: Composition

Read `references/composition.md`. Trace how each owner's operations are actually built from parts. Recursive, and it hands control back to Correctness the moment it finds a new owner:

```text
name a concern
     │
     ▼
transformer? ── yes ──► contract = its signature; continue
     │ no (capability)
     ▼
owns state 2+ operations could leave inconsistent? ── no ──► state its input/returns/fails/needs; continue
     │ yes
     ▼
┌────────────────────────────────┐
│ STOP — CORRECTNESS starts a     │
│ separate Spec for this owner    │
└────────────────┬─────────────────┘
                 ▼
concern's contract = that owner's public operations
     │
     ▼
compose upward — unify or translate E and R, not just the output
     │
     ▼
closure test passes, and (reused | enforces a HARD claim | independently testable)?
     │ yes                              │ no
     ▼                                  ▼
promote; recurse one level up      leave inline
```

```spec
composition
    flow
        <input -> meaningful stages -> outcome>

    uses
        <name>
            kind     owner | protocol | transformer | capability
            role     <one coherent responsibility>
            input    <input>
            returns  <output>
            fails    <expected failures>       -- omit when none
            needs    <capabilities>            -- omit when none
            policy   <ordering or branching>   -- composite only
            reuse    reuse-as-is | extend | supersede | new because <reason>

    boundaries
        <producer> -> <consumer>
            protocol  <named value crossing the boundary>
            facts     <what upstream already established about it>
            hides     <what the consumer never needs to know>
```

## Phase: Verify

```spec
coverage
    R1
        enforced-by  <invariants, operations, algorithm steps, or rules>
        proven-by    <test ids>
    R2
        enforced-by  <intended mechanism>
        open-by      <open item ids; proposed Specs only>

attacks
    A1 <misuse or failure scenario>
        blocked-by  <mechanism>
    A2 <scenario not prevented>
        outcome     <typed rejection, cancellation, convergence, or recorded risk>

tests
    T1 <deterministic observable proof>
```

Every requirement gets a `coverage` row with exactly one evidence lane: `proven-by` executable tests, or `open-by` unresolved items while the Spec is proposed. Attack double use, races, bounds, overflow, stale evidence, interruption, and partial external effects when they apply. An unblocked attack stays visible in `open`; do not hide it behind a confidence label. Implementation order belongs in task tracking, not the Spec.

---

## Spec lifecycle

```text
proposed    written, not yet reviewed
   │
   ▼
accepted    reviewed; coding proceeds against the HARD layer
   │
   ▼  (a later decision changes a HARD claim)
superseded  → link forward, never delete
```

```spec
requirements
    R6
        supersedes  R3
        reason      R3 assumed single-region; a later slice changed the concurrency rule
        must        <replacement behavior>
```

Only HARD claims carry this lifecycle. An accepted Spec stays maintained beside its code; merging code does not freeze it. SOFT sections may change as implementation shape changes.

## Validate before handing off

- Every operation preserves `requires` / `ensures` / `fails`; every transition is realized or explicitly forbidden; asynchronous work states completion and interruption.
- Every requirement has a `coverage` row and deterministic proof, or a visible unresolved item in `open`.
- Every shared-state invariant has one owner; atomic visibility is stated as a publication rule without prescribing a primitive.
- Every surveyed dependency has a role and reuse disposition — never silently ignored or rebuilt.
- Every attack is blocked, has an explicit outcome, or remains visible as a risk; a SOFT refactor may not weaken a HARD claim.

## Realize

The core Spec is target-neutral and is not imported or interpreted at runtime. When a target is chosen, add an optional `realization <target>` appendix to the same compiled Spec with only the decisions needed to implement it. See `references/realization/effect.md` for Effect and `references/realization/rust.md` for Rust.

## Review

Implementation review is outside this skill. Use a dedicated read-only review workflow against the Spec's HARD claims.

## Rules

- One artifact per slice. A later phase adds sections to the same file; dependent Specs remain separate and linked.
- SOFT sections may be refactored freely while their cited HARD claims still hold; HARD claims may not be silently changed.
- Never guess silently — uncertainty, assumptions, conflicting brownfield behavior, and risks stay in `open` or `spec-feedback`.
- Prefer plain sentences over code-shaped pseudocode.
