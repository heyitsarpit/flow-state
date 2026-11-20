"use client";

import { useState } from "react";

type State = "idle" | "previewing" | "committed" | "rolledBack";
type Event = "submit" | "serverOk" | "serverError" | "reset";

const transitions: Readonly<Record<State, Partial<Record<Event, State>>>> = {
  idle: { submit: "previewing" },
  previewing: { serverOk: "committed", serverError: "rolledBack" },
  committed: { reset: "idle" },
  rolledBack: { reset: "idle" },
};

const nodes: ReadonlyArray<{ readonly id: State; readonly label: string; readonly x: number; readonly y: number }> = [
  { id: "idle", label: "idle", x: 0, y: 72 },
  { id: "previewing", label: "previewing", x: 192, y: 72 },
  { id: "committed", label: "committed", x: 432, y: 0 },
  { id: "rolledBack", label: "rolled back", x: 432, y: 144 },
];

const edges: ReadonlyArray<{
  readonly from: State;
  readonly event: Event;
  readonly d: string;
  readonly lx: number;
  readonly ly: number;
}> = [
  { from: "idle", event: "submit", d: "M120 96 H192", lx: 130, ly: 88 },
  { from: "previewing", event: "serverOk", d: "M336 84 C384 84 384 24 432 24", lx: 360, ly: 16 },
  { from: "previewing", event: "serverError", d: "M336 108 C384 108 384 168 432 168", lx: 344, ly: 194 },
  { from: "committed", event: "reset", d: "M480 0 C480 -40 60 -40 60 72", lx: 240, ly: -20 },
  { from: "rolledBack", event: "reset", d: "M480 192 C480 232 60 232 60 120", lx: 240, ly: 222 },
];

const events: ReadonlyArray<Event> = ["submit", "serverOk", "serverError", "reset"];

export function TransactionFigure() {
  const [state, setState] = useState<State>("idle");
  const [log, setLog] = useState<ReadonlyArray<string>>(["idle"]);

  const send = (event: Event) => {
    const next = transitions[state][event];
    if (next === undefined) return;
    setState(next);
    setLog((entries) => [...entries.slice(-3), `${event} → ${next}`]);
  };

  return (
    <figure className="fs-figure">
      <svg viewBox="-8 -48 560 288" role="img" aria-label={`Transaction state machine, now in ${state}`}>
        {edges.map((edge) => (
          <g
            key={`${edge.from}-${edge.event}`}
            className="fs-machine-edge"
            data-live={edge.from === state ? "true" : undefined}
          >
            <path d={edge.d} />
            <text x={edge.lx} y={edge.ly}>
              {edge.event}
            </text>
          </g>
        ))}
        {nodes.map((node) => (
          <g key={node.id} className="fs-machine-node" data-active={node.id === state ? "true" : undefined}>
            <rect x={node.x} y={node.y} width={node.id === "previewing" ? 144 : 120} height={48} />
            <text x={node.x + 16} y={node.y + 30}>
              {node.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="fs-machine-events">
        {events.map((event) => (
          <button
            key={event}
            type="button"
            disabled={transitions[state][event] === undefined}
            onClick={() => send(event)}
          >
            {event}
          </button>
        ))}
      </div>
      <div className="fs-machine-log">{log.join("   ")}</div>
      <figcaption>
        <b>Figure 1.</b> A transaction as a machine. Submitting applies the change as an optimistic
        preview; the server's answer either commits it or rolls it back. Press the events to step through it.
      </figcaption>
    </figure>
  );
}
