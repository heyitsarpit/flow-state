import { deviceOf, mainSession, screenOf, sessionOf } from "../app.ts";
import { CODE } from "../server/auth.ts";
import { Profiles } from "../server/profiles.ts";
import { dateAt } from "./edges.ts";
import { elifSaved, sessionStory, signedIn, trustedStory } from "./usual.ts";

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
 * 16 accounts with saved handles sign in; the tab reloads twice.
 */
export const manySessions = SCREENS.reduce(
  (story, n) =>
    story
      .world(Profiles.saved({ email: `user${String(n)}@kamp.us`, handle: `user${String(n)}` }))
      .ensure(sessionOf(n))
      .send(sessionOf(n), { _tag: "SignedIn" }),
  sessionStory("sign-in/stress-many-sessions"),
)
  .reload()
  .reload()
  .checkpoint("end");

/**
 * One screen locks out after six wrong codes; the tab reloads during the lockout.
 */
export const reloadInLockout = Array.from({ length: 6 }, (_, n) => n)
  .reduce(
    (story) => story.send(screenOf(0), wrong),
    sessionStory("sign-in/reload-in-lockout").ensure(screenOf(0)).send(screenOf(0), emailOf(0)),
  )
  .checkpoint("locked")
  .reload()
  .checkpoint("reloaded");

const DEVICES = Array.from({ length: 16 }, (_, n) => n);

const HOUR_MS = 3_600_000;

/**
 * The `n`th device's trust ends `n` hours after the epoch.
 */
export const untilOf = (n: number) => dateAt(n * HOUR_MS);

/**
 * One session and 16 devices bound to it (S2 × 16, a first guess until the bench re-measures it);
 * Elif signs in, each device is trusted until its own date, and the tab reloads twice (L4).
 */
export const manyDevices = DEVICES.reduce(
  (story, n) =>
    story.send(deviceOf(n), { _tag: "Trust", until: untilOf(n), label: `device ${String(n)}` }),
  DEVICES.reduce(
    (story, n) => story.ensure(deviceOf(n)),
    trustedStory("sign-in/stress-many-devices").world(elifSaved).ensure(mainSession),
  ).send(mainSession, signedIn),
)
  .reload()
  .reload()
  .checkpoint("end");
