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

    expect(source).toContain("- one focused harness proof");
    expect(source).toContain("## 5. Prove The Workflow With One Focused Harness");
    expect(source).toContain("const harness = test(launchWorkspaceMachine)");
    expect(source).not.toContain("## 4A. Use `submit` For Event-Owned Writes");
    expect(source).not.toContain("import { FlowProvider");
    expect(source).not.toContain("<FlowProvider");
    expect(source).not.toContain("test.app(App).scenario(machine)");
    expect(source).not.toContain("export const App = app({ modules: [ProjectModule] });");
    expect(source).toContain("[App Structure](/guide/app-structure)");
    expect(source).toContain("[Transactions Reference](/reference/transactions#submit-vs-run)");
    expect(source).toContain("[Views And React](/reference/views-react)");
    expect(source).toContain("[Testing](/guide/testing)");
    expect(source).toContain("[Server And Hydration](/guide/server-hydration)");
  });
});
