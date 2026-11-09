---
name: playbook-reimagine
description: >-
  Research stronger approaches before committing to a direction: four independent investigators
  look at speed, purpose, rigor, and techniques from other fields, then one synthesis recommends
  what to pursue. Changes nothing. Use before planning a big change, or when the current approach
  feels like it could be much better.
metadata:
  kind: playbook
  uses: [reimagine-speed, reimagine-altitude, reimagine-depth, reimagine-range]
  applies:
    - principle-claim-only-what-you-checked
    - principle-explain-measurements
    - policy-authority
    - policy-delegation
---

# Reimagine

This playbook looks for a much better approach before the user commits to one. Four investigators
each examine the problem from a different angle, and you combine what they find into one
recommendation, leaving the choices to the user. It ends there: choosing an option does not start
delivery.

You read the goal, the current approach, its constraints, and the evidence available. You change
nothing in the project's code or records. Investigators may write temporary files, such as a
benchmark script or a scratch build, but only in a scratch directory outside the project, and they
remove or report them when done.

This page is an outline. Each investigator's skill holds the actual method. Open that skill's
`SKILL.md` in the folder beside this one (`<skills-root>/NAME/SKILL.md`), along with the
principles and policies in its `metadata.applies`. An investigation run from this outline alone
misses most of what makes it work.

## Steps

1. **Brief four independent investigators.** Give each the same goal, current approach,
   constraints, and evidence, and a share of one overall time and resource budget. Tell them which
   commitments already stand, and keep their proposals separate from decisions. Apply
   skill:policy-delegation: give each one the installed path of its skill, not its
   name.

   | Concern | Skill | Returns |
   |---|---|---|
   | Speed | `reimagine-speed` | Baseline, credible comparisons, stretch target |
   | Altitude | `reimagine-altitude` | The purpose behind the request, alternative approaches |
   | Depth | `reimagine-depth` | Stronger methods and evidence, a rewritten brief |
   | Range | `reimagine-range` | Techniques from other fields, ways to test them |

   Ask each to research its concern deeply on the internet. Search summaries are a starting point:
   they should follow promising sources to the primary documentation, papers, measurements, and
   case studies, compare methods and the conditions behind them, check consequential claims, and
   cite the sources behind each recommendation. If they have no internet access, they report that
   gap. Each keeps its scratch files and any shared runtime isolated from the others, and reports
   capabilities it lacked. An investigator may find no useful opportunity in its concern; it says
   so rather than inventing one.

2. **Check the results.** Read all four reports. Check the consequential claims against their
   evidence, and resolve factual conflicts within the budget. Point out where investigators
   assumed different workloads or constraints, since their recommendations may not combine. For
   each consequential recommendation, explain why the evidence applies to this project, and which
   differences in workload, environment, or constraints limit how far it transfers. Say which
   investigations failed or remain unfinished, and how that limits your recommendation.

3. **Synthesize.** Merge duplicates. For each distinct opportunity, explain its value and cost, and
   recommend what to pursue, with its evidence, its uncertainty, and how it would be verified.
   Keep measured facts apart from research findings and hypotheses. Do not adopt any proposal or
   start any work.

## What to return

Give the opportunities, your recommendation, links to the evidence, and the choices that need the
user's judgment. Recommend `playbook-plan` for whichever direction the user chooses.
