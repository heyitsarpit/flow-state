// The customer's signature, placed only on the wizard's SIGNOFF step with `Flow.state(…, { traits })` (F3): a
// writing trait (F2) that uploads the image as soon as it is drawn, so the upload is usually done before "Resolve".
//
// It owns a BARE write. Rule 48 allows a fragment a write that maps anything only when no subroutine is on its path,
// and this trait lives inside the wizard, a subroutine. So the upload maps nothing: its endings are evidence (rule
// 40), it never holds, and its row still shows `pending` and `progress` (O17). The wizard therefore cannot hear
// "uploaded"; the server decides at resolve time, and a resolution whose signature never arrived is refused
// (`SignatureMissing`), which asks the customer to sign again. That ending can arrive after the wizard was left
// (F11): it is the host's resolve that hears it, as late, at the root.
// design gap: rule 48 leaves a step inside a subroutine no way to own a write it can hear. If the owner wants
// "uploading…, uploaded, failed" on the SIGNOFF step, rule 48's scope needs a case for writes that release on leave.
import { Schema } from "effect";
import { deny, Flow, trait } from "flow-state";
import { uploadSignature } from "./resolve.contracts.js";

export const Signature = trait(
  {
    id: "Signature",
    events: { Signed: { ref: Schema.String } }, // the view kept the image in `PendingSignatures` under `ref`
    callbacks: { onSigned: Flow.Callback({ ref: Schema.String }) },
    memory: { ref: Flow.initial(Schema.NullOr(Schema.String), null) },
    operations: () => ({ upload: uploadSignature }), // bare (rule 48): progress in the row, endings as evidence
  },
  ({ O, callbacks }) => ({
    on: {
      Signed: {
        target: "self",
        guard: [({ memory, event }) => memory.ref !== event.ref || deny("AlreadySigned")],
        updateMemory: ({ event }) => ({ ref: event.ref }),
        actions: [O.upload.commit(({ event }) => ({ ref: event.ref }))],
        notify: [callbacks.onSigned.from(({ event }) => ({ ref: event.ref }))],
      },
    },
  }),
);
