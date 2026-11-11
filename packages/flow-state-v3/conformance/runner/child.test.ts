import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Effect } from "effect";
import { runChild } from "./child.ts";

describe("the runner's time bound (T14, Conformance R8)", () => {
  it("a planted slow child is killed at its bound and reads as unknown, never as a verdict", async () => {
    const started = Date.now();

    const why = await Effect.runPromise(
      runChild("bun", ["-e", "setTimeout(() => console.log('VERDICT pass 1/1'), 10000)"], 1).pipe(
        Effect.map((out) => `a verdict: ${out.stdout}`),
        Effect.catchTag("ChildFailed", (e) => Effect.succeed(e.why)),
      ),
    );

    assert.equal(why, "killed after 1 s");
    assert.ok(Date.now() - started < 5000);
  });
});
