// Typing schedules a lookup after a pause (`restartOn`, S1); Enter looks up at once. Both go through one guard, so
// the reason a short query is not searched is the same everywhere and `check()` shows it under the box (F21).
import { deny, machine, send } from "flow-state";
import { Queue } from "../Tickets/queue/queue.definition.js";
import { queueRef } from "../Tickets/queue/queue.ref.js";
import { Find, MIN_QUERY } from "./find.definition.js";

type Memory = typeof Find.Memory.Type;

const longEnough = ({ memory }: { memory: Memory }) =>
  memory.q.trim().length >= MIN_QUERY || deny("TooShort", { min: MIN_QUERY });

export const FindMachine = machine(Find, ({ S, E, O }) => {
  const look = O.results.lookup(({ memory }) => ({
    workspaceId: memory.workspaceId,
    q: memory.q.trim().toLowerCase(),
  }));

  // Long enough: look it up (releasing any older lookup). Otherwise: nothing to search, and an older lookup still in
  // flight is released (`cancel`, key-less: one lane per operation) so its answer never lands on an empty box.
  const searchOrClear = [
    {
      target: "self" as const,
      guard: [longEnough],
      updateMemory: () => ({ failed: false }),
      actions: [look],
    },
    {
      target: "self" as const,
      updateMemory: () => ({ hits: [], failed: false }),
      actions: [O.results.cancel],
    },
  ];

  return {
    default: S.PALETTE,
    schedules: {
      settle: { schedule: "250 millis", send: E.SearchDue, restartOn: ({ memory }) => memory.q },
    },
    on: {
      Typed: { target: "self", updateMemory: ({ event }) => ({ q: event.q }) },
      SearchDue: searchOrClear,
      Search: { target: "self", guard: [longEnough], actions: [look] }, // refused, with its reason, when too short
      Found: { target: "self", updateMemory: ({ event }) => ({ hits: event.hits, failed: false }) },
      FindFailed: { target: "self", updateMemory: () => ({ failed: true }) }, // keep the last hits, dimmed (R4)
      // A ticket opens in the queue's preview: a send to another actor's public event.
      // design gap: `send`'s target here is a function of memory (the workspace's queue). The design shows a fixed
      // ref (`send(ToastsRef, …)`); a ref chosen per turn is assumed to be written as a select.
      Choose: [
        {
          target: "self",
          guard: ({ event }) => event.kind === "ticket" || deny("NotATicket"),
          updateMemory: ({ event }) => ({ chosen: { kind: event.kind, id: event.id } }),
          actions: [
            send(
              ({ memory }) => queueRef(memory.workspaceId),
              Queue.E.PreviewOpened.from(({ event }) => ({ ticketId: event.id })),
            ),
          ],
        },
        {
          target: "self",
          updateMemory: ({ event }) => ({ chosen: { kind: event.kind, id: event.id } }),
        },
      ],
    },
    states: { PALETTE: {} },
  };
});
