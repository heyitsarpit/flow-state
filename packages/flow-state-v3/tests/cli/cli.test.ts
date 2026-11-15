// @effect-diagnostics unstableApiUsage:off -- main needs effect/cli's environment, whose services Effect marks unstable; these are its test layers.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Effect, FileSystem, Layer, Path, Predicate, Sink, Stdio, Terminal } from "effect";
import { ChildProcessSpawner } from "effect/process";
import { TestConsole } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";
import { stories as cellsStories } from "../../fixtures/cells/stories.ts";
import { stories as payStories } from "../../fixtures/pay/stories.ts";
import { stories as signInStories } from "../../fixtures/sign-in/stories.ts";
import { stories as syncStories } from "../../fixtures/sync/stories.ts";
import { stories as transferStories } from "../../fixtures/transfers/stories.ts";
import { main } from "../../src/host/cli/main.ts";
import * as testing from "../../src/host/testing/index.ts";
import type { Step, StoryRun } from "../../src/host/testing/index.ts";
import { render } from "../../src/host/trace.ts";
import * as root from "../../src/index.ts";

type Listed = {
  readonly id: string;
  readonly steps: ReadonlyArray<Step>;
  readonly run: () => Promise<StoryRun>;
};

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

const group = (app: string, stories: Readonly<Record<string, Listed>>) => ({
  app,
  stories: Object.values(stories),
});

const fixtures = [
  group("cells", cellsStories),
  group("shop", payStories),
  group("auth", signInStories),
  group("git", syncStories),
  group("bank", transferStories),
];

const every = fixtures.flatMap(({ stories }) => stories);

const decoder = new TextDecoder();

const collect = (into: Array<string>) =>
  Sink.forEachArray((chunks: ReadonlyArray<string | Uint8Array>) =>
    Effect.sync(() => {
      for (const chunk of chunks)
        into.push(Predicate.isString(chunk) ? chunk : decoder.decode(chunk));
    }),
  );

const unused = Effect.die("unused");

const cli = async (argv: ReadonlyArray<string>) => {
  const stdout: Array<string> = [];
  const stderr: Array<string> = [];

  const environment = Layer.mergeAll(
    FileSystem.layerNoop({}),
    Path.layer,
    Stdio.layerTest({ stdout: () => collect(stdout), stderr: () => collect(stderr) }),
    Layer.succeed(
      Terminal.Terminal,
      Terminal.make({
        columns: Effect.succeed(80),
        rows: Effect.succeed(24),
        readInput: unused,
        readLine: unused,
        display: () => Effect.void,
      }),
    ),
    Layer.succeed(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make(() => unused),
    ),
    TestConsole.layer,
  );

  const code = await Effect.runPromise(main(argv).pipe(Effect.provide(environment)));

  return { code, stdout: stdout.join(""), stderr: stderr.join("") };
};

const at = ["--project-root", projectRoot];

describe("flow trace", () => {
  for (const story of every)
    it(`CommandLine O2: trace ${story.id} prints the run's trace as render prints it`, async () => {
      const direct = await story.run();
      const printed = await cli(["trace", story.id, ...at]);

      expect(printed).toEqual({ code: 0, stdout: render(direct.trace, "text"), stderr: "" });
    });
});

describe("flow story run", () => {
  for (const story of every)
    it(`CommandLine O2: story run ${story.id} prints the direct run's checkpoints`, async () => {
      const direct = await story.run();

      const sequences = direct.trace.events.flatMap((e) =>
        e.record._tag === "Step" && e.record.step._tag === "checkpoint"
          ? [{ name: e.record.step.name, sequence: e.sequence }]
          : [],
      );

      const names = story.steps.flatMap((s) => (s._tag === "checkpoint" ? [s.name] : []));
      expect(sequences.map((s) => s.name)).toEqual(names);

      const lines = sequences.flatMap(({ name, sequence }) => [
        `checkpoint ${name} ${sequence}`,
        ...(direct.checkpoints[name]?.inspection.actors ?? []).map(
          ({ actor, snapshot }) => `  ${actor} ${snapshot.state}`,
        ),
      ]);

      const printed = await cli(["story", "run", story.id, ...at]);

      expect(printed).toEqual({
        code: 0,
        stdout: [`story ${story.id}`, ...lines, ""].join("\n"),
        stderr: "",
      });
    });
});

describe("flow story list", () => {
  it("CommandLine O1: story list names every Story the fixtures export, once, with its app", async () => {
    const printed = await cli(["story", "list", ...at]);
    const expected = fixtures.flatMap(({ app, stories }) => stories.map((s) => `${s.id} ${app}`));

    expect(printed.code).toBe(0);
    expect(printed.stderr).toBe("");
    expect(printed.stdout.endsWith("\n")).toBe(true);
    expect(printed.stdout.trimEnd().split("\n").toSorted()).toEqual(expected.toSorted());
  });
});

describe("unknown operands", () => {
  for (const argv of [
    ["story", "run", "pay/nope"],
    ["trace", "pay/nope"],
  ])
    it(`CommandLine O1, O3: ${argv.join(" ")} exits 2 naming the Story`, async () => {
      const printed = await cli([...argv, ...at]);

      expect(printed.code).toBe(2);
      expect(printed.stdout).toBe("");
      expect(printed.stderr).toContain("pay/nope");
    });

  it("CommandLine O3: a command flow does not have exits 2", async () => {
    const printed = await cli(["stroy", "list", ...at]);

    expect(printed.code).toBe(2);
    expect(printed.stdout).toBe("");
  });

  it("CommandLine O6: a project root without flow.config.ts exits 2", async () => {
    const printed = await cli([
      "story",
      "list",
      "--project-root",
      fileURLToPath(new URL(".", import.meta.url)),
    ]);

    expect(printed.code).toBe(2);
    expect(printed.stdout).toBe("");
    expect(printed.stderr).toContain("flow.config.ts");
  });
});

describe("public routes", () => {
  it("exports no CLI from the package's routes", () => {
    expect(Object.keys(root)).not.toContain("main");
    expect(Object.keys(testing)).not.toContain("main");

    const pkg: unknown = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    );

    expect(pkg).not.toHaveProperty("exports");
    expect(pkg).not.toHaveProperty("bin");
  });
});
