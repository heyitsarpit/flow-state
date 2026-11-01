# Prototype

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation. Use the
`coordination-policy` skill for actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

Build the smallest experiment that separates alternatives; return observations and a chosen
direction.
Authorized production implementation follows [Feature](feature.md).

1. `agent:experiment-author`: Name the uncertainty and the observation that separates alternatives.
   No discriminating question means no prototype. Reuse settled direction and existing evidence.
2. `agent:evidence-synthesizer`: Gather references when the design space is open. Recommend
   meaningful alternatives; involve the user in product preferences, not factual behavior that a run
   can establish.
3. `agent:experiment-author`: Use the `prototype` skill to build the smallest
   disposable experiment outside production source. For visuals, render and drive the interaction;
   for behavior, observe the real output, timing, or state that decides the fork.
4. `agent:experiment-author`: Label visual alternatives; provide a switcher when useful.
   Run behavioral alternatives through one repeatable recipe. `agent:evidence-synthesizer`
   compares the observations under the same conditions. If independent candidates could change the
   choice, return that need to the coordinator for arena (Use the `arena` skill).
5. Return the observations and recommendation. Only for unresolved consequential product choices,
   assign `agent:planning-interviewer` planning (Use the `planning` skill) and the
   observed
   tradeoffs. Relay those choices through Workflow; keep guesses visible.
   A settled factual result needs no new interview; continue within the existing grant.
   Assign `agent:plan-writer`
   to-plan (Use the `to-plan` skill) for material decision changes.
   Recheck affected observations when constraints change. Repeat the smallest needed probe within
   budget; retain failed evidence.
6. `agent:workflow-coordinator`: If the current grant includes building, carry the chosen direction
   into Feature or contract design. Otherwise return the scratch artifact and decision evidence. Do
   not ship the prototype as proof.

**Reply:** question, alternatives, observations, recommendation, scratch paths, and unresolved
choices.
