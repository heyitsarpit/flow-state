import { Story } from "../../../src/host/testing/index.ts";
import { attachmentSetup, photo } from "../app.ts";
import { Attachment } from "../machines/attachment.ts";
import { UploadsFake } from "../server/layer.ts";
import { Uploads } from "../server/uploads.ts";

/**
 * The attachment app over its uploads fake, with no steps yet.
 */
export const attachmentStory = (id: string) =>
  Story.app(attachmentSetup, { id, fixtures: [UploadsFake] });

/**
 * A photo uploaded in four chunks: after the first, its row shows a quarter sent.
 */
export const uploadProgress = attachmentStory("chat/upload-progress")
  .ensure(photo)
  .world(Uploads.chunk.hold(), Uploads.chunk.hold())
  .send(photo, Attachment.E.Upload({ chunks: 4 }))
  .world(Uploads.chunk.release())
  .checkpoint("one chunk")
  .world(Uploads.chunk.release())
  .checkpoint("attached");

/**
 * The user stops the upload while its second chunk is on the wire: the upload is unsure, and its
 * row still shows the quarter it sent.
 */
export const uploadStopped = attachmentStory("chat/upload-stopped")
  .ensure(photo)
  .world(Uploads.chunk.hold(), Uploads.chunk.hold())
  .send(photo, Attachment.E.Upload({ chunks: 4 }))
  .world(Uploads.chunk.release())
  .send(photo, Attachment.E.Stop())
  .checkpoint("stopped");
