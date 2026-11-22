import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

// Started by `load.test.ts` under nub, as `nub run bench` starts the bench: imports each module
// named on the command line and prints one line for each test-runner module an import resolves
// and each module that fails to load, so a clean load prints nothing.

const RUNNER = /^(?:vite-plus\/test|vitest|@vitest\/)/u;

const say = (line: string) => process.stdout.write(`${line}\n`);

registerHooks({
  resolve: (specifier, context, next) => {
    if (RUNNER.test(specifier)) say(`runner ${specifier} from ${context.parentURL ?? "?"}`);

    return next(specifier, context);
  },
});

await Promise.all(
  process.argv.slice(2).map((file) =>
    import(pathToFileURL(file).href).catch(
      // FLOW_STATE_ALLOW_UNKNOWN: a failed import's reason is untyped; it is only printed.
      (fault: unknown) => say(`failed ${file}: ${String(fault)}`),
    ),
  ),
);
