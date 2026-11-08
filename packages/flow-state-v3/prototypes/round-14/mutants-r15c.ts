export const MUTANTS: ReadonlyArray<{ readonly id: string; readonly kills: readonly string[]; readonly edits: ReadonlyArray<readonly [string, string, string]> }> = [
  {
    id: "r15c.creation-stores-raw-input-on-refusal",
    kills: ["R15-03/creation-checks-an-input-by-its-type-side-and-refuses-a-transforming-decode"],
    edits: [
      [
        "step.ts",
        "memory: run(m.memory.initial, input as never),",
        'memory: (() => { try { return run(m.memory.initial, input as never); } catch (e) { if (!(e instanceof Refused) || !e.message.includes("InputRefused")) throw e; return { ...(input as object) }; } })(),',
      ],
    ],
  },
  {
    id: "r15c.boot-queue-drops-pre-boot-sends",
    kills: ["REV7-M2/a-slow-read-queues-a-click-in-order"],
    edits: [
      [
        "driver.ts",
        "if (waitingBoot.length < bounds.bootQueue) return void waitingBoot.push(i);",
        "if (waitingBoot.length < 0) return void waitingBoot.push(i);",
      ],
    ],
  },
  { id: "r15c.failed-read-keeps-persistence", kills: ["REV7-M2/a-failed-read-runs-empty-and-writes-nothing"], edits: [["driver.ts", "boot(new Map(), false); // D26", "boot(new Map(), true); // D26"]] },
  { id: "r15c.duplicate-machine-allowed", kills: ["REV7-M2/two-machines-under-one-id-is-an-error"], edits: [["gate.ts", "if (dup !== undefined) throw new Error(`DuplicateMachine: ${dup}`);", ""]] },
];
