import { Story } from "../../src/host/testing/index.ts";
import { authSetup, screen } from "./machine.ts";
import { Auth, AuthFake, CODE } from "./server.ts";

/**
 * The sign-in app over its port fake, with no steps yet: every sign-in Story starts here.
 */
export const authStory = (id: string) => Story.app(authSetup, { id, fixtures: [AuthFake] });

const email = { _tag: "Email", email: "ada@example.com" } as const;

const wrong = { _tag: "Code", code: "000000" } as const;

const right = { _tag: "Code", code: CODE } as const;

/**
 * A user asks for a code, types a wrong one, resends into the cooldown, waits it out, signs in,
 * is throttled on the next request, and leaves and comes back.
 */
export const usual = authStory("sign-in/usual")
  .ensure(screen)
  .advance("3 seconds")
  .send(screen, email)
  .advance("4 seconds")
  .send(screen, wrong)
  .checkpoint("wrong")
  .advance("6 seconds")
  .send(screen, { _tag: "Resend" })
  .send(screen, { _tag: "Resend" })
  .checkpoint("cooling")
  .advance("30 seconds")
  .send(screen, right)
  .checkpoint("signed in")
  .world(Auth.throttle({}))
  .send(screen, email)
  .checkpoint("throttled")
  .detach(screen)
  .advance("5 seconds")
  .ensure(screen)
  .checkpoint("end");

type AuthStory = ReturnType<typeof authStory>;

const lockedOut = (story: AuthStory) =>
  Array.from({ length: 6 }, (_, n) => n)
    .reduce((s) => s.advance("4 seconds").send(screen, wrong), story)
    .advance("5 minutes")
    .send(screen, right);

const lostThenAgain = (story: AuthStory) =>
  story
    .world(Auth.verify.drop({ at: "response" }))
    .send(screen, right)
    .send(screen, email)
    .advance("4 seconds")
    .send(screen, right);

const resent = (story: AuthStory) =>
  story
    .send(screen, { _tag: "Resend" })
    .advance("30 seconds")
    .send(screen, wrong)
    .send(screen, right);

const round = (story: AuthStory, n: number) => {
  const started = story.advance("3 seconds").send(screen, email);
  const variants = [lockedOut, lostThenAgain, resent] as const;
  const next = variants[n % variants.length]?.(started) ?? started;

  return n % 3 === 2 ? next.dispose(screen).ensure(screen) : next;
};

/**
 * Nine sign-ins through a lockout, a lost answer and a resend, with the screen closed and opened
 * every third: about a hundred steps, for the bench.
 */
export const long = Array.from({ length: 9 }, (_, n) => n)
  .reduce(round, authStory("sign-in/long").ensure(screen))
  .checkpoint("end");

/**
 * Every Story of the fixture, by name.
 */
export const stories = { usual, long };
