# Trace forensics

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation. Use the
`coordination-policy` skill for actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

The supplied artifact is a fixed dataset; live reproduction is a different phase.

1. `agent:diagnostician`: Identify format, capture conditions, revision, time range, and available
   symbols. Missing provenance limits attribution; record it instead of guessing a current source
   line.
2. `agent:diagnostician`: Use captured-artifact diagnosis (Use the `diagnose` skill).
   Convert large data into a queryable
   shape using existing tools. Keep originals and location maps.
3. `agent:evidence-synthesizer`: Narrow to the costly path, retained object, wait chain, or observed
   transition. Return useful partition boundaries to the coordinator; inspect decisive evidence.
4. `agent:source-investigator`: Map evidence through the capture's symbols and matching revision.
   Resolve missing symbols where possible. A frame without attribution remains an explicit gap.
5. `agent:acceptance-checker`: Compare paired captures only under comparable conditions. State
   whether the result proves a mechanism, supports a hypothesis, or requires a live discriminating
   probe. Do not run that probe during an artifact-only request.
   Return missing attribution or unsupported claims to the assigned investigator or diagnostician.
   Recheck revised findings within budget; retain unresolved provenance as a limitation.
6. `agent:workflow-coordinator`: Return cited findings. If live diagnosis or repair was also
   requested, transfer the capture and uncertainty to Runtime forensics, Bug fix, or Perf issue
   without repeating settled analysis.

**Reply:** capture identity, queried finding, source attribution, confidence, derivatives, next
check.
