// The benchmark's machines. `Grow`: persisted memory that grows, for encode per turn. Ring, from order.compiled, for turn cost at many actors.
import { fixtureOf } from "../fixtures/build.ts";
import type { Compiled } from "../fixtures/compiled.ts";

const D = "Bench/Grow";
const f = fixtureOf(D);
export const growMachine = (n: number, persisted: boolean): Compiled => ({
  id: D,
  root: "root",
  default: "root",
  nodes: {
    root: f.node("root", {
      Add: [
        {
          patch: ({ memory, event }: any) => ({
            messages: [...memory.messages, event.message],
            count: memory.count + 1,
          }),
        },
      ],
      Tick: [{ patch: ({ memory }: any) => ({ count: memory.count + 1 }) }],
    }),
  },
  memory: f.memory(() => ({
    count: 0,
    messages: Array.from({ length: n }, (_x, i) => message(i)),
  })),
  ops: {},
  persisted,
  uses: [],
});
export const message = (i: number) => ({
  id: `m${i}`,
  author: `user-${i % 17}`,
  text: `message number ${i}, about as long as a chat line usually is, and a little more.`,
  cursor: i,
  at: 1_700_000_000_000 + i,
});
export const growActor = "Bench/Grow/a";
