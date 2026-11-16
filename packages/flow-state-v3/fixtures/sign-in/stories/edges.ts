import { blankSession } from "../app.ts";
import { screen } from "../machine.ts";
import { sessionStory } from "./usual.ts";

// The bytes `{"email":""}` adds around an email in its key's canonical text.
const KEY_FRAME = 12;

const KEY_BOUND = 8192;

/**
 * A session with an empty email.
 */
export const emptyEmail = sessionStory("sign-in/empty-email")
  .ensure(blankSession)
  .checkpoint("opened");

/**
 * A code of no characters is entered.
 */
export const emptyCode = sessionStory("sign-in/empty-code")
  .ensure(screen)
  .send(screen, { _tag: "Email", email: "elif@kamp.us" })
  .send(screen, { _tag: "Code", code: "" })
  .checkpoint("entered");

/**
 * An email whose begin key's canonical text is exactly the 8,192-byte key bound.
 */
export const emailAtBound = sessionStory("sign-in/email-at-bound")
  .ensure(screen)
  .send(screen, { _tag: "Email", email: "e".repeat(KEY_BOUND - KEY_FRAME) })
  .checkpoint("sent");
