# References for the Flow State plans

[FlowState.plan](../FlowState.plan) is the entry plan; the capability plans beside it own the
contracts, and the Specs in [/specs/core](../../../../specs/core/) record the guarantees the core builds
against. Where a document here and a plan differ, the plan wins.

| Reference                                          | What it is                                                     |
| -------------------------------------------------- | -------------------------------------------------------------- |
| [dispatch-desk/](dispatch-desk/README.md)          | the reference application, to be updated and run as a real app |
| [checkout/](checkout/README.md)                    | the second reference application, likewise                     |
| [typecheck/](typecheck/)                           | type checks for the two reference applications                 |
| [superseded.md](superseded.md)                     | plan text the plan merge replaced, each with what replaced it  |
| [proposals/revisit.md](proposals/revisit.md)       | deferred items                                                 |
| [proposals/open-items.md](proposals/open-items.md) | open items the user flagged                                    |

## Deleted history

Everything absorbed into the plans and Specs, or accepted, merged or rejected, was deleted on 2026-11-09. The last
commit that has it all is `20986677`; read any of it with `git show 20986677:<path>`. That includes:

- the design, `references/explorations/machine-fragments/machine-design.md`, and its record in `merged/`. The
  `OD`, `C`, `D`, `U` and rule numbers that plans, Specs and `superseded.md` cite are its entries;
- `references/design/` (entities, server rendering, lazy features, multi-tab, sync-engine adapter, principles,
  minimal library), `references/COVERAGE.md`;
- `references/proposals/` other than the two files above (absorb-wiring, actor-identity, actor-lifetime,
  design-catch-up, the plan-merge log and audits);
- `workflow/plans/archive/`, `workflow/tasks/archive/`, the old `specs/runtime/Runtime.spec`, and Beads (`.beads/`).

The prototypes in `packages/flow-state-v3/prototypes/` are the reference implementation and stay.
