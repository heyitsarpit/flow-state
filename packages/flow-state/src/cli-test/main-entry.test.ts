import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { isMainEntry } from "../cli/index";

describe("CLI main-entry detection", () => {
  it("recognizes an executable reached through a package-manager symlink", () => {
    const root = mkdtempSync(join(realpathSync(tmpdir()), "flow-state-cli-"));
    try {
      const packageDirectory = join(root, "packages", "flow-state", "dist", "cli");
      const consumerModules = join(root, "consumer", "node_modules");
      mkdirSync(packageDirectory, { recursive: true });
      mkdirSync(consumerModules, { recursive: true });
      const executable = join(packageDirectory, "index.mjs");
      writeFileSync(executable, "export {};\n");
      symlinkSync(join(root, "packages", "flow-state"), join(consumerModules, "flow-state"));
      const shimTarget = join(consumerModules, "flow-state", "dist", "cli", "index.mjs");

      expect(isMainEntry(shimTarget, pathToFileURL(executable))).toBe(true);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
