# Desktop and interactive native apps

1. Measure startup, input acknowledgement, first useful result, operation completion, frame pacing,
   and memory. Specify realistic refresh rates and workloads rather than universal timing targets.

2. Trace input, scheduling, data access, computation, state publication, layout, and drawing. Keep
   blocking external calls and unbounded computation off latency-sensitive threads.

3. Separate essential results from optional enrichment. Render visible content, update changed
   state, schedule enrichment with bounded resources, and cancel obsolete work.

4. Protect state publication with request identity/version checks; prevent late work overwriting the
   current view. Define ownership, thread access, and cancellation behavior for irreversible
   operations.

5. Isolate slow integrations and handle stalled drives, network shares, extensions, and previews.
   Custom frameworks are optional candidates, not a requirement.

6. Test rapid navigation, cold startup, huge collections, slow dependencies, resize/scroll,
   cancellation, stale completion, and long sessions. Measure useful work rather than animation
   alone.

## Sources

- [Keep UI thread
responsive](https://learn.microsoft.com/en-us/windows/apps/develop/performance/keep-ui-thread-responsive)
- [RAIL model](https://web.dev/articles/rail)
