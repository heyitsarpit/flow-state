---
name: code-spec
description: Grow one Spec per non-trivial slice after requirement extraction, including brownfield slices, through Survey, Correctness, Composition, and Verify. Use while proposing or superseding a slice design. Skip trivial changes, settled slices, implementation review, and raw-requirement extraction.
---

# Code Spec

## Goal

Minimize new code through better architecture. Reuse or extend existing owners before creating new ones, so each change strengthens one system instead of adding parallel paths, duplicate authority, or speculative abstractions. Fewer lines are an outcome, never a reason to skip correctness.

```text
prose requirements        existing codebase
        │                         │
        ▼                         ▼
     EXTRACT                   SURVEY
  (separate skill)          existing owner / protocol,
        │                    tagged `existing`
        └────────────┬────────────┘
                      ▼
               CORRECTNESS          cut, owner, algorithm,
                                    rule, operation.commit
                      │
                      ▼
               COMPOSITION  ◄────┐  concern, protocol, boundary
           (recursive)           │  loops back into Correctness
                      │──────────┘  when a new owner is found
                      ▼
                   VERIFY           guarantee, attack, verify, order
                      │
                      ▼
        Spec: proposed → accepted
                      │
                (code merges)
                      ▼
               Spec: frozen
                      │
                   REVIEW            separate skill, anytime after merge
```

One artifact, the **Spec**, in the notation extraction already produces (`requirement`, `entity`, `value`, `state`, `transition`, `operation`, `invariant`, `temporal`, `error`, `unknown`, `ambiguous`, `conflict`, `assumption`). Every phase here partitions the Spec or adds block kinds to it — never a second file, never a second syntax. Full term list: `references/glossary.md`. Worked example: `references/example.md`.

## Where the Spec comes from

Extraction is a separate skill. If no Spec exists yet for these requirements, extract first. If anything here shows the Spec is wrong or incomplete, record it as `spec-feedback` — never silently edit what extraction produced.

## Intake

- Stop on an unresolved conflict between source requirements.
- Ask one question when an `unknown` or `ambiguous` blocks the model; otherwise record the smallest reversible `assumption`.
- Record undeclared terms or relationships as `spec-feedback`.
- Existing behavior that disagrees with a new requirement is a Survey supersession, not a source conflict.

## HARD and SOFT

```text
HARD    extracted semantic claims: requirement · value · state · transition
        operation · invariant · temporal · error
        design claims: owner · guarantee · accepted-risk
        authoritative — changing one is a real design decision

SOFT    concern · protocol · boundary · algorithm · rule
        a working proposal — refactor freely while coding;
        reopen the Spec only if a refactor changes what a
        HARD block claims
```

This is why the Spec doesn't try to be the final source of truth for the code's *shape* — only for what the code must *guarantee*. Any protocol fact or workflow policy needed by a guarantee must also appear as a HARD claim.

## Right-size

A slice with one owner and a couple of operations needs half a page. Skip any block kind with nothing to say. If a slice's Spec passes roughly 150 lines, it likely covers more than one owner — revisit Cut, inside Correctness, below.

---

## Phase: Survey

Read `references/survey.md`. Before designing anything new, walk outward from what the new requirements actually touch and record what already exists.

```spec
existing <name> {
  kind      owner | protocol | concern
  form      transformer | capability       -- concern only
  found-in  <module or file>
  covers    <what it already does, relevant to this slice>
  reuse     reuse-as-is | extend | supersede
}
```

Correctness and Composition reuse or deliberately supersede an `existing` entry — never silently rebuild it.

## Phase: Correctness

Read `references/correctness.md`.

**Cut.** Group `entity` / `state` / `invariant` / `operation` by shared mutable state, or by needing to change atomically together, into one slice per owner — checking Survey's `existing` entries first.

```spec
slice <Name>
status       proposed
implements   <requirement ids>
depends      <slices/services needed>
provides     <operations exposed>
```

**Place owners, algorithms, and rules.** For every `invariant` and `transition` already in the Spec, decide who enforces it and how.

```spec
owner <Name> {
  state    <what it holds>
  derived  <name> = <expression>, updated <when>
}

algorithm <owner-or-operation> {
  representation  <data structure>
  argument        <why this satisfies the invariant it depends on>
}

rule <owner> {                    -- only when state is shared or concurrent
  commit  <the one step where a change becomes visible>
  bounds  <what is bounded, and what happens at the bound>
}
```

Extend every stateful `operation` already in the Spec:

```spec
operation submit(job: NewJob) -> JobId {
  ensures  exists Job where id == result      -- unchanged from extraction
  owner    Scheduler                           -- added here
  commit   assign the next id and insert it, as one step     -- added here
}
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
owns state 2+ operations could leave inconsistent? ── no ──► contract = A -> Effect<B,E,R>; continue
     │ yes
     ▼
┌────────────────────────────────┐
│ STOP — CORRECTNESS starts a     │
│ dependent Spec for this owner   │
└────────────────┬─────────────────┘
                 ▼
concern's contract = that owner's public operations
     │
     ▼
compose upward — unify or translate E and R, not just the output
     │
     ▼
closure test passes, and (reused | owns a guarantee | independently testable)?
     │ yes                              │ no
     ▼                                  ▼
promote; recurse one level up      leave inline
```

```spec
concern <name> {
  kind      transformer | capability
  contract  <input> -> <output>
}

protocol <TypeName> {
  facts  <what a value of this type is already known to satisfy>
}

boundary <concern> -> <concern> {
  protocol  <TypeName>
  hides     <what the consumer never needs to see>
}
```

## Phase: Verify

```spec
guarantee <requirement-or-invariant id> { mechanism <...>  class <...> }
attack    <misuse case, one sentence>    { class <...> }
verify    <requirement-or-invariant id> { test <...> }
order     { <dependency-ordered implementation sequence> }
```

```text
class:  IMPOSSIBLE | REJECTED | GUARANTEED | VERIFIED | POSSIBLE
```

Every `requirement` and `invariant` gets a `guarantee` row. Fix any important `POSSIBLE`, or record it:

```spec
accepted-risk <id> { attack <which row>  reason <why it's acceptable> }
```

Attack double use, races, bounds, overflow, stale evidence, interruption, and partial external effects when they apply.

---

## Spec lifecycle

```text
proposed    written, not yet reviewed
   │
   ▼
accepted    reviewed; coding proceeds against the HARD layer
   │
   ▼  (code merges)
frozen      immutable design record; code is the current realization
   │
   ▼  (a later slice changes a HARD claim)
superseded  → link forward, never delete
```

```spec
requirement R6 {
  supersedes R3
  reason "R3 assumed single-region; a later slice changed the concurrency rule"
}
```

Only HARD blocks carry this lifecycle. Requirements remain normative after merge; SOFT blocks may become stale as implementation shape changes.

## Validate before handing off

- Every extracted operation preserves `requires` / `ensures` / `errors`; every transition is realized or explicitly forbidden; every temporal claim has a guarantee or verification.
- Every `requirement` and `invariant` has a `guarantee` row, or is covered by `unknown` / `ambiguous` / `accepted-risk`.
- Every stateful `operation` has `owner`, and `commit` if it mutates shared state; every derived term has a source and update point; every added decision is tagged `design` or `assumption`.
- Every `existing` finding is `reuse-as-is`, `extend`, or `supersede` — never silently ignored.
- No `POSSIBLE` attack is left unaddressed; a SOFT refactor may not weaken a HARD claim.

## Realize

Per target language, outside the Spec. See `references/realization/effect.md` for Effect.

## Review

Implementation review is outside this skill. Use a dedicated read-only review workflow against the Spec's HARD claims.

## Rules

- One artifact. A later phase adds blocks; it never edits what an earlier phase established without marking the change.
- SOFT blocks may be refactored freely while their cited HARD claims still hold; HARD blocks may not be silently changed.
- Never guess silently — uncertainty goes into `unknown`, `ambiguous`, `assumption`, or `spec-feedback`.
- Prefer plain sentences over code-shaped pseudocode.
