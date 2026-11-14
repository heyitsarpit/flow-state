import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Formatter, Option } from "effect";
import { Fact } from "../dsl/oracle.ts";
import type { Script } from "../dsl/script.ts";
import { MemberTarget, Observation } from "../port.ts";
import { keysOf } from "../turn/credits.ts";
import { playPart } from "./play.ts";

const send = (transferId: string, by: number) =>
  ({
    _tag: "send",
    event: "Send",
    payload: { transferId, iban: "DE89370400440532013000", cents: 500 },
    by,
  }) as const;

const declined = {
  _tag: "answer",
  operation: "transfer",
  answer: { _tag: "fail", tag: "Declined", fields: { code: "insufficient" } },
} as const;

const twoAccounts: Script = {
  id: "F1-two-ends",
  fixture: "transfers",
  actor: "acct-1",
  actors: [
    { fixture: "transfers", actor: "acct-1" },
    { fixture: "transfers", actor: "acct-2" },
  ],
  steps: [
    { _tag: "ensure", by: 0 },
    { _tag: "ensure", by: 1 },
    send("t1", 0),
    { _tag: "ack" },
    send("t2", 1),
    { _tag: "ack" },
    declined,
    declined,
    { _tag: "release", by: 0 },
    { _tag: "release", by: 1 },
    { _tag: "advance", ms: 200 },
    { _tag: "ack" },
  ],
};

const turn = (keys: ReadonlyArray<string>) =>
  Observation.Turn({
    actor: { machine: "Bank/Transfers", id: "acct-1" },
    event: "Send",
    from: "READY",
    to: "READY",
    parts: [],
    members: keys.map((transferId) => ({
      operation: "transfer",
      kind: "commit" as const,
      target: MemberTarget.Key({ key: { transferId } }),
    })),
  });

describe("F1 (Q25): several actors, and the keys a report names", () => {
  it("a pilot run ends two actors of one machine in one step, under the oracles", () => {
    const played = playPart(twoAccounts, "production");

    assert.equal(played.verdict._tag, "Pass", Formatter.format(played.verdict));

    const steps = played.facts.reduce<Array<Array<Fact>>>((acc, fact) => {
      if (Fact.$is("Stepped")(fact)) acc.push([]);
      else acc.at(-1)?.push(fact);

      return acc;
    }, []);

    const ends = steps.map(
      (step) =>
        step.filter((f) => Fact.$is("Reported")(f) && Observation.$is("Finished")(f.observation))
          .length,
    );

    assert.ok(ends.includes(2), Formatter.format(ends));
  });

  it("a turn whose members name one key stands in that key for an actor the suite does not carry", () => {
    assert.deepEqual(keysOf(turn(["t1", "t1"]), Option.none(), {}), {
      transfer: { transferId: "t1" },
    });
  });

  it("two keys of one operation in one turn name no lane: neither key stands in", () => {
    assert.deepEqual(keysOf(turn(["t1", "t2"]), Option.none(), {}), {});
  });

  it("a carried actor's keys are the folds', never the report's", () => {
    assert.deepEqual(keysOf(turn(["t1"]), Option.some({}), {}), {});
  });
});
