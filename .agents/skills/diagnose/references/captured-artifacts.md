# Diagnose captured artifacts

Analyze the supplied capture as a fixed dataset. Do not rerun the system merely to enter diagnosis.
Preserve the original artifact; put conversions and queries in owned scratch storage.

1. Identify format, capture conditions, build or revision, time range, and available symbols.
   Use an appropriate parser for profiles, traces, thread dumps, or heap snapshots.
   Mark missing provenance; a capture without revision identity limits source attribution.
2. Reduce large data into a queryable form using existing tools; SQLite is an option, not a
   requirement.
   Retain original locations, units, sample counts, and reduction commands.
   Inspect decisive evidence in the bounded scope; report additional inspection needs.
3. For CPU profiles, distinguish self time from inclusive time and trace the dominant call path.
   For heaps, follow retaining paths to roots; for thread dumps, inspect blocked threads and wait
   reasons.
   A large object or hot frame is evidence, not automatically a leak or root cause.
4. Map the finding to source through capture symbols and the matching revision.
   Resolve missing symbols when possible; report unresolved attribution rather than guessing a line.
5. Compare paired captures only under comparable workloads and conditions.
   Confirm causal claims with a discriminating observation; a before/after difference alone is
   correlation.
   Without adequate confirmation, return the strongest supported hypothesis and the next probe.

Use diagnose's causal judgment. Report artifact identity, cited samples or nodes,
source attribution, hypothesis or demonstrated mechanism, uncertainty, and useful derivative paths.
Live probes belong to the reproduction mode and require an owned test environment and available
scope.
