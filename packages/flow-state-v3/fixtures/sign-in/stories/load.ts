import { screenOf, sessionOf } from "../app.ts";
import { CODE } from "../server.ts";
import { sessionStory } from "./usual.ts";

const SCREENS = Array.from({ length: 16 }, (_, n) => n);

const emailOf = (n: number) => ({ _tag: "Email", email: `user${String(n)}@kamp.us` }) as const;

const wrong = { _tag: "Code", code: "000000" } as const;

/**
 * 16 sign-in screens for different accounts; the first enters six wrong codes and locks out while
 * the second verifies and the rest wait for their codes.
 */
export const manyScreens = SCREENS.reduce(
  (story, n) => story.ensure(screenOf(n)).send(screenOf(n), emailOf(n)),
  sessionStory("sign-in/stress-many-screens"),
)
  .send(screenOf(0), wrong)
  .send(screenOf(0), wrong)
  .send(screenOf(1), { _tag: "Code", code: CODE })
  .send(screenOf(0), wrong)
  .send(screenOf(0), wrong)
  .send(screenOf(0), wrong)
  .send(screenOf(0), wrong)
  .checkpoint("end");

/**
 * 16 accounts' sessions signed in; the tab reloads twice.
 */
export const manySessions = SCREENS.reduce(
  (story, n) =>
    story
      .ensure(sessionOf(n))
      .send(sessionOf(n), { _tag: "SignedIn", refreshToken: `rt-${String(n)}`, isNew: false }),
  sessionStory("sign-in/stress-many-sessions"),
)
  .reload()
  .reload()
  .checkpoint("end");
