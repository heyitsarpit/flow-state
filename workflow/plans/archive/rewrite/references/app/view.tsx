// The app host supplies an existing ready Runtime with SessionRef, QueueRef and EditorRef admitted.
import { useState } from "react";
import { FlowProvider } from "flow-state/react";
import { OpenTicket, PinnedTicket } from "../features/Tickets/editor/TicketPanel.js";
import { QueueList } from "../features/Tickets/queue/QueueList.js";
import type { Ticket } from "../features/Tickets/types.js";
import { EditorRef, QueueRef, SessionRef } from "./actors.js";
import type { DeskSetup } from "./setup.js";

export function renderDesk(runtime: ReturnType<typeof DeskSetup.construct>) {
  return (
    <FlowProvider runtime={runtime}>
      <Desk />
    </FlowProvider>
  );
}

function Desk() {
  const [opened, setOpened] = useState<Ticket | null>(null);

  return (
    <main className="desk">
      <QueueList queueRef={QueueRef} onOpen={setOpened} />
      {opened ? (
        // A new key per ticket gives each opened ticket its own fresh editor actor.
        <OpenTicket key={opened.ticketId} ticket={opened} sessionRef={SessionRef} />
      ) : (
        <PinnedTicket editorRef={EditorRef} />
      )}
    </main>
  );
}
