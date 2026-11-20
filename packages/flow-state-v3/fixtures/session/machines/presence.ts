import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { SessionMachine } from "./session.ts";

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
  context: { user: Flow.context(SessionMachine.definition.M.user) },
});

/**
 * Presence: each changed user is the one it shows.
 */
export const PresenceMachine = machine(Presence, ({ S, E, C }) => ({
  default: S.ONLINE,
  onContext: [C.user.change({ event: E.Saw.from((user) => ({ user })) })],
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
  context: { online: Flow.context(Presence.M.user) },
});

/**
 * The dot: each changed user is one more heard.
 */
export const DotMachine = machine(Dot, ({ S, E, C }) => ({
  default: S.SHOWN,
  onContext: [C.online.change({ event: E.Heard })],
  on: { Heard: { updateMemory: ({ memory }) => ({ heard: memory.heard + 1 }) }, Ping: {} },
}));
