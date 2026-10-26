# Audit brief: did the trim lose necessary behaviour?

You edit ONE plan (named in your assignment) and nothing else. Compare it with its full draft,
workflow/plans/flow/references/full/<Name>.full.plan.txt, which held every kept commitment before
the plan was cut to a behaviour contract (rules in workflow/plans/flow/references/split-work/
trim-brief.md; rulings in split-work/decisions.md, where ruling 38 removes multi-tab sharing).

Go through the draft rule by rule. A rule is NECESSARY if leaving it out would let an app behave
incorrectly (lost or duplicated writes, wrong or stale data that never repairs, stuck states, work
that never ends or never cleans up, data leaking across users or requests, nondeterministic
Stories, hydration mismatch, a failure reported as success) or let two implementations differ in
behaviour an app author can observe. For each NECESSARY rule the plan does not state, add it to
the plan in one or two plain behaviour sentences under the right outcome. Do not restore
mechanism, provenance, exhaustive tables, host matrices or test plumbing; those stay in the draft,
which remains available as implementation notes. The 220-line target may be exceeded only by what
you restore. Run `workflow format --write` and `workflow check` on the plan.

Final message (under 150 words): rules restored (one line each, at most 15), and the plan's new
line count. If nothing necessary was lost, say so.
