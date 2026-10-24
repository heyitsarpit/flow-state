// The app host supplies an existing ready Runtime with EditorRef already admitted.
import { FlowProvider } from "flow-state/react";
import { TicketPanel } from "../features/Tickets/editor/TicketPanel.js";
import { EditorRef } from "./actors.js";
import type { DeskSetup } from "./setup.js";

export function renderDesk(runtime: ReturnType<typeof DeskSetup.construct>) {
  return (
    <FlowProvider runtime={runtime}>
      <TicketPanel editorRef={EditorRef} />
    </FlowProvider>
  );
}
