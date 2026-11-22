import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

// The turn's parts read from the source, until their types exist and take two-sided pins: only
// `apply.ts` writes an incarnation and publishes (Changes R11, I4), the writers it replaces are gone,
// and the unions of `model` and `realization` have their members (Changes Q5, T14).

const CORE = new URL("../../src/core/", import.meta.url);

const production = readdirSync(CORE).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".test-d.ts"),
);

const text = (file: string) => readFileSync(new URL(file, CORE), "utf8");

const filesWith = (pattern: RegExp) => production.filter((f) => pattern.test(text(f)));

// The writers `apply` replaces (Changes.md, fit to today's code: delete), by file and name.
const REPLACED = [
  "serve.ts#raised",
  "serve.ts#refusal",
  "incarnations.ts#setIncarnation",
  "incarnations.ts#publish",
  "context.ts#failing",
  "step.ts#fired",
  "world.ts#withIssue",
  "world.ts#withIssues",
  "world.ts#withoutIssue",
];

const declared = (entry: string) => {
  const [file = "", name = ""] = entry.split("#");

  return new RegExp(`(?:const|function)\\s+${name}\\b`, "u").test(text(file));
};

describe("one applier (Changes R11, I4)", () => {
  it.fails("Changes R11: only apply.ts writes an incarnation into the world", () => {
    expect(filesWith(/putIncarnation\(/u)).toEqual(["apply.ts"]);
  });

  it.fails("Changes R11: a publication is built at one call site, in apply.ts", () => {
    expect(filesWith(/Act\.Published\(/u)).toEqual(["apply.ts"]);
  });

  it.fails("Changes R11: the writers apply replaces are gone", () => {
    expect(REPLACED.filter(declared)).toEqual([]);
  });
});

// The members of a tagged union declared in a core file: the keys of its `Data.TaggedEnum<{ … }>`,
// or none when the file or the union is missing.
const membersOf = (file: string, union: string) => {
  if (!existsSync(new URL(file, CORE))) return [];

  const source = text(file);
  const start = source.indexOf(`type ${union} = Data.TaggedEnum<{`);

  if (start === -1) return [];

  const body = source.slice(start, source.indexOf("}>;", start));

  return [...body.matchAll(/^ {2}(\w+): /gmu)].map((m) => m[1] ?? "");
};

const byText = (a: string, b: string) => Number(a > b) - Number(a < b);

describe("the unions of the turn's parts (Changes model, realization)", () => {
  it.fails("Changes R11: a Change is one of nine tags", () => {
    expect(membersOf("apply.ts", "Change").toSorted(byText)).toEqual([
      "Begin",
      "End",
      "Inputs",
      "Lanes",
      "Refused",
      "Settled",
      "Turn",
      "Unturned",
      "Use",
    ]);
  });

  it.fails("Changes T14: an alarm is one of six kinds", () => {
    expect(membersOf("alarms.ts", "Alarm").toSorted(byText)).toEqual([
      "Bound",
      "Collect",
      "Grace",
      "Release",
      "Schedule",
      "Silent",
    ]);
  });

  it.fails("Changes realization: the host's one wake is Command.Wake and Input.Tick, with no per-timer Arm, Disarm or Fired", () => {
    const commands = membersOf("world.ts", "Command");
    const inputs = membersOf("input.ts", "Input");

    expect({
      wake: commands.includes("Wake"),
      tick: inputs.includes("Tick"),
      perTimer: [...commands, ...inputs].filter(
        (m) => m === "Arm" || m === "Disarm" || m === "Fired",
      ),
    }).toEqual({ wake: true, tick: true, perTimer: [] });
  });

  it.fails("Changes Q5: Published carries the incarnation and its why", () => {
    const published = /^ {2}Published: \{([^}]*)\};$/mu.exec(text("evidence.ts"))?.[1] ?? "";

    expect({
      incarnation: /\bincarnation:/u.test(published),
      why: /\bwhy:/u.test(published),
    }).toEqual({ incarnation: true, why: true });
  });
});

// Today's builders of a callback's inputs, each a record literal in the code that calls the
// callback; `readsOf` in `reads.ts` replaces every one (Changes R22, `model` CallbackInputs).
const BUILDERS = [
  { site: "turn.ts: a guard's and a patch's reads", file: "turn.ts", pattern: /const read = \{/gu },
  {
    site: "turn.ts: an action select's reads",
    file: "turn.ts",
    pattern: /const select = \{ memory/gu,
  },
  {
    site: "turn-arms.ts: a first delay's reads",
    file: "turn-arms.ts",
    pattern: /const input = \{ key: undefined/gu,
  },
  {
    site: "schedules.ts: a schedule function's reads",
    file: "schedules.ts",
    pattern: /const readOf = \(/gu,
  },
  {
    site: "context.ts: a reaction's `when` reads",
    file: "context.ts",
    pattern: /\{\s*memory: read\.memory,?\s*\}/gu,
  },
];

const found = BUILDERS.flatMap(({ site, file, pattern }) =>
  existsSync(new URL(file, CORE)) ? [...text(file).matchAll(pattern)].map(() => site) : [],
);

describe("one builder of callback inputs (Changes R22)", () => {
  it.fails("Changes R22: readsOf is declared once, in reads.ts", () => {
    expect(filesWith(/(?:const|function)\s+readsOf\b/u)).toEqual(["reads.ts"]);
  });

  it.fails("Changes R22: no caller of a user callback builds its inputs itself", () => {
    expect(found).toEqual([]);
  });
});
