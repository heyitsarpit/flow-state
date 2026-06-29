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
  Area or file: `packages/flow-state/src/public/data-types.ts`, `examples/launch-workspace/src/launchWorkspaceAssembly.ts`
  Symptom: the heavyweight exported app assembly still hits `TS4023` / `TS7056` when
  `LaunchWorkspaceApp` relies on inference alone, which forces a small named `FlowAppDefinition`
  boundary to stay in place to keep declaration emit and TypeScript performance healthy
  Repro or evidence: `pnpm exec tsc -p examples/launch-workspace/tsconfig.json --noEmit false
--declaration --emitDeclarationOnly --declarationDir /tmp/flow-state-launch-workspace-dts`
  passes in the current tree, but removing the explicit `FlowAppDefinition` export boundary from
  `LaunchWorkspaceApp` in `launchWorkspaceAssembly.ts` reproduces `TS4023` plus `TS7056`
  Current impact: feature modules, exported descriptors, and exported app-layer constants are
  inference-first, and the rest-arg `flow.app(...)` form removes the extra module-list value
  plumbing, but the exported app assembly still needs one named `FlowAppDefinition` boundary
  because the library does not yet compress that inferred declaration shape enough for consumers
  Planned resolution: permanent fix
