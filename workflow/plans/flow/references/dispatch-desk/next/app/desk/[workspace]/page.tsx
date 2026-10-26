import { Suspense } from "react";
import { Hydrate } from "flow-state/react";
import { dehydrate } from "flow-state/server";
import { SessionRef } from "../../../../features/Session/session.ref.js";
import { queueRef } from "../../../../features/Tickets/queue/queue.ref.js";
import { currentUser } from "../../../auth.js";
import { deskServerSetup } from "../../../server-setup.js";
import { QueueClient } from "./queue-client.js";

export default async function DeskPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  return (
    <Suspense fallback={<p>Loading queue…</p>}>
      <QueueSegment workspaceId={workspace} />
    </Suspense>
  );
}

async function QueueSegment({ workspaceId }: { workspaceId: string }) {
  const user = await currentUser();
  const payload = await dehydrate(
    deskServerSetup(user.token),
    (runtime) => {
      runtime.ensureActor(SessionRef, { input: { userId: user.id } });
      runtime.ensureActor(queueRef(workspaceId), { input: { workspaceId } });
    },
    { scope: `dispatch-desk:${user.id}`, within: "1500 millis" },
  );
  // Suspense streams this async server segment; Flow hooks themselves never suspend.
  return (
    <Hydrate payload={payload}>
      <QueueClient workspaceId={workspaceId} userId={user.id} />
    </Hydrate>
  );
}
