# Survey (Survey phase reference)

Read during Survey, before any new design. Find what already exists — scoped to what the new requirements actually touch, not a full reverse-engineering pass.

```text
new requirement
      │
      ▼
what would satisfying it read or write?
      │
      ▼
walk outward from those touchpoints only
      │
      ▼
existing owner / protocol / concern found?
```

## 1. Bound the walk

```text
BOUNDED (correct)               UNBOUNDED (wrong)
new requirement                  new requirement
   │ touches                        │
   ▼                                ▼
this owner, this protocol       "map the whole codebase first"
```

Start from the requirement, not the codebase. Check Specs beside the touched code, then look one or two hops out from what it would need to read or write.

## 2. Classify each finding

```text
reuse-as-is   already does exactly this
extend        does most of this, missing an operation or a fact
supersede     does this, but the new requirement contradicts how
```

Prefer `reuse-as-is` → `extend` → `supersede` → new. Choosing a later option requires one sentence explaining why the earlier options cannot satisfy the HARD claims.

`supersede` is not a failure — see the Spec lifecycle in `SKILL.md`. It means an existing `requirement`/`invariant`/`owner` gets a `supersedes` entry once Correctness runs.

## 3. Record only what this slice touches

```spec
existing <name> {
  kind      owner | protocol | concern
  form      transformer | capability       -- concern only
  found-in  <module, file, or nearby Spec>
  covers    <what it already does, relevant to this slice>
  reuse     reuse-as-is | extend | supersede
}
```

Don't restate the existing thing's whole behavior — only the part this slice depends on.

## 4. When existing behavior conflicts with a new invariant

Mark the existing entry `supersede`. Reserve `conflict` for incompatible source requirements; Intake stops on those because design cannot resolve them.

## 5. Hand off

```text
Correctness / Composition
      │
      ▼
references an `existing` entry ──► reuse / extend / supersede
      │
      ✗  never: re-derive the same owner or protocol from scratch
```
