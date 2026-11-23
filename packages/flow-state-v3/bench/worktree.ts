import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { Option } from "effect";

/**
 * The package folder, the folder this bench runs from.
 */
export const PACKAGE = join(import.meta.dirname, "..");

const git = (cwd: string, args: ReadonlyArray<string>) =>
  spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });

// The repository's root folder.
const repoRoot = () => git(PACKAGE, ["rev-parse", "--show-toplevel"]).stdout.trim();

/**
 * A past commit checked out clean and detached in a new folder under `scratch`, with this bench's
 * code copied over its own, so the same declarations time the commit's runtime and fixtures.
 *
 * **Details**
 *
 * The worktree shares the live tree's installed packages through links. `remove` deletes the
 * worktree and its folder; call it when done.
 */
export const worktreeAt = (commit: string, scratch: string) => {
  const root = repoRoot();
  const dir = mkdtempSync(join(scratch, `bench-${commit.slice(0, 8)}-`));
  const added = git(root, ["worktree", "add", "--detach", dir, commit]);

  if (added.status !== 0) {
    rmSync(dir, { recursive: true, force: true });

    return Option.none<{ readonly package: string; readonly remove: () => void }>();
  }

  const pkg = join(dir, "packages", "flow-state-v3");
  const history = join(PACKAGE, "bench", "history");
  rmSync(join(pkg, "bench"), { recursive: true, force: true });
  cpSync(join(PACKAGE, "bench"), join(pkg, "bench"), {
    recursive: true,
    filter: (source) => source !== history && !source.startsWith(`${history}/`),
  });

  if (!existsSync(join(dir, "node_modules")))
    symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));

  return Option.some({
    package: pkg,
    remove: () => {
      git(root, ["worktree", "remove", "--force", dir]);
      rmSync(dir, { recursive: true, force: true });
      git(root, ["worktree", "prune"]);
    },
  });
};
