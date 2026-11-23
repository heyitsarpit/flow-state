import { Story } from "../../../src/host/testing/index.ts";
import {
  Attachment,
  attachmentSetup,
  photo,
  Uploads,
  UploadsFake,
} from "../machines/attachment.ts";

const attachmentStory = (id: string) =>
  Story.app(attachmentSetup, { id, fixtures: [UploadsFake] }).ensure(photo);

/**
 * A photo uploaded in four chunks: after the first, its row shows a quarter sent.
 */
export const uploadProgress = attachmentStory("chat/upload-progress")
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
  .world(Uploads.chunk.hold(), Uploads.chunk.hold())
  .send(photo, Attachment.E.Upload({ chunks: 4 }))
  .world(Uploads.chunk.release())
  .send(photo, Attachment.E.Stop())
  .checkpoint("stopped");
