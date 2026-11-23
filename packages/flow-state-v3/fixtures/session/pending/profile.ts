/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-call, typescript/no-unsafe-return -- each line under an `@ts-expect-error` uses a read member or option the Operations Spec adds and the package lacks, so its values type as any until it lands */
// @effect-diagnostics unstableApiUsage:off -- the setup's adapter runs over Effect's fetch client, as the app's real Layer would
import { Context, Effect, Exit, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpIncomingMessage } from "effect/http";
import { layerIndexedDb } from "../../../src/host/persistence.ts";
import { Fake } from "../../../src/host/testing/index.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  machine,
  Outcome,
  resource,
  runtimeSetup,
  transaction,
} from "../../../src/index.ts";

/**
 * No answer came back from the workspace service.
 */
export class NoAnswer extends Schema.TaggedError<NoAnswer>()("NoAnswer", {}) {}

const Profile = Schema.Struct({ user: Schema.String, name: Schema.String });

const Teams = Schema.Struct({
  org: Schema.String,
  names: Schema.Record(Schema.String, Schema.String),
});

const Renamed = Schema.Struct({
  org: Schema.optional(Schema.String),
  team: Schema.String,
  name: Schema.String,
});

/**
 * The workspace port: the signed-in user's profile, an org's team names, and a team rename.
 */
export class WorkspaceApi extends Context.Service<
  WorkspaceApi,
  {
    readonly profile: (input: {
      readonly user: string;
    }) => Effect.Effect<typeof Profile.Type, NoAnswer>;
    readonly teams: (input: { readonly org: string }) => Effect.Effect<typeof Teams.Type, NoAnswer>;
    readonly rename: (
      input: { readonly org: string; readonly team: string; readonly name: string },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<typeof Renamed.Type, NoAnswer>;
  }
>()("flow-state-v3/fixtures/session/WorkspaceApi") {}

const WorkspaceTruth = Schema.Struct({
  names: Schema.Record(Schema.String, Schema.String),
  teams: Schema.Record(Schema.String, Schema.String),
  legacy: Schema.Boolean,
});

type Truth = typeof WorkspaceTruth.Type;

/**
 * The workspace server's truth: each user's display name, the org's team names, and whether its
 * rename answers come from a legacy endpoint that leaves out the org.
 */
export const Workspace = Fake.server("Workspace", {
  truth: WorkspaceTruth,
  initial: { names: { ada: "Ada" }, teams: { core: "Core" }, legacy: false },
  endpoints: {
    profile: Fake.call({
      request: { user: Schema.String },
      success: Profile,
      failure: Schema.Never,
      handle: (truth: Truth, { user }) => ({
        truth,
        exit: Exit.succeed({ user, name: truth.names[user] ?? user }),
      }),
    }),
    teams: Fake.call({
      request: { org: Schema.String },
      success: Teams,
      failure: Schema.Never,
      handle: (truth: Truth, { org }) => ({
        truth,
        exit: Exit.succeed({ org, names: truth.teams }),
      }),
    }),
    rename: Fake.call({
      request: { org: Schema.String, team: Schema.String, name: Schema.String, key: Schema.String },
      success: Renamed,
      failure: Schema.Never,
      handle: (truth: Truth, { org, team, name }) => ({
        truth: { ...truth, teams: { ...truth.teams, [team]: name } },
        exit: Exit.succeed(truth.legacy ? { team, name } : { org, team, name }),
      }),
    }),
  },
  controls: {
    renameUser: Fake.control(
      { user: Schema.String, name: Schema.String },
      (truth: Truth, { user, name }) => ({
        ...truth,
        names: { ...truth.names, [user]: name },
      }),
    ),
    legacy: Fake.control({}, (truth: Truth) => ({ ...truth, legacy: true })),
  },
  lost: () => new NoAnswer(),
});

/**
 * The workspace port over its fake.
 */
export const WorkspaceFake = Layer.effect(
  WorkspaceApi,
  Effect.map(Workspace, (server) =>
    WorkspaceApi.of({
      profile: server.profile,
      teams: server.teams,
      rename: (input, { idempotencyKey }) => server.rename({ ...input, key: idempotencyKey }),
    }),
  ),
);

/**
 * The workspace port over HTTP.
 */
export const WorkspaceHttp = (origin: string) =>
  Layer.effect(
    WorkspaceApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));
      const lost = () => Effect.fail(new NoAnswer());

      return WorkspaceApi.of({
        profile: ({ user }) =>
          HttpClientRequest.get(`/users/${encodeURIComponent(user)}`).pipe(
            client.execute,
            Effect.flatMap((r) => HttpIncomingMessage.schemaBodyJson(Profile)(r)),
            Effect.catchTags({ HttpClientError: lost, SchemaError: lost }),
          ),
        teams: ({ org }) =>
          HttpClientRequest.get(`/orgs/${encodeURIComponent(org)}/teams`).pipe(
            client.execute,
            Effect.flatMap((r) => HttpIncomingMessage.schemaBodyJson(Teams)(r)),
            Effect.catchTags({ HttpClientError: lost, SchemaError: lost }),
          ),
        rename: ({ org, team, name }, { idempotencyKey }) =>
          HttpClientRequest.put(
            `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(team)}`,
          ).pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.bodyJsonUnsafe({ name }),
            client.execute,
            Effect.flatMap((r) => HttpIncomingMessage.schemaBodyJson(Renamed)(r)),
            Effect.catchTags({ HttpClientError: lost, SchemaError: lost }),
          ),
      });
    }),
  );

/**
 * The signed-in user's profile, fresh for a minute.
 */
export const profile = resource({
  id: "Workspace/profile",
  input: { user: Schema.String },
  key: ["user"],
  services: [WorkspaceApi],
  staleTime: "1 minute",
  gcTime: "10 minutes",
  lookup: (input) => WorkspaceApi.use((api) => api.profile(input)),
});

/**
 * An org's team names, fresh for a minute.
 */
export const teams = resource({
  id: "Workspace/teams",
  input: { org: Schema.String },
  key: ["org"],
  services: [WorkspaceApi],
  staleTime: "1 minute",
  gcTime: "10 minutes",
  lookup: (input) => WorkspaceApi.use((api) => api.teams(input)),
});

/**
 * A team renamed. A lost answer is unknown.
 */
export const renameTeam = transaction({
  id: "Workspace/renameTeam",
  input: { org: Schema.String, team: Schema.String, name: Schema.String },
  key: ["org", "team"],
  concurrency: "latest",
  services: [WorkspaceApi],
  commit: (input, { attempt }) =>
    WorkspaceApi.use((api) => api.rename(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoAnswer", (e) => Outcome.unknown(e)),
    ),
});

/**
 * The shell's profile and team names: the user shown, their display name and the org's teams as
 * last read; signing out clears what was read.
 */
export const Shell = definition({
  id: "Workspace/Shell",
  states: ["SIGNED_IN", "SIGNED_OUT"],
  events: {
    Refresh: {},
    Rename: { team: Schema.String, name: Schema.String },
    SignOut: {},
    SignIn: {},
  },
  internalEvents: {
    Profiled: { name: Schema.String },
    Teamed: { names: Schema.Record(Schema.String, Schema.String) },
    Unread: {},
    Renamed: {},
    RenameUnsure: Flow.uncertain({}),
  },
  memory: {
    user: Flow.initial(Schema.String, "ada"),
    org: Flow.initial(Schema.String, "acme"),
    name: Flow.initial(Schema.String, ""),
    teams: Flow.initial(Schema.Record(Schema.String, Schema.String), {}),
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    profile: profile.outcomes({
      // @ts-expect-error Operations O2: a placed read maps `value`
      value: E.Profiled.from((v) => ({ name: v.name })),
      failure: { NoAnswer: E.Unread, Defect: E.Unread, Interrupted: E.Unread },
    }),
    teams: teams.outcomes({
      // @ts-expect-error Operations O2: a placed read maps `value`
      value: E.Teamed.from((v) => ({ names: v.names })),
      failure: { NoAnswer: E.Unread, Defect: E.Unread, Interrupted: E.Unread },
    }),
    renameTeam: renameTeam.outcomes(
      { success: E.Renamed, failure: {}, unknown: E.RenameUnsure },
      // @ts-expect-error Plan Operations O3: an operation's `writes`, applied on success
      {
        // @ts-expect-error Plan Operations O3: `writes` receives the answer and the input
        writes: ({ value }) => ({
          teams: {
            key: { org: value.org },
            // @ts-expect-error Plan Operations O3, O5: a write's data may update the current value
            data: (current) => ({
              ...current,
              names: { ...current.names, [value.team]: value.name },
            }),
          },
        }),
      },
    ),
  }),
});

/**
 * Signed in, the shell places the profile and the teams; a refresh reads the profile again; a
 * rename shows at once as an optimistic team name; signing out clears the profile off the device.
 */
export const ShellMachine = machine(Shell, ({ S, O }) => ({
  default: S.SIGNED_IN,
  states: {
    SIGNED_IN: {
      // @ts-expect-error Operations O2: a state places reads in `activities`
      activities: [
        // @ts-expect-error Operations O2: `subscribe` places a read
        O.profile.subscribe(({ memory }) => ({ user: memory.user })),
        // @ts-expect-error Operations O2: `subscribe` places a read
        O.teams.subscribe(({ memory }) => ({ org: memory.org })),
      ],
      on: {
        Profiled: { updateMemory: ({ event }) => ({ name: event.name }) },
        Teamed: { updateMemory: ({ event }) => ({ teams: event.names }) },
        Unread: { updateMemory: () => ({ notice: "workspace unavailable" }) },
        // @ts-expect-error Operations O2: `refetch` reads the placed key again now
        Refresh: { actions: [O.profile.refetch()] },
        Rename: {
          actions: [
            O.renameTeam.commit(
              ({ memory, event }) => ({ org: memory.org, team: event.team, name: event.name }),
              // @ts-expect-error Operations O5: a commit's `optimistic` value on a read
              {
                // @ts-expect-error Operations O5: `optimistic` reads the starting turn's memory and event
                optimistic: ({ memory, event }) => ({
                  teams: { org: memory.org, names: { [event.team]: event.name } },
                }),
              },
            ),
          ],
        },
        RenameUnsure: { updateMemory: () => ({ notice: "rename may not have saved" }) },
        SignOut: {
          target: S.SIGNED_OUT,
          updateMemory: () => ({ name: "", teams: {} }),
          // @ts-expect-error Operations O5: `clear` takes a partial key
          actions: [O.profile.clear(({ memory }) => ({ user: memory.user }))],
        },
      },
    },
    SIGNED_OUT: { on: { SignIn: S.SIGNED_IN } },
  },
}));

/**
 * The workspace shell.
 */
export const shell = actorRef(ShellMachine, "shell");

/**
 * The workspace grown with the shell's reads.
 */
export const shellSetup = runtimeSetup({
  app: app({ id: "workspace", machines: { shell: ShellMachine } }),
  services: Layer.merge(
    WorkspaceHttp("https://workspace.example").pipe(Layer.provide(FetchHttpClient.layer)),
    layerIndexedDb(),
  ),
  scope: "workspace",
  persistence: { captureMs: 0 },
});
