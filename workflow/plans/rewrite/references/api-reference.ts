import type { EventOf, InputOf, MemoryOf, RequirementsOf, StateOf } from "flow-state";
import type { DeskApp } from "./app/app.js";
import type { EditorMachine } from "./features/Tickets/editor/editor.machine.js";

/**
 * Public target API map. Read README.md first; the reading order is not execution order.
 * This is consumer documentation, not another package export list or proposed implementation.
 * Current and archived Plans are both used; compatible archived examples fill authoring detail.
 * Explicit unresolved questions in the current Plans are not silently resolved by an older example.
 *
 * Root authoring:
 * definition -> features/Tickets/editor/editor.definition.ts
 * machine -> features/Tickets/editor/editor.machine.ts; module/app -> app/app.ts
 * Definition.select -> features/Session/session.definition.ts
 * onContext.select -> features/Tickets/editor/editor.machine.ts
 * onMemory, onMemory.select, redirect, reenter, ordered alternatives -> features/Tickets/watcher/watcher.ts
 * S/E/O, activities, timers, updateMemory/actions/guard -> features/Tickets/editor/editor.machine.ts
 * can(snapshot,event) -> features/Tickets/editor/editor.selectors.ts; bound can(event) -> features/Tickets/editor/TicketPanel.tsx
 *
 * Root operations:
 * resource, transaction -> features/Tickets/ticket.operations.ts; stream -> features/Tickets/progress/progress.ts (marked candidate)
 * resource key/getData/getState -> features/Tickets/editor/editor.selectors.ts
 * resource lookup/refetch/subscribe/setData/cancel -> features/Tickets/editor/editor.machine.ts
 * invalidate/clear exact [O,K] -> features/Tickets/editor/editor.machine.ts; family targeting -> features/Tickets/editor/editor.selectors.ts
 * transaction key/getState -> features/Tickets/editor/editor.selectors.ts; commit/writes/outcomes/cancel -> features/Tickets/editor/editor.machine.ts
 * stream subscribe -> features/Tickets/progress/progress.ts; key/getState read fragment in that file
 *
 * Application and ownership:
 * Implementation.effect/succeed/merge -> app/implementation.ts
 * runtimeSetup -> app/setup.ts; construct/ready -> app/host.ts
 * actorRef -> app/actors.ts; admission/lease.dispose/runtime.dispose -> app/host.ts
 * actor.ref/send/getSnapshot/snapshots, runPromise/runPromiseExit -> app/host.ts
 * App.M flattening -> app/app.ts (DeskApp.M.session and DeskApp.M.editor)
 *
 * Persistence:
 * persistence/webStorage/indexedDbStorage, storage read/write/remove, filter -> app/persistence.ts
 * encode/decode and slot/entry limitations -> app/persistence.ts comments
 * persist actor/descriptor opt-ins -> app/actors.ts + features/Tickets/ticket.operations.ts
 *
 * React route:
 * FlowProvider -> app/view.tsx
 * useActor/useActorByRef/useView/useShallow -> features/Tickets/editor/TicketPanel.tsx
 *
 * Testing route:
 * story.app/machine/actor -> features/Tickets/editor/editor.story.ts
 * fixture -> testing/fixtures.ts; behavior -> app/behaviour.ts
 * send/process/checkpoint/run, persistent branches/evidence -> features/Tickets/editor/editor.story.ts
 * advanceToNextTimer -> features/Tickets/editor/editor.story.ts; advanceTo/setContext -> features/Tickets/editor/editor.story.ts
 * advance(duration), run({signal}) -> features/Tickets/editor/editor.story.ts marked limitations/fragments
 * model/getShortestPaths/getSimplePaths/path.story -> features/Tickets/editor/editor.story.ts; exact key gap marked
 * FlowStoryExecutionError -> tools/diagnostics.ts + features/Tickets/editor/editor.story.ts
 *
 * Inspection route:
 * graphOf/inspectTransition/inspectMicrosteps/whyNoTransition/formatNoTransitionSummary -> tools/inspection.ts
 * createInspectionBufferSink/attachInspectionSink/snapshot/clear/drain/dispose -> tools/inspection.ts
 * importTraceArtifact/exportTraceArtifact/summarizeTrace/diffTrace/formatTrace -> tools/inspection.ts
 * formatRehydrationSummary/formatResourceFreshnessReport/formatTransactionOverlapSummary -> tools/inspection.ts
 * formatInspectionEvent/formatInspectionTimeline -> tools/inspection.ts projection fragments
 * diffBehaviorContracts/renderBehaviorContract -> tools/inspection.ts settled contract fragments
 * buildBehaviorContract/renderBehaviorCoverage/sliceBehaviorContract/renderBehaviorDiff -> remaining forms below
 * inspectActivities/analyzeTrace/compressTraceArtifact/decompressTraceArtifact -> remaining forms below
 *
 * Diagnostics/root host types:
 * Diagnostic schema and Failure/Defect/Interruption classification -> tools/diagnostics.ts
 * FlowUsageError/FlowUsageCode/FlowPath, FlowPersistenceError, FlowDisposeError -> tools/diagnostics.ts
 * No constructor, member, or public error export beyond each owning Plan is invented.
 * All ten CLI leaves, flags, selectors, expected output semantics, exits -> tools/cli.ts
 *
 * Additional public type names and their consumer use:
 * Definition: editor.definition.ts; Machine: editor.machine.ts in features/Tickets/editor/.
 * StateToken/EventToken: inferred nominal S/E identity; never reconstruct structural lookalikes.
 * StateOf/EventOf/InputOf/MemoryOf/RequirementsOf: concrete extracted application types below.
 * Resource/Transaction: descriptor types inferred from features/Tickets/ticket.operations.ts.
 * ActorRef/ActorSnapshot: stable machine identity and current published snapshot.
 * Module/App/RuntimeSetup/Runtime/Implementation: composition and host values, kept inferred.
 * CanonicalKeyInput: bounded key boundary in features/Tickets/editor/editor.selectors.ts.
 * Persistence/PersistenceStorage/PersistenceStorageError: provider/read-write-remove failure boundary.
 * PersistenceCodec/PersistenceSlot/PersistenceValue/PersistenceEntry: domain codec/filter boundary.
 * Exact family status unions are inferred, not additional public support aliases.
 * No package namespace object, private deep import, or public wire/trace schema type is needed.
 *
 * REMAINING FORMS — these block only their concrete demonstrations:
 * Resources.Q1: resource mapper container, tag/placeholder authoring, full duration domain/defaults.
 * Archive gives string duration examples, not complete omitted policy or metadata shape.
 * Transactions.Q2: omitted concurrency; examples explicitly choose reject.
 * Streams.Q1: adapter return + mapper container; optional stream example uses the marked archive candidate.
 * StoriesAndModels.Q1: FlowStoryExecutionError members; preserve error/evidence without guessed fields.
 * StoriesAndModels.Q2/Q3/Q4: explored counted unit, advance duration, predicted stateKey state member.
 * Archive uses value.id; current Q4 explicitly leaves it open.
 * InspectionAndArtifacts.Q2: activities/analysis/slicing/diff-rendering call forms; behavior-builder/
 * coverage target typing; compression async return/failure. Settled CLI alternatives are illustrated.
 * InspectionAndArtifacts.V4: private nested wire layouts; examples never fabricate trace JSON.
 * Persistence.O1: Slot/Entry/StorageError/IndexedDBStorage member spelling beyond fixed boundaries.
 * StoriesAndModels.O2: fixture seed member layout beyond Runtime-owned canonical resource preload.
 * Statecharts.O4: timer reader accessor spelling and matches call placement not fixed publicly.
 * CommandLine.O1: gateway module export selection convention not fixed in current/archive Plan.
 * ApplicationsAndActors.Q1: consumer selector-defect isolation/retry policy; normal context example only.
 *
 * AVAILABILITY
 * Four target routes: flow-state, flow-state/react, flow-state/testing, flow-state/inspect.
 * PackageContract.O1 temporarily defers React/testing/inspect exports and several root names.
 * The temporary Runtime has construct/readiness only; full hosts/examples are future targets.
 * These files are not packed-consumer proof, source implementation, or package promotion.
 * Development follows the repository-pinned toolchain. PackageContract's Effect baseline differs
 * from the current workspace (4.0.5); this reference does not resolve that Plan/toolchain mismatch.
 *
 * Authority: all twelve parent capability Plans, ../ProjectDelivery.plan, and cited archive examples.
 */

export type EditorInput = InputOf<typeof EditorMachine>;

export type EditorMemory = MemoryOf<typeof EditorMachine>;

export type EditorEvent = EventOf<typeof EditorMachine>;

export type EditorState = StateOf<typeof EditorMachine>;

export type DeskRequirements = RequirementsOf<typeof DeskApp>;

// Input and memory retain useful domain fields; Event/State keep exact nominal vocabularies.
export const initialEditorInput: EditorInput = {
  workspaceId: "north",
  ticketId: "T-42",
  title: "Replace lobby light",
};

// RequirementsOf still identifies TicketApi even after supplying a complete Implementation/fixture.
// Complete services close execution requirements; they do not erase the authored requirement union.
