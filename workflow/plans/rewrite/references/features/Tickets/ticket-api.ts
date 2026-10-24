// Replaceable application capability; adapters return Effects with exact success/failure channels.
import { Context, Effect } from "effect";
import type { Ticket, TicketInput, SaveTitleInput, TicketError } from "./types.js";

export class TicketApi extends Context.Service<
  TicketApi,
  {
    load: (input: TicketInput, signal: AbortSignal) => Effect.Effect<Ticket, TicketError>;
    saveTitle: (input: SaveTitleInput, signal: AbortSignal) => Effect.Effect<Ticket, TicketError>;
  }
>()("DispatchDesk/TicketApi") {}
