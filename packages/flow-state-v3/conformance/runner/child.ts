/// <reference types="node" />
import { Data, Duration, Effect } from "effect";
import { spawn } from "node:child_process";

/**
 * A child process could not start, or ran past its time bound and was killed.
 */
export class ChildFailed extends Data.TaggedError("ChildFailed")<{
  readonly command: string;
  readonly why: string;
}> {}

/**
 * What a finished child printed, and how it ended.
 */
export type ChildOutput = {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};

/**
 * Runs one command with no stdin and a time bound, and returns what it printed.
 *
 * **Details**
 *
 * - The child is killed when the bound passes or when this Effect is interrupted.
 * - A signal-ended child reports code -1.
 */
// RETURN_TYPE: The exported error channel: callers match on ChildFailed, and the timeout arm needs it too.
export const runChild = (
  command: string,
  args: ReadonlyArray<string>,
  seconds: number,
): Effect.Effect<ChildOutput, ChildFailed> => {
  const line = [command, ...args].join(" ");

  return Effect.callback<ChildOutput, ChildFailed>((resume) => {
    const child = spawn(command, [...args], { stdio: ["ignore", "pipe", "pipe"] });
    const out: Array<string> = [];
    const err: Array<string> = [];
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => out.push(chunk));
    child.stderr.on("data", (chunk: string) => err.push(chunk));
    child.on("error", (error) =>
      resume(Effect.fail(new ChildFailed({ command: line, why: error.message }))),
    );
    child.on("close", (code) =>
      resume(Effect.succeed({ code: code ?? -1, stdout: out.join(""), stderr: err.join("") })),
    );

    return Effect.sync(() => {
      child.kill("SIGKILL");
    });
  }).pipe(
    Effect.timeoutOrElse({
      duration: Duration.seconds(seconds),
      orElse: () =>
        Effect.fail(new ChildFailed({ command: line, why: `killed after ${seconds} s` })),
    }),
  );
};
