# Author the Spec

Record the behavioral contract from agreed intent and supplied findings.
Use concrete prose. Run commands from the project root and consult command help when unfamiliar.
Read the [behavioral example](example.md) when the format is unfamiliar.

## Read, create, or update

Read the request, relevant Plans, Tasks, existing Specs, and affected public interfaces.
Inspect existing ownership and references before creating another Spec.
Keep one Spec per coherent module contract; it may contain multiple owners.
Split when contracts evolve independently, not merely when another owner or lifetime appears.
One Task may affect multiple module Specs, and each Spec may support multiple Tasks.
Preserve IDs, unrelated content, and existing placement.
Use code-adjacent placement when no project convention exists.

Commands use illustrative IDs and paths. Use the supplied CLI invocation and project root.

```sh
workflow list spec
workflow show @spec.Slice
workflow refs @spec.Slice
workflow create spec --id Slice --path path/to/Slice.spec \
  --set status=proposed --set basis=contract --set location=path/to/code \
  --file body=path/to/body.txt
workflow link @spec.Slice @plan.Project.O1 --type spec-trace
```

Edit body sections directly. Preserve formatter-produced continuation whitespace.
If diagnostics block queries, inspect source before relying on CLI results.

## Metadata and provenance

New Specs start proposed. Supply basis and location using the supported format.
Use realized_by for known implementation locations and provides for public operations when useful.
These references identify code; they do not prescribe its structure.
Use derives_from for existing Plan and Task references, including relevant Plan Verification
targets.
Keep precise requirement sources in source.
Cite related contracts in supported prose; derives_from does not accept Spec dependencies.
Do not invent schema fields or repeat the Plan's narrative.

Compare proposed changes with existing commitments before writing.
Surface contradictions for resolution; keep proposals distinct from agreed requirements. Use the
`keep-intent-aligned` skill for material commitment changes.
An implementation defect needs repair against the existing guarantee, not a new invariant.
Existing behavior is evidence of what happens, not automatic authority for what should happen.

## Requirements

Record one independently verifiable obligation per Requirement, with source and must.
Define each guarantee once; reference its ID in enforcement and tests using consistent code names.
Describe accepted inputs, results, errors, side effects, ordering, and compatibility where relevant.
Include bounds and interruption or retry outcomes when consumers rely on them.
Name conditions and observation points. Avoid choosing internal functions, classes, or algorithms.
Keep project-level choices in Plan decisions and Task provenance.
The `to-design` skill maintains module implementation choices in the owning Spec.
Record an implementation constraint as a Spec requirement only when it is part of the agreed module
contract, rather than merely the chosen way to implement it. Cite its source.

## Invariants

Write code-specific predicates over concrete fields and states, not high-level prose.
Define names, conditions, and observation boundaries; each predicate must hold initially and survive
permitted transitions at that boundary. See [examples](invariant-examples.md) as needed.
Derive independent properties from Requirements; link their sources and omit duplicates.
Record module guarantees under `invariants` and scoped guarantees under `owner/invariants`.
Preserve owner scopes and unique stable IDs across both placements.
The `to-design` skill creates important internal Invariants; preserve them and their design basis.
Keep preconditions, postconditions, and liveness separate. Identify violating states and checks;
passing examples alone do not prove preservation across all executions.

## Tests and open obligations

Use the `design-for-verification` skill for material claims and testing-policy (Use the
`testing-policy` skill) to executable checks.
For each check, name the public boundary, inputs, conditions, and independently derived expectation.
Show how checks establish the relevant invariants and required outcomes across those conditions.
Include relevant boundaries, failures, side effects, and repeat/interruption scenarios.
Record missing harnesses, unsettled guarantees, and unverified implementation under open.
Use supported questions, brownfield mismatches, risks, and assumption/outcome prose.
Do not author implementation sections as part of behavioral specification.
Use the `to-design` skill for optional implementation choices when needed.

Check whether agreed behavior could still be wrong while the declared checks pass.
Expose uncovered invariants and scenarios under open; passing examples alone do not close coverage.
Every requirement needs a coverage row with exactly one lane:
proven_by local test declarations, or open_by local Q/FB/RK obligations while proposed.
Use proven_by only when a corresponding executable check is identified.
A declaration does not prove execution or success. Keep actual results in the owning Task evidence.
The current format requires enforced_by. Cite a relevant invariant or known enforcing public
boundary.
When implementation is unknown, say enforcement remains unresolved and retain an open_by obligation.
Do not invent a mechanism merely to fill that field.
If attack scenarios clarify a guarantee, record their expected observable outcomes in tests or open.

## Existing Specs and lifecycle

Preserve existing implementation sections during a behavioral edit unless their migration is
assigned.
The `to-design` skill owns their authorship and revision. Do not duplicate or expand them here.
Surface contradictions with behavioral changes for resolution.

Keep proposed status while behavioral or required verification obligations remain unresolved.
Set accepted only within granted authority after required review and coverage resolution.
Acceptance does not itself establish runtime proof or human approval of agent-proposed guarantees.
Keep superseded requirements and their historical coverage. Local supersedes references preserve
lineage.
For whole-Spec replacement, link the successor in existing prose; do not invent metadata fields.
Reconcile incoming references before removing resolved questions. Preserve surviving IDs.
Report changed Plan decisions; use to-plan only when recording is explicitly assigned.

## Finalize and return

1. Check provenance, invariants, observable expectations, local references, and coverage.
2. Format every changed Spec with `workflow format path/to/Slice.spec --write`.
3. Run `workflow index` after direct creation, movement, or an ID change.
4. Run `workflow check` and inspect the diff. Resolve diagnostics within assigned scope.
5. Return paths, snapshot, changed guarantees, verdict inputs, validation, and unresolved
   obligations.

Recommend the next action; do not start execution from a preparation-only request.
