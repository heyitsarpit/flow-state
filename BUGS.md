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
  Symptom: large exported example descriptors still hit `TS7056` when helper, module, or runtime
  exports rely on inference alone, which forces a small set of app-side annotations back in to keep
  declaration emit and TypeScript performance healthy
  Repro or evidence: `pnpm exec tsc -p examples/launch-workspace/tsconfig.json --noEmit false
--declaration --emitDeclarationOnly --declarationDir /tmp/flow-state-launch-workspace-dts`
  passes in the current tree, but removing the explicit export annotations from
  `launchWorkspaceChat.ts`, `launchWorkspaceProject.ts`, or the runtime factories in
  `launchWorkspaceAssembly.ts` reproduces `TS7056`
  Current impact: the client shell helper layer is inference-first, but a few large exported
  descriptor helpers still need explicit annotations because the library does not yet compress those
  inferred declaration shapes enough for consumers
  Planned resolution: permanent fix
