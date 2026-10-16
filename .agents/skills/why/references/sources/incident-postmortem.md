# Incident & Postmortem Context

Not a separate source, a **cross-cutting angle**. Incidents can motivate defensive code: null
checks, retry logic, timeout handling, rate limits, feature flags, and resource guards.

- Search local incident notes, postmortems, Plans, and Tasks for the target or error string.
- Trace introducing commits, reverts, and reapplications around the recorded incident date.
- Inspect regression evidence and action items linking the failure to the implementation.

Read the full local record when available. A contemporaneous explanation is stronger than timing
alone; a regression check proves behavior, not the author's motivation.
Name missing incident evidence. Skip this angle when no plausible incident connection exists.
