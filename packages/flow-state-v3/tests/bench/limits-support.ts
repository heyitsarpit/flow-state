import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const runner = fileURLToPath(new URL("../../bench/run.ts", import.meta.url));
export const planted = fileURLToPath(new URL("./planted.ts", import.meta.url));

// The processes still running whose command line holds a marker.
export const alive = (marker: string) =>
  spawnSync("pgrep", ["-f", `sleep ${marker.replaceAll(".", "\\.")}`], { encoding: "utf8" })
    .stdout.split("\n")
    .filter((l) => l.trim() !== "");

export const pause = (seconds: number) => spawnSync("sleep", [String(seconds)]);
