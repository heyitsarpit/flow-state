import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";

/**
 * The workspace outline: a document pasted whole, as nested as its author made it (a bulleted list
 * a hundred thousand levels deep, beside thousands of siblings); kept across reloads.
 */
export const Outline = definition({
  id: "Workspace/Outline",
  persist: true,
  states: ["OPEN"],
  events: { Paste: { doc: Schema.Json } },
  memory: { doc: Flow.initial(Schema.Json, null) },
});

/**
 * The outline: a paste replaces the document.
 */
export const OutlineMachine = machine(Outline, ({ S }) => ({
  default: S.OPEN,
  on: { Paste: { updateMemory: ({ event }) => ({ doc: event.doc }) } },
}));

/**
 * The outline's preview: it reads the whole document and counts each change it hears; kept across
 * reloads.
 */
export const Preview = definition({
  id: "Workspace/Preview",
  persist: true,
  states: ["SHOWN"],
  events: {},
  internalEvents: { Heard: {} },
  memory: { heard: Flow.initial(Schema.Number, 0) },
  context: { doc: Flow.context(Outline.M.doc) },
});

/**
 * The preview: each changed document is one more heard.
 */
export const PreviewMachine = machine(Preview, ({ S, E, C }) => ({
  default: S.SHOWN,
  onContext: [C.doc.change({ event: E.Heard })],
  on: { Heard: { updateMemory: ({ memory }) => ({ heard: memory.heard + 1 }) } },
}));
