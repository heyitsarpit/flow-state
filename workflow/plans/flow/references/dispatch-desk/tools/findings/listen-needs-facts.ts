// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: error ListenNeedsFacts  findings-listen.pulses: `listen` over `DispatchDesk/technician-pulse`, which `delivers: "state"` (M6 2.8). pending merge 6
import { domain, listen } from "flow-state";
import { Technician } from "../../features/Roster/roster.domain.js";
import { technicianPulse } from "../../features/Tickets/technicians/technicians.contracts.js";

// pending merge 6. WRONG: a state feed carries "the value now", not changes; the store cannot apply it as facts.
// (The technician panel places this feed bare for exactly that reason.)
export const WrongListen = domain("findings-listen", {
  pulses: listen(technicianPulse).as([Technician], (pulse) =>
    Technician.patch(
      { workspaceId: "north", technicianId: "tech-ana" },
      { status: pulse.online ? "free" : "off" },
    ),
  ),
});

export const expected = {
  code: "ListenNeedsFacts",
  level: "error",
  at: "findings-listen.pulses",
} as const;
