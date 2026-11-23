import { Exit, Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";
import { NoAnswer, Renamed, Teams, WorkspaceProfile } from "../services.ts";

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
      success: WorkspaceProfile,
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
