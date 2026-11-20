// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: error ListenNeedsEvery  findings-listen.pulses: `listen` over `DispatchDesk/technician-pulse`, which `delivers: "state"`.
import { domain, listen } from "flow-state";
import { Technician } from "../../features/Roster/roster.domain.js";
import { technicianPulse } from "../../features/Tickets/technicians/technicians.contracts.js";

// WRONG: a state feed carries "the value now", not changes; the store cannot apply it as facts.
// (The technician panel places this feed bare for exactly that reason.)
export const WrongListen = domain("findings-listen", {
  // @ts-expect-error `listen` takes an `every` stream: this finding is a type error first (MD 2.11.6).
  pulses: listen(technicianPulse).as([Technician], (pulse) =>
    Technician.patch(
      { workspaceId: "north", technicianId: "tech-ana" },
      { status: pulse.online ? "free" : "off" },
    ),
  ),
});

export const expected = {
  code: "ListenNeedsEvery",
  level: "error",
  at: "findings-listen.pulses",
} as const;
