import { describe, expect, it } from "vite-plus/test";

const docsSources = import.meta.glob("../../../apps/docs/src/pages/getting-started.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function requireDoc(path: string): string {
  const source = docsSources[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source`);
  }

  return source;
}

describe("getting started docs architecture", () => {
  it("keeps one onboarding ladder and routes detours to owner pages", () => {
    const source = requireDoc("../../../apps/docs/src/pages/getting-started.md");

    expect(source).toContain("This is the supported alpha onboarding path");
    expect(source).toContain("## 6. Prove it deterministically");
    expect(source).toContain("const harness = test(postsMachine)");
    expect(source).toContain('from "flow-state/react"');
    expect(source).toContain("<FlowProvider runtime={appRuntime}>");
    expect(source).toContain("useEffect(() => () => void appRuntime.dispose()");
    expect(source).toContain("test.app(App).scenario(machine)");
    expect(source).not.toContain("Launch Workspace");
    expect(source).toContain("nub run --filter @flow-state/basic-cached-posts test");
    expect(source).toContain("nub run check:example-cli");
    expect(source).toContain("[Current Status](/reference/status)");
  });
});
