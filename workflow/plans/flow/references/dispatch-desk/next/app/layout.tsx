import type { ReactNode } from "react";
import { Hydrate } from "flow-state/react";
import { dehydrate } from "flow-state/server";
import { SessionRef } from "../../features/Session/session.ref.js";
import { currentUser } from "../auth.js";
import { DeskProviders } from "../providers.js";
import { deskServerSetup } from "../server-setup.js";

export default async function Layout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  const payload = await dehydrate(
    deskServerSetup(user.token),
    (runtime) => runtime.ensureActor(SessionRef, { input: { userId: user.id } }),
    { scope: `dispatch-desk:${user.id}`, within: "300 millis" },
  );
  return (
    <html lang="en">
      <body>
        <DeskProviders key={user.id} userId={user.id}>
          <Hydrate payload={payload}>{children}</Hydrate>
        </DeskProviders>
      </body>
    </html>
  );
}
