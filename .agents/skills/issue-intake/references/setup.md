# Set up issue intake

1. Read the requested source, project, tracker, and existing automation configuration.
   Resolve authenticated trigger identity, supported adapters, model assignments, and runtime
   access.
2. Define accepted reports, permitted writes, reply destination, fix budget, and stopping condition.
   Require explicit authorization for tracker writes, messages, repairs, and persistent execution.
3. Write only named configuration files at the established automation location.
   Keep secrets in the supported secret store. Preserve local overrides and unrelated jobs.
   Ensure scheduled workers can read the configured project and instructions after restart.
4. Exercise a harmless report through the actual trigger, identity, and read-only triage path.
   Verify deduplication and partial-write recovery in isolated state before enabling external
   writes.
5. Return configuration paths, tested capabilities, missing prerequisites, and activation state.
   Activate only the requested schedule. An authored configuration is not a running automation.
