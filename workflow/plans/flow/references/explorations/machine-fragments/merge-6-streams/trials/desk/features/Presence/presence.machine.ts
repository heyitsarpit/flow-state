// TRIAL (proposal-v3.md): WATCHING places both sessions for the screen's life. UNCHANGED from the desk's machine except that
// `MayHaveMissed` carries no payload now. A drop is not a transition: the SDK reconnects, the row reads Connecting.
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
          Viewers: { target: "self", updateMemory: ({ event }) => ({ viewerIds: event.ids }) },
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
          MayHaveMissed: { target: "self" }, // typing is ephemeral: a missed "is typing" is nothing to show
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
      ENDED: {},
    },
  };
});
