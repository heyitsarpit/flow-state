/// <reference types="node" />
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vite-plus/test";
import { Formatter, Option, Schema } from "effect";
import { parts } from "../../fixtures/index.ts";
import { LOST, type Part } from "../../fixtures/part.ts";
import type { Fixture } from "../fixtures/fixture.ts";
import { Cells, Pay } from "../fixtures/pay-golden.ts";
import { Answer } from "../world/network.ts";
import { partFixture } from "./reference.ts";

const specifiers = (source: string) =>
  [
    ...source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^"'`]*?from\s*["']([^"']+)["']/g),
    ...source.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g),
    ...source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1] ?? "");

const PACKAGE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const GOLDEN = "conformance/fixtures/pay-golden.ts";

/**
 * The golden's two readers, the two halves of phase-out V3: the hand rows equal round-14's
 * compiled Pay, and the derived reference equals the hand rows.
 */
const READERS: ReadonlyArray<string> = [
  "conformance/fixtures/rows.test.ts",
  "conformance/parts/golden.test.ts",
];

/**
 * The SHA-256 of the hand Pay fixture as it froze (`conformance/fixtures/pay.ts` at the phase-out's
 * first cut), its fold keys and delays since returned as `Option` (the Folds contract's own type):
 * the golden changes only with a logged ruling, which updates this pin.
 */
const FROZEN_AT_BASELINE = "17b6041f05dc932df571ee67d7108766b49711da92ccb7f096cb14e9f6b5651f";

const STATUSES: ReadonlyArray<Schema.JsonObject> = [
  {},
  { status: "requires_capture" },
  { status: "succeeded" },
  { status: "requires_action" },
  { status: "processing" },
];

// RETURN_TYPE: a recursive function names its type.
const filesIn = (dir: string): ReadonlyArray<string> =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (e.isDirectory()) return filesIn(join(dir, e.name));

        return e.name.endsWith(".ts") ? [join(dir, e.name)] : [];
      })
    : [];

const alternatives = (f: Fixture) =>
  [["(root)", f.handlers.root] as const, ...Object.entries(f.handlers.states)]
    .map(
      ([leaf, level]) =>
        [
          leaf,
          Object.entries(level ?? {})
            .map(
              ([event, list]) =>
                [
                  event,
                  list.map((a, position) => ({
                    index: Option.getOrElse(a.index, () => position),
                    target: a.target,
                    when: a.when.toSorted(),
                    opaque: a.opaque,
                    updates: a.updates,
                    idle: Option.getOrNull(a.idle),
                  })),
                ] as const,
            )
            .toSorted(([a], [b]) => a.localeCompare(b)),
        ] as const,
    )
    .toSorted(([a], [b]) => a.localeCompare(b));

const schedules = (f: Fixture) =>
  Object.entries(f.handlers.schedules)
    .map(
      ([leaf, list]) =>
        [
          leaf,
          (list ?? []).map((s) => ({
            id: s.id,
            send: s.send,
            delayMs: Option.getOrNull(s.delayMs),
            armOn: s.armOn.toSorted(),
            entry: s.entry,
          })),
        ] as const,
    )
    .toSorted(([a], [b]) => a.localeCompare(b));

const rows = (f: Fixture) =>
  f.rows
    .map((r) =>
      Formatter.format({
        event: r.event,
        from: r.from,
        to: r.to,
        members: r.members,
        guard: Option.getOrNull(r.guard),
        at: Option.getOrNull(r.at),
      }),
    )
    .toSorted();

const answersOf = (tags: ReadonlyArray<string>, fields: ReadonlyArray<Schema.JsonObject>) => [
  Answer.Ok({ value: {} }),
  Answer.Lost(),
  Answer.LostButLanded({ value: {} }),
  Answer.Never(),
  Answer.Die({ message: "boom" }),
  ...tags.flatMap((tag) =>
    fields.flatMap((f) => [
      Answer.Fail({ tag, fields: f }),
      Answer.FailButLanded({ tag, fields: f }),
    ]),
  ),
];

/**
 * Every tag either side could meet for `operation`: the part's server answers, the failure map of
 * both sides, the lost tags and a tag no one answers.
 */
const tagsOf = (part: Part, hand: Fixture, operation: string) => {
  const served = (part.server[operation]?.answers ?? []).flatMap(({ answer }) =>
    answer._tag === "fail" ? [answer.tag] : [],
  );

  const mapped = [hand, partFixture(part)].flatMap((f) =>
    Object.keys(f.operations[operation]?.reference.failure ?? {}),
  );

  return [...new Set([...served, ...mapped, ...LOST, "Unanswered"])].toSorted();
};

const fieldsOf = (part: Part, operation: string) => [
  ...STATUSES,
  ...(part.server[operation]?.answers ?? []).flatMap(({ answer }) =>
    answer._tag === "fail" ? [answer.fields] : [],
  ),
];

const operations = (f: Fixture, part: Part, hand: Fixture) =>
  Object.entries(f.operations)
    .map(([name, { reference: r }]) => {
      const answers = answersOf(tagsOf(part, hand, name), fieldsOf(part, name));

      return [
        name,
        {
          concurrency: r.concurrency,
          success: r.success,
          failure: r.failure,
          unknown: r.unknown,
          keyFields: r.keyFields.toSorted(),
          releasesOnLeave: r.releasesOnLeave,
          classify: answers.flatMap((a) => [
            `${Formatter.format(a)} first: ${r.classify(a, false)}`,
            `${Formatter.format(a)} again: ${r.classify(a, true)}`,
          ]),
        },
      ] as const;
    })
    .toSorted(([a], [b]) => a.localeCompare(b));

/**
 * Everything the derived and the hand fixture must agree on, rendered so a difference names its
 * place (phase-out V3): never filtered by one side's names.
 */
const comparable = (f: Fixture, part: Part, hand: Fixture) => ({
  machine: f.machine,
  states: f.states.toSorted(),
  events: Object.keys(f.events).toSorted(),
  initial: f.handlers.initial,
  persist: f.handlers.persist,
  alternatives: alternatives(f),
  schedules: schedules(f),
  rows: rows(f),
  operations: operations(f, part, hand),
});

const partNamed = (name: string) => parts.find((p) => p.name === name);

const pairs = [
  { name: "pay", hand: Pay },
  { name: "cells", hand: Cells },
];

describe("the derived reference equals Pay's frozen hand rows (phase-out V3; Conformance R15)", () => {
  for (const { name, hand } of pairs)
    it(`${name}: rows, handlers, schedules, every operation field and classify`, () => {
      const part = partNamed(name);
      assert.ok(part !== undefined, `no part ${name}`);

      assert.deepStrictEqual(
        comparable(partFixture(part), part, hand),
        comparable(hand, part, hand),
      );
    });

  it("the comparison names a planted difference: a schedule delay, a release, a classify", () => {
    const part = partNamed("pay");
    assert.ok(part !== undefined, "no part pay");

    const slower: Fixture = {
      ...Pay,
      handlers: {
        ...Pay.handlers,
        schedules: {
          ...Pay.handlers.schedules,
          PAYING: (Pay.handlers.schedules["PAYING"] ?? []).map((s) => ({
            ...s,
            delayMs: Option.some(9000),
          })),
        },
      },
    };

    const releasing: Fixture = {
      ...Pay,
      operations: {
        ...Pay.operations,
        void: {
          ...Pay.operations.void,
          reference: {
            ...Pay.operations.void.reference,
            releasesOnLeave: [{ event: "Leave", from: "CARD", to: "LEFT" }],
          },
        },
      },
    };

    const always: Fixture = {
      ...Pay,
      operations: {
        ...Pay.operations,
        place: {
          ...Pay.operations.place,
          reference: { ...Pay.operations.place.reference, classify: () => "success" },
        },
      },
    };

    for (const planted of [slower, releasing, always])
      assert.notDeepStrictEqual(comparable(planted, part, Pay), comparable(Pay, part, Pay));
  });

  it("the golden is the hand Pay as it froze, byte for byte, and reads no implementation", () => {
    assert.ok(existsSync(join(PACKAGE, GOLDEN)), `${GOLDEN} is missing`);

    const source = readFileSync(join(PACKAGE, GOLDEN), "utf8");

    assert.equal(createHash("sha256").update(source).digest("hex"), FROZEN_AT_BASELINE);

    const reads = specifiers(source).map((s) =>
      s.startsWith(".") ? relative(PACKAGE, resolve(dirname(join(PACKAGE, GOLDEN)), s)) : s,
    );

    assert.deepStrictEqual(
      reads.filter((r) => r.startsWith("src/") || r === "conformance/parts/reference.ts"),
      [],
    );
  });

  it("the golden is one module, read only by this comparison", () => {
    assert.ok(existsSync(join(PACKAGE, GOLDEN)), `${GOLDEN} is missing`);

    const readers = filesIn(PACKAGE)
      .filter((file) => !file.includes("node_modules") && !file.includes("prototypes"))
      .filter((file) =>
        specifiers(readFileSync(file, "utf8")).some(
          (s) => s.startsWith(".") && relative(PACKAGE, resolve(dirname(file), s)) === GOLDEN,
        ),
      )
      .map((file) => relative(PACKAGE, file));

    assert.deepStrictEqual(readers.toSorted(), READERS);
  });
});
