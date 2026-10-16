# Runtime forensics

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation.
Apply [coordination-policy](../../coordination-policy/SKILL.md) to actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

Capture the live symptom, narrow the causes, then test the strongest mechanism with a probe.
Return a cited diagnosis or the next observation. Production repair is a separate authorized phase.

1. `agent:diagnostician`: Name the symptom, revision, running instance, workload, and observation
   that matters. Resolve the matching UI, CLI, service, or library surface and owned test state.
2. `agent:diagnostician`: Use [diagnose](../../diagnose/SKILL.md) in live mode. Capture a profile,
   heap, trace, or blocked state appropriate to the symptom. Label instrumentation overhead and
   incomplete access.
3. `agent:evidence-synthesizer`: Reduce large artifacts through bounded inspection. Keep pivotal
   evidence, source attribution, and original captures.
4. `agent:diagnostician`: Test the strongest mechanism with a discriminating probe in an owned
   disposable environment. Distinguish a hot frame, retaining path, or temporal correlation from a
   demonstrated cause. Return inconclusive probes to the diagnostician with the competing
   explanations. Repeat the cheapest distinguishing probe within budget; retain failed evidence.
5. `agent:diagnostician`: Return the diagnosis, probe evidence, and next observation if
   inconclusive.
   When independent checking is selected, `agent:acceptance-checker` assesses the final causal claim
   and evidence before handback.
   `agent:resource-operator` cleans up owned instrumentation and processes. Preserve revision-bound
   evidence before removing temporary state.
6. `agent:workflow-coordinator`: For an already-authorized repair, carry evidence to [Bug
   fix](bug-fix.md) or [Perf issue](perf-issue.md). Otherwise stop at findings.

**Reply:** signal, mechanism or hypothesis, decisive observation, source, capture paths, and
limitations.
