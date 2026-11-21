---
proposal spec-handover
status proposed 2026-11-20
---
# Handover: turn today's concept designs into Specs (2026-11-20)

**Goal:** formalise the concept designs below into `.spec` files with `skill:to-design` and `skill:to-spec`, after
one cohesion pass and one round of the user's open decisions, so the P4 and P5 builders start from Specs that match
the code.

**Why now:** the old core Specs predate the code and are superseded; eleven designs written from the current code
(2026-11-20) now cover the next 20 or so Tasks, but they are proposals with open seams and decisions. Building
(@task.V3.T118's fix round first) waits for this.

**Read first:**
- @review.spec-cohesion (17 mismatches, unowned seams, build order
  for the first five designs);
- @proposal.body-capture-settled (the typing verdict: C6);
- `wiki/tasks/V3/epic.task` `instructions` ("The whole Task at once", Task boundaries by state, convergence);
- `wk log show V3 --last 40` (today's decisions with dates).

## The designs (all proposed)

The concept designs: @proposal.spec-typed-machine, @proposal.spec-fragments, @proposal.spec-saved-records,
@proposal.spec-reads-operations, @proposal.spec-data-layer, @proposal.spec-boundary-channels,
@proposal.spec-test-tooling, @proposal.spec-errors-trust, @proposal.spec-static-rules, @proposal.spec-ui-host,
@proposal.spec-turn-parts; adopted @proposal.schedule-issues
(@task.V3.T118); prior art to weigh, not decided: `advisor-consult-2026-11-20/` (the user's evening consult; its
README lists three conflicts).

## Decided by the user (2026-11-20)

- **Mapper shape** [decided: user 2026-11-20]: ending mappers take `(value, { input, key })`.
- **Declared schedules** [decided: user 2026-11-20]: schedules are declared on the definition (name, `key`,
  `pausedBy`).
- **No `Flow.keyed`** [decided: user 2026-11-20]: "drop it"; a keyed schedule is a plain object typed from the
  declaration.
- **Derived issues** [decided: user 2026-11-20]: issues are derived from state everywhere, never stored.
- **Task changes** [decided: user 2026-11-20]: T21 into four, a turn-parts Task before @task.V3.T109, a
  Declared-schedules Task, T24 split in P5.
- **Schedule issues** [decided: user 2026-11-20]: @proposal.schedule-issues with its R25 text, P1 and P2, built by
  @task.V3.T118.
- **No Firefox** [decided: user 2026-11-20]: Firefox is not a target.
- **Code over old Specs** [decided: user 2026-11-20]: the old core Specs are superseded by running code.

## Open, to settle before or while writing Specs

1. **Cohesion of all eleven designs** [answered: user 2026-11-21; run; done as @review.spec-cohesion-r2]: run the cohesion pass again over the second wave (boundary channels, test
   tooling, errors and trust, static rules, UI and host, turn parts) against the first five and the cohesion file.
2. **Typing** [answered: user 2026-11-21; C6, as prior art: @review.spec-cohesion-r2#typing-does-machine-capture-its-body]: adopt C6 (`const B` with `Exact`) in the typed-machine Spec instead of "checked, never read back";
   declared schedules stay for the definition-only snapshot type, the keyed `key` and the saved key codec.
3. **Advisor conflicts** [answered: user 2026-11-21; as recommended, as prior art: @review.spec-cohesion-r2 questions 4 to 6]: `Symbol.for` against `WeakMap` for the `Made` brand; T98's place (the
   consult: before T106 and T109); fragment lifetimes' two holders against `settle`.
4. **Public-API round** [answered: user 2026-11-21; all 15 as recommended, as prior art: @review.spec-cohesion-r2 section 6a]: the user's decisions from the second wave and turn parts, asked as one numbered round
   (each design's last section lists them; implementation calls are the orchestrator's).
5. **Unowned seams** [answered: user 2026-11-21; section 4's owners, as prior art: @review.spec-cohesion-r2#second-wave-task-boundaries]: the resource entry store, the persisted-resource record kind, one definition
   fingerprint, disposal order, the mint restarting at 0 against `InstanceId`.
6. **Consult gaps** [open: 2026-11-21; recommend close them in each Spec's challenge step]: adversary passes mostly skipped; streams half designed (`delivers: "latest"`, no
   `reconnect`, `Feed.live`); prior-art sweeps thin (the harness refused sidecars when five ran at once).

**Risk:** a Spec written from one design re-opens a seam another already fixed; write each Spec against the cohesion
result, name its seams exactly, and keep the user's decisions.

**Approach:** cohesion pass, then the user's round, then one Opus lead per concept writes its `.spec` through `wk`
with `to-design` step 6's challenge as the adversary review the consults skipped, then one review across all Specs;
apply the Task changes last. Record decisions as tags (skill:policy-records, Tags) and commit as `<area>: <summary>`
with a `Refs:` trailer. Run state: @task.V3.T57 done; T118 waits on its fix round; no wake cron runs.
