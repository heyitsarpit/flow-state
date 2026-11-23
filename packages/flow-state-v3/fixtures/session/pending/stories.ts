import { Story } from "../../../src/host/testing/index.ts";
import { Shell, shell, shellSetup, Workspace, WorkspaceFake } from "./profile.ts";

const shellStory = (id: string) => Story.app(shellSetup, { id, fixtures: [WorkspaceFake] });

/**
 * The shell shows Ada's profile and teams; she renames herself elsewhere and refreshes, and the
 * shell reads her profile again.
 */
export const shellUsual = shellStory("session/shell-reads")
  .ensure(shell)
  .checkpoint("shown")
  .world(Workspace.renameUser({ user: "ada", name: "Ada L." }))
  .send(shell, Shell.E.Refresh())
  .checkpoint("refreshed");

/**
 * A team renamed shows its new name at once; the server's answer is written into the teams read.
 */
export const renameShownAtOnce = shellStory("session/rename-shown-at-once")
  .ensure(shell)
  .world(Workspace.rename.hold())
  .send(shell, Shell.E.Rename({ team: "core", name: "Platform" }))
  .checkpoint("renaming")
  .world(Workspace.rename.release())
  .checkpoint("renamed");

/**
 * A legacy rename answer leaves out the org, so its write into the teams read has no key: the write
 * applies nothing and is reported, and the rename still succeeds.
 */
export const invalidWrite = shellStory("session/invalid-write")
  .ensure(shell)
  .world(Workspace.legacy({}))
  .send(shell, Shell.E.Rename({ team: "core", name: "Platform" }))
  .checkpoint("renamed");

/**
 * Signing out clears the profile read; signing in again ten seconds later reads it again, though
 * a profile read then would still be fresh.
 */
export const signOutClears = shellStory("session/sign-out-clears")
  .ensure(shell)
  .send(shell, Shell.E.SignOut())
  .advance("10 seconds")
  .send(shell, Shell.E.SignIn())
  .checkpoint("signed in again");
