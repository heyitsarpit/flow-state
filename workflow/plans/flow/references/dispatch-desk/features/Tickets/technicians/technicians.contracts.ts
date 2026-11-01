// The technician panel's contracts. Every contract states `input`, `output` and `key` (rule 39).
//
// How this differs from the desk's other feeds (COVERAGE.md 5.1, "QU techs"): KEYED state feeds over polling. One
// session per shown technician (`subscribe.each`, T6), each a loop of GETs that `Feed.reconnect` restarts after a
// failed one (recipe P, M6 4.7). A state feed, not facts: only the latest pulse matters, and the row's `last.at`
// says how old it is (T5). Compare the roster's polled feed, which carries facts from a cursor.
import { Duration, Schedule, Schema, Stream } from "effect";
import { Feed, resource, stream, transaction } from "flow-state"; // pending merge 6: Feed, stream
import { unknownWhenLost } from "../../shared/outcomes.js";
import { TicketRow } from "../types.js";
import { Breaks, Pulse, TechniciansApi } from "./technicians-api.js";

const technician = { workspaceId: Schema.String, technicianId: Schema.String };

// One technician's pulse, every ten seconds. Each GET's answer is the current value; a failed GET fails the
// connection, which `Feed.reconnect` turns into `Feed.down` (the row dims, T4) and reconnects after its schedule. Its
// budget returns once a connection has been live for `resetAfter` (S5 Q12). No proof: a poll registers nothing, so
// each first answer after a drop is the value that confirms the row again (M6 2.3, state).
export const technicianPulse = stream({
  // pending merge 6
  id: "DispatchDesk/technician-pulse",
  input: technician,
  output: Pulse,
  key: ["workspaceId", "technicianId"],
  delivers: "state",
  subscribe: (key) =>
    Feed.reconnect(
      () =>
        Stream.fromEffect(TechniciansApi.use((api) => api.pulse(key))).pipe(
          Stream.repeat(Schedule.spaced(Duration.seconds(10))),
          Stream.prepend([Feed.live()]), // pending merge 6: a poll has no registration; live from the start
        ),
      {
        while: (error) => error._tag === "PollFailed",
        schedule: Schedule.exponential("2 seconds").pipe(Schedule.upTo({ times: 6 })),
        resetAfter: "1 minute",
      },
    ),
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
