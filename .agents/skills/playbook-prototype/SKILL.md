---
name: playbook-prototype
description: >-
  Settle requirements and a solution for a goal that cannot be checked right away, through rounds
  of prototypes, a verification suite grown alongside them (conformance and benchmark suites are
  kinds of it), independent reviews, and convergence between rounds. Use before production work
  on a runtime, protocol, engine, or other design whose correctness only shows under many
  conditions. Stops at a converged design, a verification suite that passed its re-audit, and
  decisions recorded for the user.
metadata:
  kind: playbook
  uses: [interview, prototype, check-benchmark, review, to-spec, to-design]
  applies:
    - policy-convergence
    - policy-testing
    - policy-records
    - policy-delegation
    - policy-authority
    - principle-design-for-verification
    - principle-fix-root-causes
    - principle-claim-only-what-you-checked
    - principle-truth-is-a-compilation-target
    - policy-verification
---

# Prototype

Some goals cannot be checked by one experiment: a runtime that must hold under crashes, a protocol
that must survive every interleaving, a store that must stay coherent across many writers. This
playbook works toward such a goal in rounds. Each round builds a throwaway version, tests it
against a suite that grows with it, and is reviewed independently. Between rounds, the findings are
gathered and the design is redesigned once (`policy-convergence`). The prototype never becomes
production code. What carries over is the settled requirements, the design, and the suites.

The endpoint is a converged design, a verification suite (conformance, and benchmark when the
guarantees include cost) that passed a re-audit, and decisions recorded in the Plan and Specs, with
the user's open calls listed for the user's read.
Production work needs its own Plan and authorization (`policy-authority`).

You read the goal, the Plan, the Specs, earlier rounds' results and reviews, and prior art. You
write round folders, round notes, the suites, review reports, and proposed decisions.

Each step says what to do. Open a named package (`<skills-root>/NAME/SKILL.md`) only when a
step needs its full method.

## Steps

1. **Frame the goal.** Name what production needs from the prototype: the open design questions,
   the guarantees it must prove, and what would change the design. Every round must inform one of
   these; drop work that informs none. Settle the user's decisions with `interview` before the
   first round, and record any delegated authority to make design calls. Agree on a budget: a
   cap on rounds, on time, and on usage.

2. **Write the suite first.** Turn the requirements into executable scenarios before the first
   build, each one citing the rule or decision it tests, at the public boundary only
   (`policy-testing`). Run them and keep the failing output: a scenario never seen failing proves
   nothing. The suite carries across rounds and rewrites. An expected result changes only with a
   logged, specific reason. Add a benchmark verification suite when the guarantees include cost, and
   check its numbers with `check-benchmark`.

3. **Build a round.** Run `prototype` for each experiment in the round, in its own round folder.
   Run it in the real environment where a test double might be wrong, such as a real browser,
   store, or network, and record where reality disagreed with the test double.

4. **Review the round.** Run `review` with a reviewer who did not build it. The reviewer writes
   mutants and attacks from the code and rules before reading the builder's results, reruns the
   headline numbers, includes a section on the tests themselves, and continues an assumptions table
   across rounds. Findings are advice; you decide.

5. **Converge between rounds.** Apply `policy-convergence`. Write the round's notes before the next
   round's code: findings by root cause, decisions numbered and marked proposed or decided, and
   what each replaced. Fix what the last review found before taking the next planned step, and
   reorder the plan when the evidence says it is wrong, recording why.

6. **Gate the suite.** Before building on the suite's verdicts, check that every check kills its
   mutants and excuses only what the harness observed
   (`policy-testing`). Re-audit after fixing the suite; later rounds wait for a pass.

7. **Settle.** When the questions are answered and the suite passes, record the guarantees with
   `to-spec` and the implementation choices with `to-design`, and put decisions with their reasons
   in the Plan (`policy-records`). Make the suite the executable form of the Spec, so that the two
   cannot drift apart (`principle-truth-is-a-compilation-target`). Write one page for the user:
   the calls made under delegation, the limits stated, and what production must still verify.

## What to return

Return the converged design, the suites and their last verdicts, the review and audit reports, the
decisions made and those still the user's, the stated limits, and what production must still
verify. Recommend the next step, usually `playbook-plan` or `playbook-specify` for production work.
