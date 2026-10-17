# Autopilot-full

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation. Use the
`coordination-policy` skill for actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

Use for independent queued changes with granted full delivery. Name any operator-reserved items.

1. `agent:workflow-coordinator`: Resolve the queue, completion predicate, budget, configured forge,
   merge scope, and human gates. A request to state the plan stops at the plan. A build-only grant
   does not become a merge grant.
2. `agent:workflow-coordinator`: Dispatch through orchestrate (Use the `orchestrate` skill). Assign
   each change `agent:implementer`, needed design/checking owners, `agent:record-writer`, and
   `agent:delivery-operator`. Bind configured models and reasoning; reuse compatible phase workers
   explicitly. Authors never supply their own independent gate. Give independent writers separate
   branches/worktrees; serialize genuinely overlapping changes. Assign the `agent:record-writer`
   initial owners, heads, gates, and stop rules before the long build.
3. `agent:implementer`: Build the assigned slice using its method (Use the `implement-task` skill).
   The coordinator runs the needed
   Feature, Bug fix, or Refactoring phases as the same owner. Require a ready owning Task before
   implementation; workers receive only their phase. After required gates pass, the coordinator
   gives `agent:delivery-operator` checked code, evidence, and applicable
   [Opening a PR](opening-a-pr.md) steps. Preserve the
   exact submitted head and Task trail. Publish only when the scope permits it.
4. `agent:workflow-coordinator`: Assign independent checking at each code-ready patch, proportionate
   to its consequences. `agent:acceptance-checker` assesses receipts and the real artifact, returns
   a revision-bound verdict, and sends proved findings to the author. A changed patch or dependency
   invalidates affected verdicts; do not rely on an older green run.
5. `agent:workflow-coordinator`: Release `agent:delivery-operator` to land through
   applicable [Shipping](shipping.md) steps only when the current acceptance verdict, actual forge
   gates, and grant
   permit it. Operator-reserved items stop at merge-ready. A checker verdict never bypasses an
   enforced approval.
6. `agent:delivery-operator`: Reconcile current trunk drift at merge preparation. Return product
   conflicts to `agent:implementer`. `agent:acceptance-checker` refreshes affected verdicts after
   changes. After confirmed landing, the `agent:workflow-coordinator` assigns the next queue item
   and keeps gate identities current.
7. `agent:workflow-coordinator`: Audit liveness and tangible progress through supported read-only
   status. Isolate stalled attempts before replacing their scopes. Collect child receipts; reconcile
   late results against current state. A multi-session program needs a supported audit wake
   mechanism, not a remembered cadence.
8. `agent:workflow-coordinator`: On hold or stop, propagate the boundary. At completion, obtain
   checked landing/assembly receipts, account for every worker/wakeup, and have the
   `agent:record-writer` preserve the decision trail.

**Reply:** queue/owners/heads, current verdicts, actual landings, held items, remaining gates and
evidence.
