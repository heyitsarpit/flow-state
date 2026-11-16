import { Fake, samplesOf, Story } from "../../src/host/testing/index.ts";
import {
  acme,
  badge,
  coreTeam,
  globex,
  guestBadge,
  guestSession,
  guestTeam,
  mainSession,
  wallBadge,
  workspaceSetup,
} from "./machine.ts";
import { Identity, IdentityFake } from "./server.ts";

/**
 * The workspace app over its identity fake, with no steps yet: every session Story starts here.
 */
export const workspaceStory = (id: string) =>
  Story.app(workspaceSetup, { id, fixtures: [IdentityFake] });

const signInAda = { _tag: "SignIn", user: "ada" } as const;
const signInBob = { _tag: "SignIn", user: "bob" } as const;
const signOut = { _tag: "SignOut" } as const;
const retry = { _tag: "Retry" } as const;
const giveUp = { _tag: "GiveUp" } as const;
const ping = { _tag: "Ping" } as const;
const acmeName = { _tag: "Rename", name: "Acme" } as const;
const globexName = { _tag: "Rename", name: "Globex" } as const;
const coreName = { _tag: "Rename", name: "Core" } as const;
const guestsName = { _tag: "Rename", name: "Guests" } as const;

// Both trees, four layers deep: organisations, sessions, teams and a badge on each team.
const trees = (id: string) =>
  workspaceStory(id)
    .ensure(acme)
    .ensure(globex)
    .ensure(mainSession)
    .ensure(guestSession)
    .ensure(coreTeam)
    .ensure(guestTeam)
    .ensure(badge)
    .ensure(guestBadge);

/**
 * Two organisations, each the root of a tree four layers deep: Ada signs in to Acme's session and
 * Bob to the guest session, which its ref puts in Globex; the core team follows the main session
 * and the guests' team, by its ref, the guest session; one badge on each team. The tab reloads,
 * and every consumer restored from its record is bound to the provider its ref gave, at every
 * depth; then the guests' team is renamed and only its badge hears it.
 */
export const usual = trees("session/usual")
  .send(acme, acmeName)
  .send(globex, globexName)
  .send(mainSession, signInAda)
  .send(guestSession, signInBob)
  .send(coreTeam, coreName)
  .send(guestTeam, guestsName)
  .checkpoint("bound")
  .reload({ reattach: false })
  .send(badge, ping)
  .send(guestBadge, ping)
  .checkpoint("restored")
  .send(guestTeam, { _tag: "Rename", name: "Visitors" })
  .checkpoint("renamed");

const WALL = 24;

const wall = Array.from({ length: WALL }, (_, n) => wallBadge(n));

/**
 * A wall of 24 badges on the core team, fanned out from one provider: the team is renamed, the tab
 * reloads, and every badge restored from its record shows the new name.
 */
export const fanOut = wall
  .reduce((s, b) => s.ensure(b), trees("session/fan-out").send(coreTeam, coreName))
  .send(coreTeam, { _tag: "Rename", name: "Platform" })
  .checkpoint("renamed")
  .reload({ reattach: false })
  .send(wallBadge(0), ping)
  .send(wallBadge(WALL - 1), ping)
  .checkpoint("restored");

/**
 * The middle of a tree under live descendants: the main session is closed while its team and that
 * team's badge are live. Built on call and kept out of `stories`: the Runtime refuses the close, so
 * every runner's run would reject.
 */
export const parentUnderChildren = () =>
  trees("session/parent-under-children")
    .send(mainSession, signInAda)
    .send(coreTeam, coreName)
    .dispose(mainSession);

/**
 * Display names on both sides of a string's 262,144-byte bound. Ada's, at the bound, is saved;
 * Bob's, one byte past it, cannot be: the guest session's record keeps its last good capture, and a
 * reload brings it back, with its unsure sign-in given up. With short names again, Bob signs in
 * and is saved.
 */
export const longNames = workspaceStory("session/long-names")
  .ensure(mainSession)
  .ensure(guestSession)
  .world(Identity.names({ chars: 262_144 }))
  .send(mainSession, signInAda)
  .checkpoint("at bound")
  .world(Identity.names({ chars: 262_145 }))
  .send(guestSession, signInBob)
  .checkpoint("past bound")
  .reload()
  .checkpoint("reloaded")
  .send(guestSession, giveUp)
  .world(Identity.names({ chars: 0 }))
  .send(guestSession, signInBob)
  .checkpoint("signed in");

const round = (story: ReturnType<typeof workspaceStory>, n: number) => {
  const next = story
    .send(acme, { _tag: "Rename", name: `Acme ${n}` })
    .send(mainSession, signInAda)
    .world(Identity.signIn.hold())
    .send(guestSession, signInBob)
    .send(coreTeam, { _tag: "Rename", name: `Core ${n}` })
    .send(wallBadge(n % WALL), ping)
    .advance("300 millis")
    .world(Identity.signIn.lose())
    .send(guestSession, retry)
    .world(Identity.lock({ user: "ada" }))
    .send(mainSession, signInAda)
    .world(Identity.unlock({ user: "ada" }))
    .send(guestTeam, { _tag: "Rename", name: `Guests ${n}` })
    .send(guestSession, signOut)
    .world(Identity.signIn.drop({ at: "response" }))
    .send(guestSession, signInBob)
    .send(guestSession, giveUp)
    .advance("2 seconds");

  return n % 2 === 1 ? next.reload() : next;
};

/**
 * Twenty rounds over both trees and the wall of badges: renames at every layer, sign-ins held,
 * lost, retried, refused and dropped, and a reload every second round.
 */
export const stress = Array.from({ length: 20 }, (_, n) => n)
  .reduce(
    round,
    wall.reduce((s, b) => s.ensure(b), trees("session/stress")),
  )
  .checkpoint("end");

/**
 * Nine rounds over both trees and the wall, for the bench.
 */
export const long = Array.from({ length: 9 }, (_, n) => n)
  .reduce(
    round,
    wall.reduce((s, b) => s.ensure(b), trees("session/long")),
  )
  .checkpoint("end");

const sessionSamples = (names: {
  readonly past: ReadonlyArray<ReturnType<typeof Identity.names>>;
  readonly under: ReadonlyArray<ReturnType<typeof Identity.names>>;
}) =>
  samplesOf({
    id: "session",
    story: workspaceStory("session/samples"),
    names: { setup: "workspaceSetup", fixtures: ["IdentityFake"] },
    actors: { acme, globex, mainSession, guestSession, coreTeam, guestTeam, badge, guestBadge },
    servers: { Identity },
    failures: [Identity.lock({ user: "ada" }), ...names.past],
    landedFailures: [],
    values: {
      signInAda,
      signInBob,
      signOut,
      retry,
      giveUp,
      ping,
      acmeName,
      globexName,
      coreName,
      guestsName,
    },
    controls: [Identity.unlock({ user: "ada" }), ...names.under, Identity.names({ chars: 0 })],
    steps: (story) =>
      story
        .send(acme, acmeName)
        .send(globex, globexName)
        .send(mainSession, signInAda)
        .send(guestSession, signInBob)
        .send(mainSession, signOut)
        .send(guestSession, retry)
        .send(guestSession, giveUp)
        .send(coreTeam, coreName)
        .send(guestTeam, guestsName)
        .send(badge, ping)
        .send(guestBadge, ping),
  });

/**
 * What the organisations, sessions, teams and badges and the identity provider can do, for
 * generated runs: rename at every layer, sign in, out, retry and give up, and ping; the provider
 * locks a user or returns empty display names, and heals.
 */
export const samples = sessionSamples({ past: [], under: [] });

/**
 * The samples with the display names' edge values, for the stress runs: names at a string's
 * 262,144-byte bound and one byte past it.
 */
export const stressSamples = sessionSamples({
  past: [Identity.names({ chars: 262_145 })],
  under: [Identity.names({ chars: 262_144 })],
});

/**
 * A stress run from seed 36, printed by the generator and pasted here. The reload sweep and the
 * bench run it as any Story.
 */
export const seededStress = Story.app(workspaceSetup, {
  id: "session/stress-36",
  fixtures: [IdentityFake],
})
  .world(Identity.lock({ user: "ada" }))
  .ensure(acme)
  .world(Fake.storage.hold())
  .ensure(globex)
  .ensure(mainSession)
  .ensure(guestSession)
  .ensure(coreTeam)
  .ensure(guestTeam)
  .ensure(badge)
  .ensure(guestBadge)
  .send(mainSession, signInAda)
  .send(guestBadge, ping)
  .send(coreTeam, coreName)
  .world(Identity.names({ chars: 0 }))
  .send(acme, acmeName)
  .send(guestSession, signInBob)
  .send(guestBadge, ping)
  .send(guestBadge, ping)
  .send(guestBadge, ping)
  .reload({ reattach: false })
  .send(guestSession, retry)
  .send(mainSession, signInAda)
  .send(guestSession, retry)
  .send(acme, acmeName)
  .send(globex, globexName)
  .send(guestTeam, guestsName)
  .send(guestSession, retry)
  .send(guestBadge, ping)
  .send(mainSession, signInAda)
  .send(guestSession, signInBob)
  .world(Fake.network.offline())
  .send(acme, acmeName)
  .world(Fake.storage.refuse())
  .dispose(mainSession, { how: "forget" })
  .world(Identity.unlock({ user: "ada" }))
  .send(guestSession, giveUp)
  .send(mainSession, signOut)
  .advance("20 millis")
  .disposeRuntime()
  .reload()
  .advance("7 millis")
  .send(guestSession, signInBob)
  .advance("20 millis")
  .send(guestTeam, guestsName)
  .advance("3 millis")
  .send(guestSession, retry)
  .send(guestSession, giveUp)
  .advance("16 millis")
  .send(guestBadge, ping)
  .send(globex, globexName)
  .send(guestBadge, ping)
  .send(guestSession, signInBob)
  .send(mainSession, signOut)
  .send(coreTeam, coreName)
  .send(coreTeam, coreName)
  .send(globex, globexName)
  .send(guestBadge, ping)
  .advance("5 millis")
  .send(globex, globexName)
  .advance("2 millis")
  .send(guestSession, giveUp)
  .advance("17 millis")
  .send(globex, globexName)
  .send(mainSession, signInAda)
  .send(globex, globexName)
  .advance("18 millis")
  .send(badge, ping)
  .send(guestSession, signInBob)
  .send(globex, globexName)
  .send(coreTeam, coreName)
  .send(guestSession, retry)
  .send(coreTeam, coreName)
  .reload({ reattach: false })
  .advance("4 millis")
  .send(guestSession, signInBob)
  .advance("10 millis")
  .send(mainSession, signInAda)
  .send(coreTeam, coreName)
  .send(guestSession, giveUp)
  .send(mainSession, signInAda)
  .send(guestBadge, ping)
  .send(badge, ping)
  .send(badge, ping)
  .send(mainSession, signInAda)
  .send(coreTeam, coreName)
  .send(coreTeam, coreName)
  .send(mainSession, signInAda)
  .send(guestTeam, guestsName)
  .advance("20 millis")
  .send(guestSession, giveUp)
  .send(mainSession, signInAda)
  .send(guestBadge, ping)
  .send(guestSession, giveUp)
  .advance("15 millis")
  .send(acme, acmeName)
  .send(guestBadge, ping)
  .send(guestSession, giveUp)
  .advance("8 millis")
  .send(guestSession, retry)
  .send(badge, ping)
  .advance("7 millis")
  .send(guestSession, signInBob)
  .send(guestTeam, guestsName)
  .send(mainSession, signOut)
  .advance("15 millis")
  .send(guestSession, giveUp)
  .advance("15 millis")
  .send(globex, globexName)
  .advance("56438 millis")
  .world(Fake.network.online())
  .advance("2 minutes")
  .advance("2 minutes");

/**
 * Every Story of the fixture, by name.
 */
export const stories = {
  usual,
  fanOut,
  longNames,
  stress,
  long,
  seededStress,
};
