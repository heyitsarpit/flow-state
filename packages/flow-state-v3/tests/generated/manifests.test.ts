import { readdirSync } from "node:fs";
import { Predicate } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { manifests } from "../../fixtures/index.ts";

const root = new URL("../../fixtures/", import.meta.url);

const folders = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .toSorted();

// The files a fixture's Stories are exported from: its flat `stories.ts`, then `stories/*.ts`.
const storyFiles = (name: string) => {
  const entries = readdirSync(new URL(`${name}/`, root), { withFileTypes: true });
  const flat = entries.some((e) => e.isFile() && e.name === "stories.ts") ? ["stories.ts"] : [];

  const nested = entries.some((e) => e.isDirectory() && e.name === "stories")
    ? readdirSync(new URL(`${name}/stories/`, root))
        .filter((file) => file.endsWith(".ts"))
        .map((file) => `stories/${file}`)
    : [];

  return [...flat, ...nested].map((file) => new URL(`${name}/${file}`, root).href);
};

// FLOW_STATE_ALLOW_UNKNOWN: a module's exports are untyped until each is checked for a Story's shape.
const storyIdOf = (value: unknown) =>
  Predicate.hasProperty(value, "steps") &&
  Predicate.hasProperty(value, "run") &&
  Predicate.hasProperty(value, "id") &&
  Predicate.isString(value.id)
    ? [value.id]
    : [];

// RETURN_TYPE: a module namespace is untyped until its exports are read.
const load = async (href: string): Promise<Readonly<Record<string, unknown>>> => import(href);

const exportedStoryIds = async (name: string) => {
  const modules = await Promise.all(storyFiles(name).map(load));

  return modules.flatMap((module) => Object.values(module).flatMap(storyIdOf)).toSorted();
};

describe("every fixture registers one manifest (fixtures.md, Where a fixture is registered)", () => {
  it("fixtures/index.ts lists one manifest per fixture folder, by the folder's name", () => {
    expect(manifests.map((m) => m.name).toSorted()).toEqual(folders);
  });

  for (const manifest of manifests)
    it(`${manifest.name}: the manifest's stories are exactly the Stories its files export`, async () => {
      const registered = Object.values(manifest.stories)
        .map((s) => s.id)
        .toSorted();

      expect(registered).toEqual(await exportedStoryIds(manifest.name));
    });

  for (const manifest of manifests)
    it(`${manifest.name}: the saved stress Story is a seed of one of its stress samples, and registered`, () => {
      const { story, seed } = manifest.savedStress;

      expect(manifest.stressSamples.map((s) => `${s.id}/stress-${seed}`)).toContain(story.id);
      expect(Object.values(manifest.stories)).toContain(story);
    });
});
