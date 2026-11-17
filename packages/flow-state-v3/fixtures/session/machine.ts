import { Schema } from "effect";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { type Refused, signIn } from "./contracts.ts";
import { IdentityLive } from "./identity-http.ts";

const Org = definition({
  id: "Workspace/Org",
  persist: true,
  states: ["OPEN"],
  events: { Rename: { name: Schema.String } },
  memory: { name: Flow.initial(Schema.String, "") },
});

/**
 * An organisation: the root of a workspace's tree, providing its name to every session in it.
 */
export const OrgMachine = machine(Org, ({ S }) => ({
  default: S.OPEN,
  on: { Rename: { updateMemory: ({ event }) => ({ name: event.name }) } },
}));

const Session = definition({
  id: "Workspace/Session",
  persist: true,
  states: ["SIGNED_OUT", "SIGNING_IN", "SIGNED_IN"],
  events: { SignIn: { user: Schema.String }, SignOut: {}, Retry: {}, GiveUp: {} },
  internalEvents: {
    SignedIn: { user: Schema.String, displayName: Schema.String },
    Refused: { reason: Schema.String },
    NotSent: { why: Schema.String },
    Unsure: Flow.uncertain({}),
  },
  memory: {
    user: Flow.initial(Schema.String, ""),
    displayName: Flow.initial(Schema.String, ""),
    notice: Flow.initial(Schema.String, ""),
  },
  context: { org: Org.Provider.select(Schema.String, (o) => o.memory.name) },
  operations: ({ E }) => ({
    signIn: signIn.outcomes({
      success: E.SignedIn.from((p: { readonly user: string; readonly displayName: string }) => ({
        user: p.user,
        displayName: p.displayName,
      })),
      failure: { Refused: E.Refused.from((e: Refused) => ({ reason: e.reason })) },
      notSent: E.NotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      unknown: E.Unsure,
    }),
  }),
});

/**
 * Who is signed in, as the identity provider answered: a consumer of its organisation and the
 * provider every team reads its user from. An unsure sign-in is retried or given up by the user.
 */
export const SessionMachine = machine(Session, ({ S, O }) => ({
  default: S.SIGNED_OUT,
  on: {
    SignIn: { target: S.SIGNING_IN, actions: [O.signIn.commit(({ event }) => event)] },
    SignedIn: {
      target: S.SIGNED_IN,
      updateMemory: ({ event }) => ({
        user: event.user,
        displayName: event.displayName,
        notice: "",
      }),
    },
    Refused: { target: S.SIGNED_OUT, updateMemory: ({ event }) => ({ notice: event.reason }) },
    NotSent: { target: S.SIGNED_OUT, updateMemory: ({ event }) => ({ notice: event.why }) },
    Unsure: { target: S.SIGNED_OUT, updateMemory: () => ({ notice: "try again" }) },
    Retry: { target: S.SIGNING_IN, actions: [O.signIn.retry(() => ({}))] },
    GiveUp: { updateMemory: () => ({ notice: "" }), actions: [O.signIn.cancel(() => ({}))] },
    SignOut: { target: S.SIGNED_OUT, updateMemory: () => ({ user: "", displayName: "" }) },
  },
}));

const Team = definition({
  id: "Workspace/Team",
  persist: true,
  states: ["ACTIVE"],
  events: { Rename: { name: Schema.String } },
  memory: { name: Flow.initial(Schema.String, "") },
  context: { user: Session.Provider.select(Schema.String, (s) => s.memory.user) },
});

/**
 * A team: a consumer of the session whose user leads it, and the provider every badge reads its
 * team's name from.
 */
export const TeamMachine = machine(Team, ({ S }) => ({
  default: S.ACTIVE,
  on: { Rename: { updateMemory: ({ event }) => ({ name: event.name }) } },
}));

const Badge = definition({
  id: "Workspace/Badge",
  persist: true,
  states: ["SHOWN"],
  events: { Ping: {} },
  memory: { pings: Flow.initial(Schema.Number, 0) },
  context: { team: Team.Provider.select(Schema.String, (t) => t.memory.name) },
});

/**
 * An avatar badge that shows the name of the team it is bound to, and counts pings: the leaf of a
 * tree four layers deep, organisation to session to team to badge.
 */
export const BadgeMachine = machine(Badge, ({ S }) => ({
  default: S.SHOWN,
  on: { Ping: { updateMemory: ({ memory }) => ({ pings: memory.pings + 1 }) } },
}));

/**
 * The organisation every session belongs to unless its ref says otherwise.
 */
export const acme = actorRef(OrgMachine, "acme");

/**
 * A second organisation: the root of a second, independent tree.
 */
export const globex = actorRef(OrgMachine, "globex");

/**
 * The workspace's own session, in the default organisation.
 */
export const mainSession = actorRef(SessionMachine, "main");

/**
 * A guest's session, whose ref puts it in the second organisation.
 */
export const guestSession = actorRef(SessionMachine, "guest", { context: { org: globex } });

/**
 * The team led by the main session, the default for every badge.
 */
export const coreTeam = actorRef(TeamMachine, "core");

/**
 * A team whose ref binds it, at the middle layer, to the guest's session instead of the default.
 */
export const guestTeam = actorRef(TeamMachine, "guests", { context: { user: guestSession } });

/**
 * A badge bound to the default team.
 */
export const badge = actorRef(BadgeMachine, "badge");

/**
 * A badge whose ref binds it to the guests' team.
 */
export const guestBadge = actorRef(BadgeMachine, "guest-badge", { context: { team: guestTeam } });

/**
 * The `n`th badge of a wall of badges, all on the default team.
 */
export const wallBadge = (n: number) => actorRef(BadgeMachine, `wall-${n}`);

/**
 * The workspace app: organisations, sessions in the default organisation, teams led by the main
 * session, and badges on the core team, unless a ref says otherwise.
 */
export const workspace = app({
  id: "workspace",
  machines: {
    org: OrgMachine,
    session: { machine: SessionMachine, context: { org: acme } },
    team: { machine: TeamMachine, context: { user: mainSession } },
    badge: { machine: BadgeMachine, context: { team: coreTeam } },
  },
});

/**
 * The workspace's real setup: the identity provider over HTTP, persisted, each capture written at
 * once. A Story never builds its services.
 */
export const workspaceSetup = runtimeSetup({
  app: workspace,
  services: IdentityLive("https://id.example"),
  scope: "workspace",
  persistence: { captureMs: 0 },
});
