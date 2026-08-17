import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const temporaryRoot = mkdtempSync(join(tmpdir(), "flow-state-vnext-declarations-"));
const temporaryModules = join(temporaryRoot, "node_modules");
const declarationRoot = join(temporaryModules, "flow-state-vnext-private");
mkdirSync(declarationRoot, { recursive: true });
symlinkSync(join(repoRoot, "node_modules/effect"), join(temporaryModules, "effect"), "dir");

const runTsc = (arguments_) =>
  execFileSync("nubx", ["tsc", "--ignoreConfig", ...arguments_], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

runTsc([
  "--declaration",
  "--emitDeclarationOnly",
  "--isolatedDeclarations",
  "--strict",
  "--exactOptionalPropertyTypes",
  "--noUncheckedIndexedAccess",
  "--module",
  "NodeNext",
  "--moduleResolution",
  "NodeNext",
  "--target",
  "ES2022",
  "--skipLibCheck",
  "--outDir",
  declarationRoot,
  join(packageRoot, "src/vnext/index.ts"),
]);

const declarationFiles = readdirSync(declarationRoot)
  .filter((name) => name.endsWith(".d.ts"))
  .sort();
if (!declarationFiles.includes("index.d.ts"))
  throw new Error("private vNext declaration emit did not produce index.d.ts");
for (const name of declarationFiles) {
  const contents = readFileSync(join(declarationRoot, name), "utf8");
  if (/\bany\b/u.test(contents)) throw new Error(`${name} contains an erased any type`);
}
writeFileSync(
  join(declarationRoot, "package.json"),
  `${JSON.stringify(
    {
      name: "flow-state-vnext-private",
      private: true,
      type: "module",
      exports: { ".": { types: "./index.d.ts" } },
    },
    null,
    2,
  )}\n`,
);

writeFileSync(
  join(temporaryRoot, "consumer.ts"),
  `import { Effect } from "effect";
import { app, definition, machine, module, resource, type RequirementsOf } from "flow-state-vnext-private";
const D = definition({ id: "Declaration/Root", states: ["READY"], events: {} });
const M = machine(D, ({ S }) => ({ initial: S.READY, states: { READY: {} } }));
const A = app({ id: "declaration-app", persistenceVersion: "1", modules: [module({ id: "Declaration", machines: [M], views: [] })] });
type Equal<L, R> = (<T>() => T extends L ? 1 : 2) extends (<T>() => T extends R ? 1 : 2) ? true : false;
const exact: Equal<RequirementsOf<typeof A>, never> = true;
const R = resource({ id: "declaration.resource", lookup: (id: string) => Effect.succeed(id) });
// @ts-expect-error emitted resource refs retain their exact tuple
R.ref(1);
// @ts-expect-error descriptor-form bindings retain the required params selector
machine(D, ({ S, activity }) => ({ initial: S.READY, states: { READY: { activities: [activity.ensure(R)] } } }));
const InputD = definition({ id: "Declaration/Input", states: ["READY"], events: {}, memory: ({ input }: { readonly input: string }) => ({ input }) });
const InputM = machine(InputD, ({ S }) => ({ initial: S.READY, states: { READY: {} } }));
// @ts-expect-error emitted module declarations reject non-void roots
module({ id: "BadRoot", machines: [InputM], views: [] });
// @ts-expect-error emitted app declarations reject dynamic factories
app({ id: "BadDynamic", persistenceVersion: "1", modules: [module({ id: "Empty", machines: [M], views: [] })], dynamicMachines: [() => M] });
void exact;
`,
);
writeFileSync(
  join(temporaryRoot, "deep-import.ts"),
  `// @ts-expect-error the packed private aggregate exposes no deep route
import type { RequirementsTypeId } from "flow-state-vnext-private/internal.js";
void (undefined as unknown as RequirementsTypeId);
`,
);
runTsc([
  "--noEmit",
  "--strict",
  "--isolatedModules",
  "--exactOptionalPropertyTypes",
  "--noUncheckedIndexedAccess",
  "--module",
  "NodeNext",
  "--moduleResolution",
  "NodeNext",
  "--target",
  "ES2022",
  "--skipLibCheck",
  join(temporaryRoot, "consumer.ts"),
  join(temporaryRoot, "deep-import.ts"),
]);

console.log(
  `Private vNext declarations validated: ${declarationFiles.length} packed files, positive/negative aggregate consumer, zero any declarations.`,
);
