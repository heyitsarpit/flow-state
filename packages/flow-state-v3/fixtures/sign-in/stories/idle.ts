import { samplesOf, Story } from "../../../src/host/testing/index.ts";
import { authIdleSetup, idleOf, mainIdle } from "../app.ts";
import { AuthSession } from "../machines/session.ts";
import { Profiles } from "../server/profiles.ts";
import { AuthFake, ProfileFake } from "../server/layer.ts";

const ELIF = "elif@kamp.us";

/**
 * The sign-in app over its port fakes, Elif's account holding a saved handle, so signing in at
 * clock 0 lands signed in and starts her session's idle wait.
 */
export const idleStory = (id: string) =>
  Story.app(authIdleSetup, { id, fixtures: [AuthFake, ProfileFake] })
    .world(Profiles.saved({ email: ELIF, handle: "elif" }))
    .ensure(mainIdle)
    .send(mainIdle, AuthSession.E.SignedIn());

const activity = (report: string) => AuthSession.E.Activity({ report });

const policy = (idleMs: number) => AuthSession.E.PolicyLoaded({ idleMs });

/**
 * Activity ten minutes in starts the fifteen-minute wait again; fifteen idle minutes later the
 * session is signed out, and signing in again starts a new wait.
 */
export const idleUsual = idleStory("sign-in/idle-usual")
  .checkpoint("started")
  .advance("10 minutes")
  .send(mainIdle, activity("1"))
  .checkpoint("active")
  .advance("15 minutes")
  .checkpoint("signed out")
  .send(mainIdle, AuthSession.E.SignedIn())
  .checkpoint("signed in again");

/**
 * The sign-out that never comes back: a playing video stops the wait, one activity report arrives
 * unreadable, the page reloads, and the user is active again. Right ending: the wait starts again
 * and the session is signed out fifteen minutes later. Wrong ending: the reload forgets the count
 * the page last read, the next count is taken as a first reading, and the session is never signed
 * out, with no issue shown.
 */
export const idleNeverReturns = idleStory("sign-in/idle-never-returns")
  .advance("1 minute")
  .send(mainIdle, AuthSession.E.VideoStarted())
  .checkpoint("watching")
  .send(mainIdle, activity("2,"))
  .checkpoint("unreadable")
  .reload()
  .ensure(mainIdle)
  .checkpoint("reloaded")
  .send(mainIdle, activity("2"))
  .checkpoint("active again")
  .advance("15 minutes")
  .checkpoint("signed out");

/**
 * A policy longer than the longest timer: the next activity's wait is refused with an issue,
 * which stands across a reload, and the next policy starts the wait.
 */
export const idlePolicyRefused = idleStory("sign-in/idle-policy-refused")
  .send(mainIdle, policy(2 ** 31))
  .checkpoint("policy")
  .advance("1 minute")
  .send(mainIdle, activity("1"))
  .checkpoint("refused")
  .reload()
  .ensure(mainIdle)
  .checkpoint("reloaded")
  .send(mainIdle, policy(1_800_000))
  .checkpoint("valid")
  .advance("30 minutes")
  .checkpoint("signed out");

/**
 * A refused wait's issue goes when the session leaves the active state: signing out takes it.
 */
export const idleRefusedSignOut = idleStory("sign-in/idle-refused-sign-out")
  .send(mainIdle, policy(2 ** 31))
  .send(mainIdle, activity("1"))
  .checkpoint("refused")
  .send(mainIdle, AuthSession.E.SignOut())
  .checkpoint("signed out");

/**
 * A policy past the longest timer loaded before Elif signs in: the sign-in's account read is an
 * operation's outcome, so its turn commits with the idle wait refused and its issue (Schedules
 * R11); ten minutes later a valid policy starts the wait.
 */
export const idleSignInRefused = Story.app(authIdleSetup, {
  id: "sign-in/idle-sign-in-refused",
  fixtures: [AuthFake, ProfileFake],
})
  .world(Profiles.saved({ email: ELIF, handle: "elif" }))
  .ensure(mainIdle)
  .send(mainIdle, policy(2 ** 31))
  .send(mainIdle, AuthSession.E.SignedIn())
  .checkpoint("refused")
  .advance("10 minutes")
  .send(mainIdle, policy(60_000))
  .checkpoint("later");

/**
 * How many sessions the load Story idles: a first guess, to be measured on the bench.
 */
export const SESSIONS = 16;

const sessions = Array.from({ length: SESSIONS }, (_, n) => idleOf(n));

const ensured = (story: ReturnType<typeof idleStory>) =>
  sessions.reduce((s, ref) => s.ensure(ref), story);

// Each of the many accounts holds a saved handle and signs in at clock 0.
const signedIn = (story: ReturnType<typeof idleStory>) =>
  sessions.reduce(
    (s, ref, n) =>
      s
        .world(Profiles.saved({ email: `user${String(n)}@kamp.us`, handle: `user${String(n)}` }))
        .send(ref, AuthSession.E.SignedIn()),
    ensured(story),
  );

/**
 * Many sessions idle at once, each with its own wait, through two reloads, all signed out together
 * when their waits end (S3 × 16 sessions under L1 and L4).
 */
export const idleManySessions = ensured(
  ensured(signedIn(idleStory("sign-in/idle-many-sessions")).advance("5 minutes").reload()).reload(),
)
  .checkpoint("reloaded")
  .advance("10 minutes")
  .checkpoint("signed out");

/**
 * What the tabs and the organisation can do around the idle sign-out, for generated runs: counts
 * read, repeated, unreadable and empty; policies of −1 and 0 ms, a minute, the longest timer and
 * past it; a
 * video, a sign-out and a sign-in again.
 */
export const idleSamples = samplesOf({
  id: "auth-idle",
  story: idleStory("auth-idle/samples"),
  names: { setup: "authIdleSetup", fixtures: ["AuthFake", "ProfileFake"] },
  actors: { mainIdle },
  servers: {},
  failures: [],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(mainIdle, activity("1"))
      .send(mainIdle, activity("1"))
      .send(mainIdle, activity("2,"))
      .send(mainIdle, activity(""))
      .send(mainIdle, policy(-1))
      .send(mainIdle, policy(0))
      .send(mainIdle, policy(60_000))
      .send(mainIdle, policy(2 ** 31 - 1))
      .send(mainIdle, policy(2 ** 31))
      .send(mainIdle, AuthSession.E.VideoStarted())
      .send(mainIdle, AuthSession.E.SignOut())
      .send(mainIdle, AuthSession.E.SignedIn()),
});

/**
 * Every named Story of the idle sign-out.
 */
export const idleStories = {
  idleUsual,
  idleNeverReturns,
  idlePolicyRefused,
  idleRefusedSignOut,
  idleSignInRefused,
  idleManySessions,
};
