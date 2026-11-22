import { samplesOf, Story } from "../../../src/host/testing/index.ts";
import { authIdleSetup, idleOf, mainIdle } from "../app.ts";
import { IdleSignOut } from "../machines/idle-sign-out.ts";
import { AuthFake, ProfileFake } from "../server/layer.ts";

/**
 * The sign-in app with each session's idle sign-out over its port fakes, the main session's
 * idle sign-out started at clock 0.
 */
export const idleStory = (id: string) =>
  Story.app(authIdleSetup, { id, fixtures: [AuthFake, ProfileFake] }).ensure(mainIdle);

const activity = (report: string) => IdleSignOut.E.Activity({ report });

const policy = (idleMs: number) => IdleSignOut.E.PolicyLoaded({ idleMs });

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
  .send(mainIdle, IdleSignOut.E.SignInAgain())
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
  .send(mainIdle, IdleSignOut.E.VideoStarted())
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
  .send(mainIdle, IdleSignOut.E.SignOut())
  .checkpoint("signed out");

/**
 * How many sessions the load Story idles: a first guess, to be measured on the bench.
 */
export const SESSIONS = 16;

const sessions = Array.from({ length: SESSIONS }, (_, n) => idleOf(n));

const ensured = (story: ReturnType<typeof idleStory>) =>
  sessions.reduce((s, ref) => s.ensure(ref), story);

/**
 * Many sessions idle at once, each with its own wait, through two reloads, all signed out together
 * when their waits end (S3 × 16 sessions under L1 and L4).
 */
export const idleManySessions = ensured(
  ensured(ensured(idleStory("sign-in/idle-many-sessions")).advance("5 minutes").reload()).reload(),
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
      .send(mainIdle, IdleSignOut.E.VideoStarted())
      .send(mainIdle, IdleSignOut.E.SignOut())
      .send(mainIdle, IdleSignOut.E.SignInAgain()),
});

/**
 * Every named Story of the idle sign-out.
 */
export const idleStories = {
  idleUsual,
  idleNeverReturns,
  idlePolicyRefused,
  idleRefusedSignOut,
  idleManySessions,
};
