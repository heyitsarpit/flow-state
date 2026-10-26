import "server-only";
import { runtimeSetup } from "flow-state";
import { DeskApp } from "../app/app.js";
import { HttpTicketApi } from "./http-api.js";

// Each request owns its authenticated services. No server storage or persistence configuration.
export const deskServerSetup = (token: string) =>
  runtimeSetup({ app: DeskApp, services: HttpTicketApi(token) });
