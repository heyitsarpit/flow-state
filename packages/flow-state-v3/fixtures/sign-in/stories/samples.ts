import { Fake, samplesOf } from "../../../src/host/testing/index.ts";
import { laptop, mainReturn, mainSession } from "../app.ts";
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
      .send(mainReturn, { _tag: "Save", route: "/sozluk/effect", draft: "merhaba" })
      .send(mainReturn, { _tag: "Submit" })
      .send(mainSession, signedIn)
      .send(mainSession, { _tag: "Handle", handle: "elif-kaya" })
      .send(mainSession, { _tag: "Handle", handle: "" })
      .send(mainSession, { _tag: "SubmitHandle" })
      .send(mainSession, { _tag: "ConfirmHandle" })
      .send(mainSession, { _tag: "Retry" }),
});

const trustLaptop = { _tag: "Trust", until: LAPTOP_UNTIL, label: "Elif's laptop" } as const;
const trustToEpoch = { _tag: "Trust", until: EPOCH } as const;
const trustToLatest = { _tag: "Trust", until: LATEST, label: undefined } as const;
const trustToEarliest = { _tag: "Trust", until: EARLIEST, label: "" } as const;
const seenNow = { _tag: "Seen", at: LAPTOP_SEEN } as const;
const seenHidden = { _tag: "Seen", at: null } as const;
const seenLatest = { _tag: "Seen", at: LATEST } as const;
const seenEpoch = { _tag: "Seen", at: EPOCH } as const;
const seenEarliest = { _tag: "Seen", at: EARLIEST } as const;
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
      .send(laptop, { _tag: "Revoke" }),
});
