---
name: diagnose
description: >-
  Reproduce a software failure or analyze a captured profile, trace, heap, or dump. Return causal
  evidence or the next discriminating observation. Use for diagnosis requests or an unresolved
  cause during repair.
metadata:
  kind: procedure
---

# Diagnose

Reproduce the exact symptom or inspect the supplied capture. Test competing explanations.
Return the demonstrated cause or the next observation needed to distinguish causes.
Keep production code unchanged during diagnosis. Use the `design-for-verification` skill
for discriminating observations.

For an artifact-only request, load [captured-artifact diagnosis](references/captured-artifacts.md).
Skip live reproduction and follow that method; return its findings through step 4 below.

## 1. Frame the failure

State expected behavior, observed behavior, the consumer's action path, and their discriminating
final states. Read relevant contracts, Git state, existing fixes, and supplied evidence.
Name the revision, build, environment, input data, scope, and investigation budget.
In live mode, compare a plausible existing fix with the failing baseline before proposing a repair.
Artifact-only mode compares supplied captures; missing live evidence remains a named limitation.

## 2. Reproduce

Use the project's verifier or real consumer interface. Confirm setup before driving the path.
Use owned or explicitly authorized targets for side effects; otherwise observe read-only or report
blocked.
Retain exact inputs, commands or actions, and the observed final state.
Reset only owned test state when repeatability matters; never reset the user's state to force a
repro.
Separate **reproduced**, **not reproduced within budget**, and **blocked by missing capability**.
A screenshot, build, or source explanation alone does not establish reproduction.

## 3. Distinguish causes

Use the `fix-root-causes` skill for causal judgment.
Use runtime exploration (Use the `how` skill) for missing execution facts and local
rationale sources (Use the `why` skill) for relevant history.
Reuse supplied findings instead of repeating settled investigations.

For performance failures, apply design-for-performance (Use the `design-for-performance` skill) to
workload costs and waiting; verify measured comparisons through
benchmark-checklist (Use the `benchmark-checklist` skill).

For artifact-only diagnosis, use capture queries; propose live probes without running them.
List plausible causes and an observation that would distinguish them.
Choose the cheapest discriminating probe; state predicted observations before running it.
Use isolated probes, state inspection, or temporary instrumentation in a disposable copy.
Record the actual result, evidence location, and which hypotheses it supports or refutes.
Trace the symptom to the responsible owner, transition, or boundary; separate mechanism from
speculation.
If attempts repeat a failed premise, use
attack-the-premise (Use the `attack-the-premise` skill). Stop at a demonstrated cause or
the investigation budget; an inconclusive probe is not confirmation.

## 4. Return the finding

Return reproduction status, expected and observed states, revision and conditions, causal evidence,
refuted alternatives, remaining uncertainty, and one bounded repair direction or next probe.
In live mode, replay an existing fix on the same path under comparable conditions.
In artifact-only mode, report what the capture establishes and any live check still needed; do not
run that check.
Report material setup differences; do not treat an unrelated passing check as proof.
Clean up only owned processes, instrumentation, and test state; preserve useful evidence.

For material findings, apply keep-intent-aligned (Use the `keep-intent-aligned` skill).
Report repair evidence and contract gaps with a recommended next action.
For a standalone diagnosis, return findings only; objective conflicts remain with the human.
