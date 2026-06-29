import { describe, expect, it } from "vite-plus/test";

const sourceModules = import.meta.glob("./react/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function requireSource(path: string): string {
  const source = sourceModules[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source module`);
  }

  return source;
}

describe("react architecture", () => {
  it("keeps flow.use subscribed directly to the actor source instead of an identity selector", () => {
    const useActorSource = requireSource("./react/use-actor.ts");

    expect(useActorSource).not.toContain('from "../store/selected-source.js"');
    expect(useActorSource).not.toContain("selectSource(actorForRender, (snapshot) => snapshot)");
    expect(useActorSource).toContain("useSource(actorForRender)");
  });

  it("keeps useSource free of ref-held wrapper records for source readers", () => {
    const useSourceModule = requireSource("./react/use-source.ts");

    expect(useSourceModule).not.toContain("useRef<SourceRecord");
    expect(useSourceModule).not.toContain("current.current = {");
    expect(useSourceModule).toContain("useSyncExternalStore(");
  });
});
