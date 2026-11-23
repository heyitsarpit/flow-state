import { Option, Predicate, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { manifests } from "../../fixtures/index.ts";
import type { Manifest } from "../../fixtures/manifest.ts";
import {
  Fake,
  recordLiterals,
  Step,
  type Story,
  type StoryRun,
} from "../../src/host/testing/index.ts";
import { canonicalText, putBy, writtenForm } from "../rules/records.ts";
import { breachesOf } from "../rules/rules.ts";
import { reports } from "./opens.ts";

// One field of a real saved record corrupted at a time, by a mutation chosen from the JSON alone
// (Records `tests`, Alphabet), never from a list of the format's fields. Each mutant is classed by
// the form format 6's writer emits (`writtenForm`: Records R11, I2, Stage 1). Every mutant keeps
// safety, as the fault model gives a text no encoder wrote (Records `model`, FaultModel): the app
// boots (R5, I3); no other record is newly reported and no other identity hears other endings
// (R5); no local actor or identity the store does not name starts from it (R4, I9); a record
// reported unreadable or kept keeps its bytes (R6, I4). A mutant outside the writer's form is
// reported for its key, so none of its owed endings goes unreported (R1, R13), and hears no ending
// the uncorrupted store does not owe (R2, R11). A mutant inside the form is forged but valid and
// owes nothing (R20).

type Json = Schema.Json;

type JsonObject = { readonly [name: string]: Json };

type Path = ReadonlyArray<string | number>;

const JsonText = Schema.fromJsonString(Schema.Json);

// RETURN_TYPE: a type guard narrows a JSON value to its list form.
const isList = (j: Json): j is ReadonlyArray<Json> => Array.isArray(j);

// RETURN_TYPE: a type guard narrows a JSON value to its object form.
const isObject = (j: Json): j is JsonObject => Predicate.isObject(j) && !Array.isArray(j);

// How far a mutation walks into a record: the first items of a list and members of an object, to
// a depth no record of the fixtures reaches.
const WALK = { depth: 64, items: 2, members: 8 } as const;

type Mutant = { readonly what: string; readonly key: string; readonly text: string };

type Change = readonly [string, Json];

// What a node of each JSON type may be replaced by: another type, empty, and for a string its
// local and broken spellings, for a number its neighbours. Every node may also become null.
const LITERALS = recordLiterals;

// A string a codec names as a literal swapped for each other literal: a valid value of its own
// kind, in a place the writer may never put it (Records R11).
const swapsOf = (s: string) =>
  LITERALS.has(s)
    ? [...LITERALS].filter((l) => l !== s).map((l) => [`swapped ${l}`, l] as const)
    : [];

const stringChanges = (s: string) =>
  [["a number", 0], ["empty", ""], ["local", `~${s}`], ["spaced", `${s} `], ...swapsOf(s)] as const;

const numberChanges = (n: number) =>
  [
    ["a string", String(n)],
    ["plus one", n + 1],
    ["minus one", -1],
    ["half", 0.5],
  ] as const;

const listChanges = (l: ReadonlyArray<Json>) =>
  l.length > 0
    ? ([
        ["an object", {}],
        ["emptied", []],
      ] as const)
    : ([["an object", {}]] as const);

const objectChanges = (o: JsonObject) =>
  Object.keys(o).length > 0
    ? ([
        ["a list", []],
        ["emptied", {}],
      ] as const)
    : ([["a list", []]] as const);

const typedChanges = (node: Json) => {
  if (node === null) return [];

  if (Predicate.isString(node)) return stringChanges(node);

  if (Predicate.isNumber(node)) return numberChanges(node);

  if (Predicate.isBoolean(node)) return [["a string", String(node)]] as const;

  return isList(node) ? listChanges(node) : objectChanges(node);
};

const replacementsOf = (node: Json) => {
  const changes: Array<Change> = node === null ? [] : [["null", null]];

  changes.push(...typedChanges(node));

  return changes;
};

// The value with the node at `path` replaced by what `change` makes of it.
// RETURN_TYPE: recursive: each level rebuilds its container around the changed child.
const changedAt = (node: Json, path: Path, change: (at: Json) => Json): Json => {
  const [step, ...rest] = path;

  if (step === undefined) return change(node);

  if (isList(node) && Predicate.isNumber(step))
    return node.map((item, i) => (i === step ? changedAt(item, rest, change) : item));

  if (isObject(node) && Predicate.isString(step))
    return Object.fromEntries([
      ...Object.entries(node),
      [step, changedAt(node[step] ?? null, rest, change)],
    ]);

  return node;
};

// The changes an object's own members allow: one added, and each of its first members deleted or
// renamed to a local spelling.
const memberChanges = (o: JsonObject) => [
  ["field added", { ...o, "~x": 0 }] as const,
  ...Object.keys(o)
    .slice(0, WALK.members)
    .flatMap((name) => [
      [
        `${name} deleted`,
        Object.fromEntries(Object.entries(o).filter(([k]) => k !== name)),
      ] as const,
      [
        `${name} renamed local`,
        Object.fromEntries(Object.entries(o).map(([k, v]) => [k === name ? `~${k}` : k, v])),
      ] as const,
    ]),
];

type Visit = { readonly node: Json; readonly path: Path };

// The children a walk goes on to.
// RETURN_TYPE: the walk's stack holds visits, so both branches name the one Visit type.
const childrenOf = ({ node, path }: Visit): ReadonlyArray<Visit> => {
  if (path.length >= WALK.depth) return [];

  if (isList(node))
    return node.slice(0, WALK.items).map((item, i) => ({ node: item, path: [...path, i] }));

  if (isObject(node))
    return Object.keys(node)
      .slice(0, WALK.members)
      .map((name) => ({ node: node[name] ?? null, path: [...path, name] }));

  return [];
};

// Every node of a value, walked with its own stack, so a record of any depth is mutated.
const visitsOf = (root: Json) => {
  const out: Array<Visit> = [];
  const stack: Array<Visit> = [{ node: root, path: [] }];

  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    out.push(next);
    stack.push(...childrenOf(next));
  }

  return out;
};

// Every one-node change of a JSON value, each with where and what it changed.
const mutationsOf = (root: Json) =>
  visitsOf(root).flatMap(({ node, path }) =>
    [...replacementsOf(node), ...(isObject(node) ? memberChanges(node) : [])].map(
      ([what, value]) =>
        [`${["$", ...path].join(".")} ${what}`, changedAt(root, path, () => value)] as const,
    ),
  );

const ATTEMPT_FORM = /^att-[0-9a-f]+-\d+$/u;

// Every string of a record in the mint's Attempt form, by where it sits.
const attemptsIn = (root: Json) =>
  visitsOf(root).flatMap(({ node, path }) =>
    Predicate.isString(node) && ATTEMPT_FORM.test(node) ? [{ path, id: node }] : [],
  );

const KINDS = ["actor/", "work/", "lane/", "owed/"] as const;

const SWAPPED = { "actor/": "work/", "work/": "actor/", "lane/": "owed/", "owed/": "lane/" };

const kindOf = (key: string) => KINDS.find((k) => key.startsWith(k)) ?? "";

// The identity part of a key: after its kind, and for a lane key before its first `|`.
const ownerOf = (key: string) => {
  const kind = kindOf(key);
  const rest = key.slice(kind.length);

  return kind === "lane/" ? rest.slice(0, rest.indexOf("|")) : rest;
};

// A record's kind and machine: one saved record of each is mutated.
const classOf = (key: string) =>
  `${kindOf(key)}${ownerOf(key).slice(0, ownerOf(key).lastIndexOf("/"))}`;

// The record copied under its key with the name spelled as a local actor's, or its kind swapped;
// the original stays under its own key.
const keyMutants = (key: string, text: string) =>
  KINDS.filter((kind) => key.startsWith(kind)).flatMap((kind) => {
    const owner = ownerOf(key);
    const cut = owner.lastIndexOf("/") + 1;
    const tail = key.slice(kind.length + owner.length);
    const local = `${kind}${owner.slice(0, cut)}~${owner.slice(cut)}${tail}`;

    return [
      { what: "key name local", key: local, text },
      { what: `key kind ${SWAPPED[kind]}`, key: `${SWAPPED[kind]}${key.slice(kind.length)}`, text },
    ];
  });

// Every mutant of one saved record: copies under changed keys, each node's change, and each
// Attempt id written where another sits.
const mutantsOf = (key: string, text: string) =>
  Option.match(Schema.decodeUnknownOption(JsonText)(text), {
    // RETURN_TYPE: an unparsed text has no mutants, typed as the parsed branch's.
    onNone: (): ReadonlyArray<Mutant> => [],
    onSome: (json) => {
      const attempts = attemptsIn(json);

      return [
        ...keyMutants(key, text),
        ...mutationsOf(json).map(([what, value]) => ({ what, key, text: canonicalText(value) })),
        ...attempts.flatMap((a) =>
          attempts
            .filter((b) => b.id !== a.id)
            .map((b) => ({
              what: `attempt at ${["$", ...b.path].join(".")} made ${a.id}`,
              key,
              text: canonicalText(changedAt(json, b.path, () => a.id)),
            })),
        ),
      ];
    },
  });

// An identity's key text, as the store names it: the name with `%`, `/` and `|` escaped.
const keyOf = (actor: { readonly machine: string; readonly name: string }) =>
  `${actor.machine}/${actor.name.replaceAll("%", "%25").replaceAll("/", "%2F").replaceAll("|", "%7C")}`;

// What one boot shows: the store right after it, its reports, and every ending of what the store
// owed.
type Boot = {
  readonly booted: ReadonlyMap<string, string>;
  readonly reports: ReadonlyArray<string>;
  readonly endings: ReadonlyArray<{ readonly owner: string; readonly text: string }>;
  readonly actors: ReadonlyArray<string>;
  readonly breaches: ReadonlyArray<string>;
};

const failedBoot: Boot = {
  booted: new Map(),
  reports: [],
  endings: [],
  actors: [],
  breaches: ["the run failed"],
};

// What a run shows from the open that booted the put store on.
// RETURN_TYPE: a failed run gives the same Boot, so both name it.
const bootOf = (run: StoryRun<string>, open: number): Boot => {
  const later = run.trace.events.flatMap((e) =>
    e.tab.open >= open && e.record._tag === "Runtime" ? [e.record.evidence] : [],
  );

  const minted = new Set(later.flatMap((e) => (e._tag === "Minted" ? [e.attempt] : [])));

  // An Attempt minted after the boot is the app's own new work, not something the store owed.
  const ended = later.flatMap((e) =>
    e._tag === "Ended" && !Option.exists(e.attempt, (a) => minted.has(a)) ? [e] : [],
  );

  return {
    booted: run.checkpoints["corrupt-booted"]?.records.stored ?? new Map(),
    reports: reports(run, open),
    endings: ended.map((e) => ({
      owner: keyOf(e.actor),
      text: `${e.operation} ${e.channel} ${e.reason} ${Option.getOrElse(e.attempt, () => "-")}`,
    })),
    actors: run.end.inspection.actors.map((a) => String(a.actor)),
    breaches: breachesOf(run),
  };
};

// A Story run on, then one text put over its store, reloaded, and every identity the Story
// ensured ensured again as it was.
const bootAfter = async (
  story: Story<string>,
  put: { readonly key: string; readonly text: string },
) => {
  const open = story.steps.filter((step) => step._tag === "reload").length + 2;

  const ensures = story.steps.filter(
    (step, i, all) =>
      step._tag === "ensure" &&
      all.findIndex((s) => s._tag === "ensure" && keyOf(s.actor) === keyOf(step.actor)) === i,
  );

  const run = await story
    .run({
      steps: [
        ...story.steps,
        Step.world({ words: [Fake.storage.put(put.key, put.text)] }),
        Step.reload({ reattach: false, heldWrites: "abort" }),
        Step.checkpoint({ name: "corrupt-booted" }),
        ...ensures,
      ],
    })
    .then(Option.some, () => Option.none<StoryRun<string>>());

  return Option.match(run, { onNone: () => failedBoot, onSome: (r) => bootOf(r, open) });
};

// The endings `boot` heard for the mutated identity that `control` does not owe.
const invented = (control: Boot, boot: Boot, owners: ReadonlySet<string>) => {
  const owed = control.endings.filter((e) => owners.has(e.owner)).map((e) => e.text);

  return boot.endings
    .filter((e) => owners.has(e.owner))
    .flatMap((e) => {
      const at = owed.indexOf(e.text);

      if (at >= 0) owed.splice(at, 1);

      return at >= 0 ? [] : [e.text];
    });
};

const othersHeard = (b: Boot, owners: ReadonlySet<string>) =>
  b.endings
    .filter((e) => !owners.has(e.owner))
    .map((e) => `${e.owner} ${e.text}`)
    .join("\n");

// The breaches of one mutant against its uncorrupted boot.
const judge = (control: Boot, mutant: Mutant, original: string, boot: Boot) => {
  const owners = new Set([ownerOf(original), ownerOf(mutant.key)]);
  const tag = `${mutant.what} of ${original}`;

  const reportedOther = boot.reports.filter(
    (r) => !control.reports.includes(r) && !owners.has(ownerOf(r.slice(r.indexOf(" ") + 1))),
  );

  const started = boot.actors.filter((a) => !control.actors.includes(a) && !owners.has(a));

  const outside = !writtenForm(mutant.key, mutant.text);

  const unreadChanged =
    ["RecordUndecodable", "RecordKept"].some((code) =>
      boot.reports.includes(`${code} ${mutant.key}`),
    ) && boot.booted.get(mutant.key) !== mutant.text;

  const local = boot.actors.filter((a) => a.includes("/~") && !control.actors.includes(a));

  const reportedHere = boot.reports.some((r) => r.slice(r.indexOf(" ") + 1) === mutant.key);

  // A mutant in the writer's form is the user's data, with no promise about its meaning (R20): a
  // forged rest re-sends its Attempt with the forged input. Its run is judged only for booting.
  const judged = outside ? boot.breaches : boot.breaches.filter((b) => b === "the run failed");

  const breaches = [
    ...judged.map((b) => `R5: ${tag}: ${b}`),
    ...reportedOther.map((r) => `R5: ${tag}: another record reported ${r}`),
    ...started.map((a) => `R4, I9: ${tag}: ${a} started from the store`),
    ...local.map((a) => `R4, I9: ${tag}: the local actor ${a} started from the store`),
  ];

  if (outside && !reportedHere)
    breaches.push(`R11, R13: ${tag}: outside the writer's form, and nothing reports ${mutant.key}`);

  if (outside)
    breaches.push(
      ...invented(control, boot, owners).map(
        (e) => `R2, R11: ${tag}: heard ${e}, which the store does not owe`,
      ),
    );

  if (othersHeard(boot, owners) !== othersHeard(control, owners))
    breaches.push(`R5: ${tag}: another identity heard other endings`);

  if (unreadChanged) breaches.push(`R6, I4: ${tag}: reported unreadable, its bytes changed`);

  return breaches;
};

// A fixture's real saved records: each Story's end store, one record per kind and machine its
// Runtime wrote (never one the Story put), from the shortest Story that wrote one.
const sourcesOf = async (m: Manifest) => {
  const seen = new Set<string>();

  const sources: Array<{
    readonly story: Story<string>;
    readonly key: string;
    readonly text: string;
  }> = [];

  for (const story of Object.values(m.stories).toSorted(
    (a, b) => a.steps.length - b.steps.length,
  )) {
    const run = await story.run();

    const put = putBy(run);

    if (breachesOf(run).length === 0)
      for (const [key, text] of run.end.records.stored)
        if (!seen.has(classOf(key)) && !put.has(`${key}\n${text}`)) {
          seen.add(classOf(key));
          sources.push({ story, key, text });
        }
  }

  return sources;
};

const breachesOfFixture = async (m: Manifest) => {
  const breaches: Array<string> = [];

  for (const { story, key, text } of await sourcesOf(m)) {
    const control = await bootAfter(story, { key, text });

    if (control.breaches.length > 0)
      breaches.push(`the uncorrupted store of ${key} breaches: ${control.breaches.join("; ")}`);
    else
      for (const mutant of mutantsOf(key, text))
        breaches.push(...judge(control, mutant, key, await bootAfter(story, mutant)));
  }

  return breaches;
};

describe("one corrupt field of any saved record (Records R4, R5, R6, R11; I3, I4, I9)", () => {
  it("Records R11: the codecs name the literal values a slot is swapped for", () => {
    expect([...LITERALS]).toEqual(
      expect.arrayContaining(["unknown", "success", "Held", "Out", "Idle"]),
    );
  });

  for (const m of manifests.filter((x) => x.pairs.some((p) => p.reach.persisted)))
    it(`Records R5, R4, R11: every one-field corruption of ${m.name}'s saved records boots, reports no other record, starts no identity the store does not name, keeps an unread record's bytes, and invents no ending`, async () => {
      expect(await breachesOfFixture(m)).toEqual([]);
    }, 600_000);
});
