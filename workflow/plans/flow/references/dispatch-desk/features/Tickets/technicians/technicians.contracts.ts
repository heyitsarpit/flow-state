// The technician panel's contracts. Every contract states `input`, `output` and `key` (rule 39).
//
// How this differs from the desk's other feeds (COVERAGE.md 5.1, "QU techs"): KEYED `latest` feeds over polling. One
// session per shown technician (`subscribe.each`, T6), each a loop of GETs that Flow reconnects after a failed one
// (`reconnect`, MD 2.11.3). Only the latest pulse matters, and the row's `last.at` says how old it is (T5). Compare the roster's polled feed, which carries facts from a cursor.
import { Duration, Effect, Schema, Stream } from "effect";
import { Feed, resource, stream, transaction } from "flow-state";
import { unknownWhenLost } from "../../shared/outcomes.js";
import { TicketRow } from "../types.js";
import { Breaks, Pulse, TechniciansApi } from "./technicians-api.js";

const technician = { workspaceId: Schema.String, technicianId: Schema.String };

// One technician's pulse, every ten seconds. Each GET's answer is the current value, and the first answer is the
// registration (MD 2.11.12.8, "Polling"): `Feed.live()` comes after it, never before. A poll that claimed Live before its
// first GET would register and die on every offline retry, which counts as a flap and ends the session `Flapping`
// after 8 (MD 2.11.10); this way an offline device stays `Connecting`, trying every 30 s. A failed GET fails the
// connection and the row reads `Connecting` with a `drop` (the card dims); `idleTime` catches a hung GET.
export const technicianPulse = stream({
  id: "DispatchDesk/technician-pulse",
  input: technician,
  output: Pulse,
  key: ["workspaceId", "technicianId"],
  delivers: "latest",
  subscribe: (key) => {
    const get = TechniciansApi.use((api) => api.pulse(key));

    return Stream.fromEffect(get).pipe(
      Stream.flatMap((first) => Stream.make(Feed.live(), first)),
      Stream.concat(
        Stream.fromEffect(get.pipe(Effect.delay(Duration.seconds(10)))).pipe(Stream.forever),
      ),
    );
  },
  reconnect: { while: (error) => error._tag === "PollFailed" },
  idleTime: "30 seconds",
});

// Who is on a break: a plain resource (no domain), the target of the break toggle's `optimistic` look.
export const breaksOf = resource({
  id: "DispatchDesk/breaks",
  input: { workspaceId: Schema.String },
  output: Breaks,
  key: ["workspaceId"],
  lookup: (input) => TechniciansApi.use((api) => api.breaks(input)),
  staleTime: "1 minute",
  gcTime: "5 minutes",
});

// A plain write with `optimistic` (rule 36): the switch flips at once, a failure takes the look back. `latest`: a
// quick on, off, on sends at most two requests.
export const setBreak = transaction({
  id: "DispatchDesk/set-break",
  input: { ...technician, onBreak: Schema.Boolean },
  output: Breaks,
  key: ["workspaceId", "technicianId"],
  concurrency: "latest",
  commit: (input, { attempt, signal }) =>
    TechniciansApi.use((api) => api.setBreak(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

// A nudge: a push to the technician's phone. `allow`: several at once, each answered in its own turn and toasted on
// its own, nothing held (O9).
export const nudgeTechnician = transaction({
  id: "DispatchDesk/nudge-technician",
  input: { ...technician, from: Schema.String, text: Schema.String },
  key: ["workspaceId", "technicianId"],
  concurrency: "allow",
  commit: (input, { attempt, signal }) =>
    TechniciansApi.use((api) => api.nudge(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

// Dispatch: give a ticket to a technician. One per ticket at a time.
export const dispatchTicket = transaction({
  id: "DispatchDesk/dispatch-ticket",
  input: { workspaceId: Schema.String, ticketId: Schema.String, technicianId: Schema.String },
  output: TicketRow,
  key: ["workspaceId", "ticketId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    TechniciansApi.use((api) => api.dispatch(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});
