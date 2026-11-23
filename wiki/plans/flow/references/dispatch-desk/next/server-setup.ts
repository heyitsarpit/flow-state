import "server-only";
import { runtimeSetup } from "flow-state";
import { DeskApp } from "../app/app.js";
import { HttpDeskApi } from "./http-api.js";

// design gap: the app's service requirement includes the socket, presence and assistant ports, so the type
// asks for the whole Layer. The server runtime never ensures a feed, a watcher or an assistant (the page
// ensures Session and the queue only), so no connection is opened here; sessions are released at capture.
// Each request owns its authenticated services. No server storage or persistence configuration.
// The scope matches the browser setup's, so this request's payloads hydrate only for this user.
export const deskServerSetup = (user: { id: string; token: string }) =>
  runtimeSetup({ app: DeskApp, scope: user.id, services: HttpDeskApi(user.token) });
