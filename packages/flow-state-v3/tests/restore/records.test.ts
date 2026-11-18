import { readdirSync, readFileSync } from "node:fs";
import { Option, Predicate, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { manifests, type Manifest } from "../../fixtures/index.ts";
import { TraceRecord } from "../../src/host/trace.ts";
import { Fake, Step, type Story, type StoryRun } from "../../src/host/testing/index.ts";
import type { Machine } from "../../src/index.ts";
import { canonicalText } from "../rules/records.ts";
import { breachesOf } from "../rules/rules.ts";

type Compiled = Machine["compiled"];

type Machines = ReadonlyMap<string, Compiled>;

const KINDS = ["actor/", "lane/", "owed/"] as const;

// An Attempt id as the Runtime mints it.
const ATTEMPT = /^att-[\da-f]+-\d+$/u;

const parse = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json));

// A problem when a rule does not hold, none when it does.
const unless = (holds: boolean, problem: string) => (holds ? [] : [problem]);

// RETURN_TYPE: a type guard narrows a JSON value to its object member.
const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  value !== null &&
  !Array.isArray(value) &&
  !Predicate.isString(value) &&
  !Predicate.isNumber(value) &&
  !Predicate.isBoolean(value);

const compiledOf = (m: Manifest) =>
  new Map(
    Object.values(m.app.machines).map((entry) => {
      const { compiled } = "machine" in entry ? entry.machine : entry;

      return [compiled.id, compiled] as const;
    }),
  );

const unescape = (name: string) =>
  name.replaceAll("%7C", "|").replaceAll("%2F", "/").replaceAll("%25", "%");

// The longest declared machine id a text starts with, followed by `/`.
const machineIn = (machines: Machines, text: string) =>
  Option.fromUndefinedOr(
    [...machines.keys()]
      .filter((id) => text.startsWith(`${id}/`))
      .toSorted((a, b) => b.length - a.length)[0],
  );

/**
 * A record key read back into its parts, by the machines the app declares: the test's own reading
 * of `kind/machine/name`, with a lane's `|operation|keyText` after the name.
 */
const partsOf = (machines: Machines, key: string) =>
  Option.flatMap(Option.fromUndefinedOr(KINDS.find((k) => key.startsWith(k))), (kind) => {
    const rest = key.slice(kind.length);

    return Option.map(machineIn(machines, rest), (machine) => {
      const [name = "", operation = "", ...keyText] = rest.slice(machine.length + 1).split("|");
      const lane = kind === "lane/";

      return {
        kind,
        machine,
        name: unescape(name),
        operation: lane ? Option.some(operation) : Option.none<string>(),
        keyText: lane ? Option.some(keyText.join("|")) : Option.none<string>(),
      };
    });
  });

// The keys a Story put in the store itself: the Runtime did not write them.
const putBy = (story: Story<string>) =>
  new Set(
    story.steps.flatMap((step) =>
      step._tag === "world" ? step.words.flatMap((w) => (w._tag === "stored" ? [w.key] : [])) : [],
    ),
  );

// How deep a JSON value nests, read with its own stack.
const depthOf = (root: Schema.Json) => {
  let deepest = 0;
  const stack: Array<readonly [Schema.Json, number]> = [[root, 1]];

  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    const [value, depth] = next;
    deepest = Math.max(deepest, depth);

    if (Array.isArray(value)) for (const item of value) stack.push([item, depth + 1]);
    else if (isJsonObject(value))
      for (const item of Object.values(value)) stack.push([item, depth + 1]);
  }

  return deepest;
};

// Records deeper than this are the codec's own cases (Codec T1): corrupting their structure is
// what this test is for, and walking their values recursively would only measure the stack.
const DEEPEST = 64;

type Store = {
  readonly fixture: Manifest;
  readonly story: Story<string>;
  // The Story's steps up to the cut the store was saved at.
  readonly steps: ReadonlyArray<Step>;
  readonly stored: ReadonlyMap<string, string>;
};

type Saved = Store & { readonly key: string; readonly text: string };

// A JSON value's type, an empty container told apart from a filled one.
const typeOf = (v: Schema.Json) => {
  if (v === null) return "null";

  if (Array.isArray(v)) return v.length === 0 ? "[]" : "[..]";

  if (isJsonObject(v)) return Object.keys(v).length === 0 ? "{}" : "{..}";

  if (Predicate.isString(v)) return "string";

  return Predicate.isNumber(v) ? "number" : "boolean";
};

// A record's kind of content: its kind, machine and operation, and the type of each top-level
// field.
const contentOf = (machines: Machines, key: string, text: string) => {
  const json = parse(text);

  const fields = isJsonObject(json)
    ? Object.entries(json).map(([k, v]) => `${k}:${typeOf(v)}`)
    : [];

  const named = Option.match(partsOf(machines, key), {
    onNone: () => key,
    onSome: (p) => `${p.kind}${p.machine}|${Option.getOrElse(p.operation, () => "")}`,
  });

  return `${named} ${fields.toSorted().join(",")}`;
};

// What else of the record's identity the store holds, by kind and the lane records' heads: the same
// record restores differently when its identity is owed endings at the boot.
const besideOf = (machines: Machines, stored: ReadonlyMap<string, string>, key: string) =>
  Option.match(partsOf(machines, key), {
    onNone: () => "",
    onSome: (own) =>
      [...stored]
        .flatMap(([k, text]) =>
          Option.toArray(
            Option.map(
              Option.filter(
                partsOf(machines, k),
                (p) => k !== key && p.machine === own.machine && p.name === own.name,
              ),
              (p) => `${p.kind}${text.includes('"inFlight":true') ? " in flight" : ""}`,
            ),
          ),
        )
        .toSorted()
        .join(","),
  });

/**
 * The store at every checkpoint and the end of every fixture's Stories, with the steps that saved
 * it. A Story that put records in the store itself saved a world the Runtime did not write, so it
 * is left out.
 */
const storesOf = async () => {
  const found: Array<Store> = [];

  for (const fixture of manifests)
    for (const story of Object.values(fixture.stories).filter((s) => putBy(s).size === 0)) {
      const run = await story.run();

      for (const [n, step] of story.steps.entries())
        if (step._tag === "checkpoint")
          for (const cut of Option.toArray(Option.fromUndefinedOr(run.checkpoints[step.name])))
            found.push({
              fixture,
              story,
              steps: story.steps.slice(0, n + 1),
              stored: cut.records.stored,
            });

      found.push({ fixture, story, steps: story.steps, stored: run.end.records.stored });
    }

  return found;
};

/**
 * One record of each kind of content per fixture from those stores, with the store it was saved
 * in.
 */
const savedRecords = (stores: ReadonlyArray<Store>) => {
  const found: Array<Saved> = [];
  const seen = new Set<string>();

  for (const store of stores) {
    const machines = compiledOf(store.fixture);

    for (const [key, text] of store.stored) {
      const content = `${store.fixture.name} ${contentOf(machines, key, text)} beside ${besideOf(machines, store.stored, key)}`;

      if (!seen.has(content) && depthOf(parse(text)) <= DEEPEST) {
        seen.add(content);
        found.push({ ...store, key, text });
      }
    }
  }

  return found;
};

type Mutant = { readonly path: string; readonly json: Schema.Json };

// The values one corrupt array could hold, each with how it was corrupted.
// RETURN_TYPE: every branch gives the same list of corrupt values, typed once.
const corruptArray = (value: Schema.JsonArray): ReadonlyArray<readonly [string, Schema.Json]> => {
  const [first] = value;

  if (first === undefined) return [["item added", ["x"]]];

  return [
    ["emptied", []],
    ["item repeated", [...value, first]],
  ];
};

// The values one corrupt field could hold, by the field's JSON type alone, each with how it was
// corrupted.
// RETURN_TYPE: every branch gives the same list of corrupt values, typed once.
const corruptOf = (value: Schema.Json): ReadonlyArray<readonly [string, Schema.Json]> => {
  if (Predicate.isString(value))
    return [
      ["emptied", ""],
      ["local", "~1"],
      ["lengthened", `${value}x`],
    ];

  if (Predicate.isNumber(value))
    return [
      ["negative", -1],
      ["fractional", value + 0.5],
      ["past 2^53", 2 ** 53],
    ];

  if (Predicate.isBoolean(value)) return [["flipped", !value]];

  if (value === null) return [["filled", "x"]];

  if (Array.isArray(value)) return corruptArray(value);

  return [["field added", Object.fromEntries([...Object.entries(value), ["x", 1]])]];
};

type Walk = (value: Schema.Json, path: string, set: (v: Schema.Json) => Schema.Json) => void;

// Every record with exactly one field corrupted, needing no list of fields: each leaf and
// container gets its type's corrupt values, each object key is also dropped, and of an array only
// the first item is walked into, and of an object with more than 16 keys (a map an app filled)
// only the first key of each kind of value.
const mutantsOf = (root: Schema.Json) => {
  const out: Array<Mutant> = [];

  const fields = (value: Schema.JsonObject, path: string, set: (v: Schema.Json) => Schema.Json) => {
    const kinds = new Set<string>();
    const wide = Object.keys(value).length > 16;

    for (const [k, v] of Object.entries(value)) {
      out.push({
        path: `${path}.${k} dropped`,
        json: set(Object.fromEntries(Object.entries(value).filter(([key]) => key !== k))),
      });

      const kind = isJsonObject(v) ? Object.keys(v).join(",") : typeOf(v);

      if (!wide || !kinds.has(kind)) {
        kinds.add(kind);
        walk(v, `${path}.${k}`, (next) =>
          set(Object.fromEntries([...Object.entries(value), [k, next]])),
        );
      }
    }
  };

  const walk: Walk = (value, path, set) => {
    for (const [how, json] of corruptOf(value))
      out.push({ path: `${path} ${how}`, json: set(json) });

    if (Array.isArray(value)) {
      const [first] = value;

      if (first !== undefined) walk(first, `${path}[0]`, (v) => set([v, ...value.slice(1)]));
    } else if (isJsonObject(value)) fields(value, path, set);
  };

  walk(root, "$", (v) => v);

  return out;
};

// Restore R5's limit, extended to queued commits and displaced Attempts as proposed: a well-formed
// queued commit or displaced Attempt added or removed, or an owed row repeated, cannot be told
// from a real one, so its ending is judged only for a boot that never fails. An owed record with
// no rows is never written (WriteAhead I20), so emptied rows are judged in full.
const UNTELLABLE = /\.(?:queue|displaced) (?:emptied|item repeated)$|\.rows item repeated$/u;

// A record holds exactly its kind's fields (Codec R5): one with a field added is quarantined.
const FIELD_ADDED = "$ field added";

// A binding renamed to a name its provider's machine could give names another identity a ref's
// context could have bound, so an ensure by the entry's wiring is refused as it would be for a
// real record (ConflictingActorRef); a binding to a name no ref gives is covered by its own test.
const REBOUND = /\.(?:context|graph)\..*\.name (?:emptied|lengthened)$/u;

const lastOpen = (run: StoryRun) =>
  run.trace.events.reduce((open, e) => Math.max(open, e.tab.open), 0);

const quarantinedIn = (run: StoryRun, key: string) => {
  const open = lastOpen(run);

  return run.trace.events.some(
    (e) =>
      e.tab.open === open &&
      TraceRecord.$is("Runtime")(e.record) &&
      e.record.evidence._tag === "Reported" &&
      e.record.evidence.code === "RecordUndecodable" &&
      Option.contains(e.record.evidence.record, key),
  );
};

// What makes the world a boot left ill-formed, by the machines the app declares: an actor in a
// state its machine lacks or with a schedule it does not declare, a lane of an operation that is
// not a write or with an Attempt the Runtime never mints, an owed row of an undeclared operation.
const illFormed = (machines: Machines, run: StoryRun) => {
  const cut = run.end.inspection;

  const machineAt = (actor: string) =>
    Option.flatMap(machineIn(machines, actor), (id) => Option.fromUndefinedOr(machines.get(id)));

  const actors = cut.actors.flatMap(({ actor, snapshot }) =>
    Option.match(machineAt(actor), {
      onNone: () => [`${actor} is of no declared machine`],
      onSome: (compiled) => {
        const schedules = new Set(
          [...compiled.states.values()].flatMap((n) => n.schedules.map((s) => s.name)),
        );

        return [
          ...unless(compiled.states.has(snapshot.state), `${actor} is in state ${snapshot.state}`),
          ...snapshot.schedules
            .filter((s) => !schedules.has(s.key))
            .map((s) => `${actor} arms schedule ${s.key}`),
        ];
      },
    }),
  );

  const lanes = cut.lanes.flatMap((lane) => [
    ...unless(
      Option.exists(machineAt(lane.actor), (c) =>
        Option.exists(
          Option.fromUndefinedOr(c.operations.get(lane.operation)),
          (o) => o._tag === "Write",
        ),
      ),
      `${lane.actor} holds a lane of ${lane.operation}`,
    ),
    ...unless(ATTEMPT.test(lane.attempt), `${lane.actor} holds Attempt ${lane.attempt}`),
    ...unless(
      Number.isSafeInteger(lane.retryCount) && lane.retryCount >= 0,
      `${lane.actor} re-sent ${String(lane.retryCount)} times`,
    ),
  ]);

  const owed = cut.owed.flatMap((row) => [
    ...unless(
      Option.exists(machineAt(row.actor), (c) => c.operations.has(row.operation)),
      `${row.actor} is owed an ending of ${row.operation}`,
    ),
    ...unless(
      Option.match(row.attempt, { onNone: () => true, onSome: (a) => ATTEMPT.test(a) }),
      `${row.actor} is owed an ending of Attempt ${Option.getOrElse(row.attempt, () => "")}`,
    ),
  ]);

  return [
    ...unless(cut.lifecycle === "Open", `the Runtime is ${cut.lifecycle}`),
    ...actors,
    ...lanes,
    ...owed,
  ];
};

// Whether a record keeps its identity owed endings the boot derives: an owed record, or a lane in
// flight or holding a queue or displaced Attempts (Restore R1).
const owesAtBoot = (kind: string, text: string) =>
  kind === "owed/" ||
  (kind === "lane/" &&
    (text.includes('"inFlight":true') ||
      !text.includes('"queue":[]') ||
      !text.includes('"displaced":[]')));

// The identities a store's records name, by their keys, except those the boot wakes itself: an
// app ensures an identity by its own ref, whose context this test does not know, so ensuring a
// woken one again with its entry's wiring could only be refused for that.
const asleepIn = (machines: Machines, stored: ReadonlyMap<string, string>) => {
  const all = [...stored].flatMap(([key, text]) =>
    Option.toArray(Option.map(partsOf(machines, key), (p) => ({ ...p, text }))),
  );

  const owing = new Set(
    all.filter((p) => owesAtBoot(p.kind, p.text)).map((p) => `${p.machine}/${p.name}`),
  );

  const asleep = all
    .filter((p) => !owing.has(`${p.machine}/${p.name}`))
    .map((p) => [`${p.machine}/${p.name}`, { machine: p.machine, name: p.name }] as const);

  return [...new Map(asleep).values()];
};

// How one corrupt record is judged: as Restore R5's limit, as a rebinding, or in full.
type Judged = "untellable" | "rebound" | "full";

// RETURN_TYPE: the judgement names its three cases.
const judgedAs = (path: string): Judged => {
  if (UNTELLABLE.test(path)) return "untellable";

  return REBOUND.test(path) ? "rebound" : "full";
};

// Why one finished run of a corrupt record breaks Restore R5: a run rule's breach, or, when the
// record was not quarantined and reported, a world the boot left ill-formed.
const judge = (machines: Machines, key: string, judged: Judged, done: StoryRun) => {
  if (judged === "untellable")
    return unless(
      done.end.inspection.lifecycle === "Open",
      `the Runtime is ${done.end.inspection.lifecycle}`,
    );

  return quarantinedIn(done, key)
    ? breachesOf(done)
    : [...breachesOf(done), ...illFormed(machines, done)];
};

// Why the record as saved breaks Restore R5: it must be canonical, read back unquarantined, and
// keep every rule, so a mutant's failure is its corrupt field's, not the way it was booted.
const judgeSaved = (machines: Machines, saved: Saved, done: StoryRun) => [
  ...unless(canonicalText(parse(saved.text)) === saved.text, "is not canonical text"),
  ...unless(!quarantinedIn(done, saved.key), "was quarantined"),
  ...judge(machines, saved.key, "full", done),
];

// A run that failed: refused only for a rebinding is the limit REBOUND names.
// FLOW_STATE_ALLOW_UNKNOWN: a rejected run's reason is untyped until it is printed.
const failed = (judged: Judged, fault: unknown) =>
  unless(
    judged === "rebound" && String(fault).includes("ConflictingActorRef"),
    `the run failed: ${String(fault)}`,
  );

/**
 * One corrupt record booted in its Story's own saved world: the Story runs to the cut, the corrupt
 * text replaces the record, the tab reloads and every identity the boot left asleep is ensured.
 * Gives why each result breaks Restore R5. The record as saved runs first and must break nothing,
 * so a failure is the corrupt field's, not the way it was booted.
 */
const bootCorrupt = async (saved: Saved, mutants: ReadonlyArray<Mutant>) => {
  const machines = compiledOf(saved.fixture);

  const ensures = asleepIn(machines, saved.stored).map((actor) =>
    Step.ensure({ actor, context: new Map() }),
  );

  const run = (json: Schema.Json) =>
    saved.story.run({
      steps: [
        ...saved.steps,
        Step.world({ words: [Fake.storage.put(saved.key, canonicalText(json))] }),
        Step.reload({ reattach: false, heldWrites: "abort" }),
        ...ensures,
      ],
    });

  const boot = (json: Schema.Json, path: string) => {
    const judged = judgedAs(path);

    return run(json).then(
      (done) =>
        path === FIELD_ADDED
          ? unless(quarantinedIn(done, saved.key), "a field its kind lacks was read")
          : judge(machines, saved.key, judged, done),
      // FLOW_STATE_ALLOW_UNKNOWN: a rejected run's reason is untyped until it is printed.
      (fault: unknown) => failed(judged, fault),
    );
  };

  const found: Array<string> = [];
  const where = `${saved.fixture.name} ${saved.story.id} ${saved.key}`;

  const asSaved = await run(parse(saved.text)).then(
    (done) => judgeSaved(machines, saved, done),
    // FLOW_STATE_ALLOW_UNKNOWN: a rejected run's reason is untyped until it is printed.
    (fault: unknown) => [`the run failed: ${String(fault)}`],
  );

  for (const why of asSaved) found.push(`${where} as saved: ${why}`);

  for (const mutant of mutants)
    for (const why of await boot(mutant.json, mutant.path))
      found.push(`${where} ${mutant.path}: ${why.slice(0, 200)}`);

  return found;
};

// Every fixture's stores, run once for the tests below.
const stores = storesOf();

describe("corrupt saved records (Restore R5, I10; Codec R5)", () => {
  // Open: a record's fields that name a state, a schedule, an Attempt or a provider, its retry
  // count and its queued inputs are decoded as text or not at all and trusted, so a corrupt one
  // restores an ill-formed world, breaks a run rule or stops the app's ensure.
  it.fails("Restore R5: a saved record with any one field corrupted is quarantined and reported, or restores a well-formed world; the boot never fails", async () => {
    const failures: Array<string> = [];

    for (const saved of savedRecords(await stores))
      failures.push(...(await bootCorrupt(saved, mutantsOf(parse(saved.text)))));

    expect(failures).toEqual([]);
  }, 120_000);
});

// The parts of an owed record's rows that name their lane's operation beside the lane.
const rowsRepeating = (key: string, json: Schema.JsonObject) => {
  const rows = json["rows"];

  return (Array.isArray(rows) ? rows : []).flatMap((row, i) =>
    unless(
      !isJsonObject(row) || !Predicate.isString(row["lane"]) || !Object.hasOwn(row, "operation"),
      `${key} row ${String(i)} holds operation beside its lane, which names it`,
    ),
  );
};

// What a record's content repeats of its key, or of itself: a field holding its key's machine,
// name, operation or key text, an owed row naming its lane's operation beside the lane, and a lane
// with no head that still stores a queue or whether it is in flight.
const repeatedIn = (machines: Machines, key: string, text: string) =>
  Option.match(partsOf(machines, key), {
    onNone: () => [`${key} has no kind and machine`],
    onSome: (parts) => {
      const json = parse(text);

      if (!isJsonObject(json)) return [`${key} is not an object`];

      const determined = new Set([
        parts.machine,
        parts.name,
        ...Option.toArray(parts.operation),
        ...Option.toArray(parts.keyText),
      ]);

      const headless = parts.kind === "lane/" && (json["attempt"] ?? null) === null;

      return [
        ...Object.entries(json)
          .filter(([, v]) => Predicate.isString(v) && determined.has(v))
          .map(([field]) => `${key} holds ${field}, which its key names`),
        ...rowsRepeating(key, json),
        ...["queue", "inFlight"].flatMap((field) =>
          unless(!headless || !Object.hasOwn(json, field), `${key} has no head and holds ${field}`),
        ),
      ];
    },
  });

describe("each fact stored once (Codec R5; WriteAhead R4, R5)", () => {
  // Open: every record also holds the identity its key names, a lane its operation, and an owed
  // row its lane's operation.
  it.fails("Codec R5: no saved record holds what its key determines, an owed row names its lane only by its key, and a lane with no head stores no queue or inFlight", async () => {
    const repeated = new Set<string>();

    for (const store of await stores) {
      const machines = compiledOf(store.fixture);

      for (const [key, text] of store.stored)
        for (const r of repeatedIn(machines, key, text)) repeated.add(r);
    }

    expect([...repeated]).toEqual([]);
  }, 60_000);
});

// Hand parsing of identity, record key and lane key text: a local-name prefix test, a record kind
// prefix list, lookup or test, a key cut after its kind or machine, a lane id's prefix built from an actor key, the key text cut from a lane id,
// and an incarnation's count cut from its id.
const HAND_PARSING = [
  /startsWith\(LOCAL_PREFIX\)/u,
  /KINDS\.find\(/u,
  /key\.slice\(kind\.length\)/u,
  /key\.startsWith\(`\$\{own\}\|`\)/u,
  /key\.indexOf\("\/"\)/u,
  /\["actor\/", "lane\/", "owed\/"\]/u,
  /startsWith\("(?:actor|lane|owed)\/"\)/u,
  /`\$\{actorKey\([^)]*\)\}\|/u,
  /\.slice\(own\.length\)/u,
  /lastIndexOf\("-"\)/u,
];

// Every source file under a directory of the package, by path from the package root.
// RETURN_TYPE: recursive: a directory's files include its subdirectories' files.
const sourceFiles = (dir: string): ReadonlyArray<string> =>
  readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true }).flatMap(
    (entry) => {
      if (entry.isDirectory()) return sourceFiles(`${dir}/${entry.name}`);

      return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
        ? [`${dir}/${entry.name}`]
        : [];
    },
  );

describe("identity parsed in one place (Codec R5; Restore R5)", () => {
  // Open: identity and key text are cut and prefixed by hand in several modules beside the
  // identity module.
  it.fails("Codec R5: identity, record key and lane key text are parsed only by the identity module", () => {
    const sites = sourceFiles("src")
      .filter((file) => file !== "src/core/identity.ts")
      .flatMap((file) =>
        readFileSync(new URL(`../../${file}`, import.meta.url), "utf8")
          .split("\n")
          .flatMap((line, n) =>
            HAND_PARSING.some((p) => p.test(line)) ? [`${file}:${String(n + 1)}`] : [],
          ),
      );

    expect(sites).toEqual([]);
  });
});
