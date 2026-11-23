import { Layer } from "effect";
import { layerIndexedDb } from "../../src/host/persistence.ts";
import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { DocsLive } from "./adapters/docs.ts";
import { LibraryMachine } from "./machines/library.ts";

/**
 * The author's library.
 */
export const library = actorRef(LibraryMachine, "ada");

/**
 * The `n`th of many authors' libraries.
 */
export const libraryOf = (n: number) => actorRef(LibraryMachine, `author-${String(n)}`);

/**
 * The draft app: the library.
 */
export const draftApp = app({ id: "draft", machines: { library: LibraryMachine } });

/**
 * The draft app's real setup: the documents service over HTTP, persisted, each capture written at
 * once.
 */
export const draftSetup = runtimeSetup({
  app: draftApp,
  services: Layer.merge(DocsLive("https://docs.example"), layerIndexedDb()),
  scope: "draft",
  persistence: { captureMs: 0 },
});
