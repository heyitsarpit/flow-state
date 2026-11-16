import { Story } from "../../../src/host/testing/index.ts";
import { authGrownSetup, mainReturn, mainSession } from "../app.ts";
import { AuthFake } from "../server.ts";
import { Profiles } from "../server/profiles.ts";
import { ProfileFake } from "../server/layer.ts";

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
