// "Also viewing: Dana (typing…)". The state row of: `value` is what the current attach confirmed, `last` the
// previous one, dimmed with the drop's reason while the SDK reconnects. Badges are the `ViewerBadge` copies: a new
// arrival flashes.
import { useActorByRef, useNow, useView } from "flow-state/react";
import type { TicketKey } from "../Tickets/types.js";
import { TYPING_SHOWN_MS } from "./presence.definition.js";
import { presenceRef } from "./presence.ref.js";

export function Viewers({ ticket, me }: { ticket: TicketKey; me: string }) {
  const watcher = useActorByRef(presenceRef(ticket), { input: ticket });
  const row = useView(watcher, (s) => s.operations.viewers);
  const badges = useView(watcher, (s) => s.memory.badges);
  const typing = useView(watcher, (s) => s.memory.typing);
  const now = useNow("1 second");
  const members = row?.value ?? row?.last?.value ?? {};

  return (
    <p aria-live="polite" style={{ opacity: row?.connection === "Live" ? 1 : 0.5 }}>
      {badges
        .filter((badge) => badge.key !== me)
        .map((badge) => (
          <span key={badge.key} className={badge.fresh ? "flash" : undefined}>
            {members[badge.key]?.name ?? badge.key}
            {now - (typing[badge.key] ?? 0) < TYPING_SHOWN_MS && " (typing…)"}
          </span>
        ))}
      {row?.connection === "Connecting" && row.drop !== undefined && <span> (reconnecting)</span>}
    </p>
  );
}
