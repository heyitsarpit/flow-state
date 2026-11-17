import { Fake, samplesOf } from "../../../src/host/testing/index.ts";
import { actorRef } from "../../../src/index.ts";
import { guestDot, guestPresence, mainAvatar, mainDigest, mainInbox, mainThread } from "../app.ts";
import {
  BadgeMachine,
  globex,
  guestSession,
  guestTeam,
  mainSession,
  TeamMachine,
} from "../machine.ts";
import { Identity } from "../server.ts";
import { grownStory } from "./structure.ts";

const arrive = (id: string, from: string, at: number, replyTo = "") =>
  ({ _tag: "Arrive", id, from, at, replyTo }) as const;

const readAll = { _tag: "ReadAll" } as const;
const clear = { _tag: "Clear" } as const;

const inbox = (id: string) => grownStory(id).ensure(mainInbox).ensure(mainDigest);

/**
 * Messages reach the inbox while its digest is shown: Ada writes, Bob answers her, everything is
 * read, Ada answers Bob; the inbox is cleared, Bob writes again, and the tab reloads. The digest
 * selects a Date or undefined, NaN, -0, a Map, a Set, a class instance, an Option and a nested mix
 * of them.
 */
export const digestHeard = inbox("session/digest-heard")
  .send(mainInbox, arrive("m1", "ada", 1_000))
  .send(mainInbox, arrive("m2", "bob", 2_000, "m1"))
  .send(mainInbox, readAll)
  .send(mainInbox, arrive("m3", "ada", 3_000, "m2"))
  .checkpoint("heard")
  .send(mainInbox, clear)
  .checkpoint("cleared")
  .send(mainInbox, arrive("m4", "bob", 4_000))
  .checkpoint("written")
  .reload()
  .checkpoint("reloaded");

/**
 * The same messages reach the inbox while its thread view is shown, whose selection is a tree whose
 * replies point back at what they answer; the tab reloads.
 */
export const threadHeard = grownStory("session/thread-heard")
  .ensure(mainInbox)
  .ensure(mainThread)
  .send(mainInbox, arrive("m1", "ada", 1_000))
  .send(mainInbox, arrive("m2", "bob", 2_000, "m1"))
  .send(mainInbox, readAll)
  .send(mainInbox, arrive("m3", "ada", 3_000, "m2"))
  .send(mainInbox, clear)
  .send(mainInbox, arrive("m4", "bob", 4_000))
  .checkpoint("written")
  .reload()
  .checkpoint("reloaded");

/**
 * Ada and Bob both write, so the digest turns busy at its threshold of two senders; the reader
 * raises the threshold to three, which re-runs nothing; then Ada writes again, and the digest
 * hears that the inbox is no longer busy.
 */
export const digestQuiet = inbox("session/digest-quiet")
  .send(mainInbox, arrive("m1", "ada", 1_000))
  .send(mainInbox, arrive("m2", "bob", 2_000))
  .checkpoint("busy")
  .send(mainDigest, { _tag: "Quiet", from: 3 })
  .checkpoint("raised")
  .send(mainInbox, arrive("m3", "ada", 3_000))
  .checkpoint("quiet");

/**
 * Ada signs in to the main session and Bob to the guest's; the guest's online dot is shown, which
 * starts the guest's presence, never saved, by its own ref; the dot is let go and a look brings it
 * back; Carol signs in as the guest; the tab reloads with nothing open and a look brings the dot
 * back; Dan signs in as the guest.
 */
export const guestDotReturns = grownStory("session/guest-dot-returns")
  .ensure(globex)
  .ensure(mainSession)
  .ensure(guestSession)
  .send(mainSession, { _tag: "SignIn", user: "ada" })
  .send(guestSession, { _tag: "SignIn", user: "bob" })
  .ensure(guestDot)
  .checkpoint("shown")
  .detach(guestDot)
  .advance("1 second")
  .send(guestDot, { _tag: "Ping" })
  .checkpoint("returned")
  .send(guestSession, { _tag: "SignIn", user: "carol" })
  .checkpoint("carol")
  .reload({ reattach: false })
  .send(guestDot, { _tag: "Ping" })
  .checkpoint("reloaded")
  .send(guestSession, { _tag: "SignIn", user: "dan" })
  .checkpoint("dan");

/**
 * The guests' team is open, bound to the guest session; a badge is then shown whose ref names the
 * guests' team bound to the main session instead. Built on call: the Runtime refuses the badge, so
 * every runner's run would reject.
 */
export const nestedConflictingTeam = () =>
  grownStory("session/nested-conflicting-team")
    .ensure(guestTeam)
    .ensure(
      actorRef(BadgeMachine, "other-badge", {
        context: {
          team: actorRef(TeamMachine, "guests", { context: { user: mainSession } }),
        },
      }),
    );

const avatarRecord = "actor/Workspace/Avatar/avatar";

/**
 * The avatar's saved record names a last-seen form no release writes, `__proto__`, when the tab
 * opens; the avatar is ensured.
 */
export const corruptSeen = grownStory("session/corrupt-seen")
  .world(
    Fake.storage.put(
      avatarRecord,
      '{"context":{"user":{"machine":"Workspace/Session","name":"main"}},"format":1,' +
        '"machine":"Workspace/Avatar","memory":{"seen":0},"name":"avatar","schedules":[],' +
        '"seen":{"user":{"~":"__proto__"}},"state":"SHOWN"}',
    ),
  )
  .reload({ reattach: false })
  .checkpoint("boot")
  .ensure(mainAvatar)
  .checkpoint("fresh");

/**
 * Ada was signed in and the avatar had seen her when a release before slot Schemas saved both
 * records (format 1); the tab opens and the avatar is ensured.
 */
export const formatOneAvatar = grownStory("session/format-one-avatar")
  .world(
    Fake.storage.put(
      "actor/Workspace/Session/main",
      '{"context":{"org":{"machine":"Workspace/Org","name":"acme"}},"format":1,' +
        '"machine":"Workspace/Session","memory":{"displayName":"Ada","notice":"","user":"ada"},' +
        '"name":"main","schedules":[],"seen":{"org":{"value":"","~":"json"}},"state":"SIGNED_IN"}',
    ),
    Fake.storage.put(
      avatarRecord,
      '{"context":{"user":{"machine":"Workspace/Session","name":"main"}},"format":1,' +
        '"machine":"Workspace/Avatar","memory":{"seen":1},"name":"avatar","schedules":[],' +
        '"seen":{"user":{"value":"ada","~":"json"}},"state":"SHOWN"}',
    ),
  )
  .reload({ reattach: false })
  .checkpoint("boot")
  .ensure(mainAvatar)
  .checkpoint("restored")
  .send(mainSession, { _tag: "SignOut" })
  .checkpoint("signed out");

/**
 * What the inbox's digest, thread view and the guest's online dot meet, for generated runs:
 * messages arrive, answer each other, are read and cleared, while sessions sign in and out.
 */
export const inboxSamples = samplesOf({
  id: "session-inbox",
  story: inbox("session/inbox-samples").ensure(mainThread).ensure(guestDot),
  names: { setup: "workspaceGrownSetup", fixtures: ["IdentityFake"] },
  actors: { mainInbox, mainDigest, mainThread, guestDot, guestPresence, guestSession, mainSession },
  servers: { Identity },
  failures: [Identity.lock({ user: "ada" })],
  landedFailures: [],
  values: {
    adaWrites: arrive("m1", "ada", 1_000),
    bobAnswers: arrive("m2", "bob", 2_000, "m1"),
    adaAnswers: arrive("m3", "ada", 3_000, "m2"),
    readAll,
    clear,
    quiet: { _tag: "Quiet", from: 3 },
    signInBob: { _tag: "SignIn", user: "bob" },
    signOut: { _tag: "SignOut" },
    look: { _tag: "Ping" },
  },
  controls: [Identity.unlock({ user: "ada" })],
  steps: (story) =>
    story
      .send(mainInbox, arrive("m1", "ada", 1_000))
      .send(mainInbox, arrive("m2", "bob", 2_000, "m1"))
      .send(mainInbox, arrive("m3", "ada", 3_000, "m2"))
      .send(mainInbox, readAll)
      .send(mainInbox, clear)
      .send(mainDigest, { _tag: "Quiet", from: 3 })
      .send(guestSession, { _tag: "SignIn", user: "bob" })
      .send(guestSession, { _tag: "SignOut" })
      .send(guestDot, { _tag: "Ping" }),
});
