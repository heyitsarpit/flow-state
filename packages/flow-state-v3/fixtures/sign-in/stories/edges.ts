import { Schema } from "effect";
import { blankSession, deviceOf, mainSession, screen } from "../app.ts";
import { elifSaved, sessionStory, signedIn, trustedStory } from "./usual.ts";

/**
 * A date at milliseconds from the epoch, decoded by its Schema.
 */
export const dateAt = Schema.decodeSync(Schema.DateFromMillis);

// An email well past any real address.
const LONG_EMAIL = 100_000;

/**
 * A session with an empty email is opened, and the screen is sent an empty email.
 */
export const emptyEmail = sessionStory("sign-in/empty-email")
  .ensure(blankSession)
  .checkpoint("opened")
  .ensure(screen)
  .send(screen, { _tag: "Email", email: "" })
  .checkpoint("sent");

/**
 * A code of no characters is entered.
 */
export const emptyCode = sessionStory("sign-in/empty-code")
  .ensure(screen)
  .send(screen, { _tag: "Email", email: "elif@kamp.us" })
  .send(screen, { _tag: "Code", code: "" })
  .checkpoint("entered");

/**
 * An email of 100,000 characters, the begin key.
 */
export const longEmail = sessionStory("sign-in/long-email")
  .ensure(screen)
  .send(screen, { _tag: "Email", email: "e".repeat(LONG_EMAIL) })
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
  .send(deviceOf(0), { _tag: "Trust", until: EPOCH })
  .send(deviceOf(1), { _tag: "Trust", until: LATEST, label: undefined })
  .send(deviceOf(2), { _tag: "Trust", until: EARLIEST, label: "" })
  .send(deviceOf(0), { _tag: "Seen", at: null })
  .send(deviceOf(1), { _tag: "Seen", at: LATEST })
  .checkpoint("trusted")
  .reload()
  .checkpoint("reloaded");
