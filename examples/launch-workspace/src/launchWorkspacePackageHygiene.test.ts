import { describe, expect, it } from "vite-plus/test";

import packageJson from "../package.json";

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
});
