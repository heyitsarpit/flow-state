import { Fake, samplesOf, Story } from "../../../src/host/testing/index.ts";
import { authGrownSetup, authSetup, mainReturn, mainSession, screen } from "../app.ts";
import { Auth, CODE } from "../server/auth.ts";
import { AuthFake, ProfileFake } from "../server/layer.ts";
import { Profiles } from "../server/profiles.ts";

/**
 * The grown sign-in app over its port fakes, with no steps yet: every Story of the session and the
 * return starts here.
 */
export const sessionStory = (id: string) =>
  Story.app(authGrownSetup, { id, fixtures: [AuthFake, ProfileFake] });

/**
 * The account signs in on the screen, and the view tells its session.
 */
export const signedIn = { _tag: "SignedIn" } as const;

/**
 * Elif saves a draft and is sent to sign in; she signs up and chooses a handle that is taken, so
 * the redirect is held on the retry screen with her handle; a retry lands, the redirect is released
 * to the draft, and she submits it.
 */
export const handleRetry = sessionStory("sign-in/handle-retry")
  .ensure(mainSession)
  .ensure(mainReturn)
  .checkpoint("opened")
  .send(mainReturn, { _tag: "Save", route: "/sozluk/effect", draft: "merhaba" })
  .send(mainSession, signedIn)
  .send(mainSession, { _tag: "Handle", handle: "elif-kaya" })
  .world(Profiles.taken({}))
  .send(mainSession, { _tag: "SubmitHandle" })
  .checkpoint("stuck")
  .send(mainSession, { _tag: "Retry" })
  .checkpoint("released")
  .send(mainReturn, { _tag: "Submit" })
  .checkpoint("submitted");

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

const resend = { _tag: "Resend" } as const;

/**
 * A stress run from seed 36, printed by the generator and pasted here. The reload sweep and the
 * bench run it as any Story.
 */
export const seededStress = Story.app(authSetup, { id: "sign-in/stress-36", fixtures: [AuthFake] })
  .world(Auth.throttle({}))
  .world(Auth.verify.hold())
  .ensure(screen)
  .send(screen, resend)
  .send(screen, resend)
  .send(screen, wrong)
  .send(screen, email)
  .send(screen, right)
  .send(screen, resend)
  .send(screen, resend)
  .send(screen, resend)
  .reload({ reattach: false })
  .send(screen, wrong)
  .send(screen, right)
  .send(screen, wrong)
  .send(screen, resend)
  .send(screen, email)
  .send(screen, right)
  .send(screen, right)
  .send(screen, resend)
  .send(screen, right)
  .send(screen, right)
  .world(Fake.network.offline())
  .send(screen, resend)
  .dispose(screen, { how: "forget" })
  .send(screen, right)
  .send(screen, wrong)
  .advance("20 millis")
  .disposeRuntime()
  .reload()
  .advance("7 millis")
  .send(screen, wrong)
  .advance("20 millis")
  .send(screen, right)
  .advance("3 millis")
  .send(screen, email)
  .send(screen, resend)
  .advance("16 millis")
  .send(screen, resend)
  .send(screen, resend)
  .send(screen, right)
  .send(screen, wrong)
  .send(screen, right)
  .send(screen, resend)
  .send(screen, resend)
  .send(screen, right)
  .send(screen, email)
  .advance("5 millis")
  .send(screen, right)
  .advance("2 millis")
  .send(screen, resend)
  .advance("17 millis")
  .send(screen, right)
  .send(screen, right)
  .send(screen, right)
  .advance("18 millis")
  .send(screen, email)
  .send(screen, wrong)
  .send(screen, wrong)
  .send(screen, email)
  .send(screen, wrong)
  .send(screen, email)
  .reload({ reattach: false })
  .advance("4 millis")
  .send(screen, wrong)
  .advance("10 millis")
  .send(screen, resend)
  .send(screen, right)
  .send(screen, right)
  .send(screen, wrong)
  .send(screen, right)
  .send(screen, email)
  .send(screen, email)
  .send(screen, email)
  .send(screen, resend)
  .send(screen, wrong)
  .send(screen, email)
  .send(screen, right)
  .advance("20 millis")
  .send(screen, resend)
  .send(screen, resend)
  .send(screen, right)
  .send(screen, right)
  .advance("15 millis")
  .send(screen, email)
  .send(screen, right)
  .send(screen, right)
  .advance("8 millis")
  .send(screen, right)
  .send(screen, resend)
  .advance("7 millis")
  .send(screen, email)
  .send(screen, right)
  .send(screen, resend)
  .advance("15 millis")
  .send(screen, email)
  .advance("15 millis")
  .send(screen, email)
  .advance("56438 millis")
  .world(Fake.network.online())
  .advance("2 minutes")
  .world(Auth.verify.release())
  .advance("2 minutes")
  .advance("2 minutes");

/**
 * What a person and the auth server can do, for generated runs: give an email, a wrong or right
 * code, and ask again; the server throttles.
 */
export const samples = samplesOf({
  id: "sign-in",
  story: authStory("sign-in/samples"),
  names: { setup: "authSetup", fixtures: ["AuthFake"] },
  actors: { screen },
  servers: { Auth },
  failures: [Auth.throttle({})],
  landedFailures: [],
  values: { email, wrong, right, resend },
  controls: [],
  steps: (story) =>
    story
      .send(screen, email)
      .send(screen, wrong)
      .send(screen, right)
      .send(screen, right)
      .send(screen, resend),
});

/**
 * Every Story of the fixture, by name.
 */
export const stories = { usual, long, seededStress };
