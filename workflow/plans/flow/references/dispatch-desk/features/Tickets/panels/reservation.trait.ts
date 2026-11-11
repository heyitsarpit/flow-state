// A parts hold on the van: fifteen minutes, then the parts go back on the shelf. A pure trait (F1), with one timer
// armed by an event. It sits inside the resumable Parts panel (nested: the panels machine cannot see it, rule 10),
// so when the dispatcher switches tab it is frozen with the panel and its `dueAt` is KEPT: time keeps running,
// nothing is delivered while frozen, and on return an overdue hold fires once (rule 1).
import { type Duration } from "effect";
import { Flow, trait } from "flow-state";

export const Reservation = (p: { length: Duration.Input }) =>
  trait(
    {
      id: "Reservation",
      hostEvents: { Start: {}, Stop: {} },
      internalEvents: { Expired: {} },
      callbacks: { onExpired: Flow.Callback({}) },
    },
    ({ E, callbacks }) => ({
      // No memory: "held" is the armed schedule, `s.schedules.parts.reservation.expire.dueAt`.
      schedules: {
        expire: { schedule: p.length, send: E.Expired, armOn: [E.Start], disarmOn: [E.Stop] },
      },
      on: { Expired: { target: "self", notify: [callbacks.onExpired] } },
    }),
  );
