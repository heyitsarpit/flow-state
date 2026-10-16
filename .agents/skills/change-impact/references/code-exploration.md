# Code Exploration

Find what already exists before proposing new code. Start from the request or requirement, not a
full reverse-engineering pass. Inspect relevant project decisions and contracts when present. Reuse
supplied investigation findings; verify claims affected by later changes.
Use this guide within change-impact to locate existing code and assess reuse alongside impact.

## 1. Bound the walk

```text
requirement -> what must it read or write? -> affected code -> callers and dependencies
```

Check Specs beside touched code when present, then look one or two hops outward from its public
operations, state, and protocol definitions. Follow further only when an unresolved dependency or
authority could change the reuse decision or safety assessment.

## 2. Identify existing boundaries

- Locate the functions, classes, or modules implementing the affected concerns and their callers.
- Identify shared protocols, established facts, state owners, and resource lifetimes.
- Inspect relevant checks and diagnostics; distinguish declared contracts from observed behavior.

Use [runtime exploration](../../how/references/explorer-prompt.md) for unclear flow or layering.
When history could change reuse, read
[local rationale sources](../../why/references/source-playbook.md).
Investigate only the missing runtime or historical fact that blocks discovery; reuse its answer
instead of writing a second runtime explanation.
These are not mandatory full investigations. Reachability identifies possible impact, not proof.

Attach concrete locations and evidence to findings. Mark uncertainty where behavior or ownership
cannot be established; lack of a finding in the inspected scope is not proof of absence everywhere.

## 3. Classify reuse

```text
reuse-as-is   already satisfies the requirement
extend        missing an operation or fact within the same responsibility
supersede     existing behavior conflicts with the agreed requirement
new           no inspected boundary can implement it cleanly
```

Prefer reuse-as-is → extend → supersede → new. Choosing a later option requires one sentence
explaining why earlier options cannot satisfy the agreed requirement. Distinguish existing behavior
needing replacement from incompatible source requirements. Surface source conflicts for resolution;
do not silently choose which requirement wins.

## 4. Return findings to the assessment

Return locations, contracts, finding roles, reuse recommendations, and
unresolved questions. Describe only what the request depends on, not the entire implementation. Keep
findings traceable so later design reuses this evidence rather than rediscovering it.
Combine these findings with the impact assessment; do not produce a second report.
