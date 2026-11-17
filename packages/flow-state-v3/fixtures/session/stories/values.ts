import type { Schema } from "effect";
import { Fake, samplesOf } from "../../../src/host/testing/index.ts";
import { actorRef, Flow } from "../../../src/index.ts";
import {
  agendaPeek,
  guestDot,
  guestPresence,
  mainAgenda,
  mainArchive,
  mainAvatar,
  mainCalendar,
  mainDigest,
  mainInbox,
  mainNests,
  mainOutline,
  mainPreview,
  mainThread,
  mainUnread,
  nestView,
} from "../app.ts";
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
 * The calendar shows a hundred days under its agenda, saved, and a glance at it, never saved; then
 * five thousand; the tab reloads, and the range goes back to a hundred days.
 */
export const agendaLong = grownStory("session/stress-agenda-long")
  .ensure(mainCalendar)
  .ensure(mainAgenda)
  .ensure(agendaPeek)
  .send(mainCalendar, { _tag: "Show", from: 0, to: 100 })
  .checkpoint("short")
  .send(mainCalendar, { _tag: "Show", from: 0, to: 5_000 })
  .checkpoint("long")
  .reload()
  .checkpoint("reloaded")
  .send(mainCalendar, { _tag: "Show", from: 0, to: 100 })
  .checkpoint("back");

/**
 * The unread badge opens on an empty inbox, which its Schema refuses; a message arrives and is
 * opened; everything is read, refused again; spam arrives, whose opening fails; everything is read
 * again; a message arrives and is opened, and every issue has cleared.
 */
export const unreadRecovers = grownStory("session/unread-recovers")
  .ensure(mainInbox)
  .ensure(mainUnread)
  .checkpoint("empty")
  .send(mainInbox, arrive("m1", "ada", 1_000))
  .checkpoint("first")
  .send(mainInbox, readAll)
  .checkpoint("read")
  .send(mainInbox, arrive("spam", "eve", 2_000))
  .checkpoint("spam")
  .send(mainInbox, readAll)
  .send(mainInbox, arrive("m3", "bob", 3_000))
  .checkpoint("recovered");

const imported = Array.from({ length: 3_001 }, (_, n) => `a-${n}`);

/**
 * The archive imports 3,001 ids; a message arrives and two of its three memory-reading reactions log
 * it; the tab reloads; another message arrives.
 */
export const archiveLarge = grownStory("session/archive-large")
  .ensure(mainInbox)
  .ensure(mainArchive)
  .send(mainArchive, { _tag: "Import", ids: imported })
  .send(mainInbox, arrive("m1", "ada", 1_000))
  .checkpoint("logged")
  .reload()
  .checkpoint("reloaded")
  .send(mainInbox, arrive("m2", "bob", 2_000))
  .checkpoint("again");

/**
 * Ada writes and the digest hears it, saved; the store then refuses the step in which Bob answers,
 * so neither the inbox's nor the digest's change is saved; the tab reloads, and Ada writes again.
 */
export const digestRefused = inbox("session/digest-refused")
  .send(mainInbox, arrive("m1", "ada", 1_000))
  .world(Fake.storage.refuse())
  .send(mainInbox, arrive("m2", "bob", 2_000, "m1"))
  .checkpoint("refused")
  .reload()
  .checkpoint("reloaded")
  .send(mainInbox, arrive("m3", "ada", 3_000, "m1"))
  .checkpoint("after");

// A list nested `depth` levels deep, its innermost item `leaf`.
const nested = (depth: number, leaf: string) => {
  let doc: Schema.Json = leaf;

  for (let n = 0; n < depth; n += 1) doc = [doc];

  return doc;
};

/**
 * A document a hundred thousand levels deep beside five thousand siblings, each a short list.
 */
const deepAndWide = (leaf: string) => ({
  deep: nested(100_000, leaf),
  wide: Array.from({ length: 5_000 }, (_, n) => [`item ${n}`, { at: n }]),
});

/**
 * An outline a hundred thousand levels deep is pasted under its preview; the tab reloads; a
 * document both that deep and five thousand wide is pasted, and the tab reloads again. Built on
 * call and kept out of `stories`: printing and sweeping 200,000 levels at every step is too long
 * for the CLI tests and the sweeps; its own test and the bench run it.
 */
export const outlineDeep = () =>
  grownStory("session/stress-outline-deep")
    .ensure(mainOutline)
    .ensure(mainPreview)
    .send(mainOutline, { _tag: "Paste", doc: nested(100_000, "one") })
    .checkpoint("deep")
    .reload()
    .checkpoint("reloaded")
    .send(mainOutline, { _tag: "Paste", doc: deepAndWide("two") })
    .checkpoint("mixed")
    .reload()
    .checkpoint("mixed again");

// A nest's depth around the limit: its memory (one container more) at the limit, one past it, and
// the selection itself one past it.
const depths = {
  at: Flow.maxDepth - 1,
  memoryPast: Flow.maxDepth,
  selectionPast: Flow.maxDepth + 1,
};

const nestStory = (kind: "Lists" | "Folders" | "Maps", id: string) =>
  grownStory(id)
    .ensure(mainNests)
    .ensure(nestView)
    .send(mainNests, { _tag: kind, depth: depths.at })
    .checkpoint("at")
    .send(mainNests, { _tag: "Title", title: "renamed" })
    .checkpoint("titled")
    .send(mainNests, { _tag: kind, depth: depths.memoryPast })
    .checkpoint("memory past")
    .send(mainNests, { _tag: kind, depth: depths.selectionPast })
    .checkpoint("selection past")
    .send(mainNests, { _tag: kind, depth: 5_000 })
    .checkpoint("far past")
    .send(mainNests, { _tag: kind, depth: 3 })
    .checkpoint("back")
    .reload()
    .checkpoint("reloaded");

/**
 * An outline of plain JSON lists at the depth limit, then the title alone renamed, then one past
 * the limit in memory, then one past it in the selection, then 5,000 deep, then shallow again; the
 * tab reloads.
 */
export const listsAtDepth = nestStory("Lists", "session/lists-at-depth");

/**
 * The same, for a folder tree under a recursive Schema.
 */
export const foldersAtDepth = nestStory("Folders", "session/folders-at-depth");

/**
 * The same, for an index of Maps.
 */
export const mapsAtDepth = nestStory("Maps", "session/maps-at-depth");

/**
 * What the inbox's digest, thread view and the guest's online dot meet, for generated runs:
 * messages arrive, answer each other, are read and cleared, while sessions sign in and out.
 */
export const inboxSamples = samplesOf({
  id: "session-inbox",
  story: inbox("session/inbox-samples")
    .ensure(mainThread)
    .ensure(guestDot)
    .ensure(mainUnread)
    .ensure(mainArchive)
    .ensure(mainCalendar)
    .ensure(mainAgenda)
    .ensure(agendaPeek),
  names: { setup: "workspaceGrownSetup", fixtures: ["IdentityFake"] },
  actors: {
    mainInbox,
    mainDigest,
    mainThread,
    guestDot,
    guestPresence,
    guestSession,
    mainSession,
    mainUnread,
    mainArchive,
    mainCalendar,
    mainAgenda,
    agendaPeek,
  },
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
    spam: arrive("spam", "eve", 2_000),
    imported: { _tag: "Import", ids: imported },
    atItems: { _tag: "Show", from: 0, to: 4_096 },
    pastItems: { _tag: "Show", from: 0, to: 4_097 },
    longRange: { _tag: "Show", from: 0, to: 5_000 },
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
      .send(guestDot, { _tag: "Ping" })
      .send(mainInbox, arrive("spam", "eve", 2_000))
      .send(mainArchive, { _tag: "Import", ids: imported })
      .send(mainCalendar, { _tag: "Show", from: 0, to: 4_096 })
      .send(mainCalendar, { _tag: "Show", from: 0, to: 4_097 })
      .send(mainCalendar, { _tag: "Show", from: 0, to: 5_000 }),
});
