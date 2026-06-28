export type LaunchDocsStatus =
  | "Final authoring docs"
  | "Advanced authoring docs"
  | "Runtime docs"
  | "Machine docs"
  | "Machine and React docs"
  | "Transaction docs"
  | "Streams docs"
  | "React docs"
  | "Testing docs";

export type LaunchExecutableStatus =
  | "executable"
  | "partial"
  | "descriptor-only"
  | "legacy/migration support";

export type LaunchStatusNoteKind = "partial" | "contract-only" | "future" | "historical";

export interface LaunchApiSurfaceStatus {
  readonly api: string;
  readonly docsStatus: LaunchDocsStatus;
  readonly exampleProof: string;
  readonly executableStatus: LaunchExecutableStatus;
  readonly caveat: string;
}

export interface LaunchRuntimeFact {
  readonly fact: string;
  readonly exampleProof: string;
  readonly status: string;
}

export interface LaunchStatusNote {
  readonly surface: string;
  readonly kind: LaunchStatusNoteKind;
  readonly note: string;
}

export const launchApiSurfaceStatus = [
  {
    api: "flow.module",
    docsStatus: "Final authoring docs",
    exampleProof:
      "Session, Project, Checklist, Readiness, Assets, Approval, Assistant, Chat, Launch, Trace",
    executableStatus: "executable",
    caveat: "Static resource-tag validation remains contract-only.",
  },
  {
    api: "flow.resource",
    docsStatus: "Final authoring docs",
    exampleProof: "Project, Permissions, Readiness, Assets, Approval",
    executableStatus: "executable",
    caveat:
      "Offline pause/resume and proved refresh slices are executable; cache capacity/TTL and broader invalidation policy remain partial.",
  },
  {
    api: "flow.transaction",
    docsStatus: "Final authoring docs",
    exampleProof: "Project save, Approval request",
    executableStatus: "executable",
    caveat:
      "Abort teardown through cancel-previous, actor stop, and runtime dispose is proved; queue, replay, and undo remain parked.",
  },
  {
    api: "flow.machine",
    docsStatus: "Final authoring docs",
    exampleProof: "Editor, checklist, upload, approval, assistant, chat, workspace",
    executableStatus: "executable",
    caveat:
      "The proved subset is flat transitions, bounded always microsteps, and child-final success; onDone, parallel, history, and broader eventless semantics stay deferred.",
  },
  {
    api: "flow.view",
    docsStatus: "Advanced authoring docs",
    exampleProof: "Overview, trace, dashboards, multi-source summaries",
    executableStatus: "executable",
    caveat:
      "Use sparingly for real projection work; simple UI can read resources or actor snapshots directly.",
  },
  {
    api: "flow.app",
    docsStatus: "Final authoring docs",
    exampleProof: "LaunchWorkspaceApp",
    executableStatus: "executable",
    caveat: "App inventory and dependency validation exist; broader manifests are still evolving.",
  },
  {
    api: "App.layer",
    docsStatus: "Final authoring docs",
    exampleProof: "LaunchWorkspaceAppLayer, LaunchWorkspaceTestAppLayer",
    executableStatus: "executable",
    caveat: "Real Layer installers for every descriptor option remain partial.",
  },
  {
    api: "flow.runtime",
    docsStatus: "Final authoring docs",
    exampleProof: "launchRuntime",
    executableStatus: "executable",
    caveat:
      "Runtime exposes concrete resources and orchestrators; trace correlation and deterministic mailbox semantics are still partial.",
  },
  {
    api: "flow.store.memory",
    docsStatus: "Runtime docs",
    exampleProof: "App layer descriptor",
    executableStatus: "executable",
    caveat:
      "Seed/get/patch/subscribe plus host-signal pause/resume exist; cache capacity/TTL and broader freshness policy are partial.",
  },
  {
    api: "flow.store.test",
    docsStatus: "Runtime docs",
    exampleProof: "Test app layer descriptor",
    executableStatus: "executable",
    caveat:
      "Virtual time, bounded settle, and pending-work inspection are executable; deterministic mailbox ordering remains partial.",
  },
  {
    api: "flow.orchestrators.live",
    docsStatus: "Runtime docs",
    exampleProof: "App layer descriptor",
    executableStatus: "executable",
    caveat: "Descriptor config options are not yet fully semantic.",
  },
  {
    api: "flow.orchestrators.test",
    docsStatus: "Runtime docs",
    exampleProof: "Test app layer descriptor",
    executableStatus: "executable",
    caveat:
      "Actor-owned delayed transitions run under injected clocks; deterministic mailboxes remain partial.",
  },
  {
    api: "flow.ensure",
    docsStatus: "Machine docs",
    exampleProof: "Project loading",
    executableStatus: "executable",
    caveat:
      "Actor-owned resource dependency execution is proved in core tests and Launch Workspace; broader cache-policy semantics remain partial.",
  },
  {
    api: "flow.observe",
    docsStatus: "Machine docs",
    exampleProof: "Project comments, readiness/assets/approval observers",
    executableStatus: "executable",
    caveat:
      "Actor-owned observation lifecycle is proved in core tests and Launch Workspace; broader host-signal refetch policy remains partial.",
  },
  {
    api: "flow.refresh",
    docsStatus: "Machine docs",
    exampleProof: "Refresh command descriptor",
    executableStatus: "executable",
    caveat:
      "Supported actor-owned refresh behavior is runtime-real; cache TTL and richer background refresh policy remain partial.",
  },
  {
    api: "flow.run",
    docsStatus: "Transaction docs",
    exampleProof: "Project save",
    executableStatus: "executable",
    caveat:
      "State-side transaction invocation is real; broader queue and replay semantics are still parked.",
  },
  {
    api: "flow.patch",
    docsStatus: "Transaction docs",
    exampleProof: "Project preview patch command",
    executableStatus: "executable",
    caveat:
      "State-owned resource patch commands and transaction previews are proved; broader standalone command ergonomics remain partial.",
  },
  {
    api: "flow.invalidate",
    docsStatus: "Transaction docs",
    exampleProof: "Readiness invalidation command",
    executableStatus: "executable",
    caveat:
      "Supported actor-owned invalidation by ref, tag, and filter is runtime-real; broad cache policy semantics remain partial.",
  },
  {
    api: "flow.stream",
    docsStatus: "Streams docs",
    exampleProof: "Assets upload, assistant progress, chat tokens",
    executableStatus: "executable",
    caveat:
      "Runtime queue/coalesce pressure slices and disposal are proved; pressure counters and broader diagnostics remain partial.",
  },
  {
    api: "flow.after",
    docsStatus: "Streams docs",
    exampleProof: "Assets completion dismissal",
    executableStatus: "executable",
    caveat:
      "One-shot timer lifecycle snapshots are executable; recurring time behavior still belongs in Schedule.",
  },
  {
    api: "flow.child",
    docsStatus: "Machine docs",
    exampleProof: "Assistant task child flow",
    executableStatus: "executable",
    caveat: "Automatic restart policies remain contract-only.",
  },
  {
    api: "flow.can",
    docsStatus: "Machine and React docs",
    exampleProof: "Command bars, guards, permission gates",
    executableStatus: "executable",
    caveat: "Depends on resource snapshots supplied to the guard.",
  },
  {
    api: "FlowProvider",
    docsStatus: "React docs",
    exampleProof: "Launch Workspace shell",
    executableStatus: "executable",
    caveat:
      "Provides the runtime boundary for provider-backed React hooks without owning runtime disposal by default.",
  },
  {
    api: "flow.useResource",
    docsStatus: "React docs",
    exampleProof: "Workspace shell resource detail",
    executableStatus: "executable",
    caveat:
      "Reads live provider-backed resource snapshots with optimistic read plus subscribe reconciliation.",
  },
  {
    api: "flow.use",
    docsStatus: "React docs",
    exampleProof: "Workspace shell actor",
    executableStatus: "executable",
    caveat:
      "Returns a render-safe shell actor first, then swaps to the live runtime actor and rerenders on snapshot updates.",
  },
  {
    api: "flow.useView",
    docsStatus: "React docs",
    exampleProof: "Live overview and trace panels",
    executableStatus: "executable",
    caveat:
      "Projects live actor state in React, including issue-driven updates, with explicit selector equality when needed.",
  },
  {
    api: "flowTest",
    docsStatus: "Testing docs",
    exampleProof: "Screen scenarios",
    executableStatus: "executable",
    caveat: "Host test runner owns assertions.",
  },
  {
    api: "flowTest.app",
    docsStatus: "Testing docs",
    exampleProof: "Seeded resources, module fixtures, transactions",
    executableStatus: "executable",
    caveat:
      "flush drains only ready queued work; advance moves virtual time; settle runs bounded quiescence with diagnostics.",
  },
  {
    api: "createControlledEffect",
    docsStatus: "Testing docs",
    exampleProof: "Controlled helper coverage",
    executableStatus: "legacy/migration support",
    caveat: "Useful for tests; not a product runtime concept.",
  },
  {
    api: "createControlledStream",
    docsStatus: "Testing docs",
    exampleProof: "Chat token tests",
    executableStatus: "legacy/migration support",
    caveat:
      "Useful for tests while app descriptors use Effect Stream; not a product runtime concept.",
  },
] as const satisfies ReadonlyArray<LaunchApiSurfaceStatus>;

export const launchRuntimeFacts = [
  {
    fact: "Resource snapshots",
    exampleProof: "Seeded ResourceStore, runtime actor resource commands, and app harness tests",
    status:
      "executable for seed/get/patch/subscribe plus actor-owned ensure/observe/refresh/invalidate",
  },
  {
    fact: "Transaction snapshots",
    exampleProof: "Preview, rollback, route, and receipt tests",
    status: "executable",
  },
  {
    fact: "Resource cache hydration",
    exampleProof: "ResourceStore.hydrate snapshot-merge tests",
    status: "executable for newer-cache-wins snapshot restore",
  },
  {
    fact: "Stream snapshots",
    exampleProof: "Chat generation and stop tests",
    status: "executable for actor-owned stream slices",
  },
  {
    fact: "Timer snapshots",
    exampleProof: "Assets dismissal timers and flowTest timer probes",
    status: "executable for actor-owned one-shot timers",
  },
  {
    fact: "Child actor snapshots",
    exampleProof: "Assistant child lifecycle tests",
    status: "executable",
  },
  {
    fact: "Actor snapshot restore",
    exampleProof: "Runtime rehydration tests",
    status: "executable for no-replay restore and continue",
  },
  {
    fact: "Receipts",
    exampleProof: "Resource, transaction, stream, actor, and child tests",
    status: "executable",
  },
  {
    fact: "Issues",
    exampleProof: "Typed failure, child failure, and stream interrupt tests",
    status: "executable",
  },
  {
    fact: "Trace and timeline facts",
    exampleProof: "Live trace panel and trace view projection",
    status: "partial",
  },
  {
    fact: "App and module inventory",
    exampleProof: "API and module inventory tests",
    status: "executable",
  },
] as const satisfies ReadonlyArray<LaunchRuntimeFact>;

export const launchKnownPartialSurfaces = [
  "Resource cache capacity/TTL policy, richer freshness semantics, and broader invalidation behavior outside the proved actor-owned slices.",
  "Stream pressure counters and broader runtime stream diagnostics beyond the proved queue/coalesce slices.",
  "SSR hydration boundary and RSC loader/runtime split beyond the current cache and actor restore proofs.",
  "Machine/root final completion, onDone, parallel, history, initial eventless resolution, raised events, and nested or parallel eventless graphs beyond the current flat always plus child-final subset.",
  "Deterministic mailboxes and broader scheduler ordering semantics.",
  "Real Layer installers for every orchestrator descriptor option.",
  "Automatic child restart policies.",
  "Full trace correlation.",
] as const;

export const launchStatusNotes = [
  {
    surface: "flow.runtime",
    kind: "partial",
    note: "flow.runtime(AppLayer) exposes ResourceStore seed/get/patch/subscribe plus actor-owned ensure/observe/refresh/invalidate and OrchestratorSystem handles; trace correlation and deterministic mailbox semantics remain partial.",
  },
  {
    surface: "flow.module.tags",
    kind: "contract-only",
    note: "Module metadata, app inventory, dependency validation, cycle validation, and duplicate resource-id validation are executable; static resource-tag validation remains contract-only.",
  },
  {
    surface: "flow.transaction.params",
    kind: "contract-only",
    note: "Transaction params and commit are executable target names; params schema validation remains contract-only.",
  },
  {
    surface: "flow.transaction.queue",
    kind: "future",
    note: "Offline transaction queue, undo rollback, and replay receipts are parked as future work outside the core rebuild.",
  },
  {
    surface: "flow.stream",
    kind: "partial",
    note: "Chat actor unsubscribe/dispose cleanup, STOP_GENERATION interrupt, stream subscribe authoring, and stream generation snapshots are executable; broader pressure diagnostics remain partial.",
  },
  {
    surface: "flow.child",
    kind: "contract-only",
    note: "Assistant child actors, child stop receipts, child failure bubbling, and retry-only-failed-child supervision are executable; automatic restart policies remain contract-only.",
  },
  {
    surface: "flowTest.settle",
    kind: "partial",
    note: "Virtual time through flowTest.advance/settle plus public pending-work inspection is executable; deterministic mailbox ordering remains partial.",
  },
  {
    surface: "flow.mutation",
    kind: "historical",
    note: "Historical mutation/query naming stays out of final docs; use flow.transaction with params/commit/preview and flow.resource instead.",
  },
] as const satisfies ReadonlyArray<LaunchStatusNote>;

export const launchWorkspaceStatusRegistry = Object.freeze({
  apis: launchApiSurfaceStatus,
  runtimeFacts: launchRuntimeFacts,
  knownPartialSurfaces: launchKnownPartialSurfaces,
  notes: launchStatusNotes,
});

export const launchCoveredApiIds = [
  "flow.module",
  "flow.resource",
  "flow.transaction",
  "flow.machine",
  "flow.view",
  "flow.app",
  "App.layer",
  "flow.runtime",
  "flow.ensure",
  "flow.observe",
  "flow.refresh",
  "flow.run",
  "flow.patch",
  "flow.invalidate",
  "flow.stream",
  "flow.after",
  "flow.child",
  "flow.can",
  "flow.useResource",
  "flow.use",
  "flow.useView",
  "flowTest",
  "flowTest.app",
  "createControlledEffect",
  "createControlledStream",
] as const;

const launchCoveredApiIdSet = new Set<string>(launchCoveredApiIds);

export const launchApiCoverage = launchApiSurfaceStatus
  .filter((entry) => launchCoveredApiIdSet.has(entry.api))
  .map((entry) => [entry.api, entry.exampleProof] as const);

export const contractOnlyRuntimeQuestions = launchStatusNotes.map((entry) => entry.note);
