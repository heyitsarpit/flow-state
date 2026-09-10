import { assert, describe, it } from "@effect/vitest";
import { Array as EffectArray, Data, HashMap, Option, Record } from "effect";

import { immutableArray, immutableRecord, readonlyMap } from "../readonly-collections.js";

type RawFileGlob = <Value>(
  patterns: string | readonly string[],
  options: {
    readonly eager: true;
    readonly query: "?raw";
    readonly import: "default";
    readonly exhaustive?: boolean;
  },
) => Readonly<Record<string, Value>>;

declare global {
  interface ImportMeta {
    readonly glob: RawFileGlob;
  }
}

const immutablePackageName = "immutable";
const packageManifestSources = import.meta.glob<string>(
  [
    "../../../../../package.json",
    "../../../../../packages/*/package.json",
    "../../../../../apps/*/package.json",
    "../../../../../examples/*/package.json",
  ],
  { eager: true, query: "?raw", import: "default" },
);
const lockfileSources = import.meta.glob<string>("../../../../../nub.lock", {
  eager: true,
  query: "?raw",
  import: "default",
});
const sourceSources = import.meta.glob<string>(["../../**/*.ts", "../../../test/**/*.ts"], {
  eager: true,
  query: "?raw",
  import: "default",
});
const installedPackageSources = import.meta.glob<string>(
  [
    "../../../../../node_modules/immutable/package.json",
    "../../../node_modules/immutable/package.json",
  ],
  { eager: true, query: "?raw", import: "default", exhaustive: true },
);

const matchingLines = (sources: Readonly<Record<string, string>>, pattern: RegExp) =>
  Object.entries(sources).flatMap(([path, contents]) =>
    contents
      .split(/\r?\n/u)
      .flatMap((line, index) => (pattern.test(line) ? [`${path}:${index + 1}`] : [])),
  );

const immutableAvailability = {
  packageName: immutablePackageName,
  manifestFiles: Object.keys(packageManifestSources),
  manifestMatches: matchingLines(packageManifestSources, /["']immutable["']\s*:/u),
  lockfileFiles: Object.keys(lockfileSources),
  lockfileMatches: matchingLines(lockfileSources, /\bimmutable\b/u),
  installedPackageFiles: Object.keys(installedPackageSources),
  importMatches: matchingLines(
    sourceSources,
    /(?:from\s+|import\(\s*|require\(\s*)["']immutable["']/u,
  ),
};

const immutableSources = {
  map: "https://immutable-js.com/docs/v5/Map/",
  list: "https://immutable-js.com/docs/v5/List/",
  record: "https://immutable-js.com/docs/v5/Record/",
  nestedStructures: "https://immutable-js.com/docs/v5/get-started/nested-structures/",
  readme: "https://github.com/immutable-js/immutable-js#readme",
} as const;

const compatibilityMatrix = [
  {
    candidate: "Effect.Array",
    transform: "copy/map return a fresh shallow array",
    runtimeFreeze: "requires explicit Object.freeze",
    lookup: "native array indexing",
    iteration: "input order",
    evidence: "Array.ts:2810, 3493, 3752",
    decision: "adopt for equivalent transforms only",
  },
  {
    candidate: "Effect.Record",
    transform: "fromEntries/map return plain records",
    runtimeFreeze: "requires explicit Object.freeze",
    lookup: "Record.get returns Option",
    iteration: "Object.keys order",
    evidence: "Record.ts:310, 435, 619, 1004, 1022",
    decision: "retain plain construction",
  },
  {
    candidate: "Effect.HashMap",
    transform: "persistent set/remove return new maps",
    runtimeFreeze: "persistent collection, not a native Map facade",
    lookup: "get returns Option",
    iteration: "HashMap iterator order is not a native insertion-order contract",
    evidence: "HashMap.ts:51, 288, 332, 440, 523",
    decision: "use only for intentional Hash/Equal key semantics",
  },
  {
    candidate: "immutable.js",
    packageName: immutablePackageName,
    availability: immutableAvailability,
    pinnedVersion: "none",
    transform: "persistent Map/List/Record values with structural sharing",
    collectionSemantics:
      "Map is unordered keyed; List is indexed; Record has fixed keys and defaults",
    runtimeFreeze: "Map/List are immutable collections; Record rejects direct mutation",
    keyEquality: "Map uses Immutable.is for collection/value keys and identity for plain objects",
    lookup: "get returns a value or undefined, not Option",
    iteration: "Map order is undefined but stable; List is indexed and ordered",
    nestedOwnership: "nested plain values remain plain unless deep updates copy them",
    bundleRuntimeLifetime:
      "new dependency and collection runtime model would cross existing native boundaries",
    adoptionRisks:
      "value equality, absent Option API, unordered Map iteration, and foreign collection lifetimes",
    evidence: immutableSources,
    decision: "decline: key, lookup, iteration, and runtime ownership semantics do not match",
  },
] as const;

describe("readonly collection boundaries", () => {
  it("records the source-backed compatibility decisions", () => {
    assert.deepStrictEqual(
      compatibilityMatrix.find(({ candidate }) => candidate === "immutable.js"),
      {
        candidate: "immutable.js",
        packageName: immutablePackageName,
        availability: immutableAvailability,
        pinnedVersion: "none",
        transform: "persistent Map/List/Record values with structural sharing",
        collectionSemantics:
          "Map is unordered keyed; List is indexed; Record has fixed keys and defaults",
        runtimeFreeze: "Map/List are immutable collections; Record rejects direct mutation",
        keyEquality:
          "Map uses Immutable.is for collection/value keys and identity for plain objects",
        lookup: "get returns a value or undefined, not Option",
        iteration: "Map order is undefined but stable; List is indexed and ordered",
        nestedOwnership: "nested plain values remain plain unless deep updates copy them",
        bundleRuntimeLifetime:
          "new dependency and collection runtime model would cross existing native boundaries",
        adoptionRisks:
          "value equality, absent Option API, unordered Map iteration, and foreign collection lifetimes",
        evidence: immutableSources,
        decision: "decline: key, lookup, iteration, and runtime ownership semantics do not match",
      },
    );
    assert.ok(immutableAvailability.manifestFiles.length > 0);
    assert.deepStrictEqual(immutableAvailability.lockfileFiles, ["../../../../../nub.lock"]);
    assert.deepStrictEqual(immutableAvailability.manifestMatches, []);
    assert.deepStrictEqual(immutableAvailability.lockfileMatches, []);
    assert.deepStrictEqual(immutableAvailability.installedPackageFiles, []);
    assert.deepStrictEqual(immutableAvailability.importMatches, []);
  });

  it("separates non-mutating transforms from frozen shallow publication", () => {
    const nested = { value: 1 };
    const source = [nested];
    const copied = EffectArray.copy(source);
    const transformed = EffectArray.map(source, (value) => value);
    const published = immutableArray(source);
    const record = Record.fromEntries([["nested", nested]] as const);
    assert.strictEqual(Object.isFrozen(record), false);
    const frozenRecord = immutableRecord(record);

    assert.notStrictEqual(copied, source);
    assert.strictEqual(Object.isFrozen(copied), false);
    assert.notStrictEqual(transformed, source);
    assert.strictEqual(Object.isFrozen(transformed), false);
    assert.strictEqual(Object.isFrozen(published), true);
    assert.strictEqual(published[0], nested);
    assert.notStrictEqual(frozenRecord, record);
    assert.strictEqual(Object.isFrozen(record), false);
    assert.strictEqual(Object.isFrozen(frozenRecord), true);
    assert.strictEqual(frozenRecord.nested, nested);
    assert.throws(() => Array.prototype.push.call(published, nested), TypeError);
  });

  it("keeps native identity keys and ordered iteration while HashMap uses structural keys", () => {
    class Key extends Data.Class<{ readonly id: string }> {}

    const first = { id: "same" };
    const equivalent = { id: "same" };
    const native = readonlyMap([
      [first, "first"],
      [equivalent, "equivalent"],
    ] as const);
    const structural = HashMap.make([new Key({ id: "same" }), "value"] as const);
    const structuralLookup = HashMap.get(structural, new Key({ id: "same" }));
    const missingLookup = HashMap.get(structural, new Key({ id: "missing" }));
    const addedKey = new Key({ id: "added" });
    const updated = HashMap.set(structural, addedKey, "added value");

    assert.strictEqual(native.size, 2);
    assert.strictEqual(native.get({ id: "same" }), undefined);
    assert.deepStrictEqual(
      [...native.entries()].map(([key, value]) => [key, value]),
      [
        [first, "first"],
        [equivalent, "equivalent"],
      ],
    );
    assert.strictEqual(Object.isFrozen(native), true);
    assert.strictEqual("set" in native, false);
    assert.strictEqual(Option.isSome(structuralLookup), true);
    assert.strictEqual(Option.isNone(missingLookup), true);
    assert.strictEqual(HashMap.has(structural, new Key({ id: "added" })), false);
    assert.strictEqual(HashMap.has(updated, new Key({ id: "added" })), true);
  });
});
