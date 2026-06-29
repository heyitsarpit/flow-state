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
    exampleProof:
      "LaunchWorkspaceAppLayer, LaunchWorkspaceTestAppLayer, createLaunchWorkspaceRequestBoot",
    executableStatus: "executable",
    caveat:
      "Live/test installer policy is explicit and overrideable; request-scoped server runtimes now reuse the same layer through withRequestRuntime(...), while broader server/client policy variants remain partial.",
  },
  {
    api: "flow.runtime",
    docsStatus: "Final authoring docs",
    exampleProof:
      "createLaunchWorkspaceBrowserRuntime, createLaunchWorkspaceTestRuntime, createLaunchWorkspaceRequestBoot",
    executableStatus: "executable",
    caveat:
      "Runtime exposes concrete resources, orchestrators, deterministic mailbox ordering, and restorable one-shot delayed work across sends, children, streams, and timers; broader recurring schedule policy and full trace correlation remain partial.",
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
      "Virtual time, bounded settle, pending-work inspection, deterministic mailbox ordering, and restorable one-shot delayed work across sends, children, streams, and timers are executable; broader recurring schedule policy remains partial.",
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
      "Actor-owned delayed transitions run under injected clocks, and deterministic mailbox ordering plus restorable one-shot delayed work across sends, children, streams, and timers is executable; broader recurring schedule policy remains partial.",
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
      "One-shot timer lifecycle snapshots plus restored resume are executable; recurring time behavior still belongs in Schedule.",
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
    exampleProof: "Live overview, trace, and debug panels",
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
    exampleProof: "ResourceStore snapshot-merge plus runtime.resources dehydrate/hydrate tests",
    status: "executable for newer-cache-wins public cache restore",
  },
  {
    fact: "Stream snapshots",
    exampleProof: "Chat generation and stop tests",
    status: "executable for actor-owned stream slices",
  },
  {
    fact: "Timer snapshots",
    exampleProof: "Assets dismissal timers and flowTest timer probes",
    status: "executable for actor-owned one-shot timers plus restored resume",
  },
  {
    fact: "Child actor snapshots",
    exampleProof: "Assistant child lifecycle tests",
    status: "executable",
  },
  {
    fact: "Actor snapshot restore",
    exampleProof: "Runtime rehydration tests plus actor.serialize restore coverage",
    status:
      "executable for public JSON-safe actor restore, no-replay resume, delayed-work continuation, and post-restore continue",
  },
  {
    fact: "Runtime boot payload",
    exampleProof: "Runtime boot payload hydration tests plus request-scoped page boot hydration",
    status:
      "executable for request-scoped versioned resource-plus-actor handoff without persisting live runtime handles",
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
    exampleProof: "Live trace and debug panels plus trace view projection",
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
  "Broader recurring schedule policy and generalized delayed-event queues beyond the restored one-shot actor timers.",
  "Broader App.layer policy variants beyond the current live/test installer subset.",
  "Automatic child restart policies.",
  "Full trace correlation.",
] as const;

export const launchStatusNotes = [
  {
    surface: "Package topology",
    kind: "future",
    note: "The final public contract is five real packages: @flow-state/core, @flow-state/react, @flow-state/testing, @flow-state/server, and @flow-state/inspect. The current @flow-state/core/* subpaths are migration receipts only and should disappear once the package split lands.",
  },
  {
    surface: "flow.runtime",
    kind: "partial",
    note: "flow.runtime(AppLayer) exposes ResourceStore seed/get/patch/subscribe plus public dehydrate/hydrate, fail-closed versioned boot payloads, request-scoped server boot helpers, actor-owned ensure/observe/refresh/invalidate, JSON-safe actor serialize/restore, OrchestratorSystem handles, deterministic mailbox ordering, and restorable one-shot delayed work across sends, children, streams, and timers; broader recurring schedule policy and full trace correlation remain partial.",
  },
  {
    surface: "Next.js App Router",
    kind: "partial",
    note: 'Launch Workspace runs through one "use client" boundary on next@16.2.9; app/page.tsx now creates one request-scoped boot payload on the server, and the client runtime hydrates it with fail-closed versioned resource-plus-actor restore. Broader SSR/RSC ownership still remains future work.',
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
    note: "Virtual time through flowTest.advance/settle plus public pending-work inspection, deterministic mailbox ordering, and restorable one-shot delayed work across sends, children, streams, and timers is executable; broader recurring schedule policy remains partial.",
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
