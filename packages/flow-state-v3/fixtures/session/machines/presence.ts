import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { SessionMachine } from "../machine.ts";

/**
 * Who a session shows as online: it reads its session's user and keeps the last one it heard; never
 * saved, so it starts again from its session at every start.
 */
export const Presence = definition({
  id: "Workspace/Presence",
  persist: false,
  states: ["ONLINE"],
  events: {},
  internalEvents: { Saw: { user: Schema.String } },
  memory: { user: Flow.initial(Schema.String, "") },
  context: { user: SessionMachine.definition.Provider.select((s) => s.memory.user) },
});

/**
 * Presence: each changed user is the one it shows.
 */
export const PresenceMachine = machine(Presence, ({ S, E }) => ({
  default: S.ONLINE,
  onContext: [
    { select: ({ context }) => context.user, event: E.Saw.from((user: string) => ({ user })) },
  ],
  on: { Saw: { updateMemory: ({ event }) => ({ user: event.user }) } },
}));

/**
 * The online dot beside a name: it reads whom its presence shows and counts each change it hears;
 * a ping is a look at it. Kept across reloads.
 */
export const Dot = definition({
  id: "Workspace/Dot",
  persist: true,
  states: ["SHOWN"],
  events: { Ping: {} },
  internalEvents: { Heard: {} },
  memory: { heard: Flow.initial(Schema.Number, 0) },
  context: { online: Presence.Provider.select((p) => p.memory.user) },
});

/**
 * The dot: each changed user is one more heard.
 */
export const DotMachine = machine(Dot, ({ S, E }) => ({
  default: S.SHOWN,
  onContext: [{ select: ({ context }) => context.online, event: E.Heard }],
  on: { Heard: { updateMemory: ({ memory }) => ({ heard: memory.heard + 1 }) }, Ping: {} },
}));
