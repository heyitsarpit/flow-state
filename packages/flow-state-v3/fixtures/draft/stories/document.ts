import { Story } from "../../../src/host/testing/index.ts";
import { Docs } from "../server/docs.ts";
import { DocsFake } from "../server/layer.ts";
import { Document, documentSetup, plan } from "./document.ts";

/**
 * The grown draft app over its port fake, with the plan document ensured.
 */
export const documentStory = (id: string) =>
  Story.app(documentSetup, { id, fixtures: [DocsFake] }).ensure(plan);

/**
 * An edit is saved and written into the read, so the saved copy holds the new revision across a
 * reload.
 */
export const savedAfterWrite = documentStory("draft/saved-after-write")
  .send(plan, Document.E.Open())
  .send(plan, Document.E.Edit({ body: "second draft" }))
  .checkpoint("saved")
  .reload({ reattach: false })
  .checkpoint("reloaded");

/**
 * Closing the plan clears its read, and the saved copy goes with it.
 */
export const closeClears = documentStory("draft/close-clears")
  .send(plan, Document.E.Open())
  .checkpoint("loaded")
  .send(plan, Document.E.Close())
  .checkpoint("closed");

/**
 * An edit's save is on the wire when the plan is closed; the save's answer then lands. Closing
 * cleared the read, so the late save's write does not bring the saved copy back.
 */
export const saveAfterClose = documentStory("draft/save-after-close")
  .send(plan, Document.E.Open())
  .world(Docs.save.hold())
  .send(plan, Document.E.Edit({ body: "second draft" }))
  .send(plan, Document.E.Close())
  .world(Docs.save.release())
  .checkpoint("answered");

/**
 * Every document Story, by name.
 */
export const documentStories = { savedAfterWrite, closeClears, saveAfterClose };
