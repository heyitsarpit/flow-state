import { readdirSync, readFileSync } from "node:fs";
import { Predicate, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { manifests } from "../../fixtures/index.ts";
import { definition, Flow, machine } from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";
import { refusal } from "../refusals.ts";

// Every user of schedules migrated to the declared form, and the old form deleted. Each check is
// inverted until the last user moves.

type Tokens = {
  readonly S: Readonly<Record<string, unknown>>;
  readonly E: Readonly<Record<string, unknown>>;
};

const untyped: {
  readonly definition: (config: unknown) => Tokens;
  readonly machine: (definition: unknown, body: (tokens: Tokens) => unknown) => unknown;
} = loose({ definition, machine });

// A machine's `Compiled.schedules`, when it has one.
const tableOf = (compiled: unknown) =>
  Predicate.hasProperty(compiled, "schedules") ? compiled.schedules : undefined;

describe("every fixture declares the schedules it places (Types R8, I11, T2)", () => {
  it.fails("Types I11: each schedule a fixture machine places has its Compiled.schedules entry", () => {
    const placed = manifests.flatMap((manifest) =>
      Object.values(manifest.app.machines).flatMap((entry) => {
        const { compiled } = "machine" in entry ? entry.machine : entry;
        const table = tableOf(compiled);

        return [...compiled.states.values()].flatMap((node) =>
          node.schedules.map((schedule) => ({
            at: `${manifest.name}/${compiled.id}/${schedule.name}`,
            declared: Predicate.isMap(table) && table.has(schedule.name),
          })),
        );
      }),
    );

    expect(placed.length).toBeGreaterThan(0);
    expect(placed.filter(({ declared }) => !declared).map(({ at }) => at)).toEqual([]);
  });
});

// A lamp with no schedule declaration, as the old form wrote every machine.
const Undeclared = () =>
  untyped.definition({
    id: "Migration/Lamp",
    states: ["OFF"],
    events: {},
    internalEvents: { Tick: {} },
    memory: { ids: Flow.initial(Schema.Array(Schema.String), []) },
  });

// Each refusal's reason; none when it constructs.
const reasonsOf = (construct: () => unknown) =>
  refusal(construct, (d) => [String(d.details.reason ?? d.code)]).flat();

describe("the old form is refused (Types R8, I13)", () => {
  it.fails("Types I13: a body schedule written in the old form, its definition declaring none, is refused ScheduleUndeclared", () => {
    expect(
      reasonsOf(() =>
        untyped.machine(Undeclared(), ({ S, E }) => ({
          default: S["OFF"],
          states: { OFF: { schedules: { tick: { schedule: 1000, send: E["Tick"] } } } },
        })),
      ),
    ).toContain("ScheduleUndeclared");
  });

  it.fails("Types I13: the old keyed wrapper, written by hand, is refused ScheduleUndeclared", () => {
    expect(
      reasonsOf(() =>
        untyped.machine(Undeclared(), ({ S, E }) => ({
          default: S["OFF"],
          states: {
            OFF: {
              schedules: {
                poll: {
                  "~flow": "keyed",
                  config: { keys: () => [{ id: "a" }], schedule: 1000, send: E["Tick"] },
                },
              },
            },
          },
        })),
      ),
    ).toContain("ScheduleUndeclared");
  });

  it.fails("Types R8: Flow.keyed is gone from Flow", () => {
    expect(Object.keys(Flow)).not.toContain("keyed");
  });
});

// Every TypeScript file under a package folder, with its text.
const filesUnder = (folder: string) =>
  readdirSync(new URL(`../../${folder}/`, import.meta.url), { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".ts"))
    .map((path) => ({
      path: `${folder}/${path}`,
      text: readFileSync(new URL(`../../${folder}/${path}`, import.meta.url), "utf8"),
    }));

const OLD_FORM =
  /Flow\.keyed|KeyedConfig|KeyedSchedule|ScheduleKey\b|ScheduleParts|ErasedEntry|"~keyed"|"keyed"/u;

describe("the old form is gone from the package (Types R8)", () => {
  it.fails("Types R8: no source, fixture or test names Flow.keyed, KeyedConfig, KeyedSchedule, ScheduleKey, ScheduleParts, ErasedEntry or the keyed mark", () => {
    const self = "tests/compile/schedule-migration.test.ts";

    expect(
      [...filesUnder("src"), ...filesUnder("fixtures"), ...filesUnder("tests")]
        .filter(({ path, text }) => path !== self && OLD_FORM.test(text))
        .map(({ path }) => path),
    ).toEqual([]);
  });
});
