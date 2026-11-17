import { readdirSync } from "node:fs";
import { Predicate } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { manifests } from "../../fixtures/index.ts";

const root = new URL("../../fixtures/", import.meta.url);

// `services/` holds the services several fixtures share; it is no fixture.
const folders = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "services")
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
});

describe("sample-set ids", () => {
  it("every set in samples and in stressSamples has its own id across all manifests", () => {
    const lists = [manifests.flatMap((m) => m.samples), manifests.flatMap((m) => m.stressSamples)];

    for (const sets of lists) {
      const ids = sets.map((s) => s.id);

      expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    }
  });
});
