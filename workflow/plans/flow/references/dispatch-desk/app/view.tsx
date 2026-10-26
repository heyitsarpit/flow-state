"use client";
// A principal change supplies a new Runtime and remounts the provider.
import { useState } from "react";
import { FlowProvider, useActorByRef, useView } from "flow-state/react";
import { Session } from "../features/Session/session.definition.js";
import { SessionRef } from "../features/Session/session.ref.js";
import { QueueList } from "../features/Tickets/queue/QueueList.js";
import type { TicketPanel } from "../features/Tickets/editor/TicketPanel.js";
import type { TicketKey } from "../features/Tickets/types.js";
import { ToastStack } from "../features/Toasts/ToastStack.js";
import type { DeskSetup } from "./setup.js";

type PanelComponent = typeof TicketPanel;

export function renderDesk(runtime: ReturnType<typeof DeskSetup.construct>, userId: string) {
  return (
    <FlowProvider key={userId} runtime={runtime}>
      <Desk userId={userId} />
    </FlowProvider>
  );
}

export function Desk({ userId, workspaceId = "north" }: { userId: string; workspaceId?: string }) {
  const session = useActorByRef(SessionRef, { input: { userId } });
  const signedOut = useView(session, (snapshot) => Session.S.SIGNED_OUT.is(snapshot));
  const [opened, setOpened] = useState<TicketKey | null>(null);
  const [Panel, setPanel] = useState<PanelComponent | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const open = (ticket: TicketKey) => {
    setOpened(ticket);
    setLoadFailed(false);
    if (!Panel) {
      void import("../features/Tickets/editor/TicketPanel.js").then(
        (module) => setPanel(() => module.TicketPanel),
        () => setLoadFailed(true),
      );
    }
  };

  if (signedOut) return <p>Signed out.</p>;

  let panel = null;
  if (opened) {
    if (Panel)
      panel = <Panel key={JSON.stringify([opened.workspaceId, opened.ticketId])} ticket={opened} />;
    else if (loadFailed) panel = <button onClick={() => open(opened)}>Retry opening ticket</button>;
    else panel = <p role="status">Opening…</p>;
  }

  return (
    <main className="desk">
      <QueueList workspaceId={workspaceId} onOpen={open} />
      {panel}
      <ToastStack />
    </main>
  );
}
