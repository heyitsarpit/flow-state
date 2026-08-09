# Implementation scratchpad

Status: no open items

This file records only unresolved findings. Once a finding is promoted into normative contracts,
proof rows, and phase tasks, remove it here; resolved history must not become another authority.

## Rules

- Use `SP-B###` for blockers, `SP-N###` for implementation notes, and `SP-D###` for proposed
  public or semantic decisions.
- Give every entry one owning phase, affected contract/proof IDs, concrete evidence, and a next
  action.
- A scratch entry changes no behavior by itself. Update the contracts, proof matrix, and affected
  phase before implementation depends on a semantic change.
- A blocker stops only its owning phase unless the entry explicitly contradicts an earlier phase.
- Remove a resolved entry after its surviving canonical owners are verified.

## Open items

None. The former `SP-B025` authority cleanup and `SP-N003` host-recipe work are resolved design
decisions with executable obligations in Phase 8, CUT-P06, PROOF-016, and PROOF-017; they are no
longer scratchpad questions.

## Entry template

```md
- [ ] `SP-B###` — Short description
  - Owning phase: Phase N
  - Evidence: file, test, command, or observable behavior
  - Affected contracts/proofs: `SEM-###`, `PROOF-###`
  - Next action: concrete investigation or contract change
```
