import { Schema } from "effect";
import { resource } from "../../../src/index.ts";
import { DocsApi, Doc, Outline } from "../services.ts";

/**
 * A document, saved on the device so a reload shows it at once while it is read again. It is
 * fresh for a minute and kept a day after nobody has it open.
 */
export const document = resource({
  id: "Draft/document",
  input: { id: Schema.String },
  key: ["id"],
  services: [DocsApi],
  staleTime: "1 minute",
  gcTime: "1 day",
  persist: true,
  output: Doc,
  lookup: (input) => DocsApi.use((api) => api.document(input)),
});

/**
 * A document's outline, saved on the device but kept no time once nobody shows it: saved, never
 * shown after a reload.
 */
export const outline = resource({
  id: "Draft/outline",
  input: { id: Schema.String },
  key: ["id"],
  services: [DocsApi],
  staleTime: 0,
  gcTime: 0,
  persist: true,
  output: Outline,
  lookup: (input) => DocsApi.use((api) => api.outline(input)),
});
