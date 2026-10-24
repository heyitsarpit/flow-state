// Inert scenario plans and recipes; importing them runs neither a Story nor a provider.
import { Result } from "effect";
import { story } from "flow-state/testing";
import { DeskSetup } from "../../../app/setup.js";
import { demoFixture, lockedFixture } from "../../../testing/fixtures.js";
import { SessionMachine } from "../../Session/session.machine.js";
import { sessionDefinition } from "../../Session/session.definition.js";
import { EditorMachine } from "./editor.machine.js";
import { editorDefinition } from "./editor.definition.js";

export const session = story.actor(SessionMachine);

export const editor = story.actor(EditorMachine, {
  input: { workspaceId: "north", ticketId: "T-42", title: "Replace lobby light" },
  contextBindings: { canEdit: session },
});

// persistent-branches
export const opened = story
  .app(DeskSetup, {
    fixtures: [demoFixture],
    title: "Edit a repair ticket",
    tags: ["smoke", "tickets"],
  })
  .send(editor, Result.getOrThrow(editorDefinition.E.LoadRequested()))
  .process()
  .checkpoint("opened");

export const saved = opened
  .send(editor, Result.getOrThrow(editorDefinition.E.TitleChanged("Replace foyer light")))
  .send(editor, Result.getOrThrow(editorDefinition.E.SaveRequested("request-42")))
  .process()
  .checkpoint("saved");

export const closed = opened
  .send(editor, Result.getOrThrow(editorDefinition.E.Close()))
  .process()
  .checkpoint("closed");

export const reminder = opened.advanceToNextTimer().process().checkpoint("reminded");

export const focused = story
  .machine(EditorMachine, {
    input: { workspaceId: "north", ticketId: "T-42", title: "Replace lobby light" },
    context: { canEdit: true },
    fixtures: [demoFixture],
  })
  .send(Result.getOrThrow(editorDefinition.E.TitleChanged("Replace foyer light")))
  .process()
  .checkpoint("edited");

// evidence-reads
// Functions keep imports inert. Only the caller starts a run.
export async function readSavedEvidence() {
  const run = await saved.run();
  const initial = run.checkpoints.opened.actor(editor).snapshot;
  const final = run.checkpoints.saved.actor(editor).snapshot;
  const key = final.O.ticketById.key({ workspaceId: "north", ticketId: "T-42" });

  return {
    initialTitle: initial.memory.draft,
    finalTitle: final.memory.draft,
    canonicalTicket: final.O.ticketById.getData(key),
    now: run.end.runtime.now,
    pendingWork: run.end.runtime.pendingWork,
  };
}

export const revoked = opened
  .send(session, Result.getOrThrow(sessionDefinition.E.PermissionChanged(false)))
  .process()
  .checkpoint("revoked");

export const emptyTitle = opened
  .send(editor, Result.getOrThrow(editorDefinition.E.TitleChanged("")))
  .send(editor, Result.getOrThrow(editorDefinition.E.SaveRequested("request-empty")))
  .process()
  .checkpoint("declined");

export const locked = story
  .app(DeskSetup, { fixtures: [lockedFixture] })
  .send(editor, Result.getOrThrow(editorDefinition.E.LoadRequested()))
  .process()
  .send(editor, Result.getOrThrow(editorDefinition.E.TitleChanged("Replace foyer light")))
  .send(editor, Result.getOrThrow(editorDefinition.E.SaveRequested("request-locked")))
  .process()
  .checkpoint("failed");

export const readonlyEditor = focused
  .setContext({ canEdit: false })
  .process()
  .checkpoint("readonly");

// Absolute time: construct without executing; no initial epoch is assumed.
export const atKnownEpoch = focused.advanceTo(2000000000000).process().checkpoint("at-epoch");

// model-paths
// Fresh command-empty base for pure model exploration. Do not model `focused`, which has commands.
export const modelBase = story.machine(EditorMachine, {
  input: { workspaceId: "north", ticketId: "T-42", title: "Replace lobby light" },
  context: { canEdit: true },
  fixtures: [demoFixture],
});

/**
 * Model demonstration awaits StoriesAndModels.Q4's stateKey snapshot spelling:
 *
 *   const editorModel = model(modelBase, { stateKey: exactSnapshotKey });
 *   const shortest = editorModel.getShortestPaths({ events, maxDepth: 8, limit: 30 });
 *   const simple = editorModel.getSimplePaths({ events, maxDepth: 8, limit: 30 });
 *   for (const path of shortest.paths) await path.story.process().run();
 *
 * Archive PublicSurface/Types illustrate ({ value, memory }) => [value.id, memory].
 * Current Q4 explicitly leaves value versus state unresolved, so that candidate is not asserted.
 * The key must cover every guard/redirect-relevant state/memory/context/seed fact.
 * Candidates are exact event envelopes. Traversal runs no service, operation, time, or fixture.
 * getShortestPaths uses BFS; getSimplePaths DFS without repeated keys per path. Both include empty.
 * Defaults: maxDepth 20, limit 100. Results: paths/truncated/explored; explored's counted unit is open.
 * Run returned ordinary Stories and compare predicted/live keys; prediction alone is not proof.
 *
 * run({signal}) cancellation example:
 *   const controller = new AbortController();
 *   const pending = saved.run({ signal: controller.signal });
 *   controller.abort();
 *   await pending;
 * A deterministic test holds an adapter at a known boundary before aborting. Completion can win.
 * Cancellation stops later commands and waits for cleanup. Exact FlowStoryExecutionError public
 * members are open, so no invented partialRun/end access or constructor appears here.
 * Cleanup failure rejects even when end was captured. Product failure can be successful evidence.
 *
 * advance(duration) is supported, but its input representation/units remain unspecified.
 * advanceTo(epochMilliseconds) and advanceToNextTimer move time; process separately drains ready work.
 * maxTurns defaults to 100. process never invents external results or advances time implicitly.
 *
 * App evidence uses checkpoint.actor(recipe|exactRef).snapshot; focused evidence uses snapshot.
 * End follows commands and precedes cleanup; it is not actor finality or resumable state.
 * Duplicate checkpoint names and unknown literal checkpoint keys are type errors.
 * Recipes preserve identity per run; branches/reruns have fresh Runtimes and scoped fixture state.
 * Seeds are optional fixture input but their exact call layout is unspecified. They never close
 * missing services or authorize writes. Fixtures replace complete services, not operation kernels.
 *
 * Authority: ../../../../StoriesAndModels.plan, ../../../../../archive/Verification.plan, ../../../../../archive/Types.plan.
 */
