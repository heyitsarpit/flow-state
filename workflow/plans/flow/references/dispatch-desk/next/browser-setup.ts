import { Layer } from "effect";
import { runtimeSetup } from "flow-state";
import { layerIndexedDb } from "flow-state/persistence";
import { DeskApp } from "../app/app.js";
import { HttpTicketApi } from "./http-api.js";

// The Next host uses its same-origin cookie-authenticated HTTP API, not the demo server.
export const deskBrowserSetup = (userId: string) =>
  runtimeSetup({
    app: DeskApp,
    scope: userId, // whose data this Runtime holds; persistence partitions by it
    services: Layer.mergeAll(
      HttpTicketApi(
        undefined,
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Host availability check, not data validation; construction also runs during SSR.
        typeof window === "undefined" ? "http://localhost:3000" : window.location.origin,
      ),
      layerIndexedDb({ database: "dispatch-desk" }),
    ),
    persistence: { version: "1" },
  });
