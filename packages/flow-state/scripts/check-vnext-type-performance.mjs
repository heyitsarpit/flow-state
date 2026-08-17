import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const baselinePath = join(packageRoot, "proof/vnext/type-performance-baseline.json");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const temporaryRoot = mkdtempSync(join(tmpdir(), "flow-state-vnext-carrier-"));
symlinkSync(join(repoRoot, "node_modules"), join(temporaryRoot, "node_modules"), "dir");
symlinkSync(join(packageRoot, "src/vnext"), join(temporaryRoot, "vnext"), "dir");

const tscVersion = execFileSync("nubx", ["tsc", "--version"], {
  cwd: packageRoot,
  encoding: "utf8",
})
  .trim()
  .replace(/^Version /u, "");
if (baseline.typescriptVersion !== tscVersion)
  throw new Error(
    `TypeScript baseline is for ${baseline.typescriptVersion}; checked-in version is ${tscVersion}`,
  );

const carrierSource = (rootCount) => {
  const declarations = [];
  const rootNames = [];
  const viewNames = [];
  for (let index = 0; index < rootCount; index += 1) {
    declarations.push(`
const ChildDefinition${index} = definition({ id: "Carrier/Child${index}", states: ["READY"], events: {}, memory: ({ input }: { readonly input: { readonly id: string } }) => ({ id: input.id }) });
const ChildMachine${index} = machine(ChildDefinition${index}, ({ S }) => ({ initial: S.READY, states: { READY: {} } }));
const ChildDescriptor${index} = child({ id: "carrier.child.${index}", machine: ChildMachine${index} });
const Resource${index} = resource({ id: "carrier.resource.${index}", lookup: (id: string): Effect.Effect<string, never, CarrierService> => Effect.succeed(id) });
const Transaction${index} = transaction({ id: "carrier.transaction.${index}", key: (input: { readonly id: string }) => input.id, commit: (input: { readonly id: string }): Effect.Effect<string, never, CarrierService> => Effect.succeed(input.id) });
const Stream${index} = stream({ id: "carrier.stream.${index}", subscribe: (id: string): Stream.Stream<string, never, CarrierService> => Stream.make(id) });
const RootDefinition${index} = definition({ id: "Carrier/Root${index}", states: ["READY"], events: {}, memory: () => ({ id: "root-${index}" }) });
const Root${index} = machine(RootDefinition${index}, ({ S, activity }) => ({ initial: S.READY, states: { READY: { activities: [
  activity.ensure(SharedResource, { params: ({ memory }) => [memory.id] }),
  activity.ensure(Resource${index}, { params: ({ memory }) => [memory.id] }),
  activity.run(Transaction${index}, { params: ({ memory }) => ({ id: memory.id }) }),
  activity.stream(Stream${index}, { params: ({ memory }) => [memory.id], key: ([id]) => id }),
  activity.child(ChildDescriptor${index}, { input: ({ memory }) => ({ id: memory.id }), key: ({ id }) => id }),
] } } }));
const View${index} = view(Root${index}, { id: "carrier.view.${index}", select: ({ memory }) => memory.id });`);
    rootNames.push(`Root${index}`);
    viewNames.push(`View${index}`);
  }
  const modules = [];
  for (let start = 0; start < rootCount; start += 5) {
    const end = Math.min(start + 5, rootCount);
    const roots = rootNames.slice(start, end).join(", ");
    const views = viewNames.slice(start, end).join(", ");
    modules.push(
      `module({ id: "Carrier/Module${start / 5}", machines: [${roots}], views: [${views}] })`,
    );
  }
  return `import { Effect, Stream } from "effect";
import { app, child, definition, machine, module, resource, stream, transaction, view, type RequirementsOf } from "./vnext/index.js";
class CarrierService { readonly _tag = "CarrierService"; }
const SharedResource = resource({ id: "carrier.shared", lookup: (id: string): Effect.Effect<string, never, CarrierService> => Effect.succeed(id) });
${declarations.join("\n")}
const CarrierApp = app({ id: "carrier-${rootCount}", persistenceVersion: "1", modules: [${modules.join(",\n")}] });
type Equal<L, R> = (<T>() => T extends L ? 1 : 2) extends (<T>() => T extends R ? 1 : 2) ? true : false;
const exactRequirements: Equal<RequirementsOf<typeof CarrierApp>, CarrierService> = true;
void exactRequirements;
export {};
`;
};

const parseMetric = (output, name) => {
  const match = new RegExp(`^${name}:\\s+([0-9]+)`, "mu").exec(output);
  if (match === null) throw new Error(`missing ${name} in TypeScript diagnostics`);
  return Number(match[1]);
};
const parseSeconds = (output, name) => {
  const match = new RegExp(`^${name}:\\s+([0-9.]+)s`, "mu").exec(output);
  if (match === null) throw new Error(`missing ${name} in TypeScript diagnostics`);
  return Number(match[1]);
};

const compileCarrier = (rootCount) => {
  const source = join(temporaryRoot, `carrier-${rootCount}.ts`);
  const output = join(temporaryRoot, `declarations-${rootCount}`);
  writeFileSync(source, carrierSource(rootCount));
  const diagnostics = execFileSync(
    "nubx",
    [
      "tsc",
      "--ignoreConfig",
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
      "--extendedDiagnostics",
      "--outDir",
      output,
      source,
    ],
    { cwd: packageRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  return {
    instantiations: parseMetric(diagnostics, "Instantiations"),
    types: parseMetric(diagnostics, "Types"),
    memoryKilobytes: parseMetric(diagnostics, "Memory used"),
    totalSeconds: parseSeconds(diagnostics, "Total time"),
  };
};

const small = compileCarrier(25);
const large = compileCarrier(50);
if (baseline.instantiations25 === 0 || baseline.instantiations50 === 0) {
  console.log(
    JSON.stringify(
      {
        typescriptVersion: tscVersion,
        instantiations25: small.instantiations,
        instantiations50: large.instantiations,
        types25: small.types,
        types50: large.types,
        memoryKilobytes25: small.memoryKilobytes,
        memoryKilobytes50: large.memoryKilobytes,
        totalSeconds25: small.totalSeconds,
        totalSeconds50: large.totalSeconds,
      },
      null,
      2,
    ),
  );
  throw new Error(
    "replace the zero type-performance baseline with the printed checked-in measurements",
  );
}
if (small.instantiations > baseline.instantiations25 * 1.1)
  throw new Error(`25-root instantiations ${small.instantiations} exceed the 10% allowance`);
if (large.instantiations > baseline.instantiations50 * 1.1)
  throw new Error(`50-root instantiations ${large.instantiations} exceed the 10% allowance`);
if (small.types > baseline.types25 * 1.1)
  throw new Error(`25-root types ${small.types} exceed the 10% allowance`);
if (large.types > baseline.types50 * 1.1)
  throw new Error(`50-root types ${large.types} exceed the 10% allowance`);
if (large.instantiations > small.instantiations * 2.25)
  throw new Error(
    `doubling unrelated roots scales ${large.instantiations / small.instantiations}x`,
  );

const RecursiveDefinition = `import { child, definition, machine } from "./vnext/index.js";
const D = definition({ id: "Recursive", states: ["READY"], events: {} });
const C = child({ id: "recursive.child", machine: M });
const M = machine(D, ({ S, activity }) => ({ initial: S.READY, states: { READY: { activities: [activity.child(C, {})] } } }));
void M;
`;
const recursiveSource = join(temporaryRoot, "recursive-child.ts");
writeFileSync(recursiveSource, RecursiveDefinition);
const recursiveResult = spawnSync(
  "nubx",
  [
    "tsc",
    "--ignoreConfig",
    "--noEmit",
    "--strict",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ES2022",
    "--skipLibCheck",
    recursiveSource,
  ],
  { cwd: packageRoot, encoding: "utf8" },
);
const recursiveDiagnostics = `${recursiveResult.stdout}${recursiveResult.stderr}`;
if (
  recursiveResult.status === 0 ||
  !/referenced directly or indirectly/iu.test(recursiveDiagnostics)
)
  throw new Error("recursive child carrier was not rejected by a finite circularity diagnostic");
if (/excessively deep|possibly infinite/iu.test(recursiveDiagnostics))
  throw new Error("recursive child rejection reached an excessive-instantiation diagnostic");

console.log(
  `Private vNext carrier validated: 25 roots/${small.instantiations} instantiations/${small.memoryKilobytes}K/${small.totalSeconds}s, 50 roots/${large.instantiations} instantiations/${large.memoryKilobytes}K/${large.totalSeconds}s.`,
);
