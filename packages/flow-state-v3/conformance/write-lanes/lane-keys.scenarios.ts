import type { Case, Scenario } from "../dsl/case.ts";
import { coveredBy } from "../coverage.ts";
import { Held, Keyed } from "../fixtures/keyed.ts";
import { Observation } from "../port.ts";
import { Answer } from "../world/network.ts";

const OK = Answer.Ok({ value: {} });

const endedAs = (c: Case, operation: string) =>
  c.endings(operation).map((e) => `${e.channel} ${e.reason}`);

const turnsOf = (c: Case, event: string) =>
  c.reports().filter((o) => Observation.$is("Turn")(o) && o.event === event).length;

/**
 * The keyed-lane cases: a key-less member on a keyed operation (WriteLanes R9, I14) and a commit
 * whose input cannot encode (R12, I18), on `Lab/R15Keyed` and `Lab/R15Held`.
 *
 * Expected results were drafted from the Spec before the cases ran (STATUS.md, T7).
 */
export const laneKeysScenarios: ReadonlyArray<Scenario> = [
  {
    id: "LANE-13",
    cites: ["WriteLanes R9", "WriteLanes I14"],
    fixtures: [Keyed],
    run: (c) => {
      const a = c.actor(Keyed, "a");
      a.ensure();
      a.send("Go", { k: "a" });
      c.ack();
      a.send("Go", { k: "b" });
      c.ack();
      c.eq("both sent", c.requests("keyed").length, 2);
      c.answerTo("keyed", { k: "a" }, OK);
      c.answerTo("keyed", { k: "b" }, OK);
      c.eq(
        "WriteLanes I14: the key-less cancel leaves the other key's lane alone",
        endedAs(c, "keyed"),
        ["success success", "success success"],
      );
      c.eq("no re-send", c.requests("keyed").length, 2);
    },
  },
  {
    id: "LANE-14",
    cites: ["WriteLanes R12", "WriteLanes I18"],
    fixtures: [Held],
    run: (c) => {
      const a = c.actor(Held, "a");
      a.ensure();
      a.send("GoBad", { k: "a" });
      c.ack();
      c.eq("WriteLanes I18: declined, not refused", endedAs(c, "holding"), ["failure Unencodable"]);
      c.eq("WriteLanes I18: the turn ran", turnsOf(c, "GoBad"), 1);
      c.eq("nothing sent", c.requests("holding").length, 0);
      a.state("A");
    },
  },
];

/**
 * The Invariants these cases check by their own expectations (the coverage gate's second kind).
 */
export const laneKeysCovered = coveredBy(laneKeysScenarios).filter(
  (row) => row.invariant === "WriteLanes I14" || row.invariant === "WriteLanes I18",
);
