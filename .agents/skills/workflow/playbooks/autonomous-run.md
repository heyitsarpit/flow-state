# Autonomous run

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation.
Apply [coordination-policy](../../coordination-policy/SKILL.md) to actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

Use for one target, including "run until done", "keep working", and a user returning to review
later.

1. `agent:workflow-coordinator`: Read the conversation, settled Plan/Spec/Task, allowed actions,
   budget, and stop signal. State a checkable predicate. Reuse aligned intent; ask only for
   unresolved reserved choices.
2. `agent:workflow-coordinator`: Select the task's actual playbook and conditional phases.
   Run its phases as the same owner; give workers only bounded phase methods. Before implementation,
   require a ready owning Task through the selected playbook. No manager is needed per attempt.
   Foreground execution needs no scheduler. For event waits or cross-session execution, obtain
   supported wake/restart capability from setup before promising it.
3. `agent:workflow-coordinator`: Dispatch one bounded attempt and obtain its checker verdict.
   Keep accepted progress; route failures before choosing the next attempt.
   `agent:implementer` preserves rejected evidence and restores only its attempt.
   Never stack untested fixes or weaken the predicate.
4. `agent:workflow-coordinator`: Route tooling, verification, drift, and product failures to their
   assigned owners. Give separate fixes their own checks. Park unrelated discoveries; return to the
   original target.
5. `agent:record-writer`: Preserve the decision trail in owning Tasks and linked supporting
   artifacts after meaningful units: revision, change/reason, check, verdict, remaining work, next
   action, and remaining budget. On restart, reconcile actual Git, runtime, and worker state before
   continuing. The coordinator assigns state recovery to its investigators and checkers.
6. `agent:workflow-coordinator`: Continue ready work. Wait through one supported event/wake
   mechanism only when needed. Answer user questions without abandoning the run. A plateau calls for
   a bounded pivot; assign its changed hypothesis and check before another attempt.
7. `agent:workflow-coordinator`: End at the predicate, requested boundary, budget, or demonstrated
   dead end. Propagate stop to every worker and owned wakeup. Preserve a usable checkpoint and
   report any unsupported continuation.

**Reply:** predicate state, verified progress, rejected approaches, actual revision, trail,
remaining work.
