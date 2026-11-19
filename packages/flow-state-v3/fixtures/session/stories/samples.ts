import { samplesOf } from "../../../src/host/testing/index.ts";
import { mainAvatar, mainByline } from "../app.ts";
import { acme, coreTeam, globex, guestSession, mainSession } from "../app.ts";
import { Org } from "../machines/org.ts";
import { Session } from "../machines/session.ts";
import { Team } from "../machines/team.ts";
import { Identity } from "../server/identity.ts";
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
  names: { setup: "workspaceGrownSetup", fixtures: ["IdentityFake"] },
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
