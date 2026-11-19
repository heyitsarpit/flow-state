import { Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";
import { blankSession, deviceOf, mainSession, screen } from "../app.ts";
import { SignIn } from "../machines/sign-in.ts";
import { TrustedDevice } from "../machines/trusted-device.ts";
import { elifSaved, sessionStory, signedIn, trustedStory } from "./usual.ts";

/**
 * A date at milliseconds from the epoch, decoded by its Schema.
 */
export const dateAt = Schema.decodeSync(Schema.DateFromMillis);

// An email well past any real address.
const LONG_EMAIL = 100_000;

/**
 * The key of a device link held on Elif's session, an operation an earlier release of the app had.
 */
export const RETIRED_LINK =
  'lane/Auth/Session/{"email":"elif@kamp.us"}|linkDevice|{"device":"phone"}';

const retiredLink =
  '{"attempt":"att-0-1","displaced":[],"format":3,"inFlight":false,' +
  '"input":{"device":"phone"},"machine":"Auth/Session","name":"{\\"email\\":\\"elif@kamp.us\\"}",' +
  '"operation":"linkDevice","queue":[],"retryCount":0}';

/**
 * An earlier release linked devices to a session, an operation and contract this one no longer
 * has, and left a link held on Elif's session; she signs out, so the app forgets her session, and
 * the tab reloads.
 */
export const signOutRetiredLink = sessionStory("sign-in/sign-out-retired-link")
  .world(Fake.storage.put(RETIRED_LINK, retiredLink))
  .reload()
  .checkpoint("booted")
  .ensure(mainSession)
  .dispose(mainSession, { how: "forget" })
  .checkpoint("signed out")
  .reload()
  .checkpoint("reloaded");

/**
 * A session with an empty email is opened, and the screen is sent an empty email.
 */
export const emptyEmail = sessionStory("sign-in/empty-email")
  .ensure(blankSession)
  .checkpoint("opened")
  .ensure(screen)
  .send(screen, SignIn.E.Email({ email: "" }))
  .checkpoint("sent");

/**
 * A code of no characters is entered.
 */
export const emptyCode = sessionStory("sign-in/empty-code")
  .ensure(screen)
  .send(screen, SignIn.E.Email({ email: "elif@kamp.us" }))
  .send(screen, SignIn.E.Code({ code: "" }))
  .checkpoint("entered");

/**
 * An email of 100,000 characters, the begin key.
 */
export const longEmail = sessionStory("sign-in/long-email")
  .ensure(screen)
  .send(screen, SignIn.E.Email({ email: "e".repeat(LONG_EMAIL) }))
  .checkpoint("sent");

/**
 * The earliest date a `Date` holds, 8.64e15 ms before the epoch.
 */
export const EARLIEST = dateAt(-8.64e15);

/**
 * The latest date a `Date` holds, 8.64e15 ms after the epoch.
 */
export const LATEST = dateAt(8.64e15);

/**
 * The epoch.
 */
export const EPOCH = dateAt(0);

/**
 * Three devices trusted until the epoch with no label, the latest date with a label of
 * `undefined`, and the earliest date with an empty label; one is seen at no time, one at the
 * latest date; the tab reloads.
 */
export const deviceDateEdges = trustedStory("sign-in/device-date-edges")
  .world(elifSaved)
  .ensure(mainSession)
  .ensure(deviceOf(0))
  .ensure(deviceOf(1))
  .ensure(deviceOf(2))
  .send(mainSession, signedIn)
  .send(deviceOf(0), TrustedDevice.E.Trust({ until: EPOCH }))
  .send(deviceOf(1), TrustedDevice.E.Trust({ until: LATEST, label: undefined }))
  .send(deviceOf(2), TrustedDevice.E.Trust({ until: EARLIEST, label: "" }))
  .send(deviceOf(0), TrustedDevice.E.Seen({ at: null }))
  .send(deviceOf(1), TrustedDevice.E.Seen({ at: LATEST }))
  .checkpoint("trusted")
  .reload()
  .checkpoint("reloaded");
