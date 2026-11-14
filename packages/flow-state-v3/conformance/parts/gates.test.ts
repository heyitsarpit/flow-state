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
import { machineGates } from "../runner/gates.ts";
import { HELD_OUT_SEEDS } from "./generate.ts";
import { partFaults, partsOwed, playPart } from "./play.ts";
import { heldOutScripts } from "./records.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("gates (Q19, Q27)", () => {
  it("the parts suite, matrix, pairs, bench and production regressions are gates", () => {
    const names = machineGates("scratch").map((g) => g.gate);

    for (const gate of [
      "parts production",
      "matrix",
      "pairs production",
      "model mutation production",
      "bench production",
      "regressions production",
      "regressions round-14",
    ])
      assert.ok(names.includes(gate), gate);
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

describe("F4: held-out seeds run in a gate (Conformance I52; advisor Q8)", () => {
  it("the gate list holds the held-out gate beside the parts gate", () => {
    const names = machineGates("scratch").map((g) => g.gate);

    assert.ok(names.includes("parts production"));
    assert.ok(names.includes("held-out production"));
  });

  it("plays every pilot at every held-out seed in both profiles, and the stress mix, no build seed", () => {
    const ids = heldOutScripts().map((s) => s.id);

    for (const part of parts)
      for (const profile of ["usual", "stress"] as const)
        for (const seed of HELD_OUT_SEEDS)
          assert.ok(ids.includes(`PART-${part.name}-${profile}-${seed}`), `${part.name} ${seed}`);

    for (const seed of HELD_OUT_SEEDS)
      assert.ok(ids.some((id) => id.startsWith("MIX-") && id.endsWith(`-stress-${seed}`)));

    assert.ok(ids.every((id) => HELD_OUT_SEEDS.includes(Number(id.split("-").at(-1)))));
  });

  it("held-out runs pass on production or fail as owed; without the owed rows they are red", () => {
    const runs = heldOutScripts().map((script) => ({
      script,
      run: playPart(script, "production"),
    }));

    assert.deepEqual(partFaults(runs), []);
    assert.ok(partFaults(runs, []).some((f) => f.includes("-stress-109")));
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
