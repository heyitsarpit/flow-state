import { Result } from "effect";
import { FlowError } from "../src/index.ts";

type Diagnostic = FlowError["diagnostics"][number];

/**
 * Each diagnostic of a refused construction as `[code, path]`, the path dot-joined, or as `told`
 * reads it; none when the construction is accepted. A throw that is not a FlowError reads as
 * `["Thrown", its text]`.
 */
export const refusal = (
  construct: () => unknown,
  told: (d: Diagnostic) => ReadonlyArray<string> = (d) => [d.code, d.path.join(".")],
) =>
  Result.match(
    // FLOW_STATE_ALLOW_UNKNOWN: whatever the construction threw, told apart below.
    Result.try({ try: construct, catch: (error: unknown) => error }),
    {
      onSuccess: () => [],
      onFailure: (error) =>
        error instanceof FlowError ? error.diagnostics.map(told) : [["Thrown", String(error)]],
    },
  );
