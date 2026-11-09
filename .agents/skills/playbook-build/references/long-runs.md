# Long runs

Use for "keep working until done", "run while I'm away", many Tasks in dependency order, or a
program that outlives one session.

## Frame the run

- State checkable exit criteria, the authorized Tasks, allowed actions, budget, and the stop
  signal. Reuse aligned intent; ask only about unresolved reserved choices.
- Name the delivery ceiling. Building does not include committing, publishing, or landing unless
  the user asked (`policy-authority`).
- Foreground work needs no scheduler. Wait through one supported event or wake mechanism, and
  only when needed. A multi-session program needs a supported wake for its audits, not a
  remembered cadence; confirm support before promising unattended work.

## Run attempts

- Run one bounded attempt at a time per Task and get its checker's verdict before the next.
  Keep accepted progress. Route failures before choosing the next attempt. Never stack untested
  fixes or weaken the predicate. Preserve rejected evidence and restore only that attempt's changes.
- Give separate fixes their own checks. Park unrelated discoveries and return to the target.
- Resolve failures from evidence before the next attempt: shrink the failed scope, repair the
  missing capability, or replace an isolated stalled worker. Reconcile late results against the
  current base before using them.
- A plateau calls for a bounded pivot: state the changed hypothesis and its check before trying
  again.
- For many independent Tasks, refill ready work as prerequisites finish, within the global limit,
  per skill:policy-delegation#parallel-slices. For a new kind of work, run one
  representative Task through every gate first; fix what the pilot exposes and rerun the affected
  checks before scaling.
- Assemble verified units continuously and recheck assembled behavior. Keep the dependency
  frontier green rather than building above a broken base.

## Keep it resumable

After each meaningful unit, record in the owning Task: revision, change and reason, check,
verdict, remaining work, next action, and remaining budget. On restart, reconcile actual Git,
runtime, and worker state before continuing. Answer user questions without abandoning the run.

## End

End at the predicate, the requested boundary, the budget, or a demonstrated dead end. Stop every
owned worker and wake-up, account for every attempt, and leave a usable checkpoint. Report any
continuation the harness could not support.

Return the predicate state, verified progress, rejected approaches, actual revision, the trail, and
remaining work.
