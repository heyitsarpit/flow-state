// The complete executable configuration, independent of testing and Story registration. The Stories import
// `DeskSetup` and replace its client half with the Desk fake (`DeskClient`), so nothing here is Story-aware.
import { runtimeSetup } from "flow-state";
import { DeskApp } from "./app.js";
import { DemoDeskApi } from "./demo-api.js";

// Services are one Effect Layer (Runtime.plan O2). `DemoDeskApi` provides every port: tickets, comments,
// attachments, the socket, presence and the assistant, each over the one in-memory server, plus
// `PendingFiles` as tab memory (`PendingFilesLive`: an empty Map per Layer build, which is what a reload does).
// A production setup swaps in `HttpDeskApi` (next/http-api.ts), which provides the same set.
export const DeskSetup = runtimeSetup({ app: DeskApp, services: DemoDeskApi });
