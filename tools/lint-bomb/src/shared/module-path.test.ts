import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { configuredPath, isPathWithin } from "./module-path.ts";

assert.equal(isPathWithin("/app/src/domain/value.ts", "src/domain", "/app"), true);
assert.equal(isPathWithin("/app/vendor/src/domain/value.ts", "src/domain", "/app"), false);
assert.equal(isPathWithin("/app/src/domain-other/value.ts", "src/domain", "/app"), false);
assert.equal(isPathWithin("/other/app/src/value.ts", "/app/src", "/app"), false);
assert.equal(isPathWithin("/app/src/Domain/value.ts", "src/domain", "/app"), false);
assert.equal(isPathWithin("C:\\app\\src\\domain\\value.ts", "src/domain", "C:/app"), true);
assert.equal(isPathWithin("C:\\APP\\src\\domain\\value.ts", "c:/app/src/domain", "/"), true);
assert.equal(isPathWithin("C:\\app\\nested\\src\\domain\\value.ts", "src/domain", "C:/app"), false);
assert.equal(configuredPath("src/../domain/value.ts", "/missing/app"), "/missing/app/domain/value.ts");

assert.equal(configuredPath("C:/PROJECT/src/file.ts", "/"), configuredPath("c:/project/SRC/file.ts", "/"));

const directory = mkdtempSync(join(tmpdir(), "lint-bomb-paths-"));
try {
  const physical = join(directory, "physical");
  const logical = join(directory, "logical");
  mkdirSync(join(physical, "src", "domain"), { recursive: true });
  symlinkSync(physical, logical, "junction");
  assert.equal(isPathWithin(join(logical, "src", "domain", "virtual.ts"), "src/domain", physical), true);
  assert.equal(isPathWithin(join(physical, "src", "domain", "virtual.ts"), "src/domain", logical), true);
  assert.equal(isPathWithin(join(logical, "src", "domain", "virtual.ts"), "src/host", physical), false);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
