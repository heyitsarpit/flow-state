import { describe, expect, it } from "vite-plus/test";

const oracleSources = import.meta.glob(
  "./{runtime-transition-parity,transaction-interleaving-oracle,stream-interleaving-oracle}.test.ts",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Readonly<Record<string, string>>;

const productionSemanticOwners = [
  "/core/machines/flow-paths",
  "/core/machines/machine-transition",
  "/core/orchestrator/orchestrator-transaction-",
  "/core/orchestrator/orchestrator-stream-",
  "/core/transactions/transaction-callbacks",
  "/core/streams/stream-callbacks",
] as const;

describe("independent transition and owned-work oracle architecture", () => {
  it("keeps transition, transaction, and stream oracle models independent of production semantic owners", () => {
    expect(Object.keys(oracleSources)).toHaveLength(3);

    const violations: Array<string> = [];
    for (const [path, source] of Object.entries(oracleSources)) {
      for (const productionOwner of productionSemanticOwners) {
        if (source.includes(productionOwner)) {
          violations.push(`${path} imports production semantic owner ${productionOwner}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
