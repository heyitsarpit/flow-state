import { mainSession } from "../app.ts";
import { AuthSession } from "../machines/session.ts";
import { Profiles } from "../server/profiles.ts";
import { sessionStory, signedIn } from "./usual.ts";

const choosing = (id: string) => sessionStory(id).ensure(mainSession).send(mainSession, signedIn);

/**
 * A new account clears the handle field and submits.
 */
export const blankHandle = choosing("sign-in/blank-handle")
  .send(mainSession, AuthSession.E.Handle({ handle: "" }))
  .send(mainSession, AuthSession.E.SubmitHandle())
  .checkpoint("submitted");

/**
 * A handle is submitted twice while the first save is on the wire.
 */
export const submitTwice = choosing("sign-in/submit-twice")
  .send(mainSession, AuthSession.E.Handle({ handle: "elif-kaya" }))
  .world(Profiles.setUsername.hold({ at: "response" }))
  .send(mainSession, AuthSession.E.SubmitHandle())
  .send(mainSession, AuthSession.E.SubmitHandle())
  .checkpoint("twice")
  .world(Profiles.setUsername.release())
  .checkpoint("landed");

/**
 * The prefilled handle is submitted unedited, then confirmed.
 */
export const unconfirmedPrefill = choosing("sign-in/unconfirmed-prefill")
  .send(mainSession, AuthSession.E.SubmitHandle())
  .checkpoint("asked")
  .send(mainSession, AuthSession.E.ConfirmHandle())
  .checkpoint("confirmed");
