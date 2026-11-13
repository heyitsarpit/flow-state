// What the attachment contracts mean for shared records. A stored file is a record of its own, so the editor's file
// list and anything else that shows the ticket's files agree. An upload that lands creates one (no temporary id:
// the copy in the editor's memory shows its progress until the list holds it, rule 33); a remove hides it at once,
// and a 403 brings it back in place (E3).
import { and, asc, domain, entity, eq, read, write } from "flow-state";
import { StoredAttachment } from "./attachments-api.js";
import { attachmentsOn, putAttachment, removeAttachment } from "./attachments.contracts.js";

export const Attachment = entity({
  id: "DispatchDesk/Attachment",
  fields: StoredAttachment.fields,
  primaryKey: ["ref"],
  version: "revision",
});

export const AttachmentsDomain = domain("attachments", {
  files: read(attachmentsOn)
    .list(Attachment, ({ output }) => output)
    .where(({ input, record }) =>
      and(eq(record.workspaceId, input.workspaceId), eq(record.ticketId, input.ticketId)),
    )
    .unordered(), // the view sorts by name; nothing relies on the server's order

  // The upload trait's write (a fragment's domain write registers the domain for its actor, rule 49).
  put: write(putAttachment).one(Attachment),

  remove: write(removeAttachment).predicts(({ input }) => Attachment.delete({ ref: input.ref })),
});
