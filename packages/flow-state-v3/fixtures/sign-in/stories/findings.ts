import { mainSession } from "../app.ts";
import { Profiles } from "../server/profiles.ts";
import { sessionStory, signedIn } from "./usual.ts";

const choosing = (id: string) => sessionStory(id).ensure(mainSession).send(mainSession, signedIn);

/**
 * A new account clears the handle field and submits.
 */
export const blankHandle = choosing("sign-in/blank-handle")
  .send(mainSession, { _tag: "Handle", handle: "" })
  .send(mainSession, { _tag: "SubmitHandle" })
  .checkpoint("submitted");

/**
 * A handle is submitted twice while the first save is on the wire.
 */
export const submitTwice = choosing("sign-in/submit-twice")
  .send(mainSession, { _tag: "Handle", handle: "elif-kaya" })
  .world(Profiles.setUsername.hold({ at: "response" }))
  .send(mainSession, { _tag: "SubmitHandle" })
  .send(mainSession, { _tag: "SubmitHandle" })
  .checkpoint("twice")
  .world(Profiles.setUsername.release())
  .checkpoint("landed");

/**
 * The prefilled handle is submitted unedited, then confirmed.
 */
export const unconfirmedPrefill = choosing("sign-in/unconfirmed-prefill")
  .send(mainSession, { _tag: "SubmitHandle" })
  .checkpoint("asked")
  .send(mainSession, { _tag: "ConfirmHandle" })
  .checkpoint("confirmed");
