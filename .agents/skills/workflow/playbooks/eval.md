# Eval

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation. Use the
`coordination-policy` skill for actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

Design blinded trials, run ordinary tasks, judge outputs, then return an evidence-backed
recommendation.

1. `agent:evaluation-designer`: State the variants, target behavior, realistic tasks, trial count,
   models, and budget using experiment design (Use the `eval` skill). Return 3–6
   gradeable criteria, private rubric, ordinary prompts, and executable checks.
2. `agent:setup-owner`: Give each trial its raw task and permitted workspace. Hold the rubric,
   answer key, suspected defect, other candidates, and model/variant labels out of its context.
   Check actual tool access; separate directories alone are not security isolation. Disclose any
   blinding limit.
   Give the setup owner only isolation (Use the `eval` skill).
3. `agent:workflow-coordinator`: Dispatch trials with the owners appropriate to their ordinary
   tasks. Have each worker retain artifacts, checks, and scoped activity. Keep failed, blocked, and
   missing runs; do not grade skill use from self-report.
4. `agent:evaluation-judge`: Apply judging (Use the `eval` skill) to neutral-labelled
   outputs. Use
   configured model diversity when available; disclose same-family limits and hidden identity leaks.
5. `agent:acceptance-checker`: Apply outcome checking (Use the `eval` skill). Read every
   output end to end, rerun checks, and inspect decisive actions. Resolve disagreement
   against artifacts. Separate product quality from following
   the intended method.
   Return missing evidence or invalid conditions to the coordinator; it assigns setup repairs
   and affected trial reruns within budget. Preserve the rubric and prior results.
6. `agent:evidence-synthesizer`: Apply synthesis (Use the `eval` skill). Recommend adopt,
   revise, retain, or inconclusive. A single
   successful task proves only that case. Return the recommendation to the coordinator for
   authorized [Authoring a skill](authoring-a-skill.md) work and affected reruns.
   `agent:record-writer` stores material findings in owning records; `agent:resource-operator`
   cleans up only after evidence is retained.

**Reply:** variants, rubric, counts/conditions, verdicts, failures, evidence, recommendation,
limits.
