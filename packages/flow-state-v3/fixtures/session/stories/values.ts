import type { Schema } from "effect";
import { Fake, samplesOf } from "../../../src/host/testing/index.ts";
import { Calendar } from "../machines/agenda.ts";
import { Archive, Digest, Inbox } from "../machines/inbox.ts";
import { foldersOf, NestView, Nests } from "../machines/nests.ts";
import { Outline } from "../machines/outline.ts";
import { Dot } from "../machines/presence.ts";
import { Session } from "../machines/session.ts";
import { actorRef } from "../../../src/index.ts";
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
import { BadgeMachine } from "../machines/badge.ts";
import { globex, guestSession, guestTeam, mainSession } from "../app.ts";
import { TeamMachine } from "../machines/team.ts";
import { Identity } from "../server/identity.ts";
import { grownStory } from "./structure.ts";

const arrive = (id: string, from: string, at: number, replyTo = "") =>
  Inbox.E.Arrive({ id, from, at, replyTo });

const readAll = Inbox.E.ReadAll();
const clear = Inbox.E.Clear();

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
 * raises the threshold to three, which re-runs nothing, since no slot changed; then Carol writes,
 * a third sender, and the digest hears the inbox turn busy again at the new threshold.
 */
export const digestQuiet = inbox("session/digest-quiet")
  .send(mainInbox, arrive("m1", "ada", 1_000))
  .send(mainInbox, arrive("m2", "bob", 2_000))
  .checkpoint("busy")
  .send(mainDigest, Digest.E.Quiet({ from: 3 }))
  .checkpoint("raised")
  .send(mainInbox, arrive("m3", "carol", 3_000))
  .checkpoint("crossed");

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
  .send(mainSession, Session.E.SignIn({ user: "ada" }))
  .send(guestSession, Session.E.SignIn({ user: "bob" }))
  .ensure(guestDot)
  .checkpoint("shown")
  .detach(guestDot)
  .advance("1 second")
  .send(guestDot, Dot.E.Ping())
  .checkpoint("returned")
  .send(guestSession, Session.E.SignIn({ user: "carol" }))
  .checkpoint("carol")
  .reload({ reattach: false })
  .send(guestDot, Dot.E.Ping())
  .checkpoint("reloaded")
  .send(guestSession, Session.E.SignIn({ user: "dan" }))
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
  .send(mainSession, Session.E.SignOut())
  .checkpoint("signed out");

/**
 * The calendar shows a hundred days under its agenda, saved, and a glance at it, never saved; then
 * five thousand; the tab reloads, and the range goes back to a hundred days.
 */
export const agendaLong = grownStory("session/stress-agenda-long")
  .ensure(mainCalendar)
  .ensure(mainAgenda)
  .ensure(agendaPeek)
  .send(mainCalendar, Calendar.E.Show({ from: 0, to: 100 }))
  .checkpoint("short")
  .send(mainCalendar, Calendar.E.Show({ from: 0, to: 5_000 }))
  .checkpoint("long")
  .reload()
  .checkpoint("reloaded")
  .send(mainCalendar, Calendar.E.Show({ from: 0, to: 100 }))
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
 * The archive imports 3,001 ids; a message arrives and each of its three reactions logs it beside
 * the log; the tab reloads; another message arrives.
 */
export const archiveLarge = grownStory("session/archive-large")
  .ensure(mainInbox)
  .ensure(mainArchive)
  .send(mainArchive, Archive.E.Import({ ids: imported }))
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
    .send(mainOutline, Outline.E.Paste({ doc: nested(100_000, "one") }))
    .checkpoint("deep")
    .reload()
    .checkpoint("reloaded")
    .send(mainOutline, Outline.E.Paste({ doc: deepAndWide("two") }))
    .checkpoint("mixed")
    .reload()
    .checkpoint("mixed again");

/**
 * How deep the deep nests go: a hundred thousand containers, far past where Effect's own Schema
 * and equality walks run out of stack.
 */
export const DEEP = 100_000;

/**
 * How deep the swept nests go: past where Effect's own walks run out of stack on every measured
 * host, and shallow enough to print and sweep at every step.
 */
export const PAST_STACK = 3_000;

type NestKind = "Lists" | "Folders" | "Maps" | "Tree" | "Kinds";

/**
 * A nest built `depth` deep, the title alone renamed, then a nest one deeper, then that same nest
 * built again (an equal value in a new object); the tab reloads, and the nest goes shallow.
 */
export const nestAt = (kind: NestKind, depth: number, id: string) =>
  grownStory(id)
    .ensure(mainNests)
    .ensure(nestView)
    .send(mainNests, Nests.E[kind]({ depth }))
    .checkpoint("deep")
    .send(mainNests, Nests.E.Title({ title: "renamed" }))
    .checkpoint("titled")
    .send(mainNests, Nests.E[kind]({ depth: depth + 1 }))
    .checkpoint("deeper")
    .send(mainNests, Nests.E[kind]({ depth: depth + 1 }))
    .checkpoint("again")
    .reload()
    .checkpoint("reloaded")
    .send(mainNests, Nests.E[kind]({ depth: 3 }))
    .checkpoint("back");

/**
 * Plain JSON lists past where Effect's walks run out of stack, renamed, deeper, rebuilt equal,
 * reloaded and made shallow.
 */
export const listsPastStack = nestAt("Lists", PAST_STACK, "session/lists-past-stack");

/**
 * The same, for a folder tree under a recursive Schema.
 */
export const foldersPastStack = nestAt("Folders", PAST_STACK, "session/folders-past-stack");

/**
 * The same, for an index of Maps selected from JSON lists.
 */
export const mapsPastStack = nestAt("Maps", PAST_STACK, "session/maps-past-stack");

/**
 * The same, for an index of Maps held in memory and selected as it is.
 */
export const treePastStack = nestAt("Tree", PAST_STACK, "session/tree-past-stack");

/**
 * The same, for an Option, a class instance chain, a Set and a Map keyed by trees, held in memory
 * and the Option selected.
 */
export const kindsPastStack = nestAt("Kinds", PAST_STACK, "session/kinds-past-stack");

/**
 * A folder tree imported whole in its event's payload, as deep as `depth`; the viewer pins a tree
 * as deep of its own, and the title is renamed beside it twice; the tab reloads and the title is
 * renamed again.
 */
export const importAt = (depth: number, id: string) =>
  grownStory(id)
    .ensure(mainNests)
    .ensure(nestView)
    .send(mainNests, Nests.E.Import({ folder: foldersOf(depth) }))
    .checkpoint("imported")
    .send(nestView, NestView.E.Pin({ depth }))
    .checkpoint("pinned")
    .send(mainNests, Nests.E.Title({ title: "first" }))
    .checkpoint("first")
    .send(mainNests, Nests.E.Lists({ depth: 2 }))
    .checkpoint("unrelated")
    .reload()
    .checkpoint("reloaded")
    .send(mainNests, Nests.E.Title({ title: "second" }))
    .checkpoint("second");

/**
 * A folder tree past where Effect's walks run out of stack, imported in a payload and pinned in
 * the viewer's own memory, beside the title.
 */
export const importPastStack = importAt(PAST_STACK, "session/import-past-stack");

/**
 * A document both a hundred thousand deep and five thousand wide, imported as lists and as a
 * folder tree, then reloaded. Built on call and kept out of `stories`, as the deep outline is.
 */
export const deepAndWideNests = () => {
  const wide = (depth: number) => ({
    kids: [foldersOf(depth), ...Array.from({ length: 5_000 }, (_, n) => `note ${n}`)],
  });

  return grownStory("session/nests-deep-and-wide")
    .ensure(mainNests)
    .ensure(nestView)
    .send(mainNests, Nests.E.Import({ folder: wide(DEEP) }))
    .checkpoint("mixed")
    .send(mainNests, Nests.E.Import({ folder: wide(DEEP) }))
    .checkpoint("again")
    .reload()
    .checkpoint("reloaded");
};

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
    quiet: Digest.E.Quiet({ from: 3 }),
    signInBob: Session.E.SignIn({ user: "bob" }),
    signOut: Session.E.SignOut(),
    look: Dot.E.Ping(),
    spam: arrive("spam", "eve", 2_000),
    imported: Archive.E.Import({ ids: imported }),
    atItems: Calendar.E.Show({ from: 0, to: 4_096 }),
    pastItems: Calendar.E.Show({ from: 0, to: 4_097 }),
    longRange: Calendar.E.Show({ from: 0, to: 5_000 }),
  },
  controls: [Identity.unlock({ user: "ada" })],
  steps: (story) =>
    story
      .send(mainInbox, arrive("m1", "ada", 1_000))
      .send(mainInbox, arrive("m2", "bob", 2_000, "m1"))
      .send(mainInbox, arrive("m3", "ada", 3_000, "m2"))
      .send(mainInbox, readAll)
      .send(mainInbox, clear)
      .send(mainDigest, Digest.E.Quiet({ from: 3 }))
      .send(guestSession, Session.E.SignIn({ user: "bob" }))
      .send(guestSession, Session.E.SignOut())
      .send(guestDot, Dot.E.Ping())
      .send(mainInbox, arrive("spam", "eve", 2_000))
      .send(mainArchive, Archive.E.Import({ ids: imported }))
      .send(mainCalendar, Calendar.E.Show({ from: 0, to: 4_096 }))
      .send(mainCalendar, Calendar.E.Show({ from: 0, to: 4_097 }))
      .send(mainCalendar, Calendar.E.Show({ from: 0, to: 5_000 })),
});

// The nests' sample values at one depth, each one object, so a printed run names it.
const nestValuesAt = (depth: number) =>
  ({
    deepLists: Nests.E.Lists({ depth }),
    deepFolders: Nests.E.Folders({ depth }),
    deepMaps: Nests.E.Maps({ depth }),
    deepTree: Nests.E.Tree({ depth }),
    shallowTree: Nests.E.Tree({ depth: 2 }),
    deepImport: Nests.E.Import({ folder: foldersOf(depth) }),
    deepPin: NestView.E.Pin({ depth }),
    renamed: Nests.E.Title({ title: "renamed" }),
  }) as const;

const nestsSamplesAt = (depth: number, id: string) => {
  const values = nestValuesAt(depth);

  return samplesOf({
    id,
    story: grownStory(`session/${id}`).ensure(mainNests).ensure(nestView),
    names: { setup: "workspaceGrownSetup", fixtures: ["IdentityFake"] },
    actors: { mainNests, nestView },
    servers: { Identity },
    failures: [],
    landedFailures: [],
    values,
    controls: [],
    steps: (story) =>
      story
        .send(mainNests, values.deepLists)
        .send(mainNests, values.deepFolders)
        .send(mainNests, values.deepMaps)
        .send(mainNests, values.deepTree)
        .send(mainNests, values.shallowTree)
        .send(mainNests, values.deepImport)
        .send(nestView, values.deepPin)
        .send(mainNests, values.renamed),
  });
};

/**
 * What the nests and their viewer meet, for generated runs: nests of every kind and shallow
 * again, a folder tree imported in a payload, a pin of the viewer's own and the title renamed
 * beside them, 64 deep.
 */
export const nestsSamples = nestsSamplesAt(64, "session-nests");

/**
 * The same, 200 deep, past the walkers' call-stack budget so every walk takes its own stack, for
 * the stress runs: a stress run sends a thousand steps, and a computed selection of Maps is walked
 * whole at each change, so deeper nests would take a seed past its minute. The Stories take nests
 * to 3,000 and 100,000.
 */
export const nestsStressSamples = nestsSamplesAt(200, "session-nests-deep");
