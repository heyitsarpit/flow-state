import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "../shared/diagnostics.js";
import { createTestRuntimeWithInstallers } from "../testing/fixtures/runtime-test-fixtures.js";
import { FlowProvider } from "./provider.js";
import { useFlowRuntime } from "./use-runtime.js";

function createTestRuntime() {
  return createTestRuntimeWithInstallers();
}

describe("react provider", () => {
  it("provides the runtime through React context", async () => {
    const runtime = createTestRuntime();
    let observedRuntime: typeof runtime | null = null;

    const Reader = (): React.ReactElement => {
      observedRuntime = useFlowRuntime();
      return createElement("span", null, "ready");
    };

    expect(
      renderToStaticMarkup(
        createElement(FlowProvider, {
          runtime,
          children: createElement(Reader),
        }),
      ),
    ).toBe("<span>ready</span>");
    expect(observedRuntime).toBe(runtime);

    await runtime.dispose();
  });

  it("prefers the innermost runtime when providers are nested", async () => {
    const outerRuntime = createTestRuntime();
    const innerRuntime = createTestRuntime();
    let observedRuntime: typeof innerRuntime | null = null;

    const Reader = (): React.ReactElement => {
      observedRuntime = useFlowRuntime();
      return createElement("span", null, "nested");
    };

    renderToStaticMarkup(
      createElement(FlowProvider, {
        runtime: outerRuntime,
        children: createElement(FlowProvider, {
          runtime: innerRuntime,
          children: createElement(Reader),
        }),
      }),
    );

    expect(observedRuntime).toBe(innerRuntime);

    await innerRuntime.dispose();
    await outerRuntime.dispose();
  });

  it("throws a clear error when the runtime provider is missing", () => {
    const Reader = (): React.ReactElement => {
      useFlowRuntime();
      return createElement("span", null, "missing");
    };

    const renderMissingRuntime = () => renderToStaticMarkup(createElement(Reader));
    expect(renderMissingRuntime).toThrow("FlowProvider is missing a runtime");

    try {
      renderMissingRuntime();
      throw new Error("expected renderMissingRuntime to throw");
    } catch (error) {
      expect(error instanceof FlowDiagnostic).toBe(true);
      expect(error).toMatchObject({
        code: "FLOW-REACT-001",
        title: "FlowProvider is missing a runtime",
        debug: {
          hook: "useFlowRuntime",
        },
      });
    }
  });
});
