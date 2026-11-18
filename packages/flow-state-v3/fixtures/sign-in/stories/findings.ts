import { Fake } from "../../../src/host/testing/index.ts";
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

/**
 * A lane record of Elif's session for its `me` read, Held with an Attempt, as a damaged disk or a
 * bad copy could leave it: a read keeps no lane, so no release writes one.
 */
export const readLane = {
  key: 'lane/Auth/Session/{"email":"elif@kamp.us"}|Auth/me|{"email":"elif@kamp.us"}',
  text: '{"attempt":"att-000000000000000000006d61696e3a31-1","digest":"8642c4c0","displaced":[],"format":4,"inFlight":false,"input":{"email":"elif@kamp.us"},"queue":[],"retryCount":0}',
} as const;

/**
 * Elif signs in; then the store holds a lane record for her session's read, and the tab reloads
 * and ensures the session: the record is set aside and reported, and no read is held.
 */
export const readOperationLane = choosing("sign-in/read-operation-lane")
  .world(Fake.storage.put(readLane.key, readLane.text))
  .reload({ reattach: false })
  .checkpoint("booted")
  .ensure(mainSession)
  .checkpoint("restored");
