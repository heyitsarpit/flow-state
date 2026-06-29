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

None currently tracked for the active App Router migration slice.

## Mitigated Or Follow-Up Bugs

- Date: 2026-06-29
  Phase or task: Launch Workspace example declaration-emit audit
  Area or file: `packages/flow-state/src/public/data-types.ts`, `examples/launch-workspace/*`
  Symptom: an earlier Launch Workspace report hit `TS4023` and `TS7056` around exported descriptor
  shapes, which created pressure to add app-side export annotations instead of relying on library
  inference
  Repro or evidence: the historical failure was reported against
  `examples/launch-workspace/src/launchWorkspaceChat.ts` and
  `examples/launch-workspace/src/launchWorkspaceProject.ts`; the current declaration probe
  `pnpm exec tsc -p examples/launch-workspace/tsconfig.json --noEmit false --declaration --emitDeclarationOnly --declarationDir /tmp/flow-state-launch-workspace-dts`
  now passes
  Current impact: no longer blocks the App Router build/typecheck slice; follow-up remains to keep
  moving type complexity into the library so app exports can stay inference-first without hurting
  TypeScript performance
  Planned resolution: permanent fix
