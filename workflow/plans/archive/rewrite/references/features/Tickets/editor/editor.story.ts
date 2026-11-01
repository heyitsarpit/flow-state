// Inert scenario plans and recipes; importing them runs neither a Story nor a provider.
import { Schema } from "effect";
import { model, story } from "flow-state/testing";
import { DemoTicketApi } from "../../../app/demo-api.js";
import { DeskSetup } from "../../../app/setup.js";
import { LockedTicketApi } from "../../../testing/fixtures.js";
import { Session } from "../../Session/session.definition.js";
import { SessionMachine } from "../../Session/session.machine.js";
import { Editor } from "./editor.definition.js";
import { EditorMachine } from "./editor.machine.js";

const { E } = Editor;

// Recipes: Story-local actors. Bindings are explicit because recipes have no stable ref.
export const session = story.actor(SessionMachine);

export const editor = story.actor(EditorMachine, {
  input: { workspaceId: "north", ticketId: "T-42", title: "Replace lobby light" },
  contextBindings: { canEdit: session },
});

const desk = (id: string, fixtures = [DemoTicketApi]) =>
  story.app(DeskSetup, { id, fixtures, tags: ["tickets"] });

export const opened = desk("ticket-opened")
  .send(editor, E.LoadRequested())
  .process()
  .checkpoint("opened");

export const saved = desk("ticket-save")
  .send(editor, E.LoadRequested())
  .process()
  .checkpoint("opened")
  .send(editor, E.TitleChanged({ title: "Replace foyer light" }))
  .send(editor, E.SaveRequested())
  .process()
  .checkpoint("saved");

// Debounce: typing restarts the 2-second autosave; only the pause after the last edit saves.
export const autosaved = desk("ticket-autosave")
  .send(editor, E.TitleChanged({ title: "Replace foyer" }))
  .process()
  .advance("1 second")
  .send(editor, E.TitleChanged({ title: "Replace foyer light" }))
  .process()
  .advance("1 second")
  .process()
  .checkpoint("still-editing") // Only 1s since the last edit: nothing saved yet.
  .advance("1 second")
  .process()
  .checkpoint("autosaved");

export const emptyTitle = desk("ticket-empty-title")
  .send(editor, E.TitleChanged({ title: "" }))
  .send(editor, E.SaveRequested())
  .process()
  .checkpoint("declined"); // Denied with EmptyTitle; no transaction starts.

export const revokedWhileSaving = desk("ticket-revoked-while-saving")
  .send(editor, E.TitleChanged({ title: "Replace foyer light" }))
  .send(editor, E.SaveRequested())
  .send(session, Session.E.PermissionChanged({ canEdit: false })) // Queued before the save settles.
  .process()
  .checkpoint("revoked");

// Lock contention: the retry schedule backs off, each tick is a guarded event, then it gives up.
export const lockedOut = desk("ticket-locked", [LockedTicketApi])
  .send(editor, E.TitleChanged({ title: "Replace foyer light" }))
  .send(editor, E.SaveRequested())
  .process()
  .checkpoint("locked")
  .advanceToNextTimer()
  .process()
  .checkpoint("first-retry")
  .advance("10 minutes") // Long enough for every remaining backoff step.
  .process()
  .checkpoint("gave-up");

export const reminded = opened.advance("1 minute").process().checkpoint("reminded");

// A focused machine Story: one fresh editor, selected context supplied directly.
export const focused = story
  .machine(EditorMachine, {
    id: "editor-focused",
    input: { workspaceId: "north", ticketId: "T-42", title: "Replace lobby light" },
    context: { canEdit: true },
    fixtures: [DemoTicketApi],
  })
  .send(E.TitleChanged({ title: "Replace foyer light" }))
  .process()
  .checkpoint("edited");

export const readonlyEditor = focused
  .setContext({ canEdit: false })
  .process()
  .checkpoint("readonly");

// Functions keep imports inert. Only the caller starts a run.
export async function readSavedEvidence() {
  const run = await saved.run();
  const before = run.checkpoints.opened.actor(editor).snapshot;
  const after = run.checkpoints.saved.actor(editor).snapshot;
  const ref = { workspaceId: "north", ticketId: "T-42" };

  return {
    initialTitle: before.memory.draft,
    finalTitle: after.memory.draft,
    canonicalTicket: after.O.ticketById.getData(ref),
    now: run.end.runtime.now,
    pendingWork: run.end.runtime.pendingWork,
  };
}

// Pure model exploration from a fresh, command-empty base.
const modelBase = story.machine(EditorMachine, {
  id: "editor-model-base",
  input: { workspaceId: "north", ticketId: "T-42", title: "Replace lobby light" },
  context: { canEdit: true },
  fixtures: [DemoTicketApi],
});

export function exploreEditor() {
  const editorModel = model(modelBase, {
    // The key must cover every guard-relevant fact. Tokens are objects, so the state is encoded
    // to its path string through the definition's State Schema (see README findings).
    stateKey: ({ state, memory }) => ({
      state: Schema.encodeSync(Editor.State)(state),
      draftEmpty: memory.draft.trim() === "",
      draftTooLong: memory.draft.length > 200,
    }),
  });

  const events = [
    E.TitleChanged({ title: "" }),
    E.TitleChanged({ title: "Ok" }),
    E.SaveRequested(),
    E.Close(),
    E.Reopen(),
  ];

  const { paths, truncated, explored } = editorModel.getShortestPaths({
    events,
    maxDepth: 6,
    limit: 30,
  });

  return { stories: paths.map((path) => path.story.process()), truncated, explored };
}
