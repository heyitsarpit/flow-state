import { Option } from "effect";
import { expect, it } from "vite-plus/test";
import { definition } from "../definition.ts";
import { machine } from "../machine.ts";
import { Audience, makeLedger } from "./ledger.ts";
import { Life } from "./life.ts";
import { makePersistence } from "./persist.ts";
import { makeTx, ROOT_ACTIVATION } from "./tx.ts";
import { actorKey, Command, emptyWorld } from "./world.ts";

const Till = definition({
  id: "Persist/Till",
  persist: true,
  states: ["OPEN"],
  events: { Ring: {} },
  memory: {},
  operations: () => ({}),
});

const TillMachine = machine(Till, ({ S }) => ({ default: S.OPEN, states: { OPEN: {} } }));

const actor = { machine: "Persist/Till", name: "front" };

// A step over an open Runtime with one live persisted incarnation, as a step whose drain stopped
// at its cap leaves it: the mail still holds the live ending's try.
const stepOver = () => {
  const world = {
    ...emptyWorld(true),
    life: Life.Open(),
    incarnations: new Map([
      [
        actorKey(actor),
        { id: "inc-1", actor, state: "OPEN", activation: 1, memory: {}, schedules: new Map() },
      ],
    ]),
  };

  const tx = makeTx(new Map([[actor.machine, TillMachine.compiled]]), world, {
    now: 0,
    seed: "0",
  });

  const persistence = makePersistence(tx);

  return { tx, persistence, ledger: makeLedger(tx, persistence) };
};

it("WriteAhead I20: a row owed to the identity and still Queued at a step's end is in its owed record", () => {
  const { tx, persistence, ledger } = stepOver();

  ledger.owe({
    actor,
    to: Audience.Identity(),
    operation: "ring",
    attempt: Option.some("att-1"),
    lane: Option.some("lane-1"),
    channel: "success",
    reason: "Success",
    value: { receipt: "r1" },
    owner: ROOT_ACTIVATION,
    current: true,
  });
  persistence.project();

  const writes = tx
    .out()
    .commands.flatMap((c) => (Command.$is("Persist")(c) ? c.writes : []))
    .filter((w) => w.key === `owed/${actorKey(actor)}`);

  expect(tx.world().mail).toHaveLength(1);
  expect(writes.map((w) => Option.map(w.record, (r) => r["rows"]))).toEqual([
    Option.some([expect.objectContaining({ attempt: "att-1", channel: "success", kept: false })]),
  ]);
});
