import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { apiReferenceMetadata } from "./api-reference-metadata.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..", "..");
const outputPath = resolve(repoRoot, "apps/docs/src/generated/api-reference.json");
const checkMode = process.argv.includes("--check");

const routeSources = [
  {
    sectionId: "core",
    filePath: resolve(repoRoot, "packages/flow-state/src/index.ts"),
    exclude: new Set(),
  },
  {
    sectionId: "react",
    filePath: resolve(repoRoot, "packages/flow-state/src/react-entry.ts"),
    exclude: new Set(),
  },
  {
    sectionId: "testing",
    filePath: resolve(repoRoot, "packages/flow-state/src/testing.ts"),
    exclude: new Set(),
  },
  {
    sectionId: "server",
    filePath: resolve(repoRoot, "packages/flow-state/src/server.ts"),
    exclude: new Set(),
  },
  {
    sectionId: "inspect",
    filePath: resolve(repoRoot, "packages/flow-state/src/inspect.ts"),
    exclude: new Set(),
  },
];

function parseSource(filePath) {
  return ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

function extractNamedValueExports(filePath) {
  const source = parseSource(filePath);
  const exports = [];

  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) {
      continue;
    }
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
      continue;
    }

    for (const specifier of statement.exportClause.elements) {
      exports.push(specifier.name.text);
    }
  }

  return exports;
}

function assertSameSymbols(sectionTitle, expectedEntries, actualSymbols) {
  const expectedSymbols = new Set(expectedEntries.map((entry) => entry.symbol));
  const actualSet = new Set(actualSymbols);
  const missing = [...expectedSymbols].filter((symbol) => !actualSet.has(symbol));
  const unexpected = [...actualSet].filter((symbol) => !expectedSymbols.has(symbol));

  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      [
        `API reference metadata drifted for ${sectionTitle}.`,
        missing.length > 0 ? `Missing metadata for: ${missing.join(", ")}` : "",
        unexpected.length > 0 ? `Unexpected metadata entries: ${unexpected.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

const extractedBySection = new Map(
  routeSources.map((route) => {
    const symbols = extractNamedValueExports(route.filePath).filter(
      (symbol) => !route.exclude.has(symbol),
    );
    return [route.sectionId, symbols];
  }),
);

const output = {
  sections: apiReferenceMetadata.map((section) => {
    const actualSymbols = extractedBySection.get(section.id);
    if (!actualSymbols) {
      throw new Error(`Missing extracted symbols for ${section.title}.`);
    }

    assertSameSymbols(section.title, section.entries, actualSymbols);

    return {
      id: section.id,
      title: section.title,
      importPath: section.importPath,
      description: section.description,
      entries: section.entries.map((entry) => ({
        name: entry.name,
        description: entry.description,
        href: entry.href,
      })),
    };
  }),
};

const nextContent = `${JSON.stringify(output, null, 2)}\n`;

if (checkMode) {
  const currentContent = readFileSync(outputPath, "utf8");
  if (currentContent !== nextContent) {
    throw new Error(
      "Generated API reference artifact is stale. Run apps/docs/scripts/generate-api-reference.mjs.",
    );
  }
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, nextContent);
}
