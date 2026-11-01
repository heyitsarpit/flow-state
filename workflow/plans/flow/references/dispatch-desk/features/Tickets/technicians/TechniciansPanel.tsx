// Who is free. Three columns by the Technician record's status, so a dispatch's prediction moves a card at once;
// each card's pulse row says how fresh it is: live, live but quiet ("seen 2 min ago", from the phone's own time),
// or dimmed with the drop's reason while the poller reconnects. Pending merge 6 for the pulse rows.
import { useActorByRef, useNow, useView } from "flow-state/react";
import { Technician } from "../../Roster/roster.domain.js";
import { STALE_AFTER_MS, Technicians } from "./technicians.definition.js";
import { techniciansRef } from "./technicians.ref.js";

const { E, O } = Technicians;

export function TechniciansPanel({ workspaceId }: { workspaceId: string }) {
  const panel = useActorByRef(techniciansRef(workspaceId), { input: { workspaceId } });
  const cards = useView(panel, (s) => s.memory.cards);

  return (
    <aside aria-label="Technicians">
      {(["free", "busy", "break"] as const).map((column) => (
        <section key={column} aria-label={column}>
          <h4>{column}</h4>
          {cards.map((card) => (
            <TechCardView
              key={card.key}
              panel={panel}
              workspaceId={workspaceId}
              technicianId={card.key}
              column={column}
            />
          ))}
        </section>
      ))}
    </aside>
  );
}

function TechCardView({
  panel,
  workspaceId,
  technicianId,
  column,
}: {
  panel: ReturnType<typeof useActorByRef>;
  workspaceId: string;
  technicianId: string;
  column: string;
}) {
  const key = { workspaceId, technicianId };
  const tech = useView(panel, (s) => Technician.get(s, key, Technician.pick("name", "status")));
  const pulse = useView(panel, (s) => O.pulse.get(s, key)); // undefined for a technician not placed
  const onBreak = useView(panel, (s) => s.operations.breaks?.data?.[technicianId] === true);
  const now = useNow("10 seconds");

  if (tech.data === undefined || (onBreak ? "break" : tech.data.status) !== column) return null;

  const quiet = pulse?.value !== undefined && now - pulse.value.reportedAt > STALE_AFTER_MS;

  return (
    <article aria-busy={tech.predicted} style={{ opacity: pulse?.connection === "Live" ? 1 : 0.5 }}>
      <b>{tech.data.name}</b>
      {pulse?.value && <span> · {pulse.value.location}</span>}
      {quiet && <em> · seen {Math.round((now - pulse.value!.reportedAt) / 60_000)} min ago</em>}
      {pulse?.connection === "Connecting" && pulse.drop !== undefined && <em> · reconnecting</em>}
      {pulse?.last && pulse.connection !== "Live" && (
        <em> · as of {Math.round((now - pulse.last.at) / 1000)} s ago</em>
      )}
      <button onClick={() => panel.send(E.Nudge({ technicianId, text: "Call the desk" }))}>
        Nudge
      </button>
      <label>
        <input
          type="checkbox"
          checked={onBreak}
          onChange={() => panel.send(E.ToggleBreak({ technicianId, onBreak: !onBreak }))}
        />
        On break
      </label>
    </article>
  );
}
