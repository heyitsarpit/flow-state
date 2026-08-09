import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

const implementationRoot = resolve(import.meta.dirname, "..");
const files = readdirSync(implementationRoot, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
  .map((entry) => resolve(entry.parentPath, entry.name))
  .filter((path) => !path.includes("/phase-0/") && !path.includes("/receipts/"))
  .sort();

const historicalCitations = [];
for (const path of files) {
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((text, index) => {
    for (const historicalFile of ["DESIGN_DECISIONS.md", "IMPLEMENTATION_BLOCKERS.md"]) {
      if (text.includes(historicalFile)) {
        historicalCitations.push({
          file: relative(implementationRoot, path),
          line: index + 1,
          historicalFile,
          role: "historical-evidence-or-removal-target",
        });
      }
    }
  });
}

process.stdout.write(
  `${JSON.stringify(
    {
      governingAuthority: [
        "README.md",
        "contracts/*.md",
        "tasks/README.md",
        "tasks/PHASE_*.md",
        "PRE_CODING_AUDIT.md",
        "REQUIRED_TESTS.md",
        "USER_WORKFLOW_COVERAGE.md",
        "QUICK_EXAMPLES.md",
      ],
      excludedAsGoverningAuthority: [
        "../DESIGN_DECISIONS.md",
        "../IMPLEMENTATION_BLOCKERS.md",
        "../../TASK.md",
        "../../tasks/**",
      ],
      historicalCitations,
    },
    null,
    2,
  )}\n`,
);
