import { Fake, samplesOf } from "../../../src/host/testing/index.ts";
import { blankSession, laptop, longSession, mainReturn, mainSession } from "../app.ts";
import { ReturnTo } from "../machines/return-to.ts";
import { AuthSession } from "../machines/session.ts";
import { TrustedDevice } from "../machines/trusted-device.ts";
import { Profiles } from "../server/profiles.ts";
import { EARLIEST, EPOCH, LATEST } from "./edges.ts";
import {
  elifSaved,
  LAPTOP_SEEN,
  LAPTOP_UNTIL,
  sessionStory,
  signedIn,
  trustedStory,
} from "./usual.ts";

/**
 * What a new account and the profile service can do around the session, for generated runs: save
 * a return, sign in, type a handle (blank among them), submit, confirm and retry; the
 * service finds a handle taken or holds one saved earlier.
 */
export const samples = samplesOf({
  id: "auth-session",
  story: sessionStory("auth-session/samples"),
  names: { setup: "authGrownSetup", fixtures: ["AuthFake", "ProfileFake"] },
  actors: { mainSession, mainReturn },
  servers: { Profiles },
  failures: [Profiles.taken({})],
  landedFailures: [],
  values: {},
  controls: [Profiles.saved({ email: "elif@kamp.us", handle: "elif" })],
  steps: (story) =>
    story
      .send(mainReturn, ReturnTo.E.Save({ route: "/sozluk/effect", draft: "merhaba" }))
      .send(mainReturn, ReturnTo.E.Submit())
      .send(mainSession, signedIn)
      .send(mainSession, AuthSession.E.Handle({ handle: "elif-kaya" }))
      .send(mainSession, AuthSession.E.Handle({ handle: "" }))
      .send(mainSession, AuthSession.E.SubmitHandle())
      .send(mainSession, AuthSession.E.ConfirmHandle())
      .send(mainSession, AuthSession.E.Retry()),
});

/**
 * New accounts at the email's edges, for generated runs: a blank email and one of 100,000
 * characters sign in, type a handle or keep the email's prefix, submit and confirm.
 */
export const emailEdgeSamples = samplesOf({
  id: "auth-session-email-edges",
  story: sessionStory("auth-session-email-edges/samples"),
  names: { setup: "authGrownSetup", fixtures: ["AuthFake", "ProfileFake"] },
  actors: { blankSession, longSession },
  servers: { Profiles },
  failures: [Profiles.taken({})],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(blankSession, signedIn)
      .send(longSession, signedIn)
      .send(blankSession, AuthSession.E.Handle({ handle: "blank" }))
      .send(longSession, AuthSession.E.SubmitHandle())
      .send(blankSession, AuthSession.E.SubmitHandle())
      .send(longSession, AuthSession.E.ConfirmHandle()),
});

const trustLaptop = TrustedDevice.E.Trust({ until: LAPTOP_UNTIL, label: "Elif's laptop" });
const trustToEpoch = TrustedDevice.E.Trust({ until: EPOCH });
const trustToLatest = TrustedDevice.E.Trust({ until: LATEST, label: undefined });
const trustToEarliest = TrustedDevice.E.Trust({ until: EARLIEST, label: "" });
const seenNow = TrustedDevice.E.Seen({ at: LAPTOP_SEEN });
const seenHidden = TrustedDevice.E.Seen({ at: null });
const seenLatest = TrustedDevice.E.Seen({ at: LATEST });
const seenEpoch = TrustedDevice.E.Seen({ at: EPOCH });
const seenEarliest = TrustedDevice.E.Seen({ at: EARLIEST });

/**
 * The laptop's saved record key.
 */
export const laptopRecord = 'actor/Auth/TrustedDevice/{"device":"laptop"}';

const SESSION_WORK = 'work/Auth/Session/{"email":"elif@kamp.us"}';

// Elif's session's work record holding a lane of the account read, which only a write may have.
const readLane = String.raw`{"body":{"lanes":{"":{"Auth/me":{"{\"email\":\"elif@kamp.us\"}":{"displaced":[],"head":{"attempt":"att-000000000000000000006d61696e3a31-1","claims":[],"hold":"Out","rest":{},"retryCount":0},"queue":[]}}}},"rows":[]},"format":6}`;

const deviceSamplesOf = (records: boolean) =>
  samplesOf({
    id: records ? "auth-records" : "auth-devices",
    story: trustedStory(records ? "auth-records/samples" : "auth-devices/samples"),
    names: { setup: "authTrustedSetup", fixtures: ["AuthFake", "ProfileFake"] },
    actors: { mainSession, laptop },
    servers: { Profiles },
    failures: records
      ? [Fake.storage.put(laptopRecord, '{"format":1}'), Fake.storage.put(SESSION_WORK, readLane)]
      : [Fake.storage.put(laptopRecord, '{"format":1}')],
    landedFailures: [],
    values: {
      signedIn,
      trustLaptop,
      trustToEpoch,
      trustToLatest,
      trustToEarliest,
      seenNow,
      seenHidden,
      seenLatest,
      seenEpoch,
      seenEarliest,
    },
    controls: [elifSaved],
    steps: (story) =>
      story
        .send(mainSession, signedIn)
        .send(laptop, trustLaptop)
        .send(laptop, trustToEpoch)
        .send(laptop, trustToLatest)
        .send(laptop, trustToEarliest)
        .send(laptop, seenNow)
        .send(laptop, seenHidden)
        .send(laptop, seenLatest)
        .send(laptop, seenEpoch)
        .send(laptop, seenEarliest)
        .send(laptop, TrustedDevice.E.Revoke()),
  });

/**
 * What Elif and the profile service can do around a trusted device, for generated runs: sign in,
 * trust the laptop until a date, the epoch, or the earliest or latest date a `Date` holds, with a
 * label, none or `undefined`; see it at a time, at no time, the epoch or either end; revoke it;
 * the profile service holds her saved handle, and the laptop's record on disk may not decode.
 */
export const deviceSamples = deviceSamplesOf(false);

/**
 * The trusted-device samples with Elif's session's work record on disk holding a lane of a read,
 * for every runner.
 */
export const recordSamples = deviceSamplesOf(true);
