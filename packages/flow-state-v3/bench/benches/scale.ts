import { Effect, Option } from "effect";
import type { Story } from "../../src/host/testing/index.ts";
import { attachInspector } from "../../src/host/inspect.ts";
import { bench } from "../declare.ts";
import { storySubject } from "./story.ts";

// A per-unit cost that should not grow with the world: at most about 2x per 10x of size.
const FLAT = 0.3;

// A whole-run cost that should grow linearly with its size, with some slack.
const LINEAR = 1.2;

type Point = {
  readonly subject: string;
  readonly n: number;
  readonly unit: string;
  readonly runs: number;
  readonly story: () => Promise<Story<string>>;
};

const series = (name: string, maxSlope: number, metric: string, points: ReadonlyArray<Point>) =>
  points.map((p) =>
    bench({
      id: `scale.${p.subject}.${metric}`,
      concern: "scale",
      tags: ["story", name],
      size: { n: p.n, unit: p.unit },
      series: Option.some({ name, maxSlope }),
      runs: p.runs,
      load: async () => storySubject(await p.story()),
    }),
  );

const single = (subject: string, n: number, unit: string, runs: number, story: Point["story"]) =>
  bench({
    id: `scale.${subject}.per-turn-ms`,
    concern: "scale",
    tags: ["story", "past-caps"],
    size: { n, unit },
    runs,
    load: async () => storySubject(await story()),
  });

const lanesLoad = () => import("../../fixtures/lanes/stories/load.ts");
const sessionLoad = () => import("../../fixtures/session/stories/load.ts");
const sessionValues = () => import("../../fixtures/session/stories/values.ts");
const palette = () => import("../../fixtures/command-palette/stories/usual.ts");

const actors = series("actors", FLAT, "per-turn-ms", [
  {
    subject: "lanes.crowd-16",
    n: 16,
    unit: "actors",
    runs: 20,
    story: async () => (await lanesLoad()).stressCrowd16(),
  },
  {
    subject: "lanes.crowd-256",
    n: 256,
    unit: "actors",
    runs: 10,
    story: async () => (await lanesLoad()).stressCrowd256(),
  },
]);

const saved = series("saved-identities", FLAT, "per-turn-ms", [
  {
    subject: "session.wall-64",
    n: 64,
    unit: "saved",
    runs: 20,
    story: async () => (await sessionLoad()).wall,
  },
  {
    subject: "session.stress-wall-5000",
    n: 5000,
    unit: "saved",
    runs: 3,
    story: async () => (await sessionLoad()).stressWall(),
  },
]);

const depth = series(
  "value-depth",
  LINEAR,
  "per-turn-ms",
  [100, 1000, 3000].map((n) => ({
    subject: `session.nest-lists-${n}`,
    n,
    unit: "levels",
    runs: 10,
    story: async () => (await sessionValues()).nestAt("Lists", n, `session/bench-nest-${n}`),
  })),
);

const lists = series("list-length", LINEAR, "per-turn-ms", [
  {
    subject: "palette.large-list-10000",
    n: 10_000,
    unit: "commands",
    runs: 10,
    story: async () => (await palette()).largeListSaved,
  },
  {
    subject: "palette.stress-huge-list-300000",
    n: 300_000,
    unit: "commands",
    runs: 3,
    story: async () => (await palette()).stressHugeList(),
  },
]);

const singles = [
  single("lanes.serialize-deep", 1000, "queued", 10, async () =>
    (await lanesLoad()).serializeDeep(),
  ),
  single("session.outline-deep", 100_000, "levels", 5, async () =>
    (await sessionValues()).outlineDeep(),
  ),
  single("session.avatar-wall", 65, "saved", 10, async () => (await sessionLoad()).avatarWall),
  single(
    "cells.long-key",
    1,
    "story",
    10,
    async () => (await import("../../fixtures/cells/stories/edges.ts")).longKey,
  ),
  single(
    "sign-in.long-email",
    1,
    "story",
    10,
    async () => (await import("../../fixtures/sign-in/stories/edges.ts")).longEmail,
  ),
  single(
    "transfers.long-id",
    1,
    "story",
    10,
    async () => (await import("../../fixtures/transfers/stories/edges.ts")).longId,
  ),
  single(
    "player.long-room",
    1,
    "story",
    10,
    async () => (await import("../../fixtures/player/stories/edges.ts")).longRoomPlays,
  ),
];

// A burst of `size` sends to one actor while a turn runs, all queued in one mailbox and each served.
const burstSubject = async (size: number) => {
  const { lanesSetup, serializeClient } = await import("../../fixtures/lanes/app.ts");

  const burst = () => {
    const runtime = lanesSetup.construct();
    // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the bench is a host boundary: it boots a Runtime synchronously to time its sends
    Effect.runSync(runtime.ready());
    const client = runtime.ensureActor(serializeClient);
    const seen = { first: true, turns: 0 };

    attachInspector(runtime, (e) => {
      if (e._tag !== "Turn") return;
      seen.turns += 1;

      if (!seen.first) return;
      seen.first = false;

      for (let n = 0; n < size; n += 1) client.send({ _tag: "Cancel", repo: "flow" });
    });

    const start = performance.now();
    client.send({ _tag: "Cancel", repo: "flow" });

    return { ms: performance.now() - start, turns: seen.turns };
  };

  return {
    op: async () => {
      const done = burst();

      return { units: size + 1, counters: { turns: done.turns }, sample: Option.some(done.ms) };
    },
    proof: async () => {
      const { turns } = burst();

      return turns === size + 1
        ? Option.none()
        : Option.some(`a burst of ${size} sends served ${turns - 1} of them`);
    },
    shape: { sends: size },
  };
};

const mailbox = [2000, 20_000].map((n) =>
  bench({
    id: `scale.lanes.mailbox-burst-${n}.per-send-ms`,
    concern: "scale",
    tags: ["runtime", "mailbox-depth"],
    size: { n, unit: "sends" },
    series: Option.some({ name: "mailbox-depth", maxSlope: FLAT }),
    runs: 10,
    load: () => burstSubject(n),
  }),
);

/**
 * Every `scale` bench: series over size, each with the slope its claim allows, and the single
 * Stories past the caps the runtime no longer has.
 */
export const scaleBenches = [...actors, ...saved, ...depth, ...lists, ...mailbox, ...singles];
