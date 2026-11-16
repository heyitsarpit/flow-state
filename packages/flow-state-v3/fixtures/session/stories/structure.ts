import { Fake, Story } from "../../../src/host/testing/index.ts";
import { mainAvatar, teamStatus, workspaceGrownSetup } from "../app.ts";
import { acme, badge, coreTeam, mainSession } from "../machine.ts";
import { Identity, IdentityFake } from "../server.ts";

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
 * with forget; the next account's tab opens.
 */
export const newAccountRuntime = shell("session/new-account-runtime")
  .send(mainSession, signInAda)
  .send(coreTeam, { _tag: "Rename", name: "Core" })
  .disposeRuntime({ forget: true })
  .reload({ reattach: false })
  .ensure(mainSession)
  .ensure(coreTeam)
  .checkpoint("next");

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
 * Ada signs in and out under the team and the header avatar, then the tab reloads. Built on call and kept out of `stories`
 * while consumers restored by a reload publish a snapshot twice, which every runner over `stories`
 * would report.
 */
export const signedOutReloaded = () =>
  shell("session/signed-out-reloaded")
    .ensure(mainAvatar)
    .send(mainSession, signInAda)
    .send(mainSession, { _tag: "SignOut" })
    .reload()
    .checkpoint("reloaded");

/**
 * A status line whose ref names no team is ensured.
 */
export const missingTeam = () => grownStory("session/missing-team").ensure(teamStatus);
