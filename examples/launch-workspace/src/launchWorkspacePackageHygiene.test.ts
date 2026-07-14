import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import packageJson from "../package.json";

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const clientSource = readFileSync(
  new URL("../app/LaunchWorkspaceClient.tsx", import.meta.url),
  "utf8",
);

type LaunchWorkspacePackageJson = Readonly<{
  readonly scripts?: Readonly<Record<string, string>>;
}>;

describe("@flow-state/launch-workspace package hygiene", () => {
  it("runs a dedicated TypeScript proof as part of the example build", () => {
    const launchWorkspacePackageJson = packageJson as LaunchWorkspacePackageJson;

    expect(launchWorkspacePackageJson.scripts).toMatchObject({
      "check:typescript-mode-proofs": expect.any(String),
    });
    expect(launchWorkspacePackageJson.scripts?.build).toContain("check:typescript-mode-proofs");
  });

  it("keeps server and client runtime entry modules separated", () => {
    expect(pageSource).toContain("launchWorkspaceServer");
    expect(pageSource).not.toContain("launchWorkspaceBrowserRuntime");
    expect(pageSource).not.toContain("flow-state/react");
    expect(clientSource).toContain("launchWorkspaceBrowserRuntime");
    expect(clientSource).not.toContain('from "../src/launchWorkspace"');
  });
});
