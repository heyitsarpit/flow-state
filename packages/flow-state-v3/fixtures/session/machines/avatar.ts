import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { SessionMachine } from "../machine.ts";

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
    user: SessionMachine.definition.Provider.select(Schema.UndefinedOr(Schema.String), (s) =>
      s.memory.user === "" ? undefined : s.memory.user,
    ),
  },
});

/**
 * The avatar: each changed user is one more seen.
 */
export const AvatarMachine = machine(Avatar, ({ S, E }) => ({
  default: S.SHOWN,
  onContext: [{ select: ({ context }) => context.user, event: E.Seen }],
  on: { Seen: { updateMemory: ({ memory }) => ({ seen: memory.seen + 1 }) } },
}));
