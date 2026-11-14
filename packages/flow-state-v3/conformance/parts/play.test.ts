import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Formatter } from "effect";
import { mixed, parts } from "../../fixtures/index.ts";
import { implemented as production } from "../adapters/production.ts";
import { GRACE_MS } from "../dsl/expect.ts";
import { Address } from "../dsl/facts.ts";
import { actorIn, idled, returned, used } from "../turn/anchor.ts";
import { anchorAt } from "../turn/selection.ts";
import { partFixture } from "./reference.ts";
import { Fact } from "../dsl/oracle.ts";
import type { Script } from "../dsl/script.ts";
import { Observation } from "../port.ts";
import type { CaseVerdict } from "../runner/verdict.ts";
import { BUILD_SEEDS, mixOf, scriptOf } from "./generate.ts";
import { verdictOfLimit } from "../limits.ts";
import { partFaults, partsOwed, playPart, reachedBy, reachOf, worldSeedOf } from "./play.ts";

const SEEDS = BUILD_SEEDS.slice(0, 4);

const answers = (script: Script) => script.steps.filter((s) => s._tag === "answer").length;

describe("part scripts on production (Q9, Q10, Q15, Q17: Conformance R15, R19, R22, I48, I60)", () => {
  it("each pilot's usual and stress scripts pass on production, but owed reds, most answers landing", () => {
    assert.equal(parts.length, 5);

    for (const part of parts)
      for (const profile of ["usual", "stress"] as const)
        for (const seed of SEEDS) {
          const script = scriptOf(part, profile, seed, production);
          const played = playPart(script, "production");

          assert.deepEqual(partFaults([{ script, run: played }]), []);
          assert.ok(played.facts.some(Fact.$is("Reported")), `${script.id} reported nothing`);
          assert.ok(
            partsOwed.some((o) => o.case === script.id) || played.skipped * 2 <= answers(script),
            `${script.id}: ${played.skipped} answers skipped`,
          );
        }
  });

  it("the null runtime fails every pilot script by a stated failure", () => {
    assert.equal(parts.length, 5);

    for (const part of parts) {
      const played = playPart(scriptOf(part, "usual", SEEDS[0] ?? 1, production), "null");

      assert.equal(played.verdict._tag, "Fail");
      assert.ok(!played.verdict.why.includes("defect"));
    }
  });

  it("each owed red still fails on production by its check and Invariant", () => {
    assert.ok(partsOwed.length > 0);

    for (const owed of partsOwed) {
      const [, kind, name, profile, seed] =
        /^(PART|MIX)-(.+)-(usual|stress)-(\d+)$/u.exec(owed.case) ?? [];

      const part = parts.find((p) => p.name === name);
      assert.ok(profile === "usual" || profile === "stress", owed.case);
      assert.ok(kind === "MIX" || part !== undefined, owed.case);

      const script =
        part === undefined
          ? mixOf(mixed, profile, Number(seed), production)
          : scriptOf(part, profile, Number(seed), production);

      assert.equal(script.id, owed.case);
      const played = playPart(script, "production");

      assert.ok(verdictOfLimit(owed, played.verdict).held, Formatter.format(played.verdict));
    }
  });

  it("the suite's own first-contact reds stay fixed: a re-send after a crash lost the ending", () => {
    const played = playPart(mixOf(mixed, "stress", 7, production), "production");

    assert.equal(played.verdict._tag, "Pass", Formatter.format(played.verdict));
  });

  it("a boot whose capture never landed leaves the record where the last landed batch put it", () => {
    const pay = { _tag: "send", event: "PayRequested", payload: { paymentMethodId: "visa" } };
    const reload = { _tag: "reload" } as const;

    const script: Script = {
      id: "kill-unlanded-captures-12",
      fixture: "pay",
      actor: "shopper-1",
      steps: [
        { _tag: "ensure" },
        { ...pay, _tag: "send" },
        { _tag: "ack" },
        {
          _tag: "answer",
          operation: "pay",
          answer: { _tag: "ok", value: { status: "requires_capture", clientSecret: "cs" } },
        },
        { _tag: "ack" },
        reload,
        { _tag: "ack" },
        { ...pay, _tag: "send" },
        { _tag: "ack" },
        reload,
        reload,
        reload,
        reload,
        reload,
      ],
    };

    const played = playPart(script, "production");

    assert.equal(played.verdict._tag, "Pass", Formatter.format(played.verdict));
    assert.equal(
      played.facts.filter((f) => Fact.$is("Stepped")(f) && f.what === "reload").length,
      6,
    );
  });

  it("a record nothing ever landed is restored fresh after two kills", () => {
    const pay = {
      _tag: "send",
      event: "PayRequested",
      payload: { paymentMethodId: "visa" },
    } as const;

    const script: Script = {
      id: "kill-nothing-landed-11",
      fixture: "cells",
      actor: "shopper-1",
      steps: [
        { _tag: "ensure" },
        pay,
        { _tag: "reload" },
        pay,
        { _tag: "reload" },
        { _tag: "send", event: "Start", payload: { cartId: "c1", intentId: "pi1" } },
      ],
    };

    const played = playPart(script, "production");

    assert.equal(played.verdict._tag, "Pass", Formatter.format(played.verdict));
  });

  it("refuses a part on round-14", () => {
    assert.ok(parts.length > 0);
    const played = playPart(scriptOf(parts[0]!, "usual", 1, production), "round-14");

    assert.equal(played.verdict._tag, "Fail");
    assert.ok(played.verdict.why.includes("round-14"));
  });

  it("the app mix runs every pilot's actors in one runtime and one world", () => {
    const mix = mixOf(mixed, "stress", SEEDS[0] ?? 1, production);
    const played = playPart(mix, "production");

    assert.equal(played.verdict._tag, "Pass", Formatter.format(played.verdict));
    assert.equal(
      played.facts.filter((f) => Fact.$is("Stepped")(f) && !f.what.startsWith("end of case"))
        .length,
      mix.steps.length - played.skipped,
    );
    assert.ok(mix.steps.some((s) => s._tag === "reload"));
    assert.equal(Object.keys(reachOf(played)).length, 3);
  });
});

describe("reach from executed facts (Q11: Conformance R17)", () => {
  it("records codes from what ran, not from what a part claims", () => {
    assert.ok(parts.length > 0);

    for (const part of parts) {
      const played = playPart(scriptOf(part, "usual", SEEDS[0] ?? 1, production), "production");
      const reached = Object.values(reachOf(played)).flatMap((codes) => [...codes]);

      const claimed = new Set(
        Object.values(part.user)
          .flat()
          .flatMap((a) => a.codes),
      );

      assert.ok(reached.includes("rj"), part.name);
      assert.ok(
        reached.every((c) => production.includes(c)),
        part.name,
      );
      assert.ok(
        reached.every(
          (c) =>
            claimed.has(c) || ["dp", "rl", "wa", "rt", "un", "du", "ma", "lr", "sr"].includes(c),
        ),
        part.name,
      );
    }
  });

  it("a claimed code the run never exercised is not reached: no Abandon, no cm; an answer, no un", () => {
    const script: Script = {
      id: "reach-no-cancel",
      fixture: "transfers",
      actor: "acct-1",
      steps: [
        { _tag: "ensure" },
        {
          _tag: "send",
          event: "Send",
          payload: { transferId: "t1", iban: "DE89370400440532013000", cents: 500 },
        },
        { _tag: "ack" },
        { _tag: "answer", operation: "transfer", answer: { _tag: "ok", value: {} } },
        { _tag: "release" },
      ],
    };

    const transfers = parts.find((p) => p.name === "transfers");
    assert.ok(transfers !== undefined);
    assert.ok(transfers.user["READY"]?.some((a) => a.codes.includes("cm")));

    const played = playPart(script, "production");
    const reached = reachOf(played)[transfers.composite] ?? new Set();

    assert.equal(played.verdict._tag, "Pass", Formatter.format(played.verdict));
    assert.ok(reached.has("rj") && reached.has("gr"));
    assert.equal(played.skipped, 0);
    assert.ok(!reached.has("cm") && !reached.has("un"));
  });

  it("a late answer reaches lr only after its Attempt ended; a refused batch reaches sr", () => {
    const send = { transferId: "t1", iban: "DE89370400440532013000", cents: 500 };

    const ok = {
      _tag: "answer",
      operation: "transfer",
      answer: { _tag: "ok", value: {} },
    } as const;

    // RETURN_TYPE: a Script, so its steps keep the Step union rather than each literal.
    const steps = (after: ReadonlyArray<Script["steps"][number]>): Script => ({
      id: "reach-late",
      fixture: "transfers",
      actor: "acct-1",
      steps: [{ _tag: "ensure" }, { _tag: "send", event: "Send", payload: send }, ...after],
    });

    const reached = (script: Script) => {
      const played = playPart(script, "production");

      assert.equal(played.verdict._tag, "Pass", Formatter.format(played.verdict));

      return reachOf(played)["C"] ?? new Set();
    };

    const abandon = { _tag: "send", event: "Abandon", payload: { transferId: "t1" } } as const;

    assert.ok(reached(steps([{ _tag: "ack" }, abandon, ok])).has("lr"));
    assert.ok(!reached(steps([{ _tag: "ack" }, ok, abandon])).has("lr"));
    assert.ok(reached(steps([{ _tag: "refuse" }])).has("sr"));
    assert.ok(!reached(steps([{ _tag: "ack" }, ok])).has("sr"));
  });

  it("steps after a stop reach nothing", () => {
    const script: Script = {
      id: "reach-after-stop",
      fixture: "transfers",
      actor: "acct-1",
      steps: [{ _tag: "ensure" }, { _tag: "release" }],
    };

    const played = playPart(script, "null");

    assert.equal(played.verdict._tag, "Fail");
    assert.ok(!played.facts.some(Fact.$is("Released")));
    assert.ok(!Object.values(reachOf(played)).some((codes) => codes.has("gr")));
  });

  it("an answer with no open request reaches no unknown ending", () => {
    const part = parts[0];
    assert.ok(part !== undefined);

    const [operation] = part.machine.compiled.operations.keys();

    const script: Script = {
      id: "reach-skipped-answer",
      fixture: part.name,
      actor: part.actors[0] ?? "a",
      steps: [
        { _tag: "ensure" },
        { _tag: "answer", operation: operation ?? "", answer: { _tag: "lost" } },
        { _tag: "release" },
      ],
    };

    const played = playPart(script, "production");

    assert.equal(played.skipped, 1);
    assert.ok(!Object.values(reachOf(played)).some((codes) => codes.has("un")));
    assert.ok(Object.values(reachOf(played)).some((codes) => codes.size > 0));
  });
});

describe("first-contact reds of the wider stress profile that were the suite's", () => {
  it("a local actor ensured after its grace starts fresh (Actors R6), whatever leaf it had", () => {
    const script: Script = {
      id: "PART-sync-local-returns",
      fixture: "sync",
      actor: "client",
      steps: [
        { _tag: "ensure" },
        { _tag: "send", event: "SyncRepo", payload: { repo: "effect" } },
        { _tag: "answer", operation: "sync", answer: { _tag: "lost" } },
        { _tag: "send", event: "SyncRepo", payload: { repo: "docs" } },
        { _tag: "release" },
        {
          _tag: "answer",
          operation: "sync",
          answer: { _tag: "fail", tag: "RateLimited", fields: { retryAfterMs: 9000 } },
        },
        { _tag: "advance", ms: 2000 },
        { _tag: "ensure" },
      ],
    };

    const played = playPart(script, "production");

    assert.equal(played.verdict._tag, "Pass", Formatter.format(played.verdict));
  });

  it("only a local actor free for its whole grace returns with an unknown leaf; within it, it keeps its leaf", () => {
    const machinesOf = (name: string) => {
      const part = parts.find((p) => p.name === name);
      assert.ok(part !== undefined, name);

      return { part, machines: { [part.machine.compiled.id]: partFixture(part).handlers } };
    };

    const phaseAfter = (name: string, free: number) => {
      const { part, machines } = machinesOf(name);
      const actor = { machine: part.machine.compiled.id, id: "a" };
      const start = used(used(anchorAt(machines, actor, "COOLING", []), actor, 1), actor, -1);

      return actorIn(returned(idled(start, free, GRACE_MS), actor, GRACE_MS), actor).phase._tag;
    };

    assert.equal(phaseAfter("sync", GRACE_MS - 1), "Live");
    assert.equal(phaseAfter("sync", GRACE_MS), "Unanchored");
    assert.equal(phaseAfter("transfers", GRACE_MS), "Live");
  });
});

describe("the world seed comes from the script seed (close review finding 12: Conformance R8)", () => {
  it("a part script's world runs at its own seed; a script with none at 1", () => {
    assert.equal(worldSeedOf("PART-transfers-stress-7"), 7);
    assert.equal(worldSeedOf("MIX-sync+transfers+sign-in-stress-104"), 104);
    assert.equal(worldSeedOf("PART-transfers-stress-111-shrunk"), 111);
    assert.equal(worldSeedOf("reach-late"), 1);
  });
});

describe("reach credits only the part that ran (close review finding 8: Conformance R17)", () => {
  const acct = { machine: "Bank/Transfers", id: "acct-1" };
  const pass = { _tag: "Pass", id: "synthetic" } as const;

  const credited = (facts: ReadonlyArray<Fact>, verdict: CaseVerdict = pass) =>
    reachOf({ verdict, facts, skipped: 0 })["C"] ?? new Set();

  const step = Fact.Stepped({ step: 1, what: "synthetic" });
  const ensured = Fact.Ensured({ actor: acct, use: "story" });

  it("a denial reaches gd only for the actor the step drove that event to", () => {
    const denied = Fact.Reported({
      observation: Observation.Denied({ event: "Send", reasons: ["Zero"] }),
    });

    const drove = Fact.Drove({ actor: acct, event: "Send", to: Address.Root(), labels: {} });

    assert.ok(credited([ensured, step, drove, denied]).has("gd"));
    assert.ok(!credited([ensured, step, denied]).has("gd"));
    assert.ok(!credited([ensured, step, drove, step, denied]).has("gd"));
  });

  it("a refused batch reaches sr only for a persisted part that wrote since the last landing", () => {
    assert.ok(credited([step, ensured, Fact.Dropped()]).has("sr"));
    assert.ok(!credited([step, ensured, Fact.Landed(), step, Fact.Dropped()]).has("sr"));
  });

  it("an incarnation reaches rl only for an actor known before the reload", () => {
    const fresh = { machine: "Bank/Transfers", id: "acct-9" };

    const incarnated = (actor: typeof acct) =>
      Fact.Reported({ observation: Observation.Incarnated({ actor }) });

    const reload = Fact.Reloaded({ release: 1 });

    assert.ok(credited([step, ensured, step, reload, incarnated(acct)]).has("rl"));
    assert.ok(
      !credited([
        step,
        ensured,
        step,
        reload,
        step,
        Fact.Ensured({ actor: fresh, use: "story" }),
        incarnated(fresh),
      ]).has("rl"),
    );
  });

  it("a failing run reaches nothing the gates count", () => {
    const fail = { _tag: "Fail", id: "synthetic", oracles: [], why: "planted" } as const;

    const facts = [step, ensured, Fact.Released({ actor: acct, use: "story" })];

    assert.ok(reachedBy([{ run: { verdict: pass, facts, skipped: 0 } }]).has("gr"));
    assert.equal(reachedBy([{ run: { verdict: fail, facts, skipped: 0 } }]).size, 0);
  });
});

describe("F1 (Q25): two actors end dirty in one step", () => {
  it("a pilot drives two actors of one machine", () => {
    assert.ok(parts.some((p) => p.actors.length >= 2));
  });
});
