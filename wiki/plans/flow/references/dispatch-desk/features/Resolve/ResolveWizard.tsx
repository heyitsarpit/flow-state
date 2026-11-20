// The visit screen with the wizard over it. The step bar reads the host's `step` (fed by the wizard's
// `onProgressed`) and raises its jumps through the host; the wizard's own memory is at its state's name
// (`s.memory.RESOLVING`), the nested dialog's at its path. The signature's upload is the trait's bare write: its row
// gives the progress bar, and nothing else.
import { check } from "flow-state";
import { useActorByRef, useView } from "flow-state/react";
import type { TicketKey } from "../Tickets/types.js";
import { Signature } from "./signature.trait.js";
import { Visit } from "./visit.definition.js";
import { visitRef } from "./visit.ref.js";

const { S, E } = Visit;

export function VisitScreen({ ticket, assignee }: { ticket: TicketKey; assignee: string }) {
  const visit = useActorByRef(visitRef(ticket), { input: { ...ticket, assignee } });
  const resolving = useView(visit, (s) => S.RESOLVING.is(s));
  const step = useView(visit, (s) => s.memory.step);
  const asking = useView(visit, (s) => S.RESOLVING.DISCARD.is(s));
  const wizard = useView(visit, (s) => s.memory.RESOLVING);
  const upload = useView(visit, (s) =>
    wizard?.signatureRef ? Signature.O.upload.get(s, { ref: wizard.signatureRef }) : undefined,
  );
  const canSubmit = useView(visit, (s) => check(s, E.RESOLVING.Submit()));
  const notice = useView(visit, (s) => s.memory.notice);

  if (!resolving)
    return <button onClick={() => visit.send(E.StartResolve())}>Resolve on site</button>;

  return (
    <section aria-label="Resolve">
      <nav aria-label="Steps">
        {(["reason", "parts", "signoff"] as const).map((name) => (
          <button
            key={name}
            aria-current={step === name}
            onClick={() => visit.send(E.StepChosen({ step: name }))}
          >
            {name}
          </button>
        ))}
      </nav>
      {notice !== "" && <p role="status">{notice}</p>}
      {upload?.pending && upload.progress && (
        <progress value={upload.progress.sent} max={upload.progress.total}>
          Uploading the signature
        </progress>
      )}
      <button
        disabled={canSubmit._tag !== "Allowed"}
        title={canSubmit._tag === "Denied" ? canSubmit.reasons[0]?.code : undefined}
        onClick={() => visit.send(E.RESOLVING.Submit())}
      >
        Resolve
      </button>
      <button onClick={() => visit.send(E.RESOLVING.Cancel())}>Cancel</button>
      {asking && (
        <dialog open aria-label="Discard this resolution?">
          <button onClick={() => visit.send(E.RESOLVING.DISCARD.Keep())}>Keep</button>
          <button onClick={() => visit.send(E.RESOLVING.DISCARD.Discard())}>Discard</button>
        </dialog>
      )}
    </section>
  );
}
