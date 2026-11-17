import { blankSession, screen } from "../app.ts";
import { sessionStory } from "./usual.ts";

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
