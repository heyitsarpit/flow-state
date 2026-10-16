# Autopilot-stack

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation.
Apply [coordination-policy](../../coordination-policy/SKILL.md) to actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

Use for dependent changes or a requested reviewable stack. Landing can remain with the user.

1. `agent:task-designer`: Fix the ordered dependency graph, root base, intended parents, budget, and
   delivery endpoint. "Build the stack, I'll land it" means no merges or armed auto-merge. Preserve
   reserved human gates.
   Use [to-task](../../to-task/SKILL.md) for ready owning Tasks before implementation.
2. `agent:workflow-coordinator`: Assign bounded `agent:implementer` assignments through
   [orchestrate](../../orchestrate/SKILL.md). Each builds and self-checks its scope, pushes only its
   branch within the publication grant, and reports base/head/evidence. Give each implementer
   [its method](../../execute-task/references/implementer.md). One `agent:delivery-operator`
   controls shared rebases,
   retargets, and stack assembly.
3. `agent:workflow-coordinator`: Release independent scopes when their prerequisite interface is
   settled; keep coupled writes with one owner. `agent:delivery-operator` assembles each child on
   its parent's exact current tip and target that parent in its PR.
4. `agent:workflow-coordinator`: Select [Opening a PR](opening-a-pr.md) and [Babysit](babysit.md)
   for publication and readiness. Give `agent:delivery-operator` its lifecycle steps and assign
   required diagnosis/review separately. `agent:acceptance-checker` checks each link's behavior and
   dependencies. A verified tip does not make an unverified parent ready.
5. `agent:delivery-operator`: Append only accepted links. Rebase bottom-up when necessary;
   resolve topology conflicts. Return rewritten heads, product conflicts, and invalidated gates to
   the coordinator; it routes repairs and assigns affected checks.
6. `agent:delivery-operator`: Deliver the ordered chain with root/tip, exact heads, proof, and
   remaining gates. Stop there when operator landing is the endpoint. For an already-granted landing
   phase, return the ready chain to the coordinator for [Shipping](shipping.md). The delivery
   operator receives landing steps in dependency order; recheck remaining children after each merge.
7. `agent:record-writer`: Preserve Task state and topology receipts. `agent:workflow-coordinator`
   propagates stop to owners and watchers; reconcile every attempt. Missing wake support or blocked
   proof stays visible rather than a false ready claim.

**Reply:** root/tip, each link's parent/head/verdict, actual endpoint reached, held gates, excluded
work.
