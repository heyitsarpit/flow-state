---
name: change-impact
description: >-
  Investigate an engineering request, tentative direction, or diff: locate existing code and
  reuse opportunities, assess what could break, and prove pivotal safety facts with real code.
  Use before design or implementation, or to assess a consequential change.
metadata:
  kind: procedure
  applies:
    - policy-testing
    - policy-records
---

# Change Impact

Find where an engineering change belongs and what it could break, before it ships.
Start from a request, tentative direction, or diff; a finished design is not required.

It sits beside `explain-how` and `explain-why`: how tells you what the code does, why tells you why
it is shaped that way, and change impact looks at the affected code and its consequences together.
Reuse findings that already exist, and use `explain-how` or `explain-why` only for missing facts the
assessment needs. Follow behavior past the list of callers, because data formats and lifecycle
timing can affect consumers that a symbol search misses.

## Prove pivotal facts

Prove the one or two facts the safety assessment depends on, by running existing code where you
can. Before the implementation exists, keep established facts apart from obligations the future
code must meet, and do not build speculative code just to claim proof.

### How sure are you

For each fact the change's safety depends on, get it as far down this list as is cheap, and say
where it stopped. When existing code can establish a pivotal fact, run it: level 4 is the bar for
those.

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
   Use `explain-why`'s evidence-anchor step for local history and rationale when needed.
2. Find the pivotal fact the safety assessment depends on. Most changes that look risky are safe
   because of a single fact, like "this call only drops already-dead cache entries and does nothing
   else". Find that fact. If it holds, most risky cases are cleared at once. Spend your time here,
   not on a long list of maybes.
3. Look where grep stops. Read the source of the library you call, and check its pinned version and
   any local patch. Check when callbacks and cleanup actually run (now, in a microtask, during
   unmount or teardown) in the framework and library versions this project uses. Follow what a
   symbol search misses: the JSON an API returns, a DB column, a wire format, another language
   reading the same bytes, a feature flag, code three hops downstream.
4. For each risk, state how likely it is and how bad it would be. Keep three lists apart: risks you
   confirmed, risks you checked and cleared, and risks still unresolved. Cite a real `file:line`;
   a search that finds nothing is still an answer; never make up a caller or an API.
5. Prove the pivotal facts where existing code can establish them: run a real check and show what
   happened, with checks that meet `policy-testing`. If the implementation or the harness you would
   need does not exist yet, state the obligation and the check it requires instead of claiming it
   passes. Go back to exploring when a risk changes the scope or the reuse plan. Spend checking
   effort on the claims that matter.

## What to hand back

- **What it does.** The request or change, affected boundaries, and justified reuse recommendation.
- **Pivotal facts.** State the safety assumptions, evidence level, and proof. Separate current facts
  from future implementation obligations; mark unproven claims explicitly.
- **Risks.** Each names how it breaks, the `file:line`, how likely and how bad, and how to check.
  Paste the proof for the ones that matter.
- **Cleared.** What you checked and why it's fine.
- **Remaining checks.** The cheapest check for each consequential unproven claim, including an
  existing script or the harness work needed.

Tie each proof to the revision and conditions it ran under, and recheck when either changes. When
a risk changes recorded scope, constraints, or guarantees, return the affected references and
proof obligations, keeping proposed Plan or Spec changes apart from Task evidence
(`policy-records`). A direct request gets the assessment only, with no new workflow records.
Recommend the next step; do not start another phase on your own.

**Reply:** the assessment above, with pivotal facts proven or marked unproven.
