import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { SessionMachine } from "./session.ts";
import { TeamMachine } from "./team.ts";

/**
 * The page byline: who is signed in, nobody (undefined) when the session is signed out, beside the
 * name of the team they lead; it counts each change of either it sees, and is kept across reloads.
 */
export const Byline = definition({
  id: "Workspace/Byline",
  persist: true,
  states: ["SHOWN"],
  events: {},
  internalEvents: { UserSeen: {}, TeamSeen: {} },
  memory: {
    users: Flow.initial(Schema.Number, 0),
    teams: Flow.initial(Schema.Number, 0),
  },
  context: {
    user: Flow.context(Schema.UndefinedOr(Schema.String), {
      reads: { user: SessionMachine.definition.M.user },
      select: ({ user }) => (user === "" ? undefined : user),
    }),
    team: Flow.context(TeamMachine.definition.M.name),
  },
});

/**
 * The byline: each changed user is one more user seen, each changed team name one more team seen.
 */
export const BylineMachine = machine(Byline, ({ S, E, C }) => ({
  default: S.SHOWN,
  onContext: [C.user.change({ event: E.UserSeen }), C.team.change({ event: E.TeamSeen })],
  on: {
    UserSeen: { updateMemory: ({ memory }) => ({ users: memory.users + 1 }) },
    TeamSeen: { updateMemory: ({ memory }) => ({ teams: memory.teams + 1 }) },
  },
}));
