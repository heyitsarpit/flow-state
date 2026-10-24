import type { EventOf, InputOf, MemoryOf, RequirementsOf, StateOf } from "flow-state";
import type { DeskApp } from "./app/app.js";
import type { EditorMachine } from "./features/Tickets/editor/editor.machine.js";

/**
 * Public target API map. Read README.md first. Documentation, not an export list or proof.
 * Applies SurfaceSimplification D1–D60; capability Plans remain the semantic owners.
 *
 * Root authoring
 * definition (states, events, context, input, memory, initial, operations) -> features/Tickets/editor/editor.definition.ts
 * derived Schemas Editor.Event / State / Input / Memory / Snapshot -> app/host.ts, editor.story.ts
 * machine(definition, ({ S, E, O, invalidate, clear }) => config) -> editor.machine.ts
 * guard + deny(code, context) -> editor.machine.ts (canSave), watcher.ts
 * actions as static declarations; outcomes by event constructor; failures by error tag -> editor.machine.ts
 * onContext reactions -> editor.machine.ts; schedules { schedule, send } -> editor.machine.ts, queue.machine.ts
 * root activity with when (replaces onMemory), redirect, reenter, ordered alternatives -> watcher.ts
 * S.X.is(snapshot) -> editor.selectors.ts, QueueList.tsx; can(snapshot, event, { explain }) -> editor.selectors.ts
 *
 * Operations
 * resource / transaction / stream with key projectors returning named records -> features/Tickets/ticket.operations.ts
 * derived key (normalised search) -> ticketList; persist: true + data Schema -> ticketById
 * stream adapter returning a Stream; persist: false -> technicianUpdates
 * readers take the key input -> editor.selectors.ts; partial-key invalidate -> editor.machine.ts (SaveSucceeded)
 * Operation states are _tag lanes matched with Effect's Match.valueTags (no Flow helper) -> editor.selectors.ts, QueueList.tsx
 *
 * Application and ownership
 * app({ id, machines }) -> app/app.ts; actorRef with persist and context wiring -> app/actors.ts
 * runtimeSetup({ app, services: Layer }) -> app/setup.ts; persistence options -> app/persistence.ts
 * construct / ready / ensureActor / getActor / createActor / dispose / runPromise -> app/host.ts
 * FlowError -> app/host.ts, tools/diagnostics.ts
 *
 * React: FlowProvider -> app/view.tsx; useActorByRef (PinnedTicket) / useActor (OpenTicket) / useView -> TicketPanel.tsx, QueueList.tsx
 * View model shared by UI and tests: editorView -> features/Tickets/editor/editor.selectors.ts
 * Testing: story.app / story.machine / story.actor, process, advance(Duration.Input), advanceToNextTimer,
 *   checkpoint, run, model -> editor.story.ts, queue.story.ts; fixtures as Layers -> testing/fixtures.ts;
 *   defineConfig -> flow.config.ts
 * Inspect: inspect / render / attachInspector / trace -> tools/inspection.ts; CLI -> tools/cli.ts
 *
 * REFERENCE CHOICES NOT YET DECIDED BY THE PLAN (each is written one way here; see README findings)
 * - runtimeSetup's Layer field is named `services`.
 * - Outcome payloads: a success constructor receives the value's fields (SaveSucceeded: Ticket.fields);
 *   a tagged error's constructor receives the error's fields without _tag.
 * - Transaction writes: O.resource.setData(({ value }) => ({ key, data })).
 * - Persisted resources declare their data Schema as `data`.
 * - can(…, { explain: true }) returns { allowed, denied: [{ code, context }] }.
 * - attachInspector(runtime, { capacity }) returns { snapshot, drain, dispose }; trace.import/export/summarize/diff.
 * - ensureActor(ref) with no options for a void-input machine.
 * - The actor handle type is named Actor<typeof Machine> (PinnedTicket/OpenTicket pass it to TicketPanel).
 * - Invariants are paused (Q30) and not demonstrated.
 */

export type EditorInput = InputOf<typeof EditorMachine>;

export type EditorMemory = MemoryOf<typeof EditorMachine>;

export type EditorEvent = EventOf<typeof EditorMachine>; // The Schema.TaggedUnion member type, _tag-keyed.

export type EditorState = StateOf<typeof EditorMachine>;

export type DeskRequirements = RequirementsOf<typeof DeskApp>; // TicketApi, still visible after Layers close it.
