import { samplesOf, Story } from "../../../src/host/testing/index.ts";
import { authBanneredSetup, blankSession, mainBanner, mainSession } from "../app.ts";
import { AuthSession } from "../machines/session.ts";
import { AuthFake, ProfileFake } from "../server/layer.ts";
import { Profiles } from "../server/profiles.ts";

/**
 * The sign-in app with the account bar's banner over its port fakes, with no steps yet.
 */
export const bannerStory = (id: string) =>
  Story.app(authBanneredSetup, { id, fixtures: [AuthFake, ProfileFake] });

/**
 * Elif, whose handle is saved, signs in: the banner shows the loading step, then signed in, and
 * welcomes her once.
 */
export const bannerSignsIn = bannerStory("sign-in/banner-signs-in")
  .world(Profiles.saved({ email: "elif@kamp.us", handle: "elif" }))
  .ensure(mainSession)
  .ensure(mainBanner)
  .checkpoint("out")
  .send(mainSession, AuthSession.E.SignedIn())
  .checkpoint("in");

/**
 * A new account signs in, chooses a handle and saves it: the banner shows each step and welcomes
 * the account once, when the save lands.
 */
export const bannerNewAccount = bannerStory("sign-in/banner-new-account")
  .ensure(mainSession)
  .ensure(mainBanner)
  .send(mainSession, AuthSession.E.SignedIn())
  .checkpoint("choosing")
  .send(mainSession, AuthSession.E.Handle({ handle: "elif-kaya" }))
  .send(mainSession, AuthSession.E.SubmitHandle())
  .checkpoint("in");

/**
 * The account read is lost: the session goes back to signed out; the banner shows both steps and
 * welcomes no one.
 */
export const bannerLoadFails = bannerStory("sign-in/banner-load-fails")
  .ensure(mainSession)
  .ensure(mainBanner)
  .world(Profiles.me.drop({ at: "response" }))
  .send(mainSession, AuthSession.E.SignedIn())
  .advance("1 second")
  .checkpoint("out");

/**
 * Elif signs in, the tab reloads and only the banner is ensured: the session is restored signed in,
 * and the banner reads it again with no step shown and no welcome (Turn R22's silent baseline).
 */
export const bannerReloaded = bannerStory("sign-in/banner-reloaded")
  .world(Profiles.saved({ email: "elif@kamp.us", handle: "elif" }))
  .ensure(mainSession)
  .ensure(mainBanner)
  .send(mainSession, AuthSession.E.SignedIn())
  .reload({ reattach: false })
  .ensure(mainBanner)
  .checkpoint("reloaded");

/**
 * What the session and the profile service can do under the banner, for generated runs: sign in,
 * type an empty and a long handle (E1, E3), submit, confirm and retry; the service finds a handle
 * taken. The blank session signs in with an empty email.
 */
export const bannerSamples = samplesOf({
  id: "sign-in-banner",
  story: bannerStory("sign-in/banner-samples"),
  names: { setup: "authBanneredSetup", fixtures: ["AuthFake", "ProfileFake"] },
  actors: { mainSession, blankSession, mainBanner },
  servers: { Profiles },
  failures: [Profiles.taken({})],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(mainSession, AuthSession.E.SignedIn())
      .send(mainSession, AuthSession.E.Handle({ handle: "" }))
      .send(mainSession, AuthSession.E.Handle({ handle: "e".repeat(10_000) }))
      .send(mainSession, AuthSession.E.SubmitHandle())
      .send(mainSession, AuthSession.E.ConfirmHandle())
      .send(mainSession, AuthSession.E.Retry())
      .send(blankSession, AuthSession.E.SignedIn()),
});
