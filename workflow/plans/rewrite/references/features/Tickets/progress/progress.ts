/**
 * Optional technician progress feature, separate from the main app import graph.
 * Archive PublicSurface/Types illustrate an Effect-producing subscription adapter.
 * Current Streams.Q1 explicitly leaves direct Stream versus Effect-producing-Stream unresolved.
 * This is that archive-backed candidate, not a decision resolving the current question.
 */
import { Effect, Result, Stream } from "effect";
import { definition, machine, stream } from "flow-state";

export const technicianUpdates = stream({
  id: "DispatchDesk/technician-updates",
  key: ({ workspaceId, ticketId }: { workspaceId: string; ticketId: string }) => [
    workspaceId,
    ticketId,
  ],
  subscribe: (_input, { signal: _signal }) =>
    Effect.succeed(Stream.fromIterable(["assigned", "on-site", "completed"])),
  persist: true,
});

const Progress = definition({
  id: "DispatchDesk/Progress",
  states: ["WATCHING", "CLOSED"],
  events: { Close: "bare" },
  memory: ({ input }: { input: { workspaceId: string; ticketId: string } }) => input,
  operations: { technicianUpdates },
});

export const ProgressMachine = Result.getOrThrow(
  machine(Progress, ({ S, O }) => ({
    default: S.WATCHING,
    states: {
      WATCHING: {
        activities: { technician: ({ memory }) => O.technicianUpdates.subscribe(memory) },
        on: { Close: S.CLOSED },
      },
      CLOSED: {},
    },
  })),
);

/**
 * The finite demo stream needs no external connection. A real transport forwards signal and
 * finalizes its connection on interruption. One actor/declaration owns one session.
 * Distinct actors with equal descriptor/K have independent sessions, not shared resource data.
 * Closing WATCHING releases the declaration once; there is no stream cancel or getData.
 *
 * Passive read fragment with an admitted ProgressMachine snapshot:
 *   const key = snapshot.O.technicianUpdates.key({ workspaceId:"north", ticketId:"T-42" });
 *   const progress = snapshot.O.technicianUpdates.getState(key);
 *   if (progress.hasValue) console.log(progress.latest, progress.emissionCount);
 *   if (progress.status === "complete") console.log("Technician updates ended");
 *
 * States: idle/running/complete/failure/defect/interrupted. Idle has generation:null.
 * hasValue:false has no latest and count zero; true has latest and exact emissionCount.
 * Slow readers can skip intermediate values. Latest projection is not an emission history.
 * An emission changes neither editor memory nor canonical ticket data implicitly.
 *
 * Outcome names: value(V), complete(), failure(E), defect(), interrupt(), each one exact event.
 * Direct members versus outcomes container remains Q1; no guessed mapper object is used here.
 * Planned release has no domain interrupt outcome. Terminal streams never restart implicitly.
 * A durable stream still requires an independently durable stable owner. Restore keeps latest/count,
 * then live executable input may start a fresh generation without replaying old values.
 *
 * Authority: ../../../../Streams.plan, ../../../../../archive/PublicSurface.plan, ../../../../../archive/Types.plan.
 */
