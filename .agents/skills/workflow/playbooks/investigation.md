# Investigation

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation. Use the
`coordination-policy` skill for actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

Use for behavior, rationale, impact, or a decision recommendation. The endpoint is a cited answer.

1. `agent:workflow-coordinator`: State the inferred question. Use the `how` skill for
   execution facts or why (Use the `why` skill) for rationale. Give
   `agent:source-investigator` runtime exploration (Use the `how` skill) or rationale
   investigation (Use the `why` skill), with its source angle.
   Assign change-impact (Use the `change-impact` skill) to `agent:impact-investigator`
   when needed.
2. `agent:source-investigator`: Investigate only missing facts. Reuse current findings; return
   evidence and gaps. The coordinator assigns additional source angles only when needed.
3. `agent:acceptance-checker`: Prove the pivotal claim with existing code or authorized read-only
   observation where practical. Distinguish source evidence, runtime evidence, inference, and
   missing information.
4. `agent:evidence-synthesizer`: Read supplied findings. Use explanation (Use the `how` skill) for
   runtime understanding or rationale synthesis (Use the `why` skill) and
   confidence guidance (Use the `why` skill) for historical claims.
   For a narrow question, the coordinator may combine investigation and synthesis in one worker.
   Give your judgment and its reasons. For alternatives, compare
   consequences for the consumer and maintainer. Say when the premise is wrong; agreement is not the
   goal.
5. `agent:workflow-coordinator`: Return the cited answer to Workflow.
   Missing or contradictory evidence returns to its investigator within budget; preserve uncertainty
   when the sources cannot settle it. Do not turn a gap into a confident conclusion.
   Return the answer. If repair or design was also requested, carry
   these findings to that next phase. Investigation alone does not change code, commitments, or
   delivery state.

**Reply:** the answer, evidence anchors, recommendation when relevant, and remaining uncertainty.
