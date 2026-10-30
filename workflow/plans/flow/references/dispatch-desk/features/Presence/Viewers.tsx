// "Also viewing: dispatcher-2". Demonstrates the state row of M6 2.6: `value` is what the current
// connection confirmed, `last.value` the previous one, so a drop dims the list instead of emptying it.
// Used by the ticket panel and the queue row; both read the same watcher (presence.ref.ts).
// Pending merge 6: written against merge-6-streams/proposal-v2.md revision 7.1, S1–S10.
import { useActorByRef, useView } from "flow-state/react";
import { SessionRef } from "../Session/session.ref.js";
import type { TicketKey } from "../Tickets/types.js";
import { presenceRef } from "./presence.ref.js";

export function Viewers({ ticket }: { ticket: TicketKey }) {
  const watcher = useActorByRef(presenceRef(ticket), { input: ticket });
  const session = useActorByRef(SessionRef, {});
  const me = useView(session, (s) => s.memory.userId);
  const row = useView(watcher, (s) => s.operations.viewers);

  // `value` while live; `last.value` while reconnecting; nothing before the first state.
  const members = row?.value ?? row?.last?.value ?? {};
  const others = Object.values(members).filter((member) => member.id !== me);

  if (others.length === 0) return null;

  return (
    <p aria-live="polite" style={{ opacity: row?.value ? 1 : 0.5 }}>
      Also viewing: {others.map((member) => member.name).join(", ")}
      {row?.value ? null : <span> (reconnecting)</span>}
    </p>
  );
}
