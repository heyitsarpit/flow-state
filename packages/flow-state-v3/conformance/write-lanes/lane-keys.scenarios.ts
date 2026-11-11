import type { Case, Scenario } from "../dsl/case.ts";
import { coveredBy } from "../coverage.ts";
import { Held, Keyed } from "../fixtures/keyed.ts";
import { Stamp } from "../fixtures/stamp.ts";
import { Issues } from "../fixtures/issues.ts";
import { Option, Predicate } from "effect";
import { Observation } from "../port.ts";
import { Answer } from "../world/network.ts";

const OK = Answer.Ok({ value: {} });

const endedAs = (c: Case, operation: string) =>
  c.endings(operation).map((e) => `${e.channel} ${e.reason}`);

const titleOf = (c: Case) =>
  Option.getOrUndefined(
    Option.flatMap(c.entity("Issue|i1"), (r) =>
      Predicate.hasProperty(r, "data") &&
      Predicate.hasProperty(r.data, "title") &&
      Predicate.isString(r.data.title) &&
      Predicate.hasProperty(r, "predicted") &&
      r.predicted === false
        ? Option.some(r.data.title)
        : Option.none(),
    ),
  );

const turnsOf = (c: Case, event: string) =>
  c.reports().filter((o) => Observation.$is("Turn")(o) && o.event === event).length;

/**
 * The keyed-lane cases: a key-less member on a keyed operation (WriteLanes R9, I14) and a commit
 * whose input cannot encode (R12, I18), on `Lab/R15Keyed` and `Lab/R15Held`.
 *
 * Expected results were drafted from the Spec before the cases ran (@task.V3.T7).
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
      c.eq("WriteLanes I14: b's lane is gone", a.row("keyed", { k: "b" }), Option.none());
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
  {
    id: "LANE-15",
    cites: ["WriteLanes R11", "WriteLanes I17"],
    fixtures: [Stamp],
    run: (c) => {
      const a = c.actor(Stamp, "a");
      a.ensure();
      a.send("Go", { k: "a" });
      c.ack();
      c.answer("charge", Answer.Lost());
      c.eq("held unsure", a.memory().unsure, 1);
      c.upgrade(2);
      a.send("Go", { k: "b", region: "eu" });
      c.ack();
      c.eq(
        "WriteLanes I17: beside an old-version hold a commit declines OldVersion",
        a.memory().why,
        "OldVersion",
      );
      c.eq("WriteLanes I17: no commit of it is invoked", c.requests("charge").length, 1);
    },
  },
  {
    id: "LANE-16",
    cites: ["WriteLanes R1", "WriteLanes R13", "WriteLanes I2", "WriteLanes I24"],
    fixtures: [Issues],
    run: (c) => {
      const a = c.actor(Issues, "a");
      a.ensure();
      a.send("Edit", { id: "i1", title: "Lost" });
      c.ack();
      c.answer("rename", Answer.Fail({ tag: "Refused", fields: {} }));
      c.eq("refused", a.memory().toast, "Couldn't save the title");
      c.eq("WriteLanes I2: a failed commit applies no success write", titleOf(c), undefined);
      a.send("Edit", { id: "i1", title: "Kept" });
      c.ack();
      c.answer("rename", Answer.Ok({ value: { title: "Kept" } }));
      c.eq("WriteLanes I24: a succeeded commit's success write is applied", titleOf(c), "Kept");
    },
  },
];

/**
 * The Invariants these cases check by their own expectations (the coverage gate's second kind).
 */
export const laneKeysCovered = coveredBy(laneKeysScenarios).filter(
  (row) =>
    row.invariant === "WriteLanes I14" ||
    row.invariant === "WriteLanes I17" ||
    row.invariant === "WriteLanes I2" ||
    row.invariant === "WriteLanes I24" ||
    row.invariant === "WriteLanes I18",
);
