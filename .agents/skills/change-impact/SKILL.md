---
name: change-impact
description: >-
  Investigate an engineering request, tentative direction, or diff: locate existing code and
  reuse opportunities, assess what could break, and prove pivotal safety facts with real code.
  Use before design or implementation, or to assess a consequential change.
metadata:
  kind: procedure
---

# Change Impact

Find where an engineering change belongs and what it could break, before it ships.
Start from a request, tentative direction, or diff; a finished design is not required.

Companion to how (Use the `how` skill) and why (Use the `why` skill). How
tells you what the code does.
Why tells you why it's shaped that way. Change impact explores the affected code and consequences
together. Reuse existing findings; use how or why only for missing facts affecting the assessment.

Trace behavior beyond caller lists to find risks a symbol search cannot show.

## Prove pivotal facts

Prove the one or two facts the safety assessment depends on by running existing code where possible.
Before implementation exists, separate established facts from future obligations.
Do not build speculative code merely to claim proof.

### How sure are you

For each fact the change's safety depends on, get it as far down this list as is cheap, and say
where it stopped.

1. You said so. Worthless on its own.
2. You pointed at the line. A real `file:line`, or the library's own source.
3. You showed the bad case can't happen. You walked the failure step by step and it doesn't reach.
4. You ran it. A script or test that calls the real code and fails loud if you're wrong.
5. You reproduced it in the running app.

Step 4 is usually one small script that imports the same library the app ships and calls the exact
function you're worried about.

## Steps

1. Explore the request or change through [code exploration](references/code-exploration.md).
   Locate boundaries, protocols, owners, and reuse options while tracing possible consequences.
   For a diff, inspect added, changed, and deleted symbols, including implicit behavior changes.
   Read relevant Plans, Tasks, and Specs; distinguish intended guarantees from current behavior.
   Use why's evidence-anchor step for local history and rationale when needed.
2. Find the pivotal fact the safety assessment depends on. Most changes that look risky are safe
   because of a single fact, like "this call only drops already-dead cache entries and does nothing
   else". Find that
   fact. If it holds, most risky cases are cleared at once. Spend your time here, not on a long list
   of maybes.
3. Look where grep stops. Read the source of the library you call, and check its pinned version and
   any local patch. Work out when things run: microtasks, unmount and teardown, Solid versus React.
   Follow what a symbol search misses: the JSON an API returns, a DB column, a wire format, another
   language reading the same bytes, a feature flag, code three hops downstream.
4. For each risk, state its likelihood and impact. Keep the risks you confirmed.
   List the ones you checked and cleared separately. Same rules as `why`.
   Cite a real `file:line`, a search that finds nothing is still an answer, and never make up a
   caller or an API.
5. Prove the pivotal facts where existing code can establish them. Run a real check and show what
   happened, applying testing-policy (Use the `testing-policy` skill). If the
   implementation or needed
   harness does not exist, state the obligation and required check; do not claim passing evidence.
   Revisit exploration when a risk changes scope or reuse. Scale checks to consequential claims.

## What to hand back

- **What it does.** The request or change, affected boundaries, and justified reuse recommendation.
- **Pivotal facts.** State the safety assumptions, evidence level, and proof. Separate current facts
  from future implementation obligations; mark unproven claims explicitly.
- **Risks.** Each names how it breaks, the `file:line`, how likely and how bad, and how to check.
  Paste the proof for the ones that matter.
- **Cleared.** What you checked and why it's fine.
- **Remaining checks.** The cheapest check for each consequential unproven claim, including an
  existing script or the harness work needed.

Tie proof to its revision and conditions. Recheck when the implementation or those conditions
change. When risks change recorded scope, constraints, or guarantees, apply keep-intent-aligned
(Use the `keep-intent-aligned` skill): return affected references and proof
obligations, with proposed Plan or Spec implications separate from Task evidence.
A direct request returns the assessment without creating workflow artifacts.
Recommend the next action; do not start another phase automatically.

**Reply:** the assessment above, with pivotal facts proven or marked unproven.
