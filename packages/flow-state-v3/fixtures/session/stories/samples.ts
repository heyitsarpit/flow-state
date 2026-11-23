import { samplesOf } from "../../../src/host/testing/index.ts";
import { mainAvatar, mainByline, shell } from "../app.ts";
import { acme, coreTeam, globex, guestSession, mainSession } from "../app.ts";
import { Org } from "../machines/org.ts";
import { Session } from "../machines/session.ts";
import { Shell } from "../machines/shell.ts";
import { Team } from "../machines/team.ts";
import { Identity } from "../server/identity.ts";
import { Workspace } from "../server/workspace.ts";
import { shellStory } from "./shell.ts";
import { grownStory } from "./structure.ts";

const signInAda = Session.E.SignIn({ user: "ada" });
const signInBob = Session.E.SignIn({ user: "bob" });
const signOut = Session.E.SignOut();
const retry = Session.E.Retry();
const coreName = Team.E.Rename({ name: "Core" });
const platformName = Team.E.Rename({ name: "Platform" });
const acmeName = Org.E.Rename({ name: "Acme" });

/**
 * What the grown workspace's context consumers meet, for generated runs: the header avatar and the
 * page byline come and go while Ada signs in and out (an undefined user) and the team is renamed,
 * with sign-ins held, lost and locked.
 */
export const grownSamples = samplesOf({
  id: "session-grown",
  story: grownStory("session/grown-samples"),
  names: { setup: "workspaceGrownSetup", fixtures: ["IdentityFake", "WorkspaceFake"] },
  actors: { acme, globex, mainSession, guestSession, coreTeam, mainAvatar, mainByline },
  servers: { Identity },
  failures: [Identity.lock({ user: "ada" })],
  landedFailures: [],
  values: { signInAda, signInBob, signOut, retry, coreName, platformName, acmeName },
  controls: [Identity.unlock({ user: "ada" })],
  steps: (story) =>
    story
      .send(mainSession, signInAda)
      .send(guestSession, signInBob)
      .send(mainSession, signOut)
      .send(mainSession, retry)
      .send(coreTeam, coreName)
      .send(coreTeam, platformName)
      .send(acme, acmeName),
});

const shellRefresh = Shell.E.Refresh();
const shellRenamePlatform = Shell.E.Rename({ team: "core", name: "Platform" });
const shellRenameBlank = Shell.E.Rename({ team: "core", name: "" });
const shellSignOut = Shell.E.SignOut();
const shellSignIn = Shell.E.SignIn();

/**
 * What the shell's profile and team reads meet, for generated runs: a refresh reads the profile
 * again, a rename shows at once and is written by the server's answer, a blank name is still sent,
 * and signing out and in reads the profile again, with the workspace renaming its user or answering
 * without the org.
 */
export const shellSamples = samplesOf({
  id: "session-shell",
  story: shellStory("session/shell-samples"),
  names: { setup: "shellSetup", fixtures: ["WorkspaceFake"] },
  actors: { shell },
  servers: { Workspace },
  failures: [],
  landedFailures: [],
  values: { shellRefresh, shellRenamePlatform, shellRenameBlank, shellSignOut, shellSignIn },
  controls: [Workspace.renameUser({ user: "ada", name: "Ada L." }), Workspace.legacy({})],
  steps: (story) =>
    story
      .ensure(shell)
      .send(shell, shellRefresh)
      .send(shell, shellRenamePlatform)
      .send(shell, shellRenameBlank)
      .send(shell, shellSignOut)
      .send(shell, shellSignIn),
});
