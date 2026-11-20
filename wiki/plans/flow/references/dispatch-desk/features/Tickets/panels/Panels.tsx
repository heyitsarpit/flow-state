// The panel column. A frozen tab's slice stays readable (rule 1), so a tab button can say "3 parts held, 12 min
// left" while the dispatcher is on another tab: the hold's `dueAt` is kept, and `useNow` counts it down.
import { useActorByRef, useNow, useView } from "flow-state/react";
import { Panels } from "./panels.definition.js";
import { panelsRef } from "./panels.ref.js";

const { S, E } = Panels;

export function PanelColumn({ workspaceId }: { workspaceId: string }) {
  const panels = useActorByRef(panelsRef(workspaceId), { input: { workspaceId } });
  const tab = useView(panels, (s) => S.TABS.child(s)); // "HISTORY" | "CUSTOMER" | "PARTS"
  const held = useView(panels, (s) => s.memory.parts?.reserved.length ?? 0); // present while frozen too
  const dueAt = useView(panels, (s) => s.schedules.parts?.reservation.expire?.dueAt);
  const now = useNow("1 second");
  const minutesLeft =
    dueAt === undefined ? undefined : Math.max(0, Math.ceil((dueAt - now) / 60_000));

  return (
    <aside aria-label="Ticket panels">
      <nav>
        <button
          aria-pressed={tab === "HISTORY"}
          onClick={() => panels.send(E.OpenTab({ tab: "history" }))}
        >
          History
        </button>
        <button
          aria-pressed={tab === "CUSTOMER"}
          onClick={() => panels.send(E.OpenTab({ tab: "customer" }))}
        >
          Customer
        </button>
        <button
          aria-pressed={tab === "PARTS"}
          onClick={() => panels.send(E.OpenTab({ tab: "parts" }))}
        >
          Parts {held > 0 && `(${held} held, ${minutesLeft ?? "?"} min left)`}
        </button>
      </nav>
      {tab === "HISTORY" && <HistoryTab panels={panels} />}
      {tab === "PARTS" && (
        <button onClick={() => panels.send(E.parts.Reserve({ partNumber: "BULB-40W" }))}>
          Hold a bulb
        </button>
      )}
    </aside>
  );
}

function HistoryTab({ panels }: { panels: ReturnType<typeof useActorByRef> }) {
  const latest = useView(panels, (s) => s.operations.history?.latest?.data?.entries ?? []);
  const earlier = useView(panels, (s) => s.memory.history?.earlier ?? []);
  const highlighted = useView(panels, (s) => s.memory.history?.highlighted ?? null);

  return (
    <ol>
      {[...latest, ...earlier].map((entry) => (
        <li key={entry.entryId} aria-current={entry.entryId === highlighted}>
          {entry.text}{" "}
          <button
            onClick={() =>
              panels.send(E.history.Pin({ entryId: entry.entryId, pinned: !entry.pinned }))
            }
          >
            {entry.pinned ? "Unpin" : "Pin"}
          </button>
        </li>
      ))}
      <li>
        <button onClick={() => panels.send(E.history.LoadEarlier())}>Load earlier</button>
      </li>
    </ol>
  );
}
