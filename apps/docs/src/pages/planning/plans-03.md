# Plan 03 [Minimal runtime slice]

## Purpose

Implement only the runtime pieces needed to make the Project Editor example real.

## Scope

- Runtime provider.
- Effect execution boundary.
- Machine state execution.
- Minimal resource cache.
- Minimal mutation and invalidation.
- React adapter hooks required by the example.

## Procedure

1. Convert Project Editor stubs into real library calls one at a time.
2. Keep each primitive narrow.
3. Add runtime tests before broadening behavior.
4. Keep failure-as-data semantics explicit.
5. Keep cache semantics minimal.
6. Update the reference after each naming decision.
7. Stop once Project Editor runs against real package exports.

## Acceptance Criteria

- Project Editor no longer relies on fake library APIs.
- Tests pass.
- Verification passes.
- The reference docs match the implemented exports.

## Out Of Scope

- Second example until the first runtime slice works.
- Devtools.
- SSR.
- Advanced cache features unless Project Editor requires them.

## Open Questions

Empty until Plan 02 completes.
