// The complete executable configuration, independent of testing and Story registration. The Stories import
// `DeskSetup` and replace its client half with the Desk fake (`DeskClient`), so nothing here is Story-aware.
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { runtimeSetup } from "flow-state";
import { RosterHttp } from "../features/Roster/roster-api.js";
import { DeskApp } from "./app.js";
import { DemoDeskApi } from "./demo-api.js";

// Services are one Effect Layer (Runtime.plan O2). `DemoDeskApi` provides every port: tickets, comments,
// attachments, the socket, presence and the assistant, each over the one in-memory server, plus
// `PendingFiles` as tab memory (`PendingFilesLive`: an empty Map per Layer build, which is what a reload does).
// A production setup swaps in `HttpDeskApi` (next/http-api.ts), which provides the same set.
// The roster port is the one adapter written on Effect's `HttpClient` (roster-api.ts). The in-memory demo serves no
// roster, so here it points at a local server; Stories replace its transport with `Fake.fetch` (Y6).
export const DeskSetup = runtimeSetup({
  app: DeskApp,
  services: Layer.mergeAll(
    DemoDeskApi,
    RosterHttp("http://localhost:3000").pipe(Layer.provide(FetchHttpClient.layer)),
  ),
});
