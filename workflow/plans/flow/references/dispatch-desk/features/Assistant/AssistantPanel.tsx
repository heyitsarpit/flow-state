// "Suggest a reply" with Stop. The text is the row's `progress` while a reply streams and the machine's
// `last` otherwise, so tokens cost no turn (M6 4.4). "Use as comment" sends the text into the editor's
// comments composer. Pending merge 6: written against merge-6-streams/proposal-v2.md revision 7.
import { check } from "flow-state";
import { useActorByRef, useView } from "flow-state/react";
import { Editor } from "../Tickets/editor/editor.definition.js";
import { editorRef } from "../Tickets/editor/editor.ref.js";
import type { TicketKey } from "../Tickets/types.js";
import { Assistant } from "./assistant.definition.js";
import { assistantRef } from "./assistant.ref.js";

const PROMPT = "Suggest a reply to the customer."; // the demo has one canned question

export function AssistantPanel({ ticket }: { ticket: TicketKey }) {
  const assistant = useActorByRef(assistantRef(ticket), { input: ticket });
  const editor = useActorByRef(editorRef(ticket), { input: ticket });

  // The contract is keyed by workspace and ticket, so the view reads its lane with `get` (MD 2.7.15).
  const text = useView(
    assistant,
    (s) => Assistant.O.suggest.get(s, ticket).progress?.text ?? s.memory.last, // pending merge 6: `progress`
  );
  const asking = useView(assistant, (s) => Assistant.O.suggest.get(s, ticket).pending); // the lane, not a state name
  const incomplete = useView(assistant, (s) => s.memory.incomplete);
  const refused = useView(assistant, (s) => s.memory.refused);
  const ask = useView(assistant, (s) => check(s, Assistant.E.Ask({ prompt: PROMPT })));

  return (
    <section aria-label="Assistant">
      <button
        disabled={ask._tag !== "Allowed"}
        onClick={() => assistant.send(Assistant.E.Ask({ prompt: PROMPT }))}
      >
        Suggest a reply
      </button>
      {asking ? <button onClick={() => assistant.send(Assistant.E.Stop())}>Stop</button> : null}
      {refused ? <p role="alert">The assistant cannot answer for this ticket.</p> : null}
      {text !== "" ? (
        <>
          <p aria-live="polite">{text}</p>
          {incomplete && !asking ? <p>Stopped before the end. This reply is incomplete.</p> : null}
          {asking ? null : (
            <button
              onClick={() =>
                // The fragment's public event, sent to the editor's ref (rule 2; MD 2.10.18.4 sends
                // `IssuePage.E.like.Toggle` the same way).
                editor.send(Editor.E.comments.Post({ clientId: crypto.randomUUID(), text }))
              }
            >
              Use as comment
            </button>
          )}
        </>
      ) : null}
    </section>
  );
}
