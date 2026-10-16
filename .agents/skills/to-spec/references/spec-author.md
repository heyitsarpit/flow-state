# Author the Spec

Record the behavioral contract from agreed intent and supplied findings.
Use concrete prose. Run commands from the project root and consult command help when unfamiliar.
Read the [behavioral example](example.md) when the format is unfamiliar.

## Read, create, or update

Read the request, relevant Plans, Tasks, existing Specs, and affected public interfaces.
Inspect existing ownership and references before creating another Spec.
Keep one Spec per coherent module contract; independent contracts can evolve separately.
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
Surface contradictions for resolution; keep proposals distinct from agreed requirements.
Apply [keep-intent-aligned](../../keep-intent-aligned/SKILL.md) to material commitment changes.
An implementation defect needs repair against the existing guarantee, not a new invariant.
Existing behavior is evidence of what happens, not automatic authority for what should happen.

## Requirements

Record independently verifiable behavior under requirements, with source and must.
Describe accepted inputs, results, errors, side effects, ordering, and compatibility where relevant.
Include bounds and interruption or retry outcomes when consumers rely on them.
Name conditions and observation points. Avoid choosing internal functions, classes, or algorithms.
Keep chosen approaches in Plan decisions and Task provenance.
Record an implementation constraint as a Spec requirement only when it is part of the agreed module
contract, rather than merely the chosen way to implement it. Cite its source.

## Invariants

Derive module correctness targets from requirements. State their conditions and observation points.
Link invariants to the requirements they support.
Use top-level invariants for module guarantees and owner/invariants for scoped guarantees.
Both placements may coexist; Invariant IDs must be unique across both placements.
Preserve existing owner scopes. Name a behavioral authority or contract scope for new owners.
Defining a target does not require choosing internal structure or an implementation mechanism.
For example, a run can promise at most one active submission without prescribing locks or queues.
State observable lifetime guarantees in the requirement or invariant itself.

## Tests and open obligations

Apply [design-for-verification](../../design-for-verification/SKILL.md) to material claims and
[testing-policy](../../testing-policy/SKILL.md) to executable checks.
For each check, name the public boundary, inputs, conditions, and independently derived expectation.
Show how checks establish the relevant invariants and required outcomes across those conditions.
Include relevant boundaries, failures, side effects, and repeat/interruption scenarios.
Record missing harnesses, unsettled guarantees, and unverified implementation under open.
Use supported questions, brownfield mismatches, risks, and assumption/outcome prose.
Do not add a model, algorithm, composition, rules, or realization section to explain implementation.
Use [to-design](../../to-design/SKILL.md) for optional implementation choices when needed.

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
Their presence does not make implementation design part of this skill's output contract.
Do not duplicate or expand them. Surface contradictions with behavioral changes for resolution.

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
