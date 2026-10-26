// Replaceable application capability; adapters return Effects with exact success/failure channels.
import { Context, Effect, Stream } from "effect";
import type {
  QueueUnavailable,
  SaveTitleInput,
  TechnicianUpdate,
  Ticket,
  TicketListInput,
  TicketLocked,
  TicketNotFound,
  TicketPage,
  TicketRef,
  TitleRejected,
} from "./types.js";

export class TicketApi extends Context.Service<
  TicketApi,
  {
    load: (input: TicketRef, signal: AbortSignal) => Effect.Effect<Ticket, TicketNotFound>;
    list: (
      input: TicketListInput,
      signal: AbortSignal,
    ) => Effect.Effect<TicketPage, QueueUnavailable>;
    saveTitle: (
      input: SaveTitleInput,
      signal: AbortSignal,
    ) => Effect.Effect<Ticket, TicketNotFound | TicketLocked | TitleRejected>;
    technicianUpdates: (input: TicketRef) => Stream.Stream<TechnicianUpdate>;
  }
>()("DispatchDesk/TicketApi") {}
