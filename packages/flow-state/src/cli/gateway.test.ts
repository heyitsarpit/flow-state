import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { loadBehaviorGateway } from "./gateway.js";

function linkGatewayDependencies(projectRoot: string): void {
  const nodeModulesRoot = join(projectRoot, "node_modules");
  mkdirSync(nodeModulesRoot, { recursive: true });

  for (const [name, target] of [
    ["flow-state", resolve("packages/flow-state")],
    ["effect", resolve("node_modules/effect")],
    ["@effect", resolve("node_modules/@effect")],
    ["@tanstack", resolve("node_modules/@tanstack")],
  ] as const) {
    symlinkSync(target, join(nodeModulesRoot, name), "dir");
  }
}

describe("behavior gateway loading", () => {
  it("loads from a read-only project without writing CLI artifacts into it", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "flow-state-read-only-project-"));
    const appRoot = join(projectRoot, "src", "app");
    mkdirSync(appRoot, { recursive: true });
    linkGatewayDependencies(projectRoot);
    const gatewayPath = join(appRoot, "behavior.ts");
    writeFileSync(
      gatewayPath,
      [
        'import * as flow from "flow-state";',
        "export const BehaviorGateway = { app: flow.app({ modules: [] }) };",
        "",
      ].join("\n"),
    );
    chmodSync(projectRoot, 0o555);

    try {
      const gateway = await loadBehaviorGateway(gatewayPath, projectRoot);
      expect(gateway.app.kind).toBe("app");
      expect(gateway.app.modules).toEqual([]);
    } finally {
      chmodSync(projectRoot, 0o755);
    }
  });

  const invalidGateways: ReadonlyArray<readonly [name: string, source: string, path: string]> = [
    ["app", "export const BehaviorGateway = { app: { kind: 'app' } };", "app.id"],
    [
      "descriptor",
      [
        'import * as flow from "flow-state";',
        "const app = flow.app({ modules: [] });",
        "export const BehaviorGateway = { app: { ...app, modules: [{ kind: 'module', id: 42, meta: {}, inventory: () => ({}) }] } };",
      ].join("\n"),
      "app.modules[0].id",
    ],
    [
      "stories",
      'import * as flow from "flow-state"; export const BehaviorGateway = { app: flow.app({ modules: [] }), stories: "not-an-array" };',
      "stories",
    ],
    [
      "story entry",
      [
        'import * as flow from "flow-state";',
        "const app = flow.app({ modules: [] });",
        "export const BehaviorGateway = { app, stories: [{ kind: 'stories', machine: { kind: 'machine' }, stories: [{ id: 'bad', title: 'Bad', events: 'not-an-array' }] }] };",
      ].join("\n"),
      "stories[0].stories[0].events",
    ],
  ];

  for (const [name, source, path] of invalidGateways) {
    it(`rejects a malformed ${name} boundary with its exact path`, async () => {
      const projectRoot = mkdtempSync(join(tmpdir(), "flow-state-invalid-gateway-"));
      linkGatewayDependencies(projectRoot);
      const gatewayPath = join(projectRoot, "behavior.ts");
      writeFileSync(gatewayPath, `${source}\n`);

      await expect(loadBehaviorGateway(gatewayPath, projectRoot)).rejects.toThrow(
        `Invalid BehaviorGateway at ${path}`,
      );
    });
  }
});
