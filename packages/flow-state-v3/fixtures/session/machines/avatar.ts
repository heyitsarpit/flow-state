import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { SessionMachine } from "./session.ts";

/**
 * The header avatar: it reads who is signed in, nobody (undefined) when the session is signed out,
 * and counts each change it sees; kept across reloads.
 */
export const Avatar = definition({
  id: "Workspace/Avatar",
  persist: true,
  states: ["SHOWN"],
  events: {},
  internalEvents: { Seen: {} },
  memory: { seen: Flow.initial(Schema.Number, 0) },
  context: {
    user: Flow.context(Schema.UndefinedOr(Schema.String), {
      reads: { user: SessionMachine.definition.M.user },
      select: ({ user }) => (user === "" ? undefined : user),
    }),
  },
});

/**
 * The avatar: each changed user is one more seen.
 */
export const AvatarMachine = machine(Avatar, ({ S, E, C }) => ({
  default: S.SHOWN,
  onContext: [C.user.change({ event: E.Seen })],
  on: { Seen: { updateMemory: ({ memory }) => ({ seen: memory.seen + 1 }) } },
}));
