# BUGS

Use this file to record library issues, errors, and bugs discovered while
working through later phases.

When a coder agent runs into a problem that comes from the library, add an
entry here before closeout. Some entries will lead to permanent library fixes,
some will become tagged diagnostics in
`packages/flow-state/src/diagnostics.ts`, and some may need both.

Record each bug with:

- Date
- Phase or task
- Area or file
- Symptom
- Repro or evidence
- Current impact
- Planned resolution:
  permanent fix, diagnostic, both, or unresolved

## Open Bugs

- Date: 2026-06-29
  Phase or task: Launch Workspace example declaration-emit audit
  Area or file: `packages/flow-state/src/public/data-types.ts`, `examples/launch-workspace/*`
  Symptom: exported example descriptors fail declaration emit with `TS4023` because `FlowTag` and
  `FlowKey` carry private `unique symbol` brands (`flowTagBrand`, `flowKeyBrand`) that consumers
  cannot name; several large inferred exports also trip `TS7056`
  Repro or evidence: `pnpm exec tsc -p examples/launch-workspace/tsconfig.json --noEmit`
  Current impact: Launch Workspace cannot typecheck cleanly for declaration-style serialization, and
  consumer-facing example exports leak internal library branding details
  Planned resolution: both
