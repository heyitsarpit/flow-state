import { samplesOf } from "../../../src/host/testing/index.ts";
import { mainAvatar, mainByline } from "../app.ts";
import { acme, coreTeam, globex, guestSession, mainSession } from "../app.ts";
import { Identity } from "../server/identity.ts";
import { grownStory } from "./structure.ts";

const signInAda = { _tag: "SignIn", user: "ada" } as const;
const signInBob = { _tag: "SignIn", user: "bob" } as const;
const signOut = { _tag: "SignOut" } as const;
const retry = { _tag: "Retry" } as const;
const coreName = { _tag: "Rename", name: "Core" } as const;
const platformName = { _tag: "Rename", name: "Platform" } as const;
const acmeName = { _tag: "Rename", name: "Acme" } as const;

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
