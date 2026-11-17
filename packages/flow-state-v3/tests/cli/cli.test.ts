// @effect-diagnostics unstableApiUsage:off -- main needs effect/cli's environment, whose services Effect marks unstable; these are its test layers.
import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  Effect,
  FileSystem,
  Layer,
  Path,
  PlatformError,
  Predicate,
  Stdio,
  Stream,
  Terminal,
} from "effect";
import { ChildProcessSpawner } from "effect/process";
import { TestConsole } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";
import { manifests } from "../../fixtures/index.ts";
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

const fixtures = manifests.map((m) => ({
  app: m.app.id,
  stories: Object.values(m.stories) satisfies ReadonlyArray<Listed>,
}));

const every = fixtures.flatMap(({ stories }) => stories);

const unused = Effect.die("unused");

// FLOW_STATE_ALLOW_UNKNOWN: Console records whatever it was given; main gives it strings.
const text = (lines: ReadonlyArray<unknown>) =>
  lines.map((line) => `${Predicate.isString(line) ? line : "(not a string)"}\n`).join("");

const cli = async (argv: ReadonlyArray<string>) => {
  const environment = Layer.mergeAll(
    FileSystem.layerNoop({
      glob: (pattern, options) =>
        Stream.runCollect(
          Stream.fromAsyncIterable(glob(pattern, { cwd: options?.root ?? "." }), (cause) =>
            PlatformError.systemError({
              _tag: "Unknown",
              module: "FileSystem",
              method: "glob",
              cause,
            }),
          ),
        ),
    }),
    Path.layer,
    Stdio.layerTest({}),
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

  return Effect.runPromise(
    Effect.gen(function* () {
      const code = yield* main(argv);

      return {
        code,
        stdout: text(yield* TestConsole.logLines),
        stderr: text(yield* TestConsole.errorLines),
      };
    }).pipe(Effect.provide(environment)),
  );
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
    ["story", "run", "shop/nope"],
    ["trace", "shop/nope"],
  ])
    it(`CommandLine O1, O3: ${argv.join(" ")} exits 2 naming the Story`, async () => {
      const printed = await cli([...argv, ...at]);

      expect(printed.code).toBe(2);
      expect(printed.stdout).toBe("");
      expect(printed.stderr).toContain("shop/nope");
    });

  it("CommandLine O3: a command flow does not have exits 2", async () => {
    const printed = await cli(["stroy", "list", ...at]);

    expect(printed.code).toBe(2);
    expect(printed.stderr).toContain("stroy");
  });

  it("CommandLine O1: a command named without its subcommand prints help and exits 0", async () => {
    const printed = await cli(["story"]);

    expect(printed.code).toBe(0);
    expect(printed.stdout).toContain("list");
    expect(printed.stdout).toContain("run");
    expect(printed.stderr).toBe("");
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
