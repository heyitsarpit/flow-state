# Ambient block

Setup writes the block below into the project's AGENTS.md and CLAUDE.md, between the markers.
Each line names the package with the full rules.

```markdown
<!-- workflow:ambient:start -->
## Working principles

- Design for verification: turn every material claim into something checkable before building it
  (`principle-design-for-verification`).
- Claim only what you checked: report what ran, on which revision, and what stayed unverified
  (`principle-claim-only-what-you-checked`).
- Fix root causes: reproduce, trace to the mechanism, and question the premise after two failed
  fixes (`principle-fix-root-causes`).
- Explain measurements: do not trust a number until you know what limits it
  (`principle-explain-measurements`).
- Design for performance: name the workload and budget when you design; reduce work first
  (`principle-design-for-performance`).
- Enforce with structure: turn a recurring mistake into a type, check, or lint
  (`principle-enforce-with-structure`).
- Make work rerunnable: script repeated edits, analyses, and checks (`principle-make-work-rerunnable`).
- Authority: commits, pushes, PRs, merges, deploys, and messages need an explicit request
  (`policy-authority`).
- Records: the Plan is the project's ADR (each decision with its reason); Specs own contracts;
  Tasks own work and evidence. Record the result, never the session (`policy-records`).
- Not sure what to run? Ask the `workflow` router.
<!-- workflow:ambient:end -->
```
