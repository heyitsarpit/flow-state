// WATCHING places both sessions for the screen's life. A drop is not a transition (rule 25): the SDK reconnects, the
// row reads Connecting with its `drop`, and the badges dim. Only a channel the SDK gave up on ends WATCHING.
// Pending merge 6: written against merged/streams/proposal-v2.md revision 7.1, S1–S10.
import { machine } from "flow-state";
import { Presence, TYPING_SHOWN_MS } from "./presence.definition.js";

export const PresenceMachine = machine(Presence, ({ S, O }) => {
  const channel = ({ memory }: { memory: { workspaceId: string; ticketId: string } }) => ({
    workspaceId: memory.workspaceId,
    ticketId: memory.ticketId,
  });

  return {
    default: S.WATCHING,
    states: {
      WATCHING: {
        activities: [O.viewers.subscribe(channel), O.typing.subscribe(channel)],
        on: {
          // The badges' membership is host data, filled from the feed's reconciled value (rule 9).
          Viewers: { target: "self", updateMemory: ({ event }) => ({ viewerIds: event.ids }) },
          // Each typing message once, kept for a few seconds by the view (`useNow`); stale ones are dropped here.
          Typing: {
            target: "self",
            updateMemory: ({ memory, event }) => ({
              typing: Object.fromEntries(
                [...Object.entries(memory.typing), [event.memberId, event.at] as const].filter(
                  ([, at]) => at > event.at - TYPING_SHOWN_MS,
                ),
              ),
            }),
          },
          MayHaveMissed: { target: "self" }, // typing is ephemeral: a missed "is typing" is nothing to show (SR10)
          // "I am typing": a ping through the SDK, `allow`, bare. Nothing waits on it.
          Typed: {
            target: "self",
            actions: [
              O.ping.commit(({ memory, event }) => ({
                ...channel({ memory }),
                memberId: event.memberId,
                at: event.at,
              })),
            ],
          },
          Ended: {
            target: S.ENDED,
            updateMemory: ({ event }) => ({ reason: event.reason, viewerIds: [] }),
          },
        },
      },
      ENDED: {}, // the panel shows "Live presence is off"; reopening the ticket starts again
    },
  };
});
