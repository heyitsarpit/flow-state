import "server-only";
import { runtimeSetup } from "flow-state";
import { DeskApp } from "../app/app.js";
import { HttpTicketApi } from "./http-api.js";

// Each request owns its authenticated services. No server storage or persistence configuration.
// The scope matches the browser setup's, so this request's payloads hydrate only for this user.
export const deskServerSetup = (user: { id: string; token: string }) =>
  runtimeSetup({ app: DeskApp, scope: user.id, services: HttpTicketApi(user.token) });
