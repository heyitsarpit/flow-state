import { Layer } from "effect";
import { runtimeSetup } from "flow-state";
import { layerIndexedDb } from "flow-state/persistence";
import { DeskApp } from "../app/app.js";
import { FetchHttpClient } from "effect/http";
import { RosterHttp } from "../features/Roster/roster-api.js";
import { DetailsHttp } from "../features/Tickets/editor/details-api.js";
import { TechniciansHttp } from "../features/Tickets/technicians/technicians-api.js";
import { CollabLive } from "./collab.js";
import { HttpDeskApi } from "./http-api.js";

// HttpDeskApi provides the hand-written `fetch` ports (tickets, comments, attachments, socket, assistant) and
// `PendingFiles` as tab memory; the roster, details and technician ports are on Effect's `HttpClient`; presence is
// the collaboration SDK's client. The Next host uses its same-origin cookie-authenticated HTTP API.
export const deskBrowserSetup = (userId: string) =>
  runtimeSetup({
    app: DeskApp,
    scope: userId, // whose data this Runtime holds; persistence partitions by it
    services: Layer.mergeAll(
      HttpDeskApi(undefined, origin()),
      Layer.mergeAll(RosterHttp(origin()), DetailsHttp(origin()), TechniciansHttp(origin())).pipe(
        Layer.provide(FetchHttpClient.layer),
      ),
      CollabLive(() => fetch("/api/collab-token").then((r) => r.text())),
      layerIndexedDb({ database: "dispatch-desk" }),
    ),
    persistence: { version: "1" },
  });

// oxlint-disable-next-line anti-slop/no-runtime-typeof -- Host availability check, not data validation; construction also runs during SSR.
const origin = () =>
  typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
