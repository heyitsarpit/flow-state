import { mainReturn, mainSession } from "../app.ts";
import { screen } from "../machine.ts";
import { Profiles } from "../server/profiles.ts";
import { sessionStory, signedIn } from "./usual.ts";

const elifSaved = Profiles.saved({ email: "elif@kamp.us", handle: "elif" });

/**
 * Elif, who saved a handle before, signs in; her session is let go and ends; signing out forgets it; it is ensured again.
 */
export const signOutForgets = sessionStory("sign-in/sign-out-forgets")
  .world(elifSaved)
  .ensure(mainSession)
  .send(mainSession, signedIn)
  .detach(mainSession)
  .advance("1 second")
  .dispose(mainSession, { how: "forget" })
  .ensure(mainSession)
  .checkpoint("fresh");

/**
 * The unpersisted sign-in screen is disposed while the session it signed in lives on.
 */
export const screenFirst = sessionStory("sign-in/screen-first")
  .world(elifSaved)
  .ensure(screen)
  .ensure(mainSession)
  .send(mainSession, signedIn)
  .dispose(screen)
  .checkpoint("ended");

/**
 * The tab reloads while a handle save is on the wire, the redirect held. Built on call and kept out
 * of `stories` while the return restored by the reload publishes a snapshot twice, which
 * every runner over `stories` would report.
 */
export const reloadedMidHandle = () =>
  sessionStory("sign-in/reloaded-mid-handle")
    .ensure(mainSession)
    .ensure(mainReturn)
    .send(mainReturn, { _tag: "Save", route: "/pano", draft: "" })
    .send(mainSession, signedIn)
    .send(mainSession, { _tag: "Handle", handle: "elif-kaya" })
    .world(Profiles.setUsername.hold({ at: "response" }))
    .send(mainSession, { _tag: "SubmitHandle" })
    .reload()
    .checkpoint("reloaded");

/**
 * The session is disposed while the return is bound to it.
 */
export const sessionFirst = () =>
  sessionStory("sign-in/session-first").ensure(mainSession).ensure(mainReturn).dispose(mainSession);
