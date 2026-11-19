import type { ESTree } from "@oxlint/plugins";

// Where flow-state rules apply: all of packages/flow-state-v3, narrowed by a rule's options. Folders are
// relative to the package, never single files: `only` limits the rule to those folders, `except` exempts
// folders, and `exceptTests` exempts test files (`*.test.ts`, `test/`), a pattern rather than a file.
// vite.config.ts lists each rule's options, so where a rule applies is read in one place.
export const PACKAGE = "packages/flow-state-v3/";

export type Options = {
  readonly only?: ReadonlyArray<string>;
  readonly except?: ReadonlyArray<string>;
  readonly exceptTests?: boolean;
};

export const optionsSchema = [
  {
    type: "object",
    properties: {
      only: { type: "array", items: { type: "string" } },
      except: { type: "array", items: { type: "string" } },
      exceptTests: { type: "boolean" },
    },
    additionalProperties: false,
  },
];

const insideFolder = (path: string, folder: string) => path.startsWith(`${folder}/`);

const isTestFile = (path: string) =>
  /\.test\.tsx?$/u.test(path) || path.split("/").includes("test");

export const relativePath = (filename: string) => {
  const path = filename.replaceAll("\\", "/");
  const at = path.lastIndexOf(PACKAGE);

  return at < 0 ? undefined : path.slice(at + PACKAGE.length);
};

export const appliesTo = (rel: string, options: Options) =>
  (options.only === undefined || options.only.some((folder) => insideFolder(rel, folder))) &&
  !(options.except ?? []).some((folder) => insideFolder(rel, folder)) &&
  !(options.exceptTests === true && isTestFile(rel));

export const propertyName = (node: ESTree.MemberExpression) =>
  node.property.type === "Identifier" && !node.computed
    ? node.property.name
    : node.property.type === "Literal"
      ? String(node.property.value)
      : "";
