"use client";
import { Desk } from "../../../../app/view.js";

// Functions such as onOpen stay in the client chunk rather than crossing the RSC boundary.
export function QueueClient({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  return <Desk workspaceId={workspaceId} userId={userId} />;
}
