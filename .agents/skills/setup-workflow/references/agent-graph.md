# Build the project agent graph

Coordinator: use after the work is known, for an explicit graph request or a complex program.
Ordinary setup does not load this method. Use the prepared assignments;
do not map all installed roles.

Bind selected assignments to [setup's routing defaults](../SKILL.md#agent-routing-defaults).
Use [phase composition](../../workflow/references/agents.md) for conditional method
phases. Read the selected methods for coverage
and independence requirements. Helper calls do not create workers; principles and policies stay with
the assigned phase owner.

## 1. Define conditional nodes

Resolve each selected row using setup's override precedence. The saved graph's routing table names
the agent, role, exact model, reasoning effort, scoped assignment, parent, and limits.

For each needed phase, record its canonical owner name, scoped assignment, parent, inputs, write
scope, output, gate, model, reasoning, and limits. Record the runtime worker ID separately after
launch; mark unlaunched assignments explicitly. Use `#<scope>` only for distinct assignments of the
same owner. Preserve names across continuation; a saved runtime ID does not prove a live worker. Use
[phase selection](../../workflow/references/phase-selection.md) for needed, reused,
omitted, or blocked phases. Keep unknown model/effort settings unresolved.

One agent can hold multiple phase assignments only when the scope and independence remain valid.
Name that reuse explicitly. Five responsibility groups do not imply five managers or a headcount
cap. Assign integration/synthesis owners when needed; keep their artifact work separate from
coordination.

## 2. Draw two kinds of edges

- **Delegation:** who may spawn, brief, resume, replace, and accept this worker.
- **Dependency:** which artifact and passing gate release the next assignment.

Draw a Mermaid delegation tree and list gated handoffs separately. Show changed assignments before
saving; reuse existing authorization for agreed changes. Repair loops return findings to the
affected owner; they do not create a new hierarchy. Resolve depth limits before assigning nested
spawns. When nesting is unavailable, the root dispatches those same roles with their declared
scopes. Each parent receives results. A checker supplies the substantive verdict; the
`agent:workflow-coordinator` releases the next phase only on current passing gates.

## 3. Expand only needed phases

Use prepared work and any triggered [method phase
assignments](../../workflow/references/agents.md#conditional-method-phases). Give each
phase bounded inputs, permitted work, output, and gate. Reuse workers only for compatible duties;
keep required checks independent of the artifact's authors. An owner may apply several methods
without adding another worker. Add integration only when outputs need combining.

## 4. Budget the expanded graph

Count unique workers including the root. Multiple phase-owner assignments on one worker count once.
Include every delegated track and nested worker in the same budget. Report distinct agents, retained
identities, in-flight concurrency, and initial/maximum attempts. Include waiting coordinators in the
harness's in-flight count when they occupy execution slots. Distinguish potential roles from the
nodes selected for this run. Evaluate activation conditions first. Remove unused phases/agents and
reconnect surviving handoffs. Count only the resulting active graph; the complete role catalogue is
not a mandatory team.

Declare concurrency, per-node retry limits, total attempts, wall-clock budget, and any supported
usage or cost ceiling. Bound nested work from the same program allowance; a child cannot create an
unbudgeted panel. Aggregate per-parent child limits without exceeding the global cap. Without usage
telemetry, report cost as unmeasured. Agent count alone does not establish price.

Before enabling a route, resolve required limits from existing instructions or configured choices. A
valid role/model graph can remain a proposal while its execution budget is unresolved. Do not remove
required independence to fit a limit. Reduce optional scope, serialize permitted work, or report the
unmet gate.

## 5. Save and validate

Write the graph to an established project document, or workflow/reference/agent-graph.md when none
exists. Include selected assignments, delegation tree, gated handoffs, reuse, budgets, and
capability gaps. Reference defaults instead of copying the role catalogue. Include activation
conditions and material phase dispositions; count the selected team. Link the owning Plan/Task for
binding commitments and the supported settings location when
present. The document describes assignments; it is not a second task database or a new executable
config.

Check model/effort support, reachable nodes, declared parents, role cardinalities, independent
gates, write conflicts, dependency readiness, aggregate limits, and established method inputs.
Ensure every artifact/gate names its author, checker, and integration/record owner when needed.
The coordinator may hold compatible specialist assignments; preserve required independent checks.
Use an acyclic delegation tree; dependency repair loops may iterate. Ensure every dispatch has a
parent and result destination. Unsupported nesting, persistence, or settings must have an explicit
supported alternative or gap. Return the graph path, actual checks, unresolved choices, and saved
versus session-only assignments.
