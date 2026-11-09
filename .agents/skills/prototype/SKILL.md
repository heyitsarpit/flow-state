---
name: prototype
description: >-
  Build the smallest throwaway experiment that settles one design or empirical question by
  observation, then recommend a direction. Use for uncertain layouts, interactions, behavior, or
  technical approaches before production work. Offer it first; build it when chosen.
metadata:
  kind: procedure
  applies:
    - principle-design-for-verification
    - policy-testing
    - policy-records
---

# Prototype

Some questions cannot be settled by reading or arguing: which layout feels right, whether an
approach is fast enough, how a library behaves under load. A prototype answers one such question
with the smallest thing you can build and observe. It is throwaway in the sense that it never
becomes production code; it never proves the finished behavior, and scaffolding around it is
optional.

Unless it is already authorized, offer the prototype before building it: the question it answers,
a time estimate, and whether you recommend it. Build it only when the user chooses it.

## Steps

1. **Pin down the question.** Name the decision, the constraints that matter, the evidence that
   would settle it, and the time or attempt budget. Pick an observation whose result would differ
   between the options (`principle-design-for-verification`). Look up facts you can discover instead
   of experimenting on them, and leave product preferences and changes to the project's goals for
   the user to decide. If no decision actually needs an experiment, say so instead of building one.

2. **Build it in isolation.** Work in a scratch directory you own, away from production source and
   shared runtime state. Use the lightest tool that exercises the question, and prefer dependencies
   the project already has. Do not add production abstractions, change project configuration, or
   install packages unless that is in scope. When there are competing viable shapes, build at least
   two genuinely distinct ones, under conditions you can compare. Label visual variants, and add a
   switcher to flip between them when comparing side by side helps. Collect prior art only when the
   direction is still open.

3. **Observe it.** Drive the surface the question is about. For visual choices, look at the rendered
   states and use the interactions; a screenshot does not prove how an interaction behaves. For
   behavior, run the path and inspect the output. For timing, vet the comparison with
   `check-benchmark` before trusting it. Capture the inputs, conditions, results, and limitations.
   Durable tests are optional; when they are worth keeping, write them under `policy-testing`. Stop
   when the question is settled or the budget runs out.

## What to return

Return the question, the variants, the evidence, the tradeoffs, your recommendation, and the path
to the scratch artifact. Say which production assumptions remain unverified. If the findings affect
recorded commitments, name them (`policy-records`). List the choices still open for the user and
recommend the next step; production work needs its own authorization. Clean up the runtime
resources you started, and keep the artifact for review or remove it once it is no longer needed.
