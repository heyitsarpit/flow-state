import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  CancelMachine,
  cancelClient,
  LatestMachine,
  lanesSetup,
  latestClient,
  SerializeMachine,
  serializeClient,
} from "../../fixtures/lanes/machine.ts";
import { GitFakeSteadfast } from "../../fixtures/lanes/server.ts";
import { lanesStory } from "../../fixtures/lanes/stories.ts";
import { Git } from "../../fixtures/sync/server.ts";
import { Fake, type Cut, Story } from "../../src/host/testing/index.ts";
import { endings, laneFacts, type Records } from "../checkout.ts";
import { played } from "../rules/played.ts";

type Policy = "latest" | "serialize" | "cancel";

type Phase =
  | "Idle"
  | "Acknowledging"
  | "Unsent"
  | "Withdrawing"
  | "Recapturing"
  | "Resending"
  | "OnWire"
  | "Cancelling"
  | "Held";

const clients = { latest: latestClient, serialize: serializeClient, cancel: cancelClient };

const machines = { latest: LatestMachine, serialize: SerializeMachine, cancel: CancelMachine };

const FLOW = { repo: "flow" };

const commit = { _tag: "Commit", ...FLOW } as const;

type Tag = "Commit" | "Twice" | "RetryCommit" | "CancelCommit" | "Cancel" | "Retry";

// The lane's row for the flow repository at a cut, undefined when it has no lane.
const rowAt = (cut: Cut, policy: Policy) => {
  const snapshot = cut.read(clients[policy]);

  return snapshot === undefined
    ? undefined
    : Option.getOrUndefined(machines[policy].definition.O.sync.get(snapshot.operations, FLOW));
};

const FLOW_REASONS = new Set(["Cancelled", "Restored"]);

// Endings as the rule states them: an unknown the server's lost answer gave is `unknown`, every
// other ending its channel and reason.
const seen = (records: Records) =>
  endings(records, "sync").map((e) =>
    e.channel === "unknown" && !FLOW_REASONS.has(e.reason) ? "unknown" : `${e.channel} ${e.reason}`,
  );

// A Story that leaves the client's head in a phase, has one turn's commit meet it, checkpoints
// "met", then lets every held store write and call go and checkpoints "after".
const meeting = (policy: Policy, phase: Phase) => {
  const client = clients[policy];
  const story = lanesStory(`lane-cells/${policy}-${phase}`).ensure(client);
  const send = (s: Story, tag: Tag) => s.send(client, { _tag: tag, ...FLOW });

  const reached: Record<Phase, () => Story> = {
    Idle: () => send(story, "Commit"),
    Acknowledging: () => send(send(story.world(Fake.storage.hold()), "Commit"), "Commit"),
    Unsent: () => send(story.world(Git.sync.hold()), "Twice"),
    Withdrawing: () =>
      send(send(send(story.world(Fake.storage.hold()), "Commit"), "Cancel"), "Commit"),
    Recapturing: () =>
      send(
        send(send(story.world(Git.sync.drop()), "Commit").world(Fake.storage.hold()), "Retry"),
        "Commit",
      ),
    Resending: () =>
      send(send(story.world(Git.sync.drop()), "Commit").world(Git.sync.hold()), "RetryCommit"),
    OnWire: () => send(send(story.world(Git.sync.hold()), "Commit"), "Commit"),
    Cancelling: () => send(send(story.world(Git.sync.hold()), "Commit"), "CancelCommit"),
    Held: () => send(send(story.world(Git.sync.drop()), "Commit"), "Commit"),
  };

  const met = reached[phase]().checkpoint("met");
  const storage = ["Acknowledging", "Withdrawing", "Recapturing"].includes(phase);
  const wire = ["Unsent", "Resending", "OnWire", "Cancelling"].includes(phase);
  const freed = storage ? met.world(Fake.storage.release()) : met;

  return (wire ? freed.world(Git.sync.release()) : freed).advance("1 second").checkpoint("after");
};

type Expected = {
  readonly waiting: boolean;
  readonly endings: ReadonlyArray<string>;
  readonly superseded: number;
  readonly released: number;
};

const cell = (waiting: boolean, ended: ReadonlyArray<string>, superseded = 0, released = 0) =>
  ({ waiting, endings: ended, superseded, released }) satisfies Expected;

const OK = "success success";

// Each cell written from WriteLanes `algorithm` (commit under latest, serialize and cancel),
// R7, R8 (promotion) and R14, with Reads R14's `waiting`, before the code was run.
const expected: Record<Policy, Record<Phase, Expected>> = {
  // latest: Idle mints; Acknowledging and Unsent supersede the head and the commit is sent;
  // elsewhere the commit waits and is promoted when the head resolves; an unknown never promotes.
  latest: {
    Idle: cell(false, [OK]),
    Acknowledging: cell(false, [OK], 1),
    Unsent: cell(false, [OK], 1),
    Withdrawing: cell(true, ["notSent Cancelled", OK]),
    Recapturing: cell(true, ["unknown", OK, OK]),
    Resending: cell(true, ["unknown", OK, OK]),
    OnWire: cell(true, [OK, OK]),
    Cancelling: cell(true, ["unknown Cancelled"]),
    Held: cell(true, ["unknown"]),
  },
  // serialize: Idle mints; every other phase appends the commit to W, sent in order.
  serialize: {
    Idle: cell(false, [OK]),
    Acknowledging: cell(true, [OK, OK]),
    Unsent: cell(true, [OK, OK]),
    Withdrawing: cell(true, ["notSent Cancelled", OK]),
    Recapturing: cell(true, ["unknown", OK, OK]),
    Resending: cell(true, ["unknown", OK, OK]),
    OnWire: cell(true, [OK, OK]),
    Cancelling: cell(true, ["unknown Cancelled"]),
    Held: cell(true, ["unknown"]),
  },
  // cancel: the commit always becomes the head; a never-sent head is Superseded, a sent one
  // Released, one on the wire is interrupted with its ending evidence, and one a cancel was
  // pending on keeps its ending owed.
  cancel: {
    Idle: cell(false, [OK]),
    Acknowledging: cell(false, [OK], 1),
    Unsent: cell(false, [OK], 1),
    Withdrawing: cell(false, ["notSent Cancelled", OK]),
    Recapturing: cell(false, ["unknown", OK], 0, 1),
    Resending: cell(false, ["unknown", OK], 0, 1),
    OnWire: cell(false, ["unknown Cancelled", OK]),
    Cancelling: cell(false, ["unknown Cancelled", OK]),
    Held: cell(false, ["unknown", OK], 0, 1),
  },
};

const phases: ReadonlyArray<Phase> = [
  "Idle",
  "Acknowledging",
  "Unsent",
  "Withdrawing",
  "Recapturing",
  "Resending",
  "OnWire",
  "Cancelling",
  "Held",
];

describe("a commit meets each phase under each policy (WriteLanes R7, R8, algorithm; Reads R14)", () => {
  for (const policy of ["latest", "serialize", "cancel"] as const)
    for (const phase of phases)
      it(`${policy}: a commit on ${phase}`, async () => {
        const run = await played(meeting(policy, phase));
        const want = expected[policy][phase];

        expect(rowAt(run.checkpoints.met, policy)?.waiting ?? false).toBe(want.waiting);
        expect(seen(run.evidence)).toEqual(want.endings);
        expect(laneFacts(run.evidence, "Superseded")).toBe(want.superseded);
        expect(laneFacts(run.evidence, "Released")).toBe(want.released);
      });
});

const delivered = (records: Records) =>
  records.filter((e) => e._tag === "Delivered" && e.operation === "sync").length;

it("cancel: an interrupted Attempt with no cancel pending on it is recorded, never delivered; one a cancel was pending on is delivered (WriteLanes R7, R10, I15)", async () => {
  const onWire = await played(meeting("cancel", "OnWire"));
  const cancelling = await played(meeting("cancel", "Cancelling"));

  expect(delivered(onWire.evidence)).toBe(1);
  expect(delivered(cancelling.evidence)).toBe(2);
});

it("latest: a commit that queues behind a queued commit ends it Superseded, so one waits (WriteLanes R7, I8)", async () => {
  const run = await played(
    lanesStory("lane-cells/latest-twice-queued")
      .ensure(latestClient)
      .world(Git.sync.hold())
      .send(latestClient, commit)
      .send(latestClient, commit)
      .send(latestClient, commit)
      .checkpoint("met")
      .world(Git.sync.release())
      .advance("1 second")
      .checkpoint("after"),
  );

  expect(laneFacts(run.evidence, "Superseded")).toBe(1);
  expect(seen(run.evidence)).toEqual([OK, OK]);
  expect(run.checkpoints.after.read(Git.sync)).toHaveLength(2);
});

it("serialize: 64 commits wait behind the head and the next declines NotSent Overloaded (WriteLanes R7, I8)", async () => {
  const held = lanesStory("lane-cells/serialize-65th")
    .ensure(serializeClient)
    .world(Git.sync.hold())
    .send(serializeClient, commit);

  const queued = Array.from({ length: 64 }).reduce<Story>(
    (s) => s.send(serializeClient, commit),
    held,
  );

  const run = await played(
    queued
      .checkpoint("full")
      .send(serializeClient, commit)
      .checkpoint("met")
      .world(Git.sync.release())
      .advance("1 second")
      .checkpoint("after"),
  );

  const all = seen(run.evidence);

  expect(rowAt(run.checkpoints.full, "serialize")?.waiting).toBe(true);
  expect(all.filter((e) => e === "notSent Overloaded")).toHaveLength(1);
  expect(all.filter((e) => e === OK)).toHaveLength(65);
  expect(rowAt(run.checkpoints.after, "serialize")).toBeUndefined();
});

// A reload hears the lane's queued commits NotSent Restored, then its head's unknown Restored
// (Restore R3; Operations O3; Persistence O4). Under cancel the displaced head's interrupted call
// ends before the reload, unknown Cancelled, and the new head is answered: every admitted commit
// ends exactly once (WriteLanes R10).
for (const [policy, sends, want] of [
  [
    "serialize",
    [commit, commit, commit],
    ["notSent Restored", "notSent Restored", "unknown Restored"],
  ],
  ["latest", [commit, commit], ["notSent Restored", "unknown Restored"]],
  ["cancel", [commit, { _tag: "CancelCommit", ...FLOW }], ["unknown Cancelled", OK]],
] as const)
  it(`${policy}: a reload with commits waiting ends each one Restored, once (Restore R3; WriteLanes R10)`, async () => {
    const client = clients[policy];

    const sent = sends.reduce<Story>(
      (s, event) => s.send(client, event),
      lanesStory(`lane-cells/${policy}-reload`).ensure(client).world(Git.sync.hold()),
    );

    const run = await played(sent.reload().ensure(client).advance("1 second").checkpoint("after"));

    expect(seen(run.evidence)).toEqual(want);
  });

// Open, owned by the write-ahead Task: a displaced Attempt whose call outlives its lane is in no
// lane record, so a reload loses the unknown Restored that Operations O3 and Persistence O6 promise
// for an acknowledged Attempt. Over a network that will not interrupt the sync, the new head
// answers and ends the lane while the displaced call is still out.
it.fails("WriteLanes R10: under cancel a displaced Attempt whose lane ended first is heard unknown Restored after a reload", async () => {
  const run = await played(
    Story.app(lanesSetup, {
      id: "lane-cells/cancel-displaced-outlives-lane",
      fixtures: [GitFakeSteadfast],
    })
      .ensure(cancelClient)
      .world(Git.sync.hold())
      .send(cancelClient, commit)
      .send(cancelClient, { _tag: "CancelCommit", ...FLOW })
      .reload()
      .ensure(cancelClient)
      .advance("1 second")
      .checkpoint("after"),
  );

  expect(seen(run.evidence)).toEqual([OK, "unknown Restored"]);
});

it("serialize: queued commits end NotSent Disposed when the Runtime's disposal starts, and none is promoted (WriteLanes algorithm, disposal)", async () => {
  const run = await played(
    lanesStory("lane-cells/serialize-disposed")
      .ensure(serializeClient)
      .world(Git.sync.hold())
      .send(serializeClient, commit)
      .send(serializeClient, commit)
      .send(serializeClient, commit)
      .disposeRuntime()
      .advance("5 seconds")
      .checkpoint("after"),
  );

  const all = seen(run.evidence);

  expect(all.filter((e) => e === "notSent Disposed")).toHaveLength(2);
  expect(run.checkpoints.after.read(Git.sync)).toHaveLength(1);
});

it("serialize: a cancel of a Held head releases it and promotes the queued commit, whose row stops waiting (WriteLanes R8, R14; Reads R14)", async () => {
  const run = await played(
    lanesStory("lane-cells/serialize-release-promotes")
      .ensure(serializeClient)
      .world(Git.sync.drop())
      .send(serializeClient, commit)
      .send(serializeClient, commit)
      .checkpoint("held")
      .send(serializeClient, { _tag: "Cancel", ...FLOW })
      .advance("1 second")
      .checkpoint("after"),
  );

  expect(rowAt(run.checkpoints.held, "serialize")).toMatchObject({
    uncertain: true,
    waiting: true,
  });
  expect(seen(run.evidence)).toEqual(["unknown", OK]);
  expect(laneFacts(run.evidence, "Released")).toBe(1);
  expect(rowAt(run.checkpoints.after, "serialize")).toBeUndefined();
});
