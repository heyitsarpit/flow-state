// The complete executable configuration, independent of testing and Story registration. The Stories import
// `DeskSetup` and replace its client half with the Desk fake (`DeskClient`), so nothing here is Story-aware.
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { runtimeSetup } from "flow-state";
import { RosterHttp } from "../features/Roster/roster-api.js";
import { DetailsHttp } from "../features/Tickets/editor/details-api.js";
import { TechniciansHttp } from "../features/Tickets/technicians/technicians-api.js";
import { DeskApp } from "./app.js";
import { DemoDeskApi } from "./demo-api.js";

// Services are one Effect Layer (Runtime.plan O2). `DemoDeskApi` provides every port: tickets, comments,
// attachments, the socket, presence and the assistant, each over the one in-memory server, plus
// `PendingFiles` as tab memory (`PendingFilesLive`: an empty Map per Layer build, which is what a reload does).
// A production setup swaps in `HttpDeskApi` (next/http-api.ts), which provides the same set.
// The roster and ticket-details ports are written on Effect's `HttpClient` (roster-api.ts, details-api.ts). The
// in-memory demo serves neither, so here they point at a local server; Stories replace only their transport with
// `Fake.fetch` (Y6).
export const DeskSetup = runtimeSetup({
  app: DeskApp,
  services: Layer.mergeAll(
    DemoDeskApi,
    Layer.mergeAll(
      RosterHttp("http://localhost:3000"),
      DetailsHttp("http://localhost:3000"),
      TechniciansHttp("http://localhost:3000"),
    ).pipe(Layer.provide(FetchHttpClient.layer)),
  ),
});
