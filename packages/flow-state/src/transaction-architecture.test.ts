import { describe, expect, it } from "vite-plus/test";

const sourceModules = import.meta.glob("./core/orchestrator/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const controllerModulePath = "./core/orchestrator/orchestrator-transactions.ts";
const helperModulePaths = [
  "./core/orchestrator/orchestrator-transaction-completion.ts",
  "./core/orchestrator/orchestrator-transaction-concurrency.ts",
  "./core/orchestrator/orchestrator-transaction-invalidation.ts",
  "./core/orchestrator/orchestrator-transaction-outcome.ts",
  "./core/orchestrator/orchestrator-transaction-preview.ts",
  "./core/orchestrator/orchestrator-transaction-recovery.ts",
  "./core/orchestrator/orchestrator-transaction-start.ts",
  "./core/orchestrator/orchestrator-transaction-types.ts",
] as const;

function requireSource(path: string): string {
  const source = sourceModules[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source module`);
  }

  return source;
}

describe("transaction architecture", () => {
  it("keeps the runtime transaction controller delegated to owned helper modules", () => {
    const controllerSource = requireSource(controllerModulePath);

    expect(controllerSource).toContain('from "./orchestrator-transaction-concurrency.js"');
    expect(controllerSource).toContain('from "./orchestrator-transaction-preview.js"');
    expect(controllerSource).toContain('from "./orchestrator-transaction-recovery.js"');
    expect(controllerSource).toContain('from "./orchestrator-transaction-start.js"');
    expect(controllerSource).toContain('from "./orchestrator-transaction-types.js"');
    expect(controllerSource).not.toContain("type AnyFlowTransactionDefinition");
    expect(controllerSource).not.toContain("const previewOverlays = new Map");
    expect(controllerSource).not.toContain("const queuedTransactions = new Map");
    expect(controllerSource).not.toContain("const latestTransactionAttempts = new Map");
    expect(controllerSource).not.toContain("const transactionGenerations = new Map");
    expect(controllerSource).not.toContain("invalidateTransactionTargets");
    expect(controllerSource).not.toContain("resolveFailedTransactionCompletion");
    expect(controllerSource).not.toContain("resolveSuccessTransactionRoute");
    expect(controllerSource.split("\n").length < 250).toBe(true);
  });

  it("keeps transaction helper owners focused and free of explicit any seams", () => {
    for (const helperModulePath of helperModulePaths) {
      const helperSource = requireSource(helperModulePath);

      expect(helperSource.split("\n").length < 350).toBe(true);
      expect(/\bany\b/.test(helperSource)).toBe(false);
    }
  });
});
