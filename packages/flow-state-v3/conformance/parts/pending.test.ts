import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { GRACE_MS } from "../dsl/expect.ts";
import { productionCases } from "../runner/gates.ts";
import { Address } from "../dsl/facts.ts";
import { empty } from "../dsl/lifecycle-model.ts";
import { Fact } from "../dsl/oracle.ts";
import { Observation } from "../port.ts";
import { actorIn, idled, returned, Undecided, used } from "../turn/anchor.ts";
import { schedules } from "../turn/schedules.ts";
import { foldKills, redundancyFaults } from "../dsl/held-traces.ts";
import { traces } from "../dsl/lifecycle.traces.ts";
import { PACKAGE } from "../runner/args.ts";
import { foldMutants, heldVerdicts } from "../runner/fold-mutants.ts";
import { anchorAt, anchorOf, judgedStep } from "../turn/selection.ts";
import { parts } from "../../fixtures/index.ts";
import { Option } from "effect";
import { owedRows } from "./owed.ts";
import { playPart } from "./play.ts";
import { scriptById } from "./records.ts";
import { partFixture } from "./reference.ts";

/**
 * Each check below asserts a gap the suite still has, owned by the Task named in its title. It
 * fails once that Task closes the gap: then the check becomes a requirement of the gate it names,
 * and this pending one is deleted.
 */
describe("pending checks, owed to other Tasks (routed gaps)", () => {
  it("revisit (suite judging): owed scripts skip the skipped-answers rule, and many are thin (N9)", () => {
    const thin = [...new Set(owedRows.map((o) => o.case))].filter((id) => {
      const script = Option.getOrThrow(scriptById(id));
      const run = playPart(script, "production");
      const answers = script.steps.filter((s) => s._tag === "answer").length;

      return run.skipped * 2 > answers;
    });

    assert.ok(thin.length > 0);
  }, 60_000);

  it("T18: Cells aborts only while unsure, since the generator's belief frees a lane on any cancel", () => {
    const cells = parts.find((p) => p.name === "cells");
    assert.ok(cells !== undefined);

    const aborts = (leaf: string) =>
      (cells.user[leaf] ?? []).some((a) => a.kind === "send" && a.event === "AbortPay");

    assert.ok(aborts("UNSURE"));
    assert.ok(!aborts("PAYING"));
  });

  it("T17: a schedule armed with a delay the suite cannot compute is never overdue (Turn I12)", () => {
    const pay = parts.find((p) => p.name === "pay");
    assert.ok(pay !== undefined);

    const actor = { machine: pay.machine.compiled.id, id: "shopper-1" };
    const machines = { [actor.machine]: partFixture(pay).handlers };

    const drove = (event: string) => Fact.Drove({ actor, event, to: Address.Root(), labels: {} });

    const turn = (event: string, from: string, to: string, at: string) =>
      Fact.Reported({
        observation: Observation.Turn({
          actor,
          event,
          from,
          to,
          parts: [{ part: [], definition: actor.machine, at, node: "root", target: to }],
          members: [],
        }),
      });

    const steps = [
      [
        Fact.Ensured({ actor, use: "story" }),
        drove("Start"),
        turn("Start", "IDLE", "CARD", "states.IDLE.on.Start[0]"),
      ],
      [drove("PayRequested"), turn("PayRequested", "CARD", "PAYING", "on.PayRequested[1]")],
      [turn("Busy", "PAYING", "WAITING", "states.PAYING.on.Busy[0]")],
      [Fact.Advanced({ ms: 3_600_000 })],
    ];

    const life = { before: empty, after: empty, applied: [] };
    const next = schedules.open({}, [], machines, {});
    const anchor = steps.reduce((state, step) => judgedStep(state, step).state, anchorOf(machines));

    assert.deepEqual(
      anchor.undecided.filter(Undecided.$is("Delay")).map((u) => u.schedule),
      ["retry"],
    );
    assert.deepEqual(
      steps.flatMap((step) => next(step, [], life)).filter((v) => v.invariant === "Turn I12"),
      [],
    );
  });

  it("T17: production's Compile static cases run in no machine gate, only under vitest", () => {
    assert.ok(productionCases.length > 0);
    assert.ok(!productionCases.some((id) => id.startsWith("CMP-")));
  });

  it("T9: a returning local actor's leaf is unknown, not its initial leaf, and mayHaveEnded stays set", () => {
    const part = parts.find((p) => p.name === "sync");
    assert.ok(part !== undefined);

    const actor = { machine: part.machine.compiled.id, id: "a" };
    const machines = { [actor.machine]: partFixture(part).handlers };
    const free = idled(used(anchorAt(machines, actor, "COOLING", []), actor, 1), 0, GRACE_MS);
    const ended = idled(used(free, actor, -1), GRACE_MS, GRACE_MS);

    assert.equal(actorIn(returned(ended, actor, GRACE_MS), actor).phase._tag, "Unanchored");
    assert.equal(actorIn(used(ended, actor, 1), actor).mayHaveEnded, true);
  });

  it("T53: the redundancy gate ignores a fold-kill row that names no trace, so deleting a sole killer stays green (T61 close O1)", () => {
    const kept = { name: "kept", tableKills: new Set([1]), refuses: [], ruled: false };

    const fold = new Map([
      ["kept", ["m1"]],
      ["deleted sole killer", ["m100"]],
    ]);

    assert.deepEqual(redundancyFaults([kept], fold), []);
  });

  it("T53: the fold kills carry no fingerprint of the fold files or mutant list, so a fold edit leaves them stale (T61 close O2)", () => {
    const names = new Set(traces.map((t) => t.name));

    assert.ok([...foldKills().keys()].every((name) => names.has(name)));
    assert.ok([...foldKills().values()].flat().every((key) => /^m\d+$/u.test(key)));
  });

  it("T53: fold-mutants drops a crashed mutant unjudged, writes every row on a partial run, and flips nothing in lifecycle-fold.ts (T61 close O3)", () => {
    assert.ok(heldVerdicts([Option.none()]).every((v) => v.keys.length === 0));
    assert.equal(heldVerdicts([]).length, traces.length);
    assert.deepEqual(
      foldMutants(PACKAGE).filter((m) => m.file.endsWith("lifecycle-fold.ts")),
      [],
    );
  });
});
