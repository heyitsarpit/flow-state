// "This code expires in 4:52": the bank challenge's visible timer. A pure trait (F1): one schedule, no write, no
// read. Armed when the bank's frame is shown, not on entry (`armOn`, S3), because the bank may take seconds to load
// and the customer's five minutes start when they can see the code. The view reads the deadline from
// `s.schedules` and draws the seconds with `useNow` (S4); nothing ticks in memory.
//
// It sits inside the challenge, so the pay screen cannot see it (rule 10, F18). Placed `.resumable()` on the
// challenge's OPEN node: while the customer reads the help overlay it is frozen, its `dueAt` KEPT (F12). The bank
// does not pause for help, and neither does this timer: an overdue deadline fires once on return (rule 1).
import { type Duration } from "effect";
import { Flow, trait } from "flow-state";

export const Countdown = (p: { length: Duration.Input }) =>
  trait(
    {
      id: "Countdown",
      hostEvents: { Shown: {} },
      internalEvents: { Expired: {} },
      callbacks: { onExpired: Flow.Callback({}) },
    },
    ({ E, callbacks }) => ({
      schedules: { expire: { schedule: p.length, send: E.Expired, armOn: [E.Shown] } },
      on: { Expired: { target: "self", notify: [callbacks.onExpired] } },
    }),
  );
