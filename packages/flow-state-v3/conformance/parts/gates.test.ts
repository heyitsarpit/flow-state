/// <reference types="node" />
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vite-plus/test";
import { Schema } from "effect";
import { parts } from "../../fixtures/index.ts";
import { Script } from "../dsl/script.ts";
import { statedLimits } from "../limits.ts";
import { partsOwed } from "./play.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("gates (Q19, Q27)", () => {
  it("the parts suite, matrix, pairs, bench and production regressions are gates", () => {
    const source = readFileSync(resolve(HERE, "../runner/gates.ts"), "utf8");

    for (const gate of [
      "parts production",
      "matrix",
      "pairs production",
      "model mutation production",
      "bench production",
      "regressions production",
      "regressions round-14",
    ])
      assert.ok(source.includes(`gate: "${gate}"`), gate);
  });

  it("every kept regression decodes; a production red a part found is kept or owed, by its parts", () => {
    const dir = resolve(HERE, "../regressions");
    const names = new Set(parts.map((p) => p.name));

    const kept = readdirSync(dir).map((f) =>
      Schema.decodeUnknownSync(Script)(JSON.parse(readFileSync(join(dir, f), "utf8"))),
    );

    const partIds = [
      ...kept.filter((s) => s.id.startsWith("PART-")),
      ...partsOwed.map((o) => ({ id: o.case })),
    ];

    const namesParts = (id: string) => {
      const [, kind, cast] = /^(PART|MIX)-(.+)-(?:usual|stress)-\d+$/u.exec(id) ?? [];

      if (kind === "MIX") return (cast ?? "").split("+").every((n) => names.has(n));

      return kind === "PART" && names.has(cast ?? "");
    };

    for (const { id } of partIds) assert.ok(namesParts(id), `${id} names no part`);

    assert.ok(partsOwed.every((o) => o.owner.startsWith("@task.V3.")));
  });
});

describe("F2 (Q26): the mint-key limit names the path it shows", () => {
  it("lies about the turn's member keys, or says it shows only the mint check", () => {
    const row = statedLimits.find((l) => l.mutant.name === "limit.mint-key-lies");
    assert.ok(row !== undefined);

    const membersLie = row.mutant.edits.every((e) => e.file !== "world.ts");
    assert.ok(membersLie || row.admits.includes("only the mint check"));
  });
});
