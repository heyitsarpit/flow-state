import { Fake, samplesOf } from "../../../src/host/testing/index.ts";
import { laptop, mainReturn, mainSession } from "../app.ts";
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

const trustLaptop = TrustedDevice.E.Trust({ until: LAPTOP_UNTIL, label: "Elif's laptop" });
const trustToEpoch = TrustedDevice.E.Trust({ until: EPOCH });
const trustToLatest = TrustedDevice.E.Trust({ until: LATEST, label: undefined });
const trustToEarliest = TrustedDevice.E.Trust({ until: EARLIEST, label: "" });
const seenNow = TrustedDevice.E.Seen({ at: LAPTOP_SEEN });
const seenHidden = TrustedDevice.E.Seen({ at: null });
const seenLatest = TrustedDevice.E.Seen({ at: LATEST });
const seenEpoch = TrustedDevice.E.Seen({ at: EPOCH });
const seenEarliest = TrustedDevice.E.Seen({ at: EARLIEST });
const laptopRecord = 'actor/Auth/TrustedDevice/{"device":"laptop"}';

/**
 * What Elif and the profile service can do around a trusted device, for generated runs: sign in,
 * trust the laptop until a date, the epoch, or the earliest or latest date a `Date` holds, with a
 * label, none or `undefined`; see it at a time, at no time, the epoch or either end; revoke it;
 * the profile service holds her saved handle, and the laptop's record on disk may not decode.
 */
export const deviceSamples = samplesOf({
  id: "auth-devices",
  story: trustedStory("auth-devices/samples"),
  names: { setup: "authTrustedSetup", fixtures: ["AuthFake", "ProfileFake"] },
  actors: { mainSession, laptop },
  servers: { Profiles },
  failures: [Fake.storage.put(laptopRecord, '{"format":1}')],
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
