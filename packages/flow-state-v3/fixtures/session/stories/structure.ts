import { Fake, Story } from "../../../src/host/testing/index.ts";
import { mainAvatar, mainByline, teamStatus, workspaceGrownSetup } from "../app.ts";
import {
  acme,
  badge,
  coreTeam,
  globex,
  guestBadge,
  guestSession,
  guestTeam,
  mainSession,
} from "../app.ts";
import { BadgeMachine } from "../machines/badge.ts";
import { actorRef } from "../../../src/index.ts";
import { Identity } from "../server/identity.ts";
import { IdentityFake } from "../server/layer.ts";

/**
 * The grown workspace over its identity fake, with no steps yet.
 */
export const grownStory = (id: string) =>
  Story.app(workspaceGrownSetup, { id, fixtures: [IdentityFake] });

const signInAda = { _tag: "SignIn", user: "ada" } as const;

const shell = (id: string) =>
  grownStory(id).ensure(acme).ensure(mainSession).ensure(coreTeam).ensure(badge);

/**
 * Ada's sign-in is on the wire while the shell's team and badge are already shown.
 */
export const shellBeforeSession = grownStory("session/shell-before-session")
  .world(Identity.signIn.hold({ at: "response" }))
  .ensure(acme)
  .ensure(mainSession)
  .send(mainSession, signInAda)
  .ensure(coreTeam)
  .ensure(badge)
  .checkpoint("pending")
  .world(Identity.signIn.release())
  .checkpoint("settled");

/**
 * Ada signs in and names the team; she signs out on a shared computer, which disposes the Runtime
 * with forget; the next account's tab opens and Bob signs in.
 */
export const newAccountRuntime = shell("session/new-account-runtime")
  .send(mainSession, signInAda)
  .send(coreTeam, { _tag: "Rename", name: "Core" })
  .disposeRuntime({ forget: true })
  .reload({ reattach: false })
  .ensure(mainSession)
  .ensure(coreTeam)
  .checkpoint("next")
  .send(mainSession, { _tag: "SignIn", user: "bob" })
  .checkpoint("bob");

/**
 * The store refuses the team's rename; a second rename is the next publication.
 */
export const refusedWriteRetries = shell("session/refused-write-retries")
  .world(Fake.storage.refuse())
  .send(coreTeam, { _tag: "Rename", name: "Core" })
  .checkpoint("refused")
  .send(coreTeam, { _tag: "Rename", name: "Platform" })
  .reload()
  .checkpoint("reloaded");

/**
 * The team is named; the store fails to load at the reload, and a rename then is saved nowhere;
 * a healthy reload after it.
 */
export const refusedLoadKeepsData = shell("session/refused-load-keeps-data")
  .send(coreTeam, { _tag: "Rename", name: "Core" })
  .world(Fake.storage.refuseLoad())
  .reload()
  .checkpoint("unloaded")
  .send(coreTeam, { _tag: "Rename", name: "Other" })
  .reload()
  .checkpoint("healed");

/**
 * Every layer is closed from the badge up.
 */
export const childFirst = shell("session/child-first")
  .send(mainSession, signInAda)
  .dispose(badge)
  .dispose(coreTeam)
  .dispose(mainSession)
  .dispose(acme)
  .checkpoint("closed");

/**
 * The badge is let go and ends after its grace, then the team is forgotten; the badge, ensured
 * again, reads a fresh team.
 */
export const teamForgotten = shell("session/team-forgotten")
  .send(coreTeam, { _tag: "Rename", name: "Core" })
  .detach(badge)
  .advance("1 second")
  .dispose(coreTeam, { how: "forget" })
  .ensure(badge)
  .checkpoint("fresh");

/**
 * Ada signs in and out under the team.
 */
export const signedOutUndefined = shell("session/signed-out-undefined")
  .send(mainSession, signInAda)
  .send(mainSession, { _tag: "SignOut" })
  .checkpoint("signed out");

/**
 * Ada signs in and out under the team and the header avatar, then the tab reloads.
 */
export const signedOutReloaded = shell("session/signed-out-reloaded")
  .ensure(mainAvatar)
  .send(mainSession, signInAda)
  .send(mainSession, { _tag: "SignOut" })
  .checkpoint("signed out")
  .reload()
  .checkpoint("reloaded");

/**
 * The byline is let go and ends after its grace; while it is gone Ada signs out and the team is
 * renamed; it comes back, then the tab reloads and it comes back again.
 */
export const bylineReturns = shell("session/byline-returns")
  .ensure(mainByline)
  .send(mainSession, signInAda)
  .send(coreTeam, { _tag: "Rename", name: "Core" })
  .checkpoint("shown")
  .detach(mainByline)
  .advance("1 second")
  .send(mainSession, { _tag: "SignOut" })
  .send(coreTeam, { _tag: "Rename", name: "Platform" })
  .checkpoint("gone")
  .ensure(mainByline)
  .checkpoint("returned")
  .reload()
  .checkpoint("reloaded");

/**
 * The badge is shown on the core team, then its ref is ensured again naming the guests' team.
 * Built on call: the Runtime refuses the second ensure, so every runner's run would reject.
 */
export const conflictingBadge = () =>
  shell("session/conflicting-badge").ensure(
    actorRef(BadgeMachine, "badge", { context: { team: guestTeam } }),
  );

/**
 * A status line whose ref names no team is ensured.
 */
export const missingTeam = () => grownStory("session/missing-team").ensure(teamStatus);

/**
 * Bob signs in; the guests' badge is shown before the guests' team is opened, so the team starts as
 * the badge's provider; then the team is opened by its own ref.
 */
export const guestBadgeFirst = grownStory("session/guest-badge-first")
  .ensure(globex)
  .ensure(guestSession)
  .send(guestSession, { _tag: "SignIn", user: "bob" })
  .ensure(guestBadge)
  .checkpoint("badge")
  .ensure(guestTeam)
  .checkpoint("team");
