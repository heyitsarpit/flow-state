import { Result } from "effect";
import { FlowError } from "../src/index.ts";

/**
 * Each diagnostic of a refused construction as `[code, path]`, the path dot-joined; none when the
 * construction is accepted. A throw that is not a FlowError reads as `["Thrown", its text]`.
 */
export const refusal = (construct: () => unknown) =>
  Result.match(
    // FLOW_STATE_ALLOW_UNKNOWN: whatever the construction threw, told apart below.
    Result.try({ try: construct, catch: (error: unknown) => error }),
    {
      onSuccess: () => [],
      onFailure: (error) =>
        error instanceof FlowError
          ? error.diagnostics.map((d) => [d.code, d.path.join(".")])
          : [["Thrown", String(error)]],
    },
  );
