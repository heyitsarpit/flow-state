import { samplesOf } from "../../../src/host/testing/index.ts";
import { mainReturn, mainSession } from "../app.ts";
import { Profiles } from "../server/profiles.ts";
import { sessionStory, signedUp } from "./usual.ts";

/**
 * What a new account and the profile service can do around the session, for generated runs: save
 * a return, sign up or sign in, type a handle (blank among them), submit, confirm and retry; the
 * service finds a handle taken.
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
  controls: [],
  steps: (story) =>
    story
      .send(mainReturn, { _tag: "Save", route: "/sozluk/effect", draft: "merhaba" })
      .send(mainReturn, { _tag: "Submit" })
      .send(mainSession, signedUp)
      .send(mainSession, { _tag: "SignedIn", refreshToken: "rt-2", isNew: false })
      .send(mainSession, { _tag: "Handle", handle: "elif-kaya" })
      .send(mainSession, { _tag: "Handle", handle: "" })
      .send(mainSession, { _tag: "SubmitHandle" })
      .send(mainSession, { _tag: "ConfirmHandle" })
      .send(mainSession, { _tag: "Retry" }),
});
