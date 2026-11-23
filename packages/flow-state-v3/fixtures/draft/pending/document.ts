import { Layer, Schema } from "effect";
import { layerIndexedDb } from "../../../src/host/persistence.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../../src/index.ts";
import { DocsLive } from "../adapters/docs.ts";
import { LibraryMachine } from "../machines/library.ts";
import { document } from "../operations/reads.ts";
import { save } from "../operations/writes.ts";

/**
 * One open document, named by its id: its title, body and revision as last read or saved, and a
 * notice.
 */
export const Document = definition({
  id: "Draft/Document",
  persist: true,
  states: ["LOADING", "EDITING"],
  events: { Open: {}, Edit: { body: Schema.String }, Close: {} },
  internalEvents: {
    Loaded: { title: Schema.String, body: Schema.String, revision: Schema.Number },
    LoadFailed: {},
    Saved: { body: Schema.String, revision: Schema.Number },
    Conflicted: { revision: Schema.Number },
    SaveUnsure: Flow.uncertain({}),
    SaveNotSent: { why: Schema.String },
  },
  memory: {
    id: Flow.input(Schema.String),
    title: Flow.initial(Schema.String, ""),
    body: Flow.initial(Schema.String, ""),
    revision: Flow.initial(Schema.Number, 0),
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    document: document.outcomes({
      success: E.Loaded.from((v) => ({ title: v.title, body: v.body, revision: v.revision })),
      failure: { NoResponse: E.LoadFailed, Defect: E.LoadFailed, Interrupted: E.LoadFailed },
    }),
    save: save.outcomes(
      {
        success: E.Saved.from((v, { input }) => ({ body: input.body, revision: v.revision })),
        failure: { Conflict: E.Conflicted.from((e) => ({ revision: e.revision })) },
        notSent: E.SaveNotSent.from((n) => ({ why: n.why })),
        unknown: E.SaveUnsure,
      },
      {
        // A save the server took is written into the read, so the document shows it as fresh.
        writes: ({ value, input }) => [
          document.write({ id: input.id }, (current) => ({
            ...current,
            body: input.body,
            revision: value.revision,
          })),
        ],
      },
    ),
  }),
});

/**
 * Opening reads the document; each edit saves the body on the revision read, the latest edit
 * winning, and a save the server took is written into the read, so the document shows it as
 * fresh; a save that conflicts reads the document again now; closing clears the read off the
 * device.
 */
export const DocumentMachine = machine(Document, ({ S, O }) => ({
  default: S.LOADING,
  on: {
    Open: { actions: [O.document.lookup(({ memory }) => ({ id: memory.id }))] },
    Loaded: {
      target: S.EDITING,
      updateMemory: ({ event }) => ({
        title: event.title,
        body: event.body,
        revision: event.revision,
      }),
    },
    LoadFailed: { updateMemory: () => ({ notice: "offline" }) },
    Close: { target: S.LOADING, actions: [O.document.clear(({ memory }) => ({ id: memory.id }))] },
  },
  states: {
    LOADING: {},
    EDITING: {
      on: {
        Edit: {
          updateMemory: ({ event }) => ({ body: event.body }),
          actions: [
            O.save.commit(({ memory }) => ({
              id: memory.id,
              body: memory.body,
              revision: memory.revision,
            })),
          ],
        },
        Saved: {
          updateMemory: ({ event }) => ({ revision: event.revision, notice: "saved" }),
        },
        Conflicted: {
          updateMemory: ({ event }) => ({
            notice: `changed elsewhere at ${String(event.revision)}`,
          }),
          actions: [O.document.refetch],
        },
        SaveUnsure: { updateMemory: () => ({ notice: "not sure it saved" }) },
        SaveNotSent: { updateMemory: ({ event }) => ({ notice: `not saved: ${event.why}` }) },
      },
    },
  },
}));

/**
 * The plan document.
 */
export const plan = actorRef(DocumentMachine, { id: "doc-1" });

/**
 * The draft app grown with open documents around the library.
 */
export const documentApp = app({
  id: "draft",
  machines: { library: LibraryMachine, document: DocumentMachine },
});

/**
 * The grown draft app's real setup: the documents service over HTTP, persisted, each capture
 * written at once.
 */
export const documentSetup = runtimeSetup({
  app: documentApp,
  services: Layer.merge(DocsLive("https://docs.example"), layerIndexedDb()),
  scope: "draft",
  persistence: { captureMs: 0 },
});
